/**
 * Fix a board problem from its line in the health list (task-34), for the
 * desktop, `brainfile fix` and the MCP `where` tool alike (task-78).
 *
 * A fix is offered only when it loses nothing: the copy that is kept already
 * holds every document every other copy has, at least as new. Running it
 * backs up every copy first (`refs/brainfile/backups/<stamp>-<what>`) and
 * runs nothing else if a backup fails; then it settles the board with core's
 * own steps:
 *
 * - `untrack`: the code branch still tracks an old copy of `.brainfile/`
 *   while the board lives on its branch. One commit on the code branch drops
 *   it and ignores `.brainfile/`, as `migrate --to-branch` does; other staged
 *   work is left alone.
 * - `adopt`: two copies where one already has everything, a checkout outside
 *   `.brainfile/`, or the board branch open in two places. Core's `adopt`
 *   takes the copy that has everything as the board, checked out at
 *   `.brainfile/` only (the code branch's copy untracked on the way).
 * - `prune`: a checkout of the board branch whose folder is gone is forgotten.
 *
 * An unfinished merge, two copies that each have changes, a standalone board
 * repository (its own history would go) and a live checkout with work in it
 * are never fixed here: a person decides those, with an agent's help.
 *
 * For 20 seconds after, Undo puts back what the fix changed. What it needs is
 * kept in `.brainfile/state/last-fix.json`, so Undo works from another
 * process than the fix: the desktop's Undo after `brainfile fix`, or
 * `brainfile fix --undo` after the desktop's Fix.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  boardBranch,
  boardRepoKind,
  git,
  gitCommonDir,
  isTrackedBoard,
  listWorktrees,
  pruneLostBoardCheckouts,
  unmergedFiles,
} from './boardRepo';
import {
  type BoardSighting,
  type BoardSurvey,
  type Contents,
  codeBranchTracks,
  compareContents,
  readFolder,
  readTree,
  surveyBoards,
} from './boards';
import {
  BACKUP_NAMESPACE,
  type BackupSource,
  adoptBoard,
  backupStamp,
  saveBoardBackup,
  untrackBoardOnCodeBranch,
} from './consolidate';

/** One copy of the board to save before anything changes. */
export interface FixCopy {
  label: string;
  what: string;
  source: BackupSource;
  /** Its folder, when it is one: the backup Undo puts back. */
  dir?: string;
}

/** What Fix would do, and what it runs. The desktop's window sees `kind` and `words`. */
export interface FixPlan {
  /** `untrack` the code branch's old copy, `adopt` the copy that has everything, or `prune` a lost checkout. */
  kind: 'untrack' | 'adopt' | 'prune';
  /** What it will do, in a few words, said before it runs: `Back up both, then untrack main's copy`. */
  words: string;
  /** What it does, without the backing up: `untrack main's copy`. */
  does: string;
  /** For `adopt`: the board to keep, as core's `adopt` takes it. */
  keep?: string;
  copies: FixCopy[];
  /** The repository's main worktree. */
  root: string;
}

/** What Undo needs to put things back. Kept in `state/last-fix.json` for 20 seconds. */
export interface FixUndoRecord {
  root: string;
  /** The code branch the fix committed on, and where it was. */
  code: { branch: string; before: string; after: string; gitignore: string | null } | null;
  /** `.git/info/exclude` as it was, when the fix changed it. */
  exclude: { file: string; before: string | null } | null;
  /** The board branch and its checkouts, as they were. */
  board: {
    branch: string;
    before: string | null;
    after: string;
    home: string;
    /** What stood at `.brainfile/`: a folder board, a checkout of the branch, or nothing. */
    homeWas: 'folder' | 'checkout' | 'none';
    /** The backup of that folder, put back in its place. */
    folderBackup: string | null;
    /** Checkouts of the branch elsewhere that the fix closed. */
    checkouts: string[];
    /** `brainfile.remote` as it was. */
    remote: string | null;
  } | null;
}

export interface AppliedFix {
  /** `Untracked main's copy. Push main to share it.` (the push only when there is a remote) */
  message: string;
  backups: string[];
  /** What Undo puts back, also kept in `state/last-fix.json`; null when there is nothing to undo. */
  undo: FixUndoRecord | null;
}

