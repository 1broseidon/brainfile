/**
 * Making two boards one (spec-15): `adopt` takes one board as it is,
 * `mergeBoards` combines two by document ID, and both end the same way: the
 * board on its branch, checked out at `.brainfile/` in the main worktree, the
 * code branch no longer tracking `.brainfile/`, and every board that was
 * replaced saved first under `refs/brainfile/backups/<UTC timestamp>-<what>`.
 *
 * The new board commit descends from the local branch and from the remote's
 * last-known copy, so the next sync is a fast-forward and nothing either side
 * had is unreachable. Backups stay local unless pushed by name.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { parseFrontmatter, serializeFrontmatter } from '../frontmatter';
import {
  BOARD_REF_NAMESPACE,
  type WorktreeEntry,
  boardBranch,
  boardRepoKind,
  boardTrackingRef,
  commitBoard,
  commitHandEdits,
  ensureBoardDirs,
  ensureExcludeEntry,
  git,
  gitCommonDir,
  listWorktrees,
  unmergedFiles,
} from './boardRepo';
import { boardRemote, boardRemoteName, ensureBoardAttributes, registerMergeDriver } from './boardSync';
import { type BoardRelation, codeBranchTracks, compareContents, readFolder, readTree } from './boards';
import { mergeBoardDocuments, mergeFields } from './merge';

export const BACKUP_NAMESPACE = `${BOARD_REF_NAMESPACE}/backups`;

const SKIP_TOP_LEVEL = new Set(['.git', 'state']);
const DOC_PATH = /^(board|logs)\/([^/]+)\.md$/;
const LEDGER = 'logs/ledger.jsonl';

type Files = Map<string, Buffer>;

interface RepoContext {
  /** Where repository-level git commands run: the main worktree, or the common dir when it is bare. */
  cwd: string;
  common: string;
  main: WorktreeEntry;
  branch: string;
  branchRef: string;
  /** Where the board belongs: `.brainfile/` in the main worktree. */
  home: string;
  /** Worktrees checked out on the board branch. */
  checkouts: WorktreeEntry[];
  /** The remote's last-known copy, e.g. `refs/brainfile/remotes/origin/board`. */
  tracking: string | null;
}

function real(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

function must(r: ReturnType<typeof git>, what: string): string {
  if (!r.ok) throw new Error(`${what}: ${r.stderr || `git exited ${r.status}`}`);
  return r.stdout;
}

/** git with stdin, returning raw stdout. */
function gitRaw(args: string[], cwd: string, input?: string | Buffer, env?: NodeJS.ProcessEnv): { ok: boolean; stdout: Buffer; stderr: string } {
  const r = spawnSync('git', args, {
    cwd,
    input,
    env: env ? { ...process.env, ...env } : process.env,
    maxBuffer: 256 * 1024 * 1024,
  });
  return { ok: r.status === 0, stdout: (r.stdout as Buffer) ?? Buffer.alloc(0), stderr: (r.stderr ?? '').toString().trim() };
}

/** Commits made here use the git user, with a fallback when none is configured. */
function identity(cwd: string): string[] {
  const args = ['-c', 'commit.gpgsign=false'];
  if (!git(['config', '--get', 'user.name'], cwd).stdout) args.push('-c', 'user.name=brainfile');
  if (!git(['config', '--get', 'user.email'], cwd).stdout) args.push('-c', 'user.email=brainfile@localhost');
  return args;
}

function resolveCommit(cwd: string, ref: string): string | null {
  const r = git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], cwd);
  return r.ok && r.stdout ? r.stdout : null;
}

function repoContext(dotDir: string): RepoContext {
  const dir = real(dotDir);
  const probe = boardRepoKind(dir) === 'linked' ? dir : path.dirname(dir);
  const worktrees = listWorktrees(probe);
  const common = gitCommonDir(probe);
  if (worktrees.length === 0 || !common) {
    throw new Error('Boards are combined inside a git repository; this board is not in one.');
  }
  const main = worktrees[0];
  const branch = boardBranch(probe);
  const branchRef = `refs/heads/${branch}`;
  const cwd = main.bare ? common : main.path;
  const remote = boardRemote(cwd) ?? (git(['remote', 'get-url', 'origin'], cwd).ok ? 'origin' : null);
  const tracking = remote ? boardTrackingRef(remote, boardRemoteName(cwd)) : null;
  return {
    cwd,
    common,
    main,
    branch,
    branchRef,
    home: real(main.bare ? path.join(common, 'brainfile') : path.join(main.path, '.brainfile')),
    checkouts: worktrees.filter((w) => w.branch === branchRef),
    tracking: tracking && resolveCommit(cwd, tracking) ? tracking : null,
  };
}

