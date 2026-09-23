/**
 * Board-on-a-branch storage (spec-9, phase 1).
 *
 * A *tracked* board is a `.brainfile/` directory that is itself a git
 * repository: inside a project repo it is a linked worktree checked out on the
 * board branch (default `brainfile`, an orphan branch with its own history);
 * outside any repo it is a standalone repository. Either way every mutation
 * becomes one commit, authored by the git user, and the board is shared
 * by every worktree of the project because linked worktrees share one git
 * directory.
 *
 * Core stays git-free: everything that shells out to git lives here.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';

export const DEFAULT_BOARD_BRANCH = 'brainfile';
export const BOARD_BRANCH_CONFIG_KEY = 'brainfile.branch';

/**
 * On a remote, a board is stored under `refs/brainfile/<name>` rather than as
 * a branch: hosts list, badge and offer pull requests for branches only, so
 * the board stays out of the project's branch list while still being pushed,
 * fetched and kept like any other ref. Locally the last-known remote position
 * lives under `refs/brainfile/remotes/<remote>/<name>`, outside `refs/remotes/`
 * so a user's `git fetch --prune` never deletes it.
 */
export const BOARD_REF_NAMESPACE = 'refs/brainfile';
export const BOARD_NAME_CONFIG_KEY = 'brainfile.boardName';
/** 0.21.0 key: the branch the board was pushed to. Still read as the name. */
export const LEGACY_REMOTE_BRANCH_CONFIG_KEY = 'brainfile.remoteBranch';
/** Default name for a board that lives in a code repository. */
export const DEFAULT_BOARD_NAME = 'board';

export function remoteBoardRef(name: string): string {
  return `${BOARD_REF_NAMESPACE}/${name}`;
}

export function boardTrackingRef(remote: string, name: string): string {
  return `${BOARD_REF_NAMESPACE}/remotes/${remote}/${name}`;
}

/** A network git call that never prompts and gives up instead of hanging. */
const NETWORK_TIMEOUT_MS = 8000;
const NO_PROMPT_ENV: NodeJS.ProcessEnv = { GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: 'echo', SSH_ASKPASS: 'echo' };
export function gitNetwork(args: string[], cwd: string): GitResult {
  return git(args, cwd, NO_PROMPT_ENV, NETWORK_TIMEOUT_MS);
}
const EXCLUDE_ENTRY = '.brainfile/';
const EXCLUDE_MARKER = '# brainfile: board worktree (managed by `brainfile`)';
const FALLBACK_IDENTITY_NAME = 'brainfile';
const FALLBACK_IDENTITY_EMAIL = 'brainfile@localhost';
const MAX_MESSAGE_LENGTH = 72;
const BOARD_SUBDIRS = ['board', 'logs'];

export interface GitResult {
  ok: boolean;
  status: number | null;
  stdout: string;
  stderr: string;
}

/** Run git synchronously. Never throws; a missing git binary is `ok: false`. */
export function git(args: string[], cwd: string, env?: NodeJS.ProcessEnv, timeoutMs?: number): GitResult {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf-8',
    env: env ? { ...process.env, ...env } : process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...(timeoutMs ? { timeout: timeoutMs, killSignal: 'SIGKILL' as const } : {}),
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: (result.stdout ?? '').toString().trim(),
    stderr: (result.stderr ?? '').toString().trim(),
  };
}

/** Toplevel of the working tree containing `cwd`, or null outside any repo. */
export function gitToplevel(cwd: string): string | null {
  const r = git(['rev-parse', '--show-toplevel'], cwd);
  return r.ok && r.stdout ? path.resolve(r.stdout) : null;
}

/** The git directory shared by every worktree of the repo containing `cwd`. */
export function gitCommonDir(cwd: string): string | null {
  const r = git(['rev-parse', '--git-common-dir'], cwd);
  if (!r.ok || !r.stdout) return null;
  return path.resolve(cwd, r.stdout);
}

export interface WorktreeEntry {
  path: string;
  head?: string;
  /** Full ref, e.g. `refs/heads/brainfile`; absent when detached or bare. */
  branch?: string;
  bare: boolean;
  detached: boolean;
}