/** Paths compared as git reports them: symlinks resolved (`/tmp` is `/private/tmp` on macOS). */
function real(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

function inside(child: string, parent: string): boolean {
  const rel = path.relative(real(parent), real(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function must(r: ReturnType<typeof git>, what: string): string {
  if (!r.ok) throw new Error(`${what}: ${r.stderr || `git exited ${r.status}`}`);
  return r.stdout;
}

function commitOf(cwd: string, ref: string): string | null {
  const r = git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], cwd);
  return r.ok && r.stdout ? r.stdout : null;
}

/** ` Push main to share it.`, when there is somewhere to push it; a repository on this Mac only has nowhere. */
function pushHint(root: string, branch: string): string {
  return git(['remote'], root).stdout ? ` Push ${branch} to share it.` : '';
}

function readOrNull(file: string): string | null {
  try {
    return fs.readFileSync(file, 'utf-8');
  } catch {
    return null;
  }
}

function writeOrRemove(file: string, content: string | null): void {
  if (content === null) fs.rmSync(file, { force: true });
  else fs.writeFileSync(file, content, 'utf-8');
}

interface Repo {
  root: string;
  common: string;
  branch: string;
  branchRef: string;
  home: string;
}

function repoOf(dotDir: string): Repo | null {
  const probe = boardRepoKind(dotDir) === 'linked' ? dotDir : path.dirname(dotDir);
  const main = listWorktrees(probe)[0];
  const common = gitCommonDir(probe);
  if (!main || main.bare || !common) return null;
  const branch = boardBranch(probe);
  return { root: main.path, common, branch, branchRef: `refs/heads/${branch}`, home: real(path.join(main.path, '.brainfile')) };
}

/** A copy's documents: its folder when it has one (hand edits and all), else its tree in git. */
function contentsOf(s: BoardSighting, root: string): Contents | null {
  if (s.path && fs.existsSync(path.join(s.path, 'brainfile.md'))) return readFolder(s.path);
  if (s.kind === 'code-branch') return readTree(root, s.ref);
  if (s.commit) return readTree(root, s.commit);
  return null;
}

/** Does `keep` hold every document each of `all` holds, each the same or newer? */
function holdsAll(keep: BoardSighting, all: BoardSighting[], root: string): boolean {
  const mine = contentsOf(keep, root);
  if (!mine) return false;
  return all.every((other) => {
    if (other === keep) return true;
    const theirs = contentsOf(other, root);
    if (!theirs) return false;
    const relation = compareContents(mine, theirs);
    return relation === 'same' || relation === 'contains';
  });
}

/** How a copy reads in a few words: `origin's`, `the branch`, `the folder`. */
function shortLabel(s: BoardSighting): string {
  if (s.kind === 'remote') return s.label;
  if (s.kind === 'branch') return 'the branch';
  return 'the folder';
}

function copyOf(s: BoardSighting, repo: Repo): FixCopy {
  const label = s.kind === 'folder' ? `the folder ${s.path}` : s.label;
  if (s.kind === 'folder') return { label, what: 'folder', source: { dir: s.path! }, dir: s.path };
  if (s.kind === 'code-branch') {
    const head = commitOf(repo.root, 'HEAD');
    return { label, what: s.label.replace(/^the copy on /, ''), source: { treeish: `${head ?? 'HEAD'}:.brainfile` } };
  }
  if (s.kind === 'remote') return { label, what: s.remote ?? 'remote', source: { treeish: s.commit!, parent: s.commit } };
  const tip = s.commit ?? commitOf(repo.root, repo.branchRef) ?? undefined;
  if (s.path && fs.existsSync(path.join(s.path, 'brainfile.md'))) return { label, what: 'branch', source: { dir: s.path, ...(tip ? { parent: tip } : {}) } };
  return { label, what: 'branch', source: { treeish: tip!, parent: tip } };
}

// ── The problem, in the health list's words ─────────────────────────────────

/** One thing wrong with where the board lives: its few words for the list, and its one plain sentence under them. */
export interface BoardProblem {
  /** `two copies`, `merge unfinished`, `open elsewhere`, `open twice`, `old copy in main`. */
  short: string;
  /** `Origin's (19) already has everything this folder (7) has.` */
  line: string;
}

const capital = (text: string): string => `${text[0]?.toUpperCase() ?? ''}${text.slice(1)}`;

/** `this folder (7)`. */
const counted = (b: BoardSighting): string => `${b.label} (${b.docs})`;

/** `board/task-3.md`, `board/task-3.md and 2 more`. */
function firstOf(files: string[]): string {
  return files.length > 1 ? `${files[0]} and ${files.length - 1} more` : files[0];
}

/**
 * Every problem with where the board lives, worst first, as the desktop's
 * health list says them and `brainfile fix` prints them. `survey` is
 * `surveyBoards`; `unfinished` the files a merge left with conflict markers.
 */
export function boardProblems(survey: BoardSurvey, unfinished: string[] = []): BoardProblem[] {
  const problems: BoardProblem[] = [];
  const conflict = survey.conflict;
  if (conflict) {
    const { current, other, relation } = conflict;
    const line =
      relation === 'contained'
        ? `${capital(counted(other))} already has everything ${counted(current)} has.`
        : relation === 'contains'
          ? `${capital(counted(current))} already has everything ${counted(other)} has.`
          : relation === 'unrelated'
            ? `${capital(counted(current))} and ${counted(other)} share no history.`
            : `${capital(counted(current))} and ${counted(other)} each have changes the other lacks.`;
    problems.push({ short: 'two copies', line });
  }
  if (unfinished.length > 0) {
    problems.push({ short: 'merge unfinished', line: `A merge stopped with conflicts in ${firstOf(unfinished)}.` });
  }
  if (survey.outsideHome) {
    problems.push({ short: 'open elsewhere', line: 'This board is checked out outside .brainfile/, where it belongs.' });
  }
  const elsewhere = survey.strayWorktrees.filter((w) => !w.missing);
  if (elsewhere.length > 0) {
    problems.push({
      short: 'open twice',
      line: elsewhere.length === 1 ? `Also checked out at ${elsewhere[0].path}.` : `Also checked out in ${elsewhere.length} other folders.`,
    });
  }
  if (survey.trackedTwice) {
    const branch = survey.trackedTwice.label.replace(/^the copy on /, '');
    problems.push({ short: `old copy in ${branch}`, line: `An old copy of .brainfile/ (${survey.trackedTwice.docs} docs) is still tracked on ${branch}.` });
  }
  return problems;
}

// ── Fix ─────────────────────────────────────────────────────────────────────

const backUp = (n: number): string => (n <= 1 ? 'Back up' : n === 2 ? 'Back up both' : `Back up all ${n}`);

/**
 * What Fix would do about the board at `dotDir` now, or null when nothing
 * can be fixed without a person's choice. `project` is the folder the window
 * opened it from: a fix that would remove the checkout it lives in is not
 * offered. `surveyed` saves surveying again when the caller just did.
 */
export function planFix(dotDir: string, project?: string, surveyed?: BoardSurvey): FixPlan | null {
  const repo = repoOf(dotDir);
  if (!repo) return null;
  const survey = surveyed ?? surveyBoards(dotDir);
  const current = survey.boards[0];
  if (!current) return null;

  // A merge left half-done is a person's call: which version of each file is right.
  const checkouts = listWorktrees(repo.root).filter((w) => w.branch === repo.branchRef && fs.existsSync(w.path));
  if (checkouts.some((c) => unmergedFiles(c.path).length > 0)) return null;
  if (isTrackedBoard(dotDir) && unmergedFiles(dotDir).length > 0) return null;

  const live = survey.strayWorktrees.filter((w) => !w.missing);
  let keep: BoardSighting | null = null;
  let does = '';
  if (survey.conflict) {
    const { relation, other } = survey.conflict;
    if (relation === 'contained') {
      keep = other;
      does = `use ${shortLabel(other)}`;
    } else if (relation === 'contains') {
      keep = current;
      does = 'keep this one';
    } else {
      return null;
    }
  } else if (survey.outsideHome) {
    keep = current;
    does = 'move it into .brainfile/';
  } else if (live.length > 0) {
    keep = current;
    does = live.length === 1 ? 'close the extra checkout' : `close ${live.length} extra checkouts`;
  }

  if (keep) {
    // A board that is its own repository would lose its history when replaced.
    if (survey.boards.some((b) => b.kind === 'folder' && b.storage === 'standalone')) return null;
    // Every checkout but .brainfile/ is closed: each must have nothing uncommitted, and none may hold the project itself.
    const closing = checkouts.filter((c) => real(c.path) !== repo.home);
    for (const c of closing) {
      if (git(['status', '--porcelain'], c.path).stdout) return null;
      if (project && inside(project, c.path)) return null;
    }
    // The code branch's copy goes on the way. When the folder has changes it
    // has not committed there, its last commit is a copy of its own.
    const all = [...survey.boards];
    const folderAtHome = survey.boards.find((b) => b.kind === 'folder' && b.path && real(b.path) === repo.home && b.trackedBy);
    const committed = folderAtHome ? readTree(repo.root, 'HEAD:.brainfile') : null;
    if (folderAtHome && committed && !survey.trackedTwice && compareContents(readFolder(repo.home), committed) !== 'same') {
      all.push({ kind: 'code-branch', ref: 'HEAD:.brainfile', label: `the copy on ${folderAtHome.trackedBy}`, docs: committed.docs.size, lastChange: null });
    }
    if (!holdsAll(keep, all, repo.root)) return null;
    const code = codeBranchTracks(repo.root) ? git(['symbolic-ref', '--quiet', '--short', 'HEAD'], repo.root).stdout : '';
    if (code) does = `${does}, untrack ${code}'s copy`;
    const copies = all.map((b) => copyOf(b, repo));
    return { kind: 'adopt', words: `${backUp(copies.length)}, then ${does}`, does, keep: keep.ref, copies, root: repo.root };
  }

  if (survey.trackedTwice) {
    const branch = git(['symbolic-ref', '--quiet', '--short', 'HEAD'], repo.root).stdout;
    // Detached, there is no branch to commit on.
    if (!branch) return null;
    if (!holdsAll(current, [current, survey.trackedTwice], repo.root)) return null;
    const copies = [current, survey.trackedTwice].map((b) => copyOf(b, repo));
    does = `untrack ${branch}'s copy`;
    return { kind: 'untrack', words: `${backUp(copies.length)}, then ${does}`, does, copies, root: repo.root };
  }

  if (survey.strayWorktrees.some((w) => w.missing)) {
    does = survey.strayWorktrees.filter((w) => w.missing).length === 1 ? 'forget the lost checkout' : 'forget the lost checkouts';
    return { kind: 'prune', words: `Back up, then ${does}`, does, copies: [copyOf(current, repo)], root: repo.root };
  }
  return null;
}

// ── Undo, kept in state/ ────────────────────────────────────────────────────

/** How long after a fix Undo can still put it back, from any process; the desktop offers it for ten seconds. */
export const FIX_UNDO_MS = 20_000;

/** The last fix, as `state/last-fix.json` keeps it. */
export interface LastFix {
  /** When it ran (ISO); Undo is refused once `FIX_UNDO_MS` has passed. */
  at: string;
  /** The plan's words: `Back up both, then untrack main's copy`. */
  words: string;
  record: FixUndoRecord;
}

/** `state/last-fix.json` of the board at `dotDir`: in `.brainfile/` of the main worktree, where every fix leaves the board. */
export function lastFixFile(dotDir: string): string {
  const repo = repoOf(dotDir);
  return path.join(repo ? repo.home : real(dotDir), 'state', 'last-fix.json');
}

/** The last fix, while Undo can still put it back; null when there is none, or it is too late. */
export function lastFix(dotDir: string, now = Date.now()): LastFix | null {
  let kept: LastFix;
  try {
    kept = JSON.parse(fs.readFileSync(lastFixFile(dotDir), 'utf-8')) as LastFix;
  } catch {
    return null;
  }
  const at = Date.parse(kept?.at);
  if (!kept?.record || Number.isNaN(at) || now - at > FIX_UNDO_MS) return null;
  return kept;
}

function forgetFix(dotDir: string): void {
  fs.rmSync(lastFixFile(dotDir), { force: true });
}

/**
 * Back up every copy, then run the plan. `expected` is the plan's words as
 * the person confirmed them: if the plan is different now, nothing runs.
 * What Undo needs goes in `state/last-fix.json`; a fix that cannot be undone
 * clears the last one's, which would no longer put things back as they were.
 */
export function applyFix(dotDir: string, options: { expected?: string; project?: string; now?: number } = {}): AppliedFix {
  const plan = planFix(dotDir, options.project);
  if (!plan) throw new Error('No safe fix here now. Nothing was changed.');
  if (options.expected && plan.words !== options.expected) {
    throw new Error(`The board changed: Fix would now ${plan.does}. Nothing was changed.`);
  }
  forgetFix(dotDir);
  const applied = runFix(dotDir, plan);
  if (applied.undo) {
    const file = lastFixFile(dotDir);
    const kept: LastFix = { at: new Date(options.now ?? Date.now()).toISOString(), words: plan.words, record: applied.undo };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(kept, null, 2)}\n`, 'utf-8');
  }
  return applied;
}

function runFix(dotDir: string, plan: FixPlan): AppliedFix {
  const repo = repoOf(dotDir)!;

  // Backups first. If one fails, it throws and nothing else runs.
  const stamp = backupStamp();
  const backups = plan.copies.map((c) => saveBoardBackup(dotDir, c.source, `${c.label} before fix: ${plan.does}`, c.what, stamp));

  if (plan.kind === 'prune') {
    const forgotten = pruneLostBoardCheckouts(repo.root);
    return { message: forgotten.length === 1 ? 'Forgot the lost checkout.' : `Forgot ${forgotten.length} lost checkouts.`, backups, undo: null };
  }

  const gitignore = path.join(repo.root, '.gitignore');
  const branchHere = git(['symbolic-ref', '--quiet', '--short', 'HEAD'], repo.root).stdout;
  const codeBefore = commitOf(repo.root, 'HEAD');
  const ignoreBefore = readOrNull(gitignore);

  if (plan.kind === 'untrack') {
    const untracked = untrackBoardOnCodeBranch(repo.root);
    if (!untracked) throw new Error(`${branchHere || 'The code branch'} no longer tracks .brainfile/. Nothing else was changed.`);
    return {
      message: `Untracked ${untracked.branch}'s copy.${pushHint(repo.root, untracked.branch)}`,
      backups,
      undo: {
        root: repo.root,
        code: { branch: untracked.branch, before: codeBefore!, after: untracked.commit, gitignore: ignoreBefore },
        exclude: null,
        board: null,
      },
    };
  }

  // adopt: note how things stand, so Undo can put them back.
  const exclude = path.join(repo.common, 'info', 'exclude');
  const excludeBefore = readOrNull(exclude);
  const branchBefore = commitOf(repo.root, repo.branchRef);
  const checkouts = listWorktrees(repo.root).filter((w) => w.branch === repo.branchRef && fs.existsSync(w.path));
  const homeIsCheckout = checkouts.some((c) => real(c.path) === repo.home);
  const homeIsFolder = !homeIsCheckout && fs.existsSync(path.join(repo.home, 'brainfile.md'));
  const folderAt = plan.copies.findIndex((c) => c.dir && real(c.dir) === repo.home);
  const remoteBefore = git(['config', '--get', 'brainfile.remote'], repo.root).stdout || null;

  const result = adoptBoard(dotDir, plan.keep!);
  const after = commitOf(repo.root, repo.branchRef)!;
  const label = plan.does.split(',')[0];
  const done = label.startsWith('use ')
    ? `Using ${label.slice(4)}.`
    : label === 'keep this one'
      ? 'Kept this one.'
      : label.startsWith('move')
        ? 'Moved into .brainfile/.'
        : result.removedCheckouts.length === 1
          ? 'Closed the extra checkout.'
          : `Closed ${result.removedCheckouts.length} extra checkouts.`;
  const message = result.untracked ? `${done}${pushHint(repo.root, result.untracked.branch)}` : done;
  return {
    message,
    backups: [...backups, ...result.backups],
    undo: {
      root: repo.root,
      code: result.untracked ? { branch: result.untracked.branch, before: codeBefore!, after: result.untracked.commit, gitignore: ignoreBefore } : null,
      exclude: { file: exclude, before: excludeBefore },
      board: {
        branch: repo.branch,
        before: branchBefore,
        after,
        home: repo.home,
        homeWas: homeIsCheckout ? 'checkout' : homeIsFolder ? 'folder' : 'none',
        folderBackup: homeIsFolder && folderAt >= 0 ? backups[folderAt] : null,
        checkouts: result.removedCheckouts,
        remote: remoteBefore,
      },
    },
  };
}

