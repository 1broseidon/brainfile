/**
 * Every board a repository has (spec-15). A repo should have one board, but
 * it can end up with two: a `.brainfile/` folder in the checkout (plain
 * files, its own repository, or tracked by the code branch) beside the board
 * branch, or a local board branch whose history has nothing in common with
 * the remote's. Resolution picks one place to read and write; this module
 * looks at the others and says when they disagree, so nothing writes to the
 * stale one.
 *
 * Two homes count: the folder in the checkout, and the board-branch lineage
 * (the local branch and the remote's `refs/brainfile/<name>`). Within the
 * lineage, ahead, behind or diverged from a shared ancestor is sync state,
 * not two boards. Offline unless asked to fetch.
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import {
  boardBranch,
  boardRepoKind,
  boardTrackingRef,
  git,
  gitNetwork,
  gitToplevel,
  listWorktrees,
  remoteBoardRef,
} from './boardRepo';
import { boardRemote, boardRemoteName } from './boardSync';

export type SightingKind = 'folder' | 'branch' | 'remote' | 'code-branch';

/** One copy of a board: where it is, how much it holds, and when it last changed. */
export interface BoardSighting {
  kind: SightingKind;
  /** What to pass to `merge-boards` / `adopt`: a folder path, or a git ref. */
  ref: string;
  /** How a person reads it in a sentence: `this folder`, `origin's`, … */
  label: string;
  /** A checkout of it on disk, when there is one. */
  path?: string;
  remote?: string;
  /** Tip commit, for a git ref. */
  commit?: string;
  /** For a folder: `plain`, `standalone` (its own repository) or `linked` (a worktree). */
  storage?: 'plain' | 'standalone' | 'linked';
  /** For a folder: the code branch that tracks it, if any. */
  trackedBy?: string;
  /** Documents (tasks, specs, logs…): `board/*.md` plus `logs/*.md`. */
  docs: number;
  /** Latest `updatedAt` / `completedAt` / `createdAt` across its documents. */
  lastChange: string | null;
}

/** How one board stands against another. */
export type BoardRelation =
  /** Same documents, same contents. */
  | 'same'
  /** This one has everything the other has, at least as new. */
  | 'contains'
  /** The other one has everything this one has, at least as new. */
  | 'contained'
  /** Each has something the other lacks. */
  | 'diverged';

export interface BoardConflict {
  /** The board resolution picked: where reads and writes go. */
  current: BoardSighting;
  /** The board it disagrees with. */
  other: BoardSighting;
  relation: BoardRelation | 'unrelated';
  /** `Two boards: this folder (7) and origin's (19, newer).` */
  message: string;
  /** The command that settles it, e.g. `brainfile adopt refs/brainfile/remotes/origin/board`. */
  resolve: string;
}

export interface LineageState {
  remote: string;
  /** Last-known position of the board on the remote, e.g. `refs/brainfile/remotes/origin/board`. */
  ref: string;
  /** Commits here the remote has not seen; null when the local branch does not exist. */
  ahead: number | null;
  /** Commits on the remote not here yet. */
  behind: number | null;
  /** No shared history: two boards, not one board out of step. */
  unrelated: boolean;
}

export interface StrayWorktree {
  path: string;
  /** The folder is gone; `git worktree prune` would drop it. */
  missing: boolean;
}

export interface BoardSurvey {
  /** Every copy found, the current board first. */
  boards: BoardSighting[];
  /** Set when the current board and another disagree: nothing should write until it is settled. */
  conflict: BoardConflict | null;
  /** The local board branch against the remote's copy, when both are known. */
  lineage: LineageState | null;
  /** Worktrees of the board branch somewhere other than its home at `.brainfile/`. */
  strayWorktrees: StrayWorktree[];
  /**
   * The code branch also tracks `.brainfile/` while the board lives on its
   * own branch: a second, stale copy that rides along with code commits.
   */
  trackedTwice: BoardSighting | null;
}

export interface SurveyOptions {
  /** Refresh the remote's copy first (one network round trip, bounded). Default false. */
  fetch?: boolean;
}

interface Doc {
  /** Path inside the board, e.g. `board/task-3.md`. */
  path: string;
  /** git blob id of its contents. */
  blob: string;
  /** Raw contents, read on demand. */
  read: () => string;
}

interface Contents {
  docs: Map<string, Doc>;
  config: string | null;
}