/** `git worktree list --porcelain`, parsed. Empty outside a repo. */
export function listWorktrees(cwd: string): WorktreeEntry[] {
  const r = git(['worktree', 'list', '--porcelain'], cwd);
  if (!r.ok) return [];
  const entries: WorktreeEntry[] = [];
  let current: WorktreeEntry | null = null;
  for (const line of r.stdout.split('\n')) {
    if (line.startsWith('worktree ')) {
      current = { path: path.resolve(line.slice('worktree '.length)), bare: false, detached: false };
      entries.push(current);
    } else if (!current) {
      continue;
    } else if (line.startsWith('HEAD ')) {
      current.head = line.slice(5);
    } else if (line.startsWith('branch ')) {
      current.branch = line.slice(7);
    } else if (line === 'bare') {
      current.bare = true;
    } else if (line === 'detached') {
      current.detached = true;
    }
  }
  return entries;
}

/** Name of the board branch for the repo containing `cwd` (`brainfile.branch`, default `brainfile`). */
export function boardBranch(cwd: string): string {
  const r = git(['config', '--get', BOARD_BRANCH_CONFIG_KEY], cwd);
  return r.ok && r.stdout ? r.stdout : DEFAULT_BOARD_BRANCH;
}

export type BoardRepoKind = 'linked' | 'standalone';

/**
 * How the board directory is tracked: a linked worktree (`.git` is a gitdir
 * pointer file), a standalone repository (`.git` is a directory), or null for
 * a plain directory.
 */
export function boardRepoKind(dotDir: string): BoardRepoKind | null {
  try {
    const st = fs.statSync(path.join(dotDir, '.git'));
    if (st.isFile()) return 'linked';
    if (st.isDirectory()) return 'standalone';
  } catch {
    /* plain directory */
  }
  return null;
}

export function isTrackedBoard(dotDir: string): boolean {
  return boardRepoKind(dotDir) !== null;
}

/**
 * Resolution step 3: from anywhere inside a repo (including a linked code
 * worktree that has no `.brainfile/` of its own), find the worktree checked
 * out on the board branch.
 */
export function findTrackedBoardDir(cwd: string): string | null {
  const worktrees = listWorktrees(cwd);
  if (worktrees.length === 0) return null;
  const wanted = `refs/heads/${boardBranch(cwd)}`;
  const hit = worktrees.find((w) => w.branch === wanted);
  if (!hit) return null;
  return fs.existsSync(path.join(hit.path, 'brainfile.md')) ? hit.path : null;
}

/** How long a failed lookup for a board on the remote is remembered. */
const PROBE_MISS_TTL_MS = 10 * 60_000;

function probeMissFile(cwd: string): string | null {
  const common = gitCommonDir(cwd);
  return common ? path.join(common, 'brainfile-probe.json') : null;
}

function recentProbeMiss(cwd: string, remote: string): boolean {
  const file = probeMissFile(cwd);
  if (!file) return false;
  try {
    const miss = JSON.parse(fs.readFileSync(file, 'utf-8')) as { remote?: string; at?: number };
    return miss.remote === remote && typeof miss.at === 'number' && Date.now() - miss.at < PROBE_MISS_TTL_MS;
  } catch {
    return false;
  }
}

function recordProbeMiss(cwd: string, remote: string): void {
  const file = probeMissFile(cwd);
  if (!file) return;
  try {
    fs.writeFileSync(file, JSON.stringify({ remote, at: Date.now() }), 'utf-8');
  } catch {
    /* only a cache */
  }
}

function clearProbeMiss(cwd: string): void {
  const file = probeMissFile(cwd);
  if (file) fs.rmSync(file, { force: true });
}

/**
 * Board names published on `remote` (`refs/brainfile/<name>`), or null when
 * the remote could not be asked. One network round trip.
 */