// ── Reading and writing whole boards ────────────────────────────────────────

/** Every file of a board on disk, `.git` and the local-only `state/` aside. */
function filesFromDir(dir: string): Files {
  const out: Files = new Map();
  const walk = (current: string, prefix: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (prefix === '' && SKIP_TOP_LEVEL.has(entry.name)) continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full, rel);
      else if (entry.isFile()) out.set(rel, fs.readFileSync(full));
    }
  };
  walk(dir, '');
  return out;
}

/** Every file of a board at a commit. */
function filesFromCommit(cwd: string, commit: string): Files {
  const out: Files = new Map();
  const list = must(git(['ls-tree', '-r', '-z', commit], cwd), `read ${commit}`);
  const entries: Array<{ rel: string; blob: string }> = [];
  for (const entry of list.split('\0')) {
    const tab = entry.indexOf('\t');
    if (tab < 0) continue;
    const [, type, blob] = entry.slice(0, tab).split(' ');
    const rel = entry.slice(tab + 1);
    if (type === 'blob' && !SKIP_TOP_LEVEL.has(rel.split('/')[0])) entries.push({ rel, blob });
  }
  if (entries.length === 0) return out;
  const r = gitRaw(['cat-file', '--batch'], cwd, `${entries.map((e) => e.blob).join('\n')}\n`);
  if (!r.ok) throw new Error(`read ${commit}: ${r.stderr}`);
  const contents = new Map<string, Buffer>();
  let at = 0;
  while (at < r.stdout.length) {
    const eol = r.stdout.indexOf(10, at);
    if (eol < 0) break;
    const [id, , size] = r.stdout.subarray(at, eol).toString('utf-8').split(' ');
    const n = Number.parseInt(size, 10);
    contents.set(id, r.stdout.subarray(eol + 1, eol + 1 + n));
    at = eol + 1 + n + 1;
  }
  for (const e of entries) out.set(e.rel, contents.get(e.blob) ?? Buffer.alloc(0));
  return out;
}