const DOC_PATH = /^(board|logs)\/([^/]+)\.md$/;
const STAMP_FIELD = /^(updatedAt|completedAt|createdAt):\s*["']?([0-9][0-9T:.+\-Z]*)["']?\s*$/gm;

function blobId(content: Buffer): string {
  return crypto.createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex');
}

function readFolder(dotDir: string): Contents {
  const docs = new Map<string, Doc>();
  for (const sub of ['board', 'logs']) {
    let names: string[] = [];
    try {
      names = fs.readdirSync(path.join(dotDir, sub));
    } catch {
      continue;
    }
    for (const name of names) {
      const rel = `${sub}/${name}`;
      const m = DOC_PATH.exec(rel);
      if (!m) continue;
      const full = path.join(dotDir, sub, name);
      let content: Buffer;
      try {
        content = fs.readFileSync(full);
      } catch {
        continue;
      }
      docs.set(m[2], { path: rel, blob: blobId(content), read: () => content.toString('utf-8') });
    }
  }
  let config: string | null = null;
  try {
    config = blobId(fs.readFileSync(path.join(dotDir, 'brainfile.md')));
  } catch {
    /* none */
  }
  return { docs, config };
}

/** `git cat-file --batch` for many blobs in one process. */
function readBlobs(cwd: string, ids: string[]): Map<string, string> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const r = spawnSync('git', ['cat-file', '--batch'], { cwd, input: `${ids.join('\n')}\n`, maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0 || !r.stdout) return out;
  const buf = r.stdout as Buffer;
  let at = 0;
  while (at < buf.length) {
    const eol = buf.indexOf(10, at);
    if (eol < 0) break;
    const [id, type, size] = buf.subarray(at, eol).toString('utf-8').split(' ');
    if (type === 'missing' || size === undefined) {
      at = eol + 1;
      continue;
    }
    const n = Number.parseInt(size, 10);
    out.set(id, buf.subarray(eol + 1, eol + 1 + n).toString('utf-8'));
    at = eol + 1 + n + 1;
  }
  return out;
}

/** A board's documents at a git tree-ish (`refs/heads/brainfile`, `HEAD:.brainfile`). */
function readTree(cwd: string, treeish: string): Contents | null {
  const r = git(['ls-tree', '-r', '-z', treeish], cwd);
  if (!r.ok) return null;
  const docs = new Map<string, Doc>();
  let config: string | null = null;
  let cache: Map<string, string> | null = null;
  const blobs: string[] = [];
  for (const entry of r.stdout.split('\0')) {
    const tab = entry.indexOf('\t');
    if (tab < 0) continue;
    const [, type, blob] = entry.slice(0, tab).split(' ');
    const rel = entry.slice(tab + 1);
    if (type !== 'blob') continue;
    if (rel === 'brainfile.md') {
      config = blob;
      continue;
    }
    const m = DOC_PATH.exec(rel);
    if (!m) continue;
    blobs.push(blob);
    docs.set(m[2], {
      path: rel,
      blob,
      read: () => {
        cache ??= readBlobs(cwd, blobs);
        return cache.get(blob) ?? '';
      },
    });
  }
  if (docs.size === 0 && config === null) return null;
  return { docs, config };
}

function stampOf(doc: Doc): string {
  const head = doc.read().slice(0, 4000);
  let latest = '';
  for (const m of head.matchAll(STAMP_FIELD)) if (m[2] > latest) latest = m[2];
  return latest;
}

function lastChange(contents: Contents): string | null {
  let latest = '';
  for (const doc of contents.docs.values()) {
    const s = stampOf(doc);
    if (s > latest) latest = s;
  }
  return latest || null;
}

/** Does `a` hold every document `b` holds, each the same or newer? */
function holds(a: Contents, b: Contents): boolean {
  for (const [id, theirs] of b.docs) {
    const ours = a.docs.get(id);
    if (!ours) return false;
    if (ours.blob === theirs.blob) continue;
    // A completed task moves from board/ to logs/; completion is the newer state.
    if (ours.path.startsWith('logs/') && theirs.path.startsWith('board/')) continue;
    if (theirs.path.startsWith('logs/') && ours.path.startsWith('board/')) return false;
    if (stampOf(ours) < stampOf(theirs)) return false;
  }
  return true;
}

/** How board `a` stands against board `b`, by content. */
export function compareContents(a: Contents, b: Contents): BoardRelation {
  const sameDocs = a.docs.size === b.docs.size && [...a.docs].every(([id, d]) => b.docs.get(id)?.blob === d.blob);
  if (sameDocs) return 'same';
  const aHolds = holds(a, b);
  const bHolds = holds(b, a);
  if (aHolds && !bHolds) return 'contains';
  if (bHolds && !aHolds) return 'contained';
  return 'diverged';
}

function count(cwd: string, range: string): number {
  const r = git(['rev-list', '--count', range], cwd);
  return r.ok ? Number.parseInt(r.stdout, 10) || 0 : 0;
}

function resolveRef(cwd: string, ref: string): string | null {
  const r = git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], cwd);
  return r.ok && r.stdout ? r.stdout : null;
}