export function listRemoteBoards(cwd: string, remote: string): string[] | null {
  const r = gitNetwork(['ls-remote', '--quiet', remote, `${BOARD_REF_NAMESPACE}/*`], cwd);
  if (!r.ok) return null;
  const names: string[] = [];
  for (const line of r.stdout.split('\n')) {
    const ref = line.split('\t')[1] ?? '';
    const name = ref.slice(BOARD_REF_NAMESPACE.length + 1);
    if (ref.startsWith(`${BOARD_REF_NAMESPACE}/`) && name && !name.includes('/')) names.push(name);
  }
  return names;
}

export interface MaterializeOptions {
  /** Ask the remote even if a recent lookup found nothing (after `--set-remote`). */
  fresh?: boolean;
}

/**
 * Where to start a board that is not checked out yet: the local branch, the
 * board published on the remote (`refs/brainfile/<name>`, fetched on
 * demand), or a board a 0.21.0 machine pushed as a plain branch.
 */
function findBoardStart(cwd: string, branch: string, options: MaterializeOptions): { ref: string; remote: string | null; name?: string } | null {
  if (git(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], cwd).ok) return { ref: branch, remote: null };
  const configuredRemote = git(['config', '--get', 'brainfile.remote'], cwd).stdout || null;
  const remote = configuredRemote ?? (git(['remote', 'get-url', 'origin'], cwd).ok ? 'origin' : null);
  if (!remote) return null;
  const configuredName =
    git(['config', '--get', BOARD_NAME_CONFIG_KEY], cwd).stdout ||
    git(['config', '--get', LEGACY_REMOTE_BRANCH_CONFIG_KEY], cwd).stdout ||
    null;

  // Already fetched once (a previous attempt, or sync), no network needed.
  const knownName = configuredName ?? DEFAULT_BOARD_NAME;
  const known = boardTrackingRef(remote, knownName);
  if (git(['rev-parse', '--verify', '--quiet', known], cwd).ok) return { ref: known, remote, name: knownName };

  if (options.fresh || !recentProbeMiss(cwd, remote)) {
    const names = listRemoteBoards(cwd, remote);
    const name = names === null
      ? null
      : configuredName
        ? (names.includes(configuredName) ? configuredName : null)
        : names.includes(DEFAULT_BOARD_NAME)
          ? DEFAULT_BOARD_NAME
          : names.length === 1 ? names[0] : null;
    if (name) {
      const tracking = boardTrackingRef(remote, name);
      if (gitNetwork(['fetch', '--quiet', '--no-tags', remote, `+${remoteBoardRef(name)}:${tracking}`], cwd).ok) {
        clearProbeMiss(cwd);
        return { ref: tracking, remote, name };
      }
    }
  }

  // A board shared by 0.21.0 is a branch on the remote; a clone already has it.
  const legacyBranch = configuredName ?? branch;
  const legacy = `refs/remotes/${remote}/${legacyBranch}`;
  if (!git(['rev-parse', '--verify', '--quiet', legacy], cwd).ok && configuredRemote && (options.fresh || !recentProbeMiss(cwd, remote))) {
    gitNetwork(['fetch', '--quiet', '--no-tags', remote, `+refs/heads/${legacyBranch}:${legacy}`], cwd);
  }
  if (git(['rev-parse', '--verify', '--quiet', legacy], cwd).ok) return { ref: legacy, remote };

  recordProbeMiss(cwd, remote);
  return null;
}

/**
 * Resolution step 4: the board is not checked out anywhere (a fresh clone,
 * or the directory was removed). Create the worktree at
 * `<main worktree>/.brainfile` — or inside the common git dir for bare
 * layouts — and hide it from the code branch. Returns the new board
 * directory, or null when there is nothing to materialize.
 */