/** Write the board saved at `ref` into `dir`, without touching any real index. */
function checkoutInto(root: string, common: string, ref: string, dir: string): void {
  const index = path.join(common, `brainfile-undo-${process.pid}-${Date.now()}`);
  const env = { GIT_INDEX_FILE: index };
  try {
    fs.mkdirSync(dir, { recursive: true });
    must(git(['read-tree', ref], root, env), `read ${ref}`);
    must(git(['checkout-index', '--all', '--force', `--prefix=${dir}${path.sep}`], root, env), `write ${dir}`);
  } finally {
    fs.rmSync(index, { force: true });
  }
}

/**
 * Put back what the last fix changed, within `FIX_UNDO_MS` of it, whichever
 * process ran it. Refuses, changing nothing, when the board or the code
 * branch has moved on since. The board it replaces is backed up first. One
 * go: refused or not, the fix cannot be undone again.
 */
export function undoFix(dotDir: string, options: { now?: number } = {}): string {
  const kept = lastFix(dotDir, options.now);
  forgetFix(dotDir);
  if (!kept) throw new Error('Too late to undo; brainfile backups has every copy.');
  return putBack(kept.record);
}

function putBack(record: FixUndoRecord): string {
  const { root, code, board } = record;
  const common = gitCommonDir(root);
  if (!common) throw new Error('The repository is gone. Nothing was put back.');

  // Everything that can refuse, before anything changes.
  if (code && commitOf(root, `refs/heads/${code.branch}`) !== code.after) {
    throw new Error(`${code.branch} has moved on since. Nothing was put back; brainfile backups has every copy.`);
  }
  const branchRef = board ? `refs/heads/${board.branch}` : '';
  if (board && commitOf(root, branchRef) !== board.after) {
    throw new Error('The board has changed since. Nothing was put back; brainfile backups has every copy.');
  }
  if (board) {
    for (const p of board.checkouts) {
      if (fs.existsSync(p)) throw new Error(`${p} is in use again. Nothing was put back; brainfile backups has every copy.`);
    }
  }

  if (board) {
    // The board as the fix left it is a copy too.
    saveBoardBackup(board.home, { dir: board.home, parent: board.after }, `the board at ${board.home} before undoing a fix`, 'undo');
    if (board.homeWas === 'checkout') {
      // .brainfile/ stays the checkout; only the branch steps back, keeping anything not yet committed.
      if (board.before && board.before !== board.after) must(git(['reset', '--keep', '--quiet', board.before], board.home), 'step the board back');
    } else {
      // Local-only state (brief positions, the search index) goes back with the folder.
      const state = path.join(board.home, 'state');
      const keepState = fs.existsSync(state) ? fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-state-')) : null;
      if (keepState) fs.cpSync(state, keepState, { recursive: true });
      must(git(['worktree', 'remove', '--force', board.home], root), 'close the board checkout');
      if (board.before) must(git(['update-ref', branchRef, board.before, board.after], root), `move '${board.branch}' back`);
      else must(git(['update-ref', '-d', branchRef, board.after], root), `remove '${board.branch}'`);
      if (board.homeWas === 'folder' && board.folderBackup) {
        checkoutInto(root, common, `${BACKUP_NAMESPACE}/${board.folderBackup}`, board.home);
        for (const sub of ['board', 'logs']) fs.mkdirSync(path.join(board.home, sub), { recursive: true });
        if (keepState) fs.cpSync(keepState, state, { recursive: true });
      }
      if (keepState) fs.rmSync(keepState, { recursive: true, force: true });
    }
    // The checkouts it closed come back where they were.
    if (board.before) {
      for (const p of board.checkouts) must(git(['worktree', 'add', '--quiet', '--force', p, board.branch], root), `check the board out at ${p} again`);
    }
    const remoteNow = git(['config', '--get', 'brainfile.remote'], root).stdout || null;
    if (remoteNow !== board.remote) {
      if (board.remote) git(['config', 'brainfile.remote', board.remote], root);
      else git(['config', '--unset', 'brainfile.remote'], root);
    }
  }

  if (code) {
    must(git(['update-ref', `refs/heads/${code.branch}`, code.before, code.after], root), `move ${code.branch} back`);
    // The index takes .brainfile/ and .gitignore from the commit it is back on; the rest of it is as it was.
    git(['reset', '--quiet', '--', '.brainfile', '.gitignore'], root);
    writeOrRemove(path.join(root, '.gitignore'), code.gitignore);
  }
  if (record.exclude) writeOrRemove(record.exclude.file, record.exclude.before);
  return 'Put back as it was.';
}