function writeFiles(dir: string, files: Files): void {
  for (const [rel, content] of files) {
    const full = path.join(dir, ...rel.split('/'));
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
}

/** A git tree of the board in `dir`, written without touching any real index. */
function treeFromDir(ctx: RepoContext, dir: string): string {
  const index = path.join(ctx.common, `brainfile-index-${process.pid}-${Date.now()}`);
  const env = { GIT_DIR: ctx.common, GIT_WORK_TREE: dir, GIT_INDEX_FILE: index };
  try {
    must(git(['add', '-A', '--', '.', ':(exclude)state', ':(exclude).git'], dir, env), `read ${dir}`);
    return must(git(['write-tree'], dir, env), `snapshot ${dir}`);
  } finally {
    fs.rmSync(index, { force: true });
  }
}

function treeFromFiles(ctx: RepoContext, files: Files): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-board-'));
  try {
    writeFiles(dir, files);
    return treeFromDir(ctx, dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function commitTree(ctx: RepoContext, tree: string, parents: string[], message: string): string {
  const args = [...identity(ctx.cwd), 'commit-tree', tree, ...parents.flatMap((p) => ['-p', p]), '-m', message];
  return must(git(args, ctx.cwd), 'commit the board');
}

// ── Sources ─────────────────────────────────────────────────────────────────

export interface BoardSource {
  /** What the person passed. */
  spec: string;
  /** How it reads in a sentence: `origin's`, `the 'brainfile' branch`, `backup 20261012T205217Z-folder`. */
  label: string;
  /** The commit, for a git ref. */
  commit?: string;
  /** The folder, for a board on disk. */
  dir?: string;
}

function labelForRef(ref: string): string {
  if (ref.startsWith('refs/heads/')) return `the '${ref.slice(11)}' branch`;
  const remote = /^refs\/brainfile\/remotes\/([^/]+)\//.exec(ref);
  if (remote) return `${remote[1]}'s`;
  if (ref.startsWith(`${BACKUP_NAMESPACE}/`)) return `backup ${ref.slice(BACKUP_NAMESPACE.length + 1)}`;
  return ref;
}

/** A folder holding a board, or a git ref (a backup name works too). Throws when it is neither. */
export function resolveBoardSource(dotDir: string, spec: string): BoardSource {
  const ctx = repoContext(dotDir);
  const asPath = path.resolve(spec);
  if (fs.existsSync(asPath) && fs.statSync(asPath).isDirectory()) {
    const dir = fs.existsSync(path.join(asPath, 'brainfile.md')) ? asPath : path.join(asPath, '.brainfile');
    if (!fs.existsSync(path.join(dir, 'brainfile.md'))) throw new Error(`${spec} holds no board (no brainfile.md).`);
    const relative = path.relative(process.cwd(), dir);
    const shown = relative === '' ? '.' : relative.startsWith('..') || path.isAbsolute(relative) ? dir : relative;
    return { spec, label: `the folder ${shown}`, dir: real(dir) };
  }
  for (const ref of [spec, `${BACKUP_NAMESPACE}/${spec}`]) {
    const commit = resolveCommit(ctx.cwd, ref);
    if (commit) {
      const full = git(['rev-parse', '--symbolic-full-name', ref], ctx.cwd).stdout || ref;
      return { spec, label: labelForRef(full), commit };
    }
  }
  throw new Error(`'${spec}' is neither a folder with a board nor a git ref here. brainfile where lists the boards it found.`);
}

// ── Backups ─────────────────────────────────────────────────────────────────

export interface BackupInfo {
  /** Pass to `brainfile backups restore`. */
  name: string;
  ref: string;
  /** When it was taken (ISO). */
  at: string;
  /** What it saved, e.g. `this folder (/work/app/.brainfile) before adopt origin's`. */
  note: string;
  docs: number;
}

/** `20261012T205217Z`. */
export function backupStamp(now = new Date()): string {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

function saveBackup(ctx: RepoContext, tree: string, parent: string | null, note: string, name: string): string {
  let unique = name;
  for (let n = 2; resolveCommit(ctx.cwd, `${BACKUP_NAMESPACE}/${unique}`); n += 1) unique = `${name}-${n}`;
  const commit = commitTree(ctx, tree, parent ? [parent] : [], `backup: ${note}`);
  must(git(['update-ref', `${BACKUP_NAMESPACE}/${unique}`, commit], ctx.cwd), 'save the backup');
  return unique;
}

/**
 * One copy of a board to save: a folder on disk (a plain board, or a
 * checkout of the board branch with its hand edits), or a board in git, as a
 * commit (`refs/heads/brainfile`) or a tree (`<commit>:.brainfile`, the copy
 * a code branch tracks). `parent` keeps the copy's history reachable from
 * the backup; leave it out for a tree inside a code commit.
 */
export type BackupSource = { dir: string; parent?: string } | { treeish: string; parent?: string };

/**
 * Save one copy of a board under `refs/brainfile/backups/<stamp>-<what>`,
 * the way `brainfile backups` lists and restores them, before anything that
 * changes a board outside `adopt` / `merge-boards` (which back up what they
 * replace themselves). Throws when the copy cannot be read or saved, so the
 * caller changes nothing. Returns the backup's name.
 */
export function saveBoardBackup(dotDir: string, source: BackupSource, note: string, what: string, stamp = backupStamp()): string {
  const ctx = repoContext(dotDir);
  let tree: string;
  if ('dir' in source) {
    if (!fs.existsSync(path.join(source.dir, 'brainfile.md'))) throw new Error(`${source.dir} holds no board to back up.`);
    tree = treeFromDir(ctx, source.dir);
  } else {
    // `<rev>:<path>` names a tree already; a commit-ish needs peeling.
    tree = must(git(['rev-parse', '--verify', source.treeish.includes(':') ? source.treeish : `${source.treeish}^{tree}`], ctx.cwd), `read ${source.treeish}`);
  }
  const parent = source.parent ? resolveCommit(ctx.cwd, source.parent) : null;
  const safe = what.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'board';
  return saveBackup(ctx, tree, parent, note, `${stamp}-${safe}`);
}

/** Backups in the repository around `dotDir`, newest first. */
export function listBackups(dotDir: string): BackupInfo[] {
  const ctx = repoContext(dotDir);
  const r = git(
    ['for-each-ref', '--sort=-committerdate', '--format=%(refname)%00%(committerdate:iso-strict)%00%(contents:subject)', `${BACKUP_NAMESPACE}/`],
    ctx.cwd
  );
  if (!r.ok || !r.stdout) return [];
  return r.stdout.split('\n').map((line) => {
    const [ref, at, subject] = line.split('\0');
    return {
      name: ref.slice(BACKUP_NAMESPACE.length + 1),
      ref,
      at,
      note: subject.replace(/^backup: /, ''),
      docs: readTree(ctx.cwd, ref)?.docs.size ?? 0,
    };
  });
}

// ── The code branch stops tracking .brainfile/ ──────────────────────────────

export interface UntrackResult {
  /** The code branch the commit was made on. */
  branch: string;
  commit: string;
}

/**
 * One commit on the checked-out code branch that drops `.brainfile/` from it
 * and lists `.brainfile/` in `.gitignore`. Built on a scratch index, so other
 * staged work is left alone and not folded in. Null when the code branch does
 * not track `.brainfile/`, or HEAD is not a branch.
 */
export function untrackBoardOnCodeBranch(repoRoot: string, rel = '.brainfile'): UntrackResult | null {
  if (!codeBranchTracks(repoRoot, rel)) return null;
  const branch = git(['symbolic-ref', '--quiet', '--short', 'HEAD'], repoRoot).stdout;
  const head = resolveCommit(repoRoot, 'HEAD');
  if (!branch || !head) return null;
  const common = gitCommonDir(repoRoot);
  if (!common) return null;
  const index = path.join(common, `brainfile-untrack-${process.pid}-${Date.now()}`);
  const env = { GIT_INDEX_FILE: index };
  try {
    must(git(['read-tree', head], repoRoot, env), 'read HEAD');
    must(git(['rm', '-r', '-q', '--cached', '--ignore-unmatch', '--', rel], repoRoot, env), `untrack ${rel}/`);
    const line = `${rel}/`;
    const isLine = (l: string) => [line, rel, `/${line}`, `/${rel}`].includes(l.trim());
    const before = git(['show', `${head}:.gitignore`], repoRoot);
    const ignored = before.ok ? `${before.stdout}\n` : '';
    const listed = ignored.split('\n').some(isLine);
    if (!listed) {
      const content = `${ignored.length > 1 ? ignored : ''}${line}\n`;
      const blob = gitRaw(['hash-object', '-w', '--stdin'], repoRoot, content);
      if (!blob.ok) throw new Error(`write .gitignore: ${blob.stderr}`);
      must(git(['update-index', '--add', '--cacheinfo', `100644,${blob.stdout.toString().trim()},.gitignore`], repoRoot, env), 'stage .gitignore');
    }
    const tree = must(git(['write-tree'], repoRoot, env), 'write the tree');
    const message = `chore: move the board to the ${boardBranch(repoRoot)} branch`;
    const commit = must(git([...identity(repoRoot), 'commit-tree', tree, '-p', head, '-m', message], repoRoot), 'commit');
    must(git(['update-ref', '-m', message, `refs/heads/${branch}`, commit, head], repoRoot), `move ${branch}`);
    // Bring the real index and the working .gitignore along, leaving anything else as it was.
    git(['reset', '-q', '--', rel, '.gitignore'], repoRoot);
    if (!listed) {
      const file = path.join(repoRoot, '.gitignore');
      const working = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '';
      if (!working.split(/\r?\n/).some(isLine)) {
        fs.writeFileSync(file, `${working}${working.length > 0 && !working.endsWith('\n') ? '\n' : ''}${line}\n`, 'utf-8');
      }
    }
    return { branch, commit };
  } finally {
    fs.rmSync(index, { force: true });
  }
}

// ── Settling on one board ───────────────────────────────────────────────────

export interface SettleResult {
  /** The board branch's new tip. */
  commit: string;
  /** Where the board is checked out now. */
  dotDir: string;
  /** Backups taken first (names for `brainfile backups restore`). */
  backups: string[];
  /** Checkouts of the board branch removed from elsewhere (their commits are on the branch). */
  removedCheckouts: string[];
  /** The commit on the code branch that stopped tracking `.brainfile/`, when one was made. */
  untracked: UntrackResult | null;
  /** Nothing changed: the board was already this one, in its one place. */
  unchanged: boolean;
}

interface Plan {
  tree: string;
  /** Commits the new board descends from, besides the local branch and the remote's copy. */
  parents: string[];
  message: string;
  /** For backups: `adopt origin's`. */
  verb: string;
}

function isAncestor(cwd: string, a: string, b: string): boolean {
  return git(['merge-base', '--is-ancestor', a, b], cwd).ok;
}

/**
 * Make the board branch hold `plan.tree`, checked out at its home, with
 * every board it replaces backed up first. Everything that can refuse is
 * checked before anything changes.
 */
function settle(dotDir: string, makePlan: (ctx: RepoContext) => Plan): SettleResult {
  const ctx = repoContext(dotDir);

  // Everything that can refuse, before anything is written.
  const present = ctx.checkouts.filter((c) => fs.existsSync(c.path));
  for (const c of present) {
    const stuck = unmergedFiles(c.path);
    if (stuck.length > 0) throw new Error(`Finish the merge in ${c.path} first (${stuck.join(', ')}). Nothing was changed.`);
  }
  const homeCheckout = present.find((c) => real(c.path) === ctx.home) ?? null;
  const aside = `${ctx.home}.settling`;
  let homeFolder = false;
  if (!homeCheckout && fs.existsSync(ctx.home)) {
    if (boardRepoKind(ctx.home) === 'linked') {
      throw new Error(`${ctx.home} is a checkout of another branch. Move it away first. Nothing was changed.`);
    }
    homeFolder = fs.existsSync(path.join(ctx.home, 'brainfile.md'));
    if (!homeFolder && fs.readdirSync(ctx.home).length > 0) {
      throw new Error(`${ctx.home} exists and holds no board. Move it away first. Nothing was changed.`);
    }
    if (fs.existsSync(aside)) throw new Error(`${aside} exists from an earlier attempt; remove it first. Nothing was changed.`);
  }

  // Hand edits in any checkout become commits; one anywhere but home must
  // then be clean, since it will be removed.
  for (const c of present) {
    commitHandEdits(c.path);
    if (real(c.path) !== ctx.home && git(['status', '--porcelain'], c.path).stdout) {
      throw new Error(`The board branch is also checked out at ${c.path} with files git could not commit. Clear them there first. Nothing else was changed.`);
    }
  }

  const plan = makePlan(ctx);
  const localTip = resolveCommit(ctx.cwd, ctx.branchRef);
  const remoteTip = ctx.tracking ? resolveCommit(ctx.cwd, ctx.tracking) : null;

  // Descend from everything there is, minus what is already an ancestor.
  const candidates = [...new Set([localTip, remoteTip, ...plan.parents].filter((c): c is string => !!c))];
  const parents = candidates.filter((p) => !candidates.some((q) => q !== p && isAncestor(ctx.cwd, p, q)));
  const sameTree = (c: string) => git(['rev-parse', `${c}^{tree}`], ctx.cwd).stdout === plan.tree;
  const nothingToDo = !!homeCheckout && parents.length === 1 && parents[0] === localTip && sameTree(localTip!) && ctx.checkouts.length === 1;
  const untrackNeeded = !ctx.main.bare && codeBranchTracks(ctx.main.path);
  if (nothingToDo && !untrackNeeded) {
    return { commit: localTip!, dotDir: ctx.home, backups: [], removedCheckouts: [], untracked: null, unchanged: true };
  }

  // Backups first.
  const stamp = backupStamp();
  const backups: string[] = [];
  if (homeFolder) {
    backups.push(saveBackup(ctx, treeFromDir(ctx, ctx.home), null, `the folder ${ctx.home} before ${plan.verb}`, `${stamp}-folder`));
  }
  if (localTip) {
    backups.push(saveBackup(ctx, `${localTip}^{tree}`, localTip, `the '${ctx.branch}' branch before ${plan.verb}`, `${stamp}-branch`));
  }

  const commit = parents.length === 1 && sameTree(parents[0]) ? parents[0] : commitTree(ctx, plan.tree, parents, plan.message);

  // One home: other checkouts go (clean, their commits kept); lost ones are pruned.
  const removedCheckouts: string[] = [];
  for (const c of present) {
    if (real(c.path) === ctx.home) continue;
    must(git(['worktree', 'remove', c.path], ctx.cwd), `remove the checkout at ${c.path}`);
    removedCheckouts.push(c.path);
  }
  if (present.length < ctx.checkouts.length) git(['worktree', 'prune'], ctx.cwd);

  if (homeCheckout) {
    if (commit !== localTip) must(git(['merge', '--ff-only', '--quiet', commit], ctx.home), 'move the board forward');
  } else {
    must(git(['update-ref', ctx.branchRef, commit], ctx.cwd), `move '${ctx.branch}'`);
    if (fs.existsSync(ctx.home)) fs.renameSync(ctx.home, aside);
    const added = git(['worktree', 'add', '--quiet', ctx.home, ctx.branch], ctx.cwd);
    if (!added.ok) {
      if (fs.existsSync(aside) && !fs.existsSync(ctx.home)) fs.renameSync(aside, ctx.home);
      throw new Error(
        `Could not check the board out at ${ctx.home}: ${added.stderr}. The '${ctx.branch}' branch holds the result; backups: ${backups.join(', ') || 'none'}.`
      );
    }
    // Local-only state (brief positions, the search index) comes along.
    if (fs.existsSync(path.join(aside, 'state')) && !fs.existsSync(path.join(ctx.home, 'state'))) {
      fs.cpSync(path.join(aside, 'state'), path.join(ctx.home, 'state'), { recursive: true });
    }
    fs.rmSync(aside, { recursive: true, force: true });
    ensureExcludeEntry(ctx.cwd);
  }

  const untracked = untrackNeeded ? untrackBoardOnCodeBranch(ctx.main.path) : null;

  // The board descends from the remote's copy, so that is where it goes back to.
  const remote = ctx.tracking ? /^refs\/brainfile\/remotes\/([^/]+)\//.exec(ctx.tracking)?.[1] : null;
  if (remote && !boardRemote(ctx.cwd)) git(['config', 'brainfile.remote', remote], ctx.cwd);

  ensureBoardDirs(ctx.home);
  ensureBoardAttributes(ctx.home);
  registerMergeDriver(ctx.home);
  commitBoard(ctx.home, { message: 'chore: merge attributes' });

  return {
    commit: git(['rev-parse', 'HEAD'], ctx.home).stdout || commit,
    dotDir: ctx.home,
    backups,
    removedCheckouts,
    untracked,
    unchanged: false,
  };
}

/** Take the board at `spec` (a folder or a ref) as the one board, as it is. */
export function adoptBoard(dotDir: string, spec: string): SettleResult & { source: BoardSource } {
  const source = resolveBoardSource(dotDir, spec);
  const result = settle(dotDir, (ctx) => ({
    tree: source.dir ? treeFromDir(ctx, source.dir) : must(git(['rev-parse', `${source.commit}^{tree}`], ctx.cwd), 'read the board'),
    parents: source.commit ? [source.commit] : [],
    message: `adopt ${source.label}`,
    verb: `adopt ${source.label}`,
  }));
  return { ...result, source };
}

/** Put a backup back; the board it replaces is backed up first. */
export function restoreBackup(dotDir: string, name: string): SettleResult & { source: BoardSource } {
  const ref = name.startsWith(`${BACKUP_NAMESPACE}/`) ? name : `${BACKUP_NAMESPACE}/${name}`;
  const ctx = repoContext(dotDir);
  if (!resolveCommit(ctx.cwd, ref)) throw new Error(`No backup named '${name}'. brainfile backups lists them.`);
  return adoptBoard(dotDir, ref);
}

// ── Merging two boards by document ID ───────────────────────────────────────

export interface Renumbered {
  from: string;
  to: string;
  /** Which board the renumbered document came from. */
  side: 'this' | 'other';
  title: string;
}

export interface MergeBoardsResult extends SettleResult {
  source: BoardSource;
  /** How this board stood against the other before merging. */
  relation: BoardRelation;
  /** One board already held everything the other had, so it was adopted as it was. */
  adopted: 'this' | 'other' | null;
  renumbered: Renumbered[];
  /** Files both boards had in different versions, kept from this board (other than documents). */
  keptOurs: string[];
}

interface Parsed {
  data: Record<string, unknown>;
  body: string;
}

function parse(content: Buffer): Parsed | null {
  const parsed = parseFrontmatter<Record<string, unknown>>(content.toString('utf-8'));
  return parsed ? { data: parsed.data, body: parsed.body } : null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Two documents with one ID are the same document unless created apart with unrelated titles. */
function sameDocument(a: Parsed, b: Parsed): boolean {
  const ca = text(a.data.createdAt);
  const cb = text(b.data.createdAt);
  if (!ca || !cb || ca === cb) return true;
  const ta = normalTitle(text(a.data.title));
  const tb = normalTitle(text(b.data.title));
  return !!ta && !!tb && (ta === tb || ta.includes(tb) || tb.includes(ta));
}

function docsOf(files: Files): Map<string, string> {
  const out = new Map<string, string>();
  for (const rel of files.keys()) {
    const m = DOC_PATH.exec(rel);
    if (m) out.set(m[2], rel);
  }
  return out;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Rename document `from` to `to` on one board: its file, its ID and every mention of it there. */
function renumber(files: Files, from: string, to: string, note: string): Files {
  const pattern = new RegExp(`(?<![A-Za-z0-9_-])${escapeRegExp(from)}(?![0-9])`, 'g');
  const out: Files = new Map();
  for (const [rel, content] of files) {
    const m = DOC_PATH.exec(rel);
    const isText = rel.endsWith('.md') || rel === LEDGER;
    let next = isText ? Buffer.from(content.toString('utf-8').replace(pattern, to)) : content;
    let target = rel;
    if (m && m[2] === from) {
      target = `${m[1]}/${to}.md`;
      next = Buffer.from(appendLog(next.toString('utf-8'), note));
    }
    out.set(target, next);
  }
  return out;
}

function appendLog(content: string, line: string): string {
  const entry = `- ${new Date().toISOString()}: [merge-boards] ${line}`;
  if (/^## Log\s*$/m.test(content)) return `${content.replace(/\s+$/, '')}\n${entry}\n`;
  return `${content.replace(/\s+$/, '')}\n\n## Log\n${entry}\n`;
}

const LOG_HEADING = /^## Log\s*$/m;

/** Split a body at its `## Log` section. */
function splitLog(body: string): { main: string; log: string[] } {
  const m = LOG_HEADING.exec(body);
  if (!m) return { main: body, log: [] };
  const log = body.slice(m.index + m[0].length).split('\n').filter((l) => l.trim().length > 0);
  return { main: body.slice(0, m.index), log };
}

const STAMPED = /^\s*[-*]\s+(\d{4}-\d{2}-\d{2}T[0-9:.]+Z?)/;

/**
 * Two versions of one document with no common base: fields last-writer-wins
 * by `updatedAt`, the newer body, and both logs, unioned in time order.
 */
function mergeUnrelated(ours: Parsed, theirs: Parsed): string {
  const data = mergeFields({}, ours.data, theirs.data);
  const oursNewer = text(ours.data.updatedAt) > text(theirs.data.updatedAt);
  const a = splitLog(ours.body);
  const b = splitLog(theirs.body);
  const log = [...a.log];
  for (const line of b.log) if (!log.includes(line)) log.push(line);
  if (log.every((l) => STAMPED.test(l))) log.sort((x, y) => (STAMPED.exec(x)![1] < STAMPED.exec(y)![1] ? -1 : 1));
  const main = (oursNewer ? a.main : b.main).replace(/\s+$/, '');
  const body = log.length > 0 ? `${main}\n\n## Log\n${log.join('\n')}\n` : `${main}\n`;
  return serializeFrontmatter(data, body);
}

function nextFreeIds(taken: Iterable<string>): (id: string) => string {
  const max = new Map<string, number>();
  for (const id of taken) {
    const m = /^(.*)-(\d+)$/.exec(id);
    if (m) max.set(m[1], Math.max(max.get(m[1]) ?? 0, Number.parseInt(m[2], 10)));
  }
  return (id) => {
    const prefix = /^(.*)-\d+$/.exec(id)?.[1] ?? id;
    const n = (max.get(prefix) ?? 0) + 1;
    max.set(prefix, n);
    return `${prefix}-${n}`;
  };
}

/** Combine two boards' files by document ID. Exported for tests. */
export function mergeBoardFiles(
  oursIn: Files,
  theirsIn: Files,
  base: Files | null
): { files: Files; renumbered: Renumbered[]; keptOurs: string[] } {
  let ours = oursIn;
  let theirs = theirsIn;
  const renumbered: Renumbered[] = [];

  // The same ID on two different documents: the older keeps it.
  const ourDocs = docsOf(ours);
  const theirDocs = docsOf(theirs);
  const next = nextFreeIds([...ourDocs.keys(), ...theirDocs.keys()]);
  for (const [id, ourPath] of [...ourDocs]) {
    const theirPath = theirDocs.get(id);
    if (!theirPath) continue;
    const o = parse(ours.get(ourPath)!);
    const t = parse(theirs.get(theirPath)!);
    if (!o || !t || sameDocument(o, t)) continue;
    const to = next(id);
    const theirsNewer = text(t.data.createdAt) > text(o.data.createdAt);
    const moved = theirsNewer ? t : o;
    const kept = theirsNewer ? o : t;
    const note = `renumbered from ${id}: the other board already had ${id} (${text(kept.data.title)})`;
    if (theirsNewer) theirs = renumber(theirs, id, to, note);
    else ours = renumber(ours, id, to, note);
    renumbered.push({ from: id, to, side: theirsNewer ? 'other' : 'this', title: text(moved.data.title) });
  }

  const files: Files = new Map();
  const keptOurs: string[] = [];
  const oursById = docsOf(ours);
  const theirsById = docsOf(theirs);
  const baseById = base ? docsOf(base) : new Map<string, string>();

  // Documents: one side only, or both merged; completion wins over an edit.
  for (const id of new Set([...oursById.keys(), ...theirsById.keys()])) {
    const op = oursById.get(id);
    const tp = theirsById.get(id);
    if (op && !tp) {
      files.set(op, ours.get(op)!);
      continue;
    }
    if (tp && !op) {
      files.set(tp, theirs.get(tp)!);
      continue;
    }
    const o = ours.get(op!)!;
    const t = theirs.get(tp!)!;
    const target = op!.startsWith('logs/') ? op! : tp!.startsWith('logs/') ? tp! : op!;
    if (o.equals(t)) {
      files.set(target, o);
      continue;
    }
    const bp = baseById.get(id);
    const baseText = bp && base ? base.get(bp)!.toString('utf-8') : null;
    let merged: string | null = null;
    if (baseText !== null) {
      const three = mergeBoardDocuments(baseText, o.toString('utf-8'), t.toString('utf-8'));
      if (three.clean) merged = three.content;
    }
    if (merged === null) {
      const po = parse(o);
      const pt = parse(t);
      merged = po && pt ? mergeUnrelated(po, pt) : o.toString('utf-8');
    }
    files.set(target, Buffer.from(merged));
  }

  // Everything else: one side only, the ledger unioned, attributes unioned, otherwise ours.
  for (const rel of new Set([...ours.keys(), ...theirs.keys()])) {
    if (DOC_PATH.test(rel)) continue;
    const o = ours.get(rel);
    const t = theirs.get(rel);
    if (!o || !t || o.equals(t)) {
      files.set(rel, (o ?? t)!);
      continue;
    }
    if (rel === LEDGER || rel === '.gitattributes' || rel === '.gitignore') {
      const lines = o.toString('utf-8').split('\n').filter(Boolean);
      for (const line of t.toString('utf-8').split('\n').filter(Boolean)) if (!lines.includes(line)) lines.push(line);
      files.set(rel, Buffer.from(`${lines.join('\n')}\n`));
      continue;
    }
    files.set(rel, o);
    keptOurs.push(rel);
  }
  return { files, renumbered, keptOurs };
}

/**
 * Combine the board at `dotDir` with the one at `spec` by document ID. When
 * one already holds everything the other has, that one is adopted as it is.
 */
export function mergeBoards(dotDir: string, spec: string): MergeBoardsResult {
  const source = resolveBoardSource(dotDir, spec);
  const here = real(dotDir);
  if (source.dir && source.dir === here) throw new Error('That is this board. Name the other one: brainfile where lists them.');
  const ctx = repoContext(dotDir);
  commitHandEdits(here);
  const ourContents = readFolder(here);
  const theirContents = source.dir ? readFolder(source.dir) : readTree(ctx.cwd, source.commit!);
  if (!theirContents) throw new Error(`${source.label} holds no board.`);
  const relation = compareContents(ourContents, theirContents);

  if (relation === 'contained') {
    const adopted = adoptBoard(dotDir, spec);
    return { ...adopted, relation, adopted: 'other', renumbered: [], keptOurs: [] };
  }
  if (relation === 'same' || relation === 'contains') {
    // Keep this board; the other's history becomes an ancestor so nothing it had is lost.
    const result = settle(dotDir, (c) => ({
      tree: treeFromDir(c, here),
      parents: source.commit ? [source.commit] : [],
      message: `merge-boards: kept this board over ${source.label} (it had nothing new)`,
      verb: `merge-boards ${source.label}`,
    }));
    return { ...result, source, relation, adopted: 'this', renumbered: [], keptOurs: [] };
  }

  const onBranch = boardRepoKind(here) === 'linked' && listWorktrees(here).find((w) => real(w.path) === here)?.branch === ctx.branchRef;
  const ourCommit = onBranch ? resolveCommit(here, 'HEAD') : null;
  const baseCommit = ourCommit && source.commit ? git(['merge-base', ourCommit, source.commit], ctx.cwd).stdout || null : null;
  const merged = mergeBoardFiles(
    filesFromDir(here),
    source.dir ? filesFromDir(source.dir) : filesFromCommit(ctx.cwd, source.commit!),
    baseCommit ? filesFromCommit(ctx.cwd, baseCommit) : null
  );
  const result = settle(dotDir, (c) => ({
    tree: treeFromFiles(c, merged.files),
    parents: source.commit ? [source.commit] : [],
    message: `merge-boards: ${source.label}`,
    verb: `merge-boards ${source.label}`,
  }));
  return { ...result, source, relation, adopted: null, renumbered: merged.renumbered, keptOurs: merged.keptOurs };
}