/** The code branch checked out in `worktree`, or null when detached. */
function currentBranch(worktree: string): string | null {
  const r = git(['symbolic-ref', '--quiet', '--short', 'HEAD'], worktree);
  return r.ok && r.stdout ? r.stdout : null;
}

/** Is `rel` (a folder) tracked by the index of the worktree at `root`? */
function trackedByIndex(root: string, rel: string): boolean {
  const r = git(['ls-files', '--', rel], root);
  return r.ok && r.stdout.length > 0;
}

/** Paths compared as git reports them: symlinks resolved (`/tmp` is `/private/tmp` on macOS). */
function real(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

function sighting(base: Omit<BoardSighting, 'docs' | 'lastChange'>, contents: Contents): BoardSighting {
  return { ...base, docs: contents.docs.size, lastChange: lastChange(contents) };
}

function describeConflict(current: BoardSighting, other: BoardSighting, relation: BoardConflict['relation']): BoardConflict {
  const newer = (a: BoardSighting, b: BoardSighting) => (a.lastChange ?? '') > (b.lastChange ?? '');
  const part = (b: BoardSighting, vs: BoardSighting) => `${b.label} (${b.docs}${newer(b, vs) ? ', newer' : ''})`;
  const message = `Two boards: ${part(current, other)} and ${part(other, current)}.`;
  let resolve: string;
  if (relation === 'contained') {
    resolve = `brainfile adopt ${other.ref}`;
  } else if (relation === 'contains') {
    resolve = `brainfile adopt ${current.ref}`;
  } else {
    resolve = `brainfile merge-boards ${other.ref}`;
  }
  return { current, other, relation, message, resolve };
}

/**
 * Look for every board the repository around `dotDir` has. `dotDir` is the
 * board resolution picked; the survey says whether another copy disagrees
 * with it. Outside a repository there is only ever the one.
 */
export function surveyBoards(dotDir: string, options: SurveyOptions = {}): BoardSurvey {
  const dir = real(dotDir);
  const kind = boardRepoKind(dir);
  const worktrees = listWorktrees(kind === 'linked' ? dir : path.dirname(dir));
  const empty: BoardSurvey = { boards: [], conflict: null, lineage: null, strayWorktrees: [], trackedTwice: null };
  const here = readFolder(dir);
  const branch = boardBranch(dir);
  const branchRef = `refs/heads/${branch}`;
  const onBoardBranch = kind === 'linked' && worktrees.find((w) => real(w.path) === dir)?.branch === branchRef;

  const currentSighting = (storage: BoardSighting['storage'], trackedBy?: string): BoardSighting =>
    sighting(
      onBoardBranch
        ? { kind: 'branch', ref: branchRef, label: `the '${branch}' branch`, path: dir, storage }
        : { kind: 'folder', ref: dir, label: 'this folder', path: dir, storage, ...(trackedBy ? { trackedBy } : {}) },
      here
    );

  // A folder in no repository, or a board that is its own repository with
  // no code repository around it: there is nothing else to look at.
  if (worktrees.length === 0) {
    return { ...empty, boards: [currentSighting(kind ?? 'plain')] };
  }

  const cwd = kind === 'linked' ? dir : path.dirname(dir);
  const main = worktrees[0];
  const home = main.bare ? null : real(path.join(main.path, '.brainfile'));

  // A folder board may be tracked by the code branch checked out around it.
  let trackedBy: string | undefined;
  if (!onBoardBranch) {
    const codeRoot = gitToplevel(path.dirname(dir));
    const rel = codeRoot ? path.relative(real(codeRoot), dir).split(path.sep).join('/') : '';
    if (codeRoot && rel && !rel.startsWith('..') && trackedByIndex(codeRoot, rel)) trackedBy = currentBranch(codeRoot) ?? 'HEAD';
  }
  const current = currentSighting(kind ?? 'plain', trackedBy);
  const survey: BoardSurvey = { ...empty, boards: [current] };

  // Worktrees of the board branch away from its home.
  survey.strayWorktrees = worktrees
    .filter((w) => w.branch === branchRef && (!home || real(w.path) !== home))
    .map((w) => ({ path: w.path, missing: !fs.existsSync(w.path) }));

  // The lineage: the local branch and the remote's copy.
  const remote = boardRemote(cwd) ?? (git(['remote', 'get-url', 'origin'], cwd).ok ? 'origin' : null);
  const name = boardRemoteName(cwd);
  const tracking = remote ? boardTrackingRef(remote, name) : null;
  if (options.fetch && remote && tracking) {
    const r = gitNetwork(['fetch', '--quiet', '--no-tags', remote, `+${remoteBoardRef(name)}:${tracking}`], cwd);
    if (!r.ok && /couldn't find remote ref|no such ref/i.test(r.stderr)) git(['update-ref', '-d', tracking], cwd);
  }
  const localTip = resolveRef(cwd, branchRef);
  const remoteTip = tracking ? resolveRef(cwd, tracking) : null;

  let local: { sighting: BoardSighting; contents: Contents } | null = null;
  if (localTip && !onBoardBranch) {
    const contents = readTree(cwd, localTip);
    if (contents) {
      const out = survey.strayWorktrees.find((w) => !w.missing)?.path;
      local = {
        contents,
        sighting: sighting({ kind: 'branch', ref: branchRef, label: `the '${branch}' branch`, commit: localTip, ...(out ? { path: out } : {}) }, contents),
      };
      survey.boards.push(local.sighting);
    }
  }

  let fromRemote: { sighting: BoardSighting; contents: Contents } | null = null;
  if (remote && tracking && remoteTip) {
    const contents = readTree(cwd, remoteTip);
    if (contents) {
      fromRemote = {
        contents,
        sighting: sighting({ kind: 'remote', ref: tracking, label: `${remote}'s`, remote, commit: remoteTip }, contents),
      };
      survey.boards.push(fromRemote.sighting);
    }
  }

  if (localTip && remoteTip && remote && tracking) {
    const related = git(['merge-base', localTip, remoteTip], cwd).ok;
    survey.lineage = {
      remote,
      ref: tracking,
      ahead: related ? count(cwd, `${remoteTip}..${localTip}`) : null,
      behind: related ? count(cwd, `${localTip}..${remoteTip}`) : null,
      unrelated: !related,
    };
  } else if (remoteTip && remote && tracking) {
    survey.lineage = { remote, ref: tracking, ahead: null, behind: null, unrelated: false };
  }

  if (onBoardBranch) {
    // The board is the branch's checkout. Another board is a folder at its
    // home it is not checked out in, or the remote's copy with no shared history.
    if (home && home !== dir && fs.existsSync(path.join(home, 'brainfile.md'))) {
      const folder = readFolder(home);
      const homeKind = boardRepoKind(home);
      const tracked = trackedByIndex(main.path, '.brainfile');
      const s = sighting(
        {
          kind: 'folder',
          ref: home,
          label: 'the folder in the checkout',
          path: home,
          storage: homeKind ?? 'plain',
          ...(tracked ? { trackedBy: currentBranch(main.path) ?? 'HEAD' } : {}),
        },
        folder
      );
      survey.boards.push(s);
      const relation = compareContents(here, folder);
      if (relation !== 'same') survey.conflict = describeConflict(current, s, relation);
    } else if (home && home === dir && trackedByIndex(main.path, '.brainfile')) {
      // The code branch still tracks .brainfile/ under the worktree: a stale
      // copy that rides along with code commits. Reported, never written.
      const contents = readTree(main.path, 'HEAD:.brainfile');
      if (contents) {
        const s = sighting(
          { kind: 'code-branch', ref: 'HEAD:.brainfile', label: `the copy on ${currentBranch(main.path) ?? 'HEAD'}`, storage: 'plain' },
          contents
        );
        survey.boards.push(s);
        survey.trackedTwice = s;
      }
    }
    if (!survey.conflict && fromRemote && survey.lineage?.unrelated) {
      survey.conflict = describeConflict(current, fromRemote.sighting, 'unrelated');
    }
    return survey;
  }

  // The board is a folder: the board branch (or, without one, the remote's
  // copy) is a second board unless it holds exactly the same documents.
  const other = local ?? fromRemote;
  if (other) {
    const relation = compareContents(here, other.contents);
    if (relation !== 'same') survey.conflict = describeConflict(current, other.sighting, relation);
  }
  return survey;
}

/** The conflict alone, for write guards. Never throws: a failed survey is no conflict. */
export function boardConflict(dotDir: string): BoardConflict | null {
  try {
    return surveyBoards(dotDir).conflict;
  } catch {
    return null;
  }
}

const capital = (text: string): string => `${text[0]?.toUpperCase() ?? ''}${text.slice(1)}`;

/** One sentence on how the two boards stand: `Origin's already has everything this folder has.` */
export function boardConflictRelation(conflict: BoardConflict): string {
  switch (conflict.relation) {
    case 'contained':
      return `${capital(conflict.other.label)} already has everything ${conflict.current.label} has.`;
    case 'contains':
      return `${capital(conflict.current.label)} already has everything ${conflict.other.label} has.`;
    case 'unrelated':
      return 'They share no history.';
    default:
      return 'Each has changes the other lacks.';
  }
}

/**
 * The error every write gives while two boards disagree: what was found and
 * the command that settles it. Shared by the CLI, MCP and the desktop host.
 */
export function boardConflictError(conflict: BoardConflict): string {
  return `${conflict.message} ${boardConflictRelation(conflict)} Nothing was written. Settle it first: ${conflict.resolve} (brainfile where shows both).`;
}