export function materializeBoardWorktree(cwd: string, options: MaterializeOptions = {}): string | null {
  const branch = boardBranch(cwd);
  const worktrees = listWorktrees(cwd);
  if (worktrees.length === 0) return null;
  if (worktrees.some((w) => w.branch === `refs/heads/${branch}`)) return null;
  const main = worktrees[0];
  let target: string;
  if (main.bare) {
    const common = gitCommonDir(cwd);
    if (!common) return null;
    target = path.join(common, 'brainfile');
  } else {
    target = path.join(main.path, '.brainfile');
  }
  if (fs.existsSync(target)) return null;
  const start = findBoardStart(cwd, branch, options);
  if (!start) return null;
  const r = start.remote
    ? git(['worktree', 'add', '--quiet', '--no-track', '-b', branch, target, start.ref], cwd)
    : git(['worktree', 'add', '--quiet', target, branch], cwd);
  if (!r.ok) return null;
  ensureExcludeEntry(cwd);
  // Boards shared before empty directories were kept arrive without them.
  for (const sub of BOARD_SUBDIRS) fs.mkdirSync(path.join(target, sub), { recursive: true });
  if (start.remote) {
    // The board arrived through this remote, so that is where it goes back to.
    if (!git(['config', '--get', 'brainfile.remote'], cwd).stdout) git(['config', 'brainfile.remote', start.remote], cwd);
    if (start.name && start.name !== DEFAULT_BOARD_NAME && !git(['config', '--get', BOARD_NAME_CONFIG_KEY], cwd).stdout) {
      git(['config', BOARD_NAME_CONFIG_KEY, start.name], cwd);
    }
  }
  const relative = path.relative(process.cwd(), target) || '.';
  process.stderr.write(
    start.remote
      ? `Checked out the shared board from ${start.remote} into ${relative}/\n`
      : `Checked out the board from the '${branch}' branch into ${relative}/\n`
  );
  return target;
}

/** Hide `.brainfile/` from the code branch without touching `.gitignore`. Returns true when an entry was added. */
export function ensureExcludeEntry(cwd: string): boolean {
  const common = gitCommonDir(cwd);
  if (!common) return false;
  const file = path.join(common, 'info', 'exclude');
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '';
  const present = existing
    .split(/\r?\n/)
    .some((line) => line.trim() === EXCLUDE_ENTRY || line.trim() === '.brainfile');
  if (present) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const separator = existing.length > 0 && !existing.endsWith('\n') ? '\n' : '';
  fs.appendFileSync(file, `${separator}${EXCLUDE_MARKER}\n${EXCLUDE_ENTRY}\n`, 'utf-8');
  return true;
}

/** Remove the exclude entry, but only the one we wrote (identified by its marker). */
export function removeExcludeEntry(cwd: string): boolean {
  const common = gitCommonDir(cwd);
  if (!common) return false;
  const file = path.join(common, 'info', 'exclude');
  if (!fs.existsSync(file)) return false;
  const lines = fs.readFileSync(file, 'utf-8').split(/\r?\n/);
  const at = lines.indexOf(EXCLUDE_MARKER);
  if (at < 0) return false;
  const removeCount = lines[at + 1]?.trim() === EXCLUDE_ENTRY ? 2 : 1;
  lines.splice(at, removeCount);
  fs.writeFileSync(file, lines.join('\n'), 'utf-8');
  return true;
}

/** `git worktree add --orphan -b <branch> <dotDir>` (git >= 2.42). */
export function createOrphanBoardWorktree(repoCwd: string, dotDir: string, branch: string): void {
  const r = git(['worktree', 'add', '--quiet', '--orphan', '-b', branch, dotDir], repoCwd);
  if (!r.ok) {
    throw new Error(
      `Could not create the board worktree on branch '${branch}' (git >= 2.42 is required for --orphan): ${r.stderr}`
    );
  }
}

/** `git init` inside the board directory for boards outside any repo. */
export function initStandaloneBoardRepo(dotDir: string): void {
  const parent = path.dirname(dotDir);
  let r = git(['init', '--quiet', '-b', 'main', dotDir], parent);
  if (!r.ok) r = git(['init', '--quiet', dotDir], parent);
  if (!r.ok) throw new Error(`Could not initialize a git repository in ${dotDir}: ${r.stderr}`);
}

export function boardIsDirty(dotDir: string): boolean {
  const r = git(['status', '--porcelain'], dotDir);
  return r.ok && r.stdout.length > 0;
}

export function boardHasCommits(dotDir: string): boolean {
  return git(['rev-parse', '--verify', '--quiet', 'HEAD'], dotDir).ok;
}

/** Files with uncommitted changes, relative to the board directory. */
/** Paths still carrying conflict markers from an unfinished merge. */
export function unmergedFiles(dotDir: string): string[] {
  const r = git(['diff', '--name-only', '--diff-filter=U'], dotDir);
  return r.ok ? r.stdout.split('\n').map((l) => l.trim()).filter(Boolean) : [];
}

export function boardDirtyFiles(dotDir: string): string[] {
  const r = git(['status', '--porcelain'], dotDir);
  if (!r.ok || !r.stdout) return [];
  // `git()` trims stdout, so the first line may have lost its leading status
  // column; strip the status letters and whitespace rather than a fixed width.
  return r.stdout
    .split('\n')
    .map((line) => line.replace(/^[ MADRCU?!]{1,2}\s+/, '').replace(/^.* -> /, '').trim())
    .filter(Boolean);
}

function identityArgs(dotDir: string): string[] {
  const args: string[] = [];
  if (!git(['config', '--get', 'user.name'], dotDir).stdout) args.push('-c', `user.name=${FALLBACK_IDENTITY_NAME}`);
  if (!git(['config', '--get', 'user.email'], dotDir).stdout) args.push('-c', `user.email=${FALLBACK_IDENTITY_EMAIL}`);
  return args;
}

type CommitListener = (dotDir: string) => void;
const commitListeners: CommitListener[] = [];

/** Run `listener` after every successful board commit made by this process. */
export function onBoardCommitted(listener: CommitListener): void {
  if (!commitListeners.includes(listener)) commitListeners.push(listener);
}

function notifyCommitted(dotDir: string): void {
  for (const listener of commitListeners) {
    try {
      listener(dotDir);
    } catch {
      /* listeners are best-effort */
    }
  }
}

export interface CommitBoardOptions {
  message: string;
  /** The agent acting, recorded as a `[name]` suffix; the author stays the git user. */
  agent?: string | null;
}

/**
 * Stage everything in the board directory and commit it. Returns true when a
 * commit was made, false when the board is plain or nothing changed. Never
 * throws: a failed commit must not fail the mutation it records.
 */
/**
 * git does not store empty directories, and a board without `board/` reads
 * as legacy on the other side. Keep both alive with a `.gitkeep`.
 */
export function ensureBoardDirs(dotDir: string): boolean {
  let created = false;
  for (const sub of BOARD_SUBDIRS) {
    const dir = path.join(dotDir, sub);
    try {
      fs.mkdirSync(dir, { recursive: true });
      const keep = path.join(dir, '.gitkeep');
      if (!fs.existsSync(keep)) {
        fs.writeFileSync(keep, '', 'utf-8');
        created = true;
      }
    } catch {
      /* best effort */
    }
  }
  return created;
}

export function commitBoard(dotDir: string, options: CommitBoardOptions): boolean {
  if (!isTrackedBoard(dotDir)) return false;
  ensureBoardDirs(dotDir);
  // A merge a human still owns must not be committed with its markers.
  if (unmergedFiles(dotDir).length > 0) return false;
  if (!git(['add', '-A'], dotDir).ok) return false;
  if (!boardIsDirty(dotDir)) return false;
  const agent = options.agent?.replace(/[[\]<>\r\n]/g, '').trim();
  const suffix = agent ? ` [${agent}]` : '';
  const message = oneLine(options.message, suffix);
  const r = git(
    [...identityArgs(dotDir), '-c', 'commit.gpgsign=false', 'commit', '--quiet', '--no-verify', '-m', message],
    dotDir
  );
  if (r.ok) notifyCommitted(dotDir);
  return r.ok;
}

/**
 * Commit outstanding hand edits (files changed outside the CLI) before a
 * command mutates, so they are never folded into that command's commit.
 */
export function commitHandEdits(dotDir: string): boolean {
  if (!isTrackedBoard(dotDir)) return false;
  // Boards created before the .gitkeep files existed get them in their own
  // commit, not folded into whatever command happens to run next.
  // git lists a directory holding only new files as `board/`, not its contents.
  const keepOnly = (f: string) => f.endsWith('.gitkeep') || BOARD_SUBDIRS.some((sub) => f === `${sub}/`);
  if (ensureBoardDirs(dotDir) && boardDirtyFiles(dotDir).every(keepOnly)) {
    commitBoard(dotDir, { message: 'chore: keep board/ and logs/ in git' });
  }
  const files = boardDirtyFiles(dotDir);
  if (files.length === 0) return false;
  const summary = files.length <= 3 ? files.join(', ') : `${files.length} files`;
  return commitBoard(dotDir, { message: `edit: ${summary}` });
}

/** The home board: `~/.brainfile`, addressed with `-g` / `--global` or `BRAINFILE_GLOBAL=1`. */
export function homeBoardDir(): string {
  return path.join(os.homedir(), '.brainfile');
}

export function isGlobalBoardRequested(argv: string[] = process.argv): boolean {
  if (process.env.BRAINFILE_GLOBAL === '1') return true;
  return argv.includes('-g') || argv.includes('--global');
}

/** One line of at most MAX_MESSAGE_LENGTH, keeping `suffix` whole at the end. */
function oneLine(message: string, suffix = ''): string {
  const flat = message.replace(/\s+/g, ' ').trim();
  const room = Math.max(1, MAX_MESSAGE_LENGTH - suffix.length);
  return `${flat.length > room ? `${flat.slice(0, room - 1)}…` : flat}${suffix}`;
}

interface CommandLike {
  name(): string;
  args: string[];
  opts(): Record<string, unknown>;
  parent?: CommandLike | null;
}

/**
 * Commit message for a CLI invocation: `<verb> <id>: <detail>`, e.g.
 * `move task-3: in-progress`, `add: Fix login bug`, `contract pickup task-2`.
 */
export function describeCommandForCommit(command: CommandLike): string {
  const names: string[] = [];
  let cursor: CommandLike | null | undefined = command;
  while (cursor && cursor.parent) {
    names.unshift(cursor.name());
    cursor = cursor.parent;
  }
  const opts = command.opts();
  const idValue = opts.task ?? opts.taskId;
  const id = Array.isArray(idValue) ? idValue.join(',') : typeof idValue === 'string' ? idValue : '';
  const positional = command.args.filter((a) => typeof a === 'string' && a.length > 0);
  const detail = [opts.title, opts.column, positional.join(' ')]
    .find((v): v is string => typeof v === 'string' && v.length > 0) ?? '';
  const head = `${names.join(' ')}${id ? ` ${id}` : ''}`;
  return oneLine(detail ? `${head}: ${detail}` : head);
}

// ── Debounced commits for long-running frontends (TUI) ──────────────────────

const pendingCommits = new Map<string, { messages: string[] }>();
let flushTimer: NodeJS.Timeout | null = null;
let exitHookInstalled = false;

/** Queue a commit for a board; bursts of edits within `delayMs` become one commit. */
export function scheduleBoardCommit(brainfilePath: string, message: string, delayMs = 2000): void {
  const dotDir = path.dirname(path.resolve(brainfilePath));
  if (!isTrackedBoard(dotDir)) return;
  const entry = pendingCommits.get(dotDir) ?? { messages: [] };
  entry.messages.push(message);
  pendingCommits.set(dotDir, entry);
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(flushBoardCommits, delayMs);
  flushTimer.unref?.();
  if (!exitHookInstalled) {
    exitHookInstalled = true;
    process.once('exit', flushBoardCommits);
  }
}

/** Commit every queued board now. Safe to call from an `exit` handler (synchronous). */
export function flushBoardCommits(): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  for (const [dotDir, entry] of pendingCommits) {
    const [first, ...rest] = entry.messages;
    const message = rest.length === 0 ? first : `${first} (+${rest.length} more)`;
    commitBoard(dotDir, { message });
  }
  pendingCommits.clear();
}
