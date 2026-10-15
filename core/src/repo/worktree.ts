/**
 * A worktree per hand-off (spec-14): each dispatched task gets its own git
 * worktree and branch, so two agents, or an agent and the person, never
 * share one checkout, and an agent never edits the running app's own files.
 * The board is still shared: it lives on the board branch, which every
 * worktree of the repository reaches.
 *
 * A hand-off forks from the trunk (decision-11), not from whatever the
 * person's checkout is on: the branch `brainfile.trunk` names in the
 * repository's git config, else origin's default branch, else main. A
 * hand-off that only reads (its contract's deliverables are all research, a
 * review or a link) gets a detached checkout of the trunk's tip instead, and
 * leaves no branch behind.
 *
 * The branch is `dispatch/<task-id>`, not `brainfile/<task-id>`: git cannot
 * hold `refs/heads/brainfile/…` beside the board branch `refs/heads/brainfile`.
 * The branch it came from, and the commit, are kept in the branch's own git
 * config (`branch.dispatch/<id>.brainfileBase`, `.brainfileFork`), so
 * nothing else needs storing.
 *
 * A hand-off may be given another branch to fork from and land on instead
 * of the trunk (decision-16: the task's `landsOn`, see landsOnOf): it is
 * recorded as the branch's `brainfileBase`, and the review, the conflict
 * preview, landing and send-back all go into it. An epic with a branch of
 * its own has one with no worktree (prepareBranch), its target brought into
 * it before each hand-off (bringIn).
 *
 * Not an IDE: the review says what changed, opens it in the person's editor,
 * merges it or throws it away. It never edits a diff.
 *
 * Moved from the desktop (task-76), so the CLI and headless runners hand off
 * and land the same way. `projectId` is the project's folder throughout.
 */
import { spawn } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { TaskDocument } from '../types';
import type { LintIssue } from '../linter';
import { isBranchName } from '../landsOn';
import { openPullRequestOf } from '../pullRequest';
import { readTasksDir } from '../taskFile';
import type { PullRequestRecord } from '../types';
import { findV2Task, getV2Dirs } from '../workspace';
import { BOARD_STATE_DIR, boardBranch, git, gitCommonDir, gitToplevel, listWorktrees } from './boardRepo';
import { landingLockPath, takeLandingLock, type LandingLockOptions } from './landingLock';
import { locateBoard } from './locate';

/**
 * A hand-off's own branch and worktree, as its review shows them (spec-14):
 * what the agent committed, and where Merge would put it.
 */
export interface HandOffReview {
  /** `dispatch/task-15`; null for a hand-off that only read, in a detached checkout of the trunk. */
  branch: string | null;
  /** The worktree's folder. */
  path: string;
  /** The branch it was started from (a commit, when that was detached). */
  base: string | null;
  /** Where Merge lands: the branch it was started from while that exists, else the trunk (decision-11). */
  into: string | null;
  /** The branch the project's checkout is on now: when it is `into`, it follows a landing by fast-forward. Null when detached. */
  checkout: string | null;
  /** Commits on the branch since it started. */
  ahead: number;
  /** The newest first, the first few. */
  commits: { sha: string; subject: string }[];
  /** The first few files changed, with lines added and removed. */
  files: { path: string; added: number; removed: number }[];
  filesChanged: number;
  added: number;
  removed: number;
  /** Files changed in the worktree and not committed: Merge waits for them. */
  uncommitted: number;
  /** Its commits are already in `into`; Merge only lets the worktree go. */
  merged: boolean;
  /** The files that would conflict if it merged into `into` now (git merge-tree, nothing written). */
  conflicts: string[];
}

/** A hand-off that can merge now, for a Ready to merge list (task-69). */
export interface ReadyHandOff {
  taskId: string;
  /** The branch it merges into. */
  into: string;
  /** Commits on its branch. */
  ahead: number;
  added: number;
  removed: number;
  /** git's merge-tree found the merge would conflict: it waits in its column instead. */
  conflicts: boolean;
}

export const BRANCH_PREFIX = 'dispatch/';
const BASE_KEY = 'brainfileBase';
const FORK_KEY = 'brainfileFork';
/** Set on a branch made with no worktree of its own, as an epic's branch (decision-16). */
export const EPIC_KEY = 'brainfileEpic';
const TRUNK_KEY = 'brainfile.trunk';
/** Deliverables that write nothing into the code: a contract made only of these only reads. */
const READING = new Set(['research', 'review', 'link']);
/** How many commits and files a review lists; the totals cover the rest. */
const SHOWN = 12;

/** Where hand-offs are checked out: out of the person's projects, and out of the running app's checkout. */
export function worktreesRoot(): string {
  return process.env.BRAINFILE_WORKTREES ?? path.join(os.homedir(), '.brainfile-worktrees');
}

export const branchFor = (taskId: string): string => `${BRANCH_PREFIX}${taskId}`;

export interface Worktree {
  path: string;
  /** Null for a hand-off that only reads: a detached checkout of the trunk's tip. */
  branch: string | null;
  /** The branch it was started from, or the commit when that was detached. */
  base: string | null;
  /** The branch already carries commits: this is not the first pass. */
  resumed: boolean;
}

/** `<repo>-<hash>`: one folder per repository, so two repos' task-1 never meet. */
function repoFolder(repoRoot: string): string {
  return `${path.basename(repoRoot)}-${createHash('sha1').update(repoRoot).digest('hex').slice(0, 6)}`;
}

/** `<root>/<repo>-<hash>/<task-id>`. */
function worktreePath(repoRoot: string, taskId: string, root: string): string {
  return path.join(root, repoFolder(repoRoot), taskId);
}

/** Whether a hand-off with this contract only reads: it has deliverables, and none of them is written into the code. */
export function onlyReads(contract: { deliverables?: { type: string }[] } | undefined): boolean {
  const deliverables = contract?.deliverables ?? [];
  return deliverables.length > 0 && deliverables.every((d) => READING.has(d.type));
}

function currentBranch(cwd: string): string | null {
  const r = git(['symbolic-ref', '--quiet', '--short', 'HEAD'], cwd);
  return r.ok && r.stdout ? r.stdout : null;
}

function branchExists(repoRoot: string, branch: string): boolean {
  return git(['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], repoRoot).ok;
}

/**
 * The trunk (decision-11): the branch `brainfile.trunk` names, else origin's
 * default branch, else main, else master. `ref` is what a hand-off forks
 * from: the local branch, else origin's copy of it. Null when the
 * repository has none of them.
 */
export function trunkOf(repoRoot: string): { name: string; ref: string } | null {
  const named = git(['config', '--get', TRUNK_KEY], repoRoot);
  const origin = git(['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], repoRoot);
  const fromOrigin = origin.ok && origin.stdout.startsWith('origin/') ? origin.stdout.slice('origin/'.length) : '';
  for (const name of [named.ok ? named.stdout : '', fromOrigin, 'main', 'master']) {
    const found = name ? branchRef(repoRoot, name) : null;
    if (found) return found;
  }
  return null;
}

/** A branch by name, as a hand-off forks from it: the local branch, else origin's copy of it; null when neither exists. */
export function branchRef(repoRoot: string, name: string): { name: string; ref: string } | null {
  if (branchExists(repoRoot, name)) return { name, ref: name };
  if (git(['show-ref', '--verify', '--quiet', `refs/remotes/origin/${name}`], repoRoot).ok) return { name, ref: `origin/${name}` };
  return null;
}

/**
 * A branch to land on, here: the local branch, else made from origin's copy
 * and following it, so the work has a branch to go into.
 */
function localBranch(repoRoot: string, name: string): { ok: true } | { ok: false; error: string } {
  const found = branchRef(repoRoot, name);
  if (!found) return { ok: false, error: `There is no branch ${name}, here or on origin` };
  if (found.ref === found.name) return { ok: true };
  const made = git(['branch', '--track', found.name, found.ref], repoRoot);
  return made.ok ? { ok: true } : { ok: false, error: `Could not make ${found.name} from ${found.ref}: ${made.stderr || made.stdout}` };
}

/**
 * Where to fork from: the local trunk, unless it is only behind origin's (work
 * merged on the forge that was never pulled), when origin's is. A local trunk
 * with commits of its own is the person's, and is kept. Landing then moves the
 * local trunk on past origin's commits, as the branch holds them. Any other
 * branch a hand-off forks from is chosen the same way.
 */
export function freshest(repoRoot: string, trunk: { name: string; ref: string }): string {
  const remote = `origin/${trunk.name}`;
  if (trunk.ref === remote || !git(['rev-parse', '--verify', '--quiet', `refs/remotes/${remote}`], repoRoot).ok) return trunk.ref;
  const behind = git(['merge-base', '--is-ancestor', trunk.ref, remote], repoRoot).ok;
  const same = git(['rev-parse', trunk.ref], repoRoot).stdout === git(['rev-parse', remote], repoRoot).stdout;
  return behind && !same ? remote : trunk.ref;
}

function recorded(repoRoot: string, branch: string, key: string): string | null {
  const r = git(['config', '--get', `branch.${branch}.${key}`], repoRoot);
  return r.ok && r.stdout ? r.stdout : null;
}

/**
 * The commit the hand-off started from: recorded when the worktree was made,
 * else where the branch meets the one it goes into. Everything after it is
 * the agent's work, merged since or not.
 */
function forkOf(repoRoot: string, branch: string, into: string | null): string | null {
  const fork = recorded(repoRoot, branch, FORK_KEY);
  if (fork && git(['cat-file', '-e', `${fork}^{commit}`], repoRoot).ok) return fork;
  const r = git(['merge-base', into ?? 'HEAD', branch], repoRoot);
  return r.ok && r.stdout ? r.stdout : null;
}

/**
 * Where the branch's work goes: the branch it was started from, while that
 * still exists (hand-offs made before decision-11 keep theirs), else the trunk.
 */
function intoOf(repoRoot: string, branch: string): string | null {
  const base = recorded(repoRoot, branch, BASE_KEY);
  if (base && branchExists(repoRoot, base)) return base;
  const trunk = trunkOf(repoRoot);
  return trunk && branchExists(repoRoot, trunk.name) ? trunk.name : null;
}

/** The hand-off's checkout, when there is one on disk. */
/** Whether two paths are one folder, however they were reached (symlinks, /private on macOS). */
function samePath(a: string, b: string): boolean {
  try {
    return fs.realpathSync(a) === fs.realpathSync(b);
  } catch {
    return path.resolve(a) === path.resolve(b);
  }
}

function existing(repoRoot: string, taskId: string): string | null {
  const ref = `refs/heads/${branchFor(taskId)}`;
  const hit = listWorktrees(repoRoot).find((w) => w.branch === ref);
  return hit && fs.existsSync(hit.path) ? hit.path : null;
}

/**
 * Whether the task's hand-off has work on its branch that has not landed
 * where it goes. A worker may complete its task before then, so a completed
 * task is not yet something to build on.
 */
export function unlanded(projectId: string, taskId: string): boolean {
  const repoRoot = gitToplevel(projectId);
  if (!repoRoot || !existing(repoRoot, taskId)) return false;
  const branch = branchFor(taskId);
  const into = intoOf(repoRoot, branch);
  const fork = into ? forkOf(repoRoot, branch, into) : null;
  if (!into || !fork) return false;
  const ahead = git(['rev-list', '--count', `${fork}..${branch}`], repoRoot);
  return ahead.ok && Number(ahead.stdout) > 0 && !landedIn(repoRoot, branch, into);
}

/** A hand-off's read-only checkout, when there is one on disk: detached, in the task's folder. */
function existingReader(repoRoot: string, taskId: string): string | null {
  const hit = listWorktrees(repoRoot).find(
    (w) => w.detached && path.basename(w.path) === taskId && path.basename(path.dirname(w.path)) === repoFolder(repoRoot)
  );
  return hit && fs.existsSync(hit.path) ? hit.path : null;
}

function ahead(repoRoot: string, branch: string): number {
  const fork = forkOf(repoRoot, branch, intoOf(repoRoot, branch));
  const r = fork ? git(['rev-list', '--count', `${fork}..${branch}`], repoRoot) : null;
  return r?.ok ? Number(r.stdout) || 0 : 0;
}

/**
 * Whether a hand-off can have a worktree here: a repository with a commit,
 * whose board lives on the board branch, so every worktree shares it. A board
 * kept as plain files in the code would be copied, not shared: that work
 * stays in the folder, as before.
 */
export function canBranch(projectId: string): string | null {
  const repoRoot = gitToplevel(projectId);
  if (!repoRoot || !git(['rev-parse', '--verify', '--quiet', 'HEAD'], repoRoot).ok) return null;
  const located = locateBoard(projectId, { materialize: false });
  return located.found && located.storage === 'linked' ? repoRoot : null;
}

/**
 * The task's worktree, made on first use from the tip of the branch it goes
 * into, and found again after (a send-back, a second hand-off). That is
 * `base` when given (decision-16: the task's target, a local branch or
 * origin's, which is then made locally so the work can land there), else the
 * trunk; either through `freshest`. It is recorded as the branch's
 * `brainfileBase`, which review and landing go by; a branch made before keeps
 * the one it recorded. One that only `reads` gets a detached checkout and no
 * branch, unless the task already has a branch: the work on it is kept. Null
 * when the project cannot branch (see canBranch).
 */
export function prepareWorktree(projectId: string, taskId: string, root = worktreesRoot(), reads = false, base?: string): Worktree | null {
  const repoRoot = canBranch(projectId);
  if (!repoRoot) return null;
  const branch = branchFor(taskId);
  const target = base ? branchRef(repoRoot, base) : trunkOf(repoRoot);
  if (base && !target) throw new Error(`There is no branch ${base} for ${taskId} to fork from, here or on origin`);
  // A checkout whose folder was deleted still holds its branch until pruned.
  git(['worktree', 'prune'], repoRoot);
  const reader = existingReader(repoRoot, taskId);
  if (reads && !branchExists(repoRoot, branch)) {
    if (reader) return { path: reader, branch: null, base: target?.name ?? null, resumed: false };
    const at = worktreePath(repoRoot, taskId, root);
    fs.mkdirSync(path.dirname(at), { recursive: true });
    const r = git(['worktree', 'add', '--detach', at, target ? freshest(repoRoot, target) : 'HEAD'], repoRoot);
    if (!r.ok) throw new Error(`Could not make a checkout for ${taskId}: ${r.stderr || r.stdout}`);
    return { path: at, branch: null, base: target?.name ?? null, resumed: false };
  }
  // It read before and writes now: the read-only checkout gives way, unless it holds changes.
  if (reader) {
    const r = git(['worktree', 'remove', reader], repoRoot);
    if (!r.ok) throw new Error(`${taskId}'s read-only checkout has changes in it: discard it first`);
  }
  let at = existing(repoRoot, taskId);
  if (!at) {
    at = worktreePath(repoRoot, taskId, root);
    fs.mkdirSync(path.dirname(at), { recursive: true });
    if (branchExists(repoRoot, branch)) {
      const r = git(['worktree', 'add', at, branch], repoRoot);
      if (!r.ok) throw new Error(`Could not check out ${branch}: ${r.stderr || r.stdout}`);
    } else {
      // A branch named only on origin is made here, following it, so there is a branch to land on.
      if (base && target && target.ref !== target.name) {
        const made = localBranch(repoRoot, target.name);
        if (!made.ok) throw new Error(made.error);
      }
      // A repository with no trunk to name forks from the checkout, as before decision-11.
      const fork = git(['rev-parse', target ? freshest(repoRoot, target) : 'HEAD'], repoRoot).stdout;
      const into = target?.name ?? currentBranch(repoRoot) ?? fork;
      const r = git(['worktree', 'add', '-b', branch, at, fork], repoRoot);
      if (!r.ok) throw new Error(`Could not make a worktree for ${taskId}: ${r.stderr || r.stdout}`);
      git(['config', `branch.${branch}.${BASE_KEY}`, into], repoRoot);
      git(['config', `branch.${branch}.${FORK_KEY}`, fork], repoRoot);
    }
  }
  return { path: at, branch, base: recorded(repoRoot, branch, BASE_KEY), resumed: ahead(repoRoot, branch) > 0 };
}

/**
 * A task's branch with no worktree of its own (decision-16): an epic's, for
 * everything under it to fork from and land on. Made from the tip of `base`
 * (its target, a local branch or origin's, which is then made locally), else
 * the trunk, through `freshest`, and recorded as prepareWorktree records a
 * hand-off's; found again after, keeping what it recorded. No worktree, as
 * landings move it with update-ref while it is not checked out. Null when
 * the project cannot branch (see canBranch).
 */
export function prepareBranch(projectId: string, taskId: string, base?: string): { branch: string; base: string | null; made: boolean } | null {
  const repoRoot = canBranch(projectId);
  if (!repoRoot) return null;
  const branch = branchFor(taskId);
  if (branchExists(repoRoot, branch)) return { branch, base: recorded(repoRoot, branch, BASE_KEY), made: false };
  const target = base ? branchRef(repoRoot, base) : trunkOf(repoRoot);
  if (!target) throw new Error(base ? `There is no branch ${base} for ${taskId} to fork from, here or on origin` : `${taskId} has no trunk to make its branch from`);
  if (target.ref !== target.name) {
    const made = localBranch(repoRoot, target.name);
    if (!made.ok) throw new Error(made.error);
  }
  const fork = git(['rev-parse', freshest(repoRoot, target)], repoRoot).stdout;
  // Only where there is none yet: two made at once make one.
  const r = git(['update-ref', `refs/heads/${branch}`, fork, ''], repoRoot);
  if (!r.ok) {
    if (branchExists(repoRoot, branch)) return { branch, base: recorded(repoRoot, branch, BASE_KEY), made: false };
    throw new Error(`Could not make ${branch}: ${said(r)}`);
  }
  git(['config', `branch.${branch}.${BASE_KEY}`, target.name], repoRoot);
  git(['config', `branch.${branch}.${FORK_KEY}`, fork], repoRoot);
  git(['config', `branch.${branch}.${EPIC_KEY}`, 'true'], repoRoot);
  return { branch, base: target.name, made: true };
}

/** What bringing a branch's target into it came to (decision-16): done, or why not, with a conflict's files for an agent to settle. */
export type Refresh =
  | { ok: true; moved: boolean; message: string }
  | Refused
  | { ok: false; kind: 'conflict'; error: string; branch: string; into: string; files: string[]; collided: Collision[] };

/**
 * Brings the target into a task's branch (decision-16), so an epic's branch
 * does not drift from the branch it lands on: decision-12's landing the
 * other way. The target's tip (through `freshest`) is merged into the branch
 * in a checkout made for it and gone after, never the person's, and the
 * branch moves to the result only from the tip that was merged, a
 * compare-and-swap; if it moved meanwhile (a child landed) it starts again.
 * A branch with none of its own work follows by fast-forward. The target's
 * tip is then recorded as its fork, so its review shows only its own work. A
 * conflict merges nothing and names the files, for an agent to settle. One
 * at a time with landings, which move the same branch; a branch checked out
 * somewhere is left alone.
 */
export function bringIn(projectId: string, taskId: string, options: { lock?: LandingLockOptions; attempts?: number } = {}): Promise<Refresh> {
  const repoRoot = gitToplevel(projectId);
  const branch = branchFor(taskId);
  if (!repoRoot || !branchExists(repoRoot, branch)) return Promise.resolve({ ok: false, kind: 'refused', error: `There is no ${branch} to bring anything into` });
  return serially(repoRoot, options.lock, async (): Promise<Refresh> => {
    const at = existing(repoRoot, taskId);
    if (at) return { ok: false, kind: 'refused', error: `${branch} is checked out at ${at}: nothing was brought in` };
    const base = recorded(repoRoot, branch, BASE_KEY);
    const target = base ? branchRef(repoRoot, base) : trunkOf(repoRoot);
    if (!target) return { ok: false, kind: 'refused', error: `${branch} has nothing to bring in: ${base ?? 'the trunk'} is gone` };
    const into = target.name;
    for (let attempt = 0; attempt < (options.attempts ?? 5); attempt++) {
      const old = git(['rev-parse', '--verify', `refs/heads/${branch}`], repoRoot).stdout;
      const tip = git(['rev-parse', '--verify', freshest(repoRoot, target)], repoRoot).stdout;
      if (!old || !tip) return { ok: false, kind: 'refused', error: `${!old ? branch : into} is gone: nothing was brought in` };
      if (git(['merge-base', '--is-ancestor', tip, old], repoRoot).ok) return { ok: true, moved: false, message: `${branch} already has ${into}` };
      let next = tip;
      if (!git(['merge-base', '--is-ancestor', old, tip], repoRoot).ok) {
        const merged = mergeAside(repoRoot, old, tip, `Merge ${into} into ${branch}`);
        if (!merged.ok) {
          if (merged.files.length) {
            const collided = collisions(projectId, branch, tip, merged.files);
            return { ok: false, kind: 'conflict', branch, into, files: merged.files, collided, error: `Bringing ${into} into ${branch} conflicts in ${named(merged.files)}. Nothing was brought in.` };
          }
          return { ok: false, kind: 'refused', error: `Nothing was brought in: ${merged.error}` };
        }
        next = merged.commit;
      }
      if (git(['update-ref', '-m', `Merge ${into} into ${branch}`, `refs/heads/${branch}`, next, old], repoRoot).ok) {
        git(['config', `branch.${branch}.${FORK_KEY}`, tip], repoRoot);
        return { ok: true, moved: true, message: `Brought ${into} into ${branch}` };
      }
      // The branch moved since it was read: again, from its new tip.
    }
    return { ok: false, kind: 'refused', error: `${branch} kept moving: nothing was brought in, try again` };
  });
}

/** `theirs` merged into `ours` in a detached checkout of its own, made and removed here: the merge commit, or the files that conflicted. */
function mergeAside(repoRoot: string, ours: string, theirs: string, message: string): { ok: true; commit: string } | { ok: false; files: string[]; error: string } {
  const at = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-bring-in-'));
  try {
    const added = git(['worktree', 'add', '--detach', at, ours], repoRoot);
    if (!added.ok) return { ok: false, files: [], error: said(added) };
    const merged = git(['merge', '--no-ff', '--no-edit', '-m', message, theirs], at);
    if (merged.ok) return { ok: true, commit: git(['rev-parse', 'HEAD'], at).stdout };
    const files = git(['diff', '--name-only', '--diff-filter=U'], at).stdout.split('\n').filter(Boolean);
    git(['merge', '--abort'], at);
    return { ok: false, files, error: said(merged) };
  } finally {
    git(['worktree', 'remove', '--force', at], repoRoot);
    fs.rmSync(at, { recursive: true, force: true });
    git(['worktree', 'prune'], repoRoot);
  }
}

/** The work a hand-off left on its branch, for the review in the task pane; null when it has no worktree. */
export function reviewOf(projectId: string, taskId: string): HandOffReview | null {
  const repoRoot = gitToplevel(projectId);
  if (!repoRoot) return null;
  const at = existing(repoRoot, taskId);
  const checkout = currentBranch(repoRoot);
  if (!at) {
    // A read-only checkout has nothing to merge: only what was left in it, to throw away.
    const reader = existingReader(repoRoot, taskId);
    if (!reader) return null;
    const none = { ahead: 0, commits: [], files: [], filesChanged: 0, added: 0, removed: 0, merged: false, conflicts: [] };
    return { branch: null, path: reader, base: trunkOf(repoRoot)?.name ?? null, into: null, checkout, ...none, uncommitted: uncommittedIn(reader).count };
  }
  const branch = branchFor(taskId);
  const into = intoOf(repoRoot, branch);
  const fork = forkOf(repoRoot, branch, into);

  const log = fork ? git(['log', '--format=%h%x09%s', `${fork}..${branch}`], repoRoot) : null;
  const commits = (log?.ok ? log.stdout.split('\n').filter(Boolean) : []).map((line) => {
    const [sha, ...subject] = line.split('\t');
    return { sha, subject: subject.join('\t') };
  });

  const numstat = fork ? git(['diff', '--numstat', fork, branch], repoRoot) : null;
  const files = (numstat?.ok ? numstat.stdout.split('\n').filter(Boolean) : []).map((line) => {
    const [added, removed, ...file] = line.split('\t');
    // Binary files say `-`.
    return { path: file.join('\t'), added: Number(added) || 0, removed: Number(removed) || 0 };
  });

  const uncommitted = uncommittedIn(at).count;
  const merged = !!into && commits.length > 0 && landedIn(repoRoot, branch, into);
  const conflicts = into && commits.length > 0 && !merged ? conflictsWith(repoRoot, into, branch) : [];

  return {
    branch,
    path: at,
    base: recorded(repoRoot, branch, BASE_KEY),
    into,
    checkout,
    ahead: commits.length,
    commits: commits.slice(0, SHOWN),
    files: files.slice(0, SHOWN),
    filesChanged: files.length,
    added: files.reduce((n, f) => n + f.added, 0),
    removed: files.reduce((n, f) => n + f.removed, 0),
    uncommitted,
    merged,
    conflicts,
  };
}

/**
 * Whether the branch's work is already where it goes: in `into`, in what
 * `into` tracks, or in origin's copy of `into`, so a pull request merged on
 * the forge counts while the local branch is behind. For a target other
 * than the trunk (decision-16) that is its own copy on origin, never the
 * trunk's: work merged into main has not landed on a release line. A squash
 * merge leaves no ancestry, so a merge that would change nothing counts too.
 */
function landedIn(repoRoot: string, branch: string, into: string): boolean {
  const upstream = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', `${into}@{upstream}`], repoRoot);
  const places = [into, upstream.ok ? upstream.stdout : '', `origin/${into}`].filter(
    (ref, i, all) => ref && all.indexOf(ref) === i && git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], repoRoot).ok
  );
  return places.some((ref) => {
    if (git(['merge-base', '--is-ancestor', branch, ref], repoRoot).ok) return true;
    const tree = git(['merge-tree', '--write-tree', ref, branch], repoRoot);
    const own = git(['rev-parse', `${ref}^{tree}`], repoRoot);
    return tree.ok && own.ok && tree.stdout.split('\n')[0] === own.stdout;
  });
}

/**
 * The files that would conflict if the branch merged into `into` now, as
 * git's merge-tree says without writing anything; none when it would merge
 * cleanly, or when git could not say.
 */
function conflictsWith(repoRoot: string, into: string, branch: string): string[] {
  const tree = git(['merge-tree', '--write-tree', '--name-only', '--no-messages', into, branch], repoRoot);
  if (tree.ok || tree.status !== 1) return [];
  // The tree's ID, then one conflicted file a line.
  return tree.stdout.split('\n').slice(1).filter(Boolean);
}

/** The files changed in a worktree and not committed, as git names them, the first few; the count covers the rest. */
export function uncommittedIn(at: string): { files: string[]; count: number } {
  const status = git(['status', '--porcelain'], at);
  const lines = status.ok ? status.stdout.split('\n').filter(Boolean) : [];
  // `XY path`; the output comes trimmed, so the first line may have lost a leading blank.
  return { files: lines.slice(0, SHOWN).map((l) => l.replace(/^\s?\S{1,2}\s+/, '')), count: lines.length };
}

/** The task's pull request while it is open on the forge (decision-16), from the project's board, open or completed. */
export function openPullRequestOn(projectId: string, taskId: string): PullRequestRecord | null {
  const located = locateBoard(projectId, { materialize: false });
  const found = located.found ? findV2Task(getV2Dirs(located.brainfilePath), taskId, true) : null;
  return found ? openPullRequestOf(found.doc.task) : null;
}

/**
 * The tasks whose pull request is open on the forge: every open task's, and a
 * completed one's while its hand-off still has a worktree (its worker
 * completed it before it landed). The completed archive is not read whole.
 */
export function withOpenPullRequest(projectId: string): Set<string> {
  const located = locateBoard(projectId, { materialize: false });
  const repoRoot = gitToplevel(projectId);
  if (!located.found) return new Set();
  const dirs = getV2Dirs(located.brainfilePath);
  const open = new Set(readTasksDir(dirs.boardDir).filter((d) => openPullRequestOf(d.task)).map((d) => d.task.id));
  const heads = `refs/heads/${BRANCH_PREFIX}`;
  for (const w of repoRoot ? listWorktrees(repoRoot) : []) {
    const taskId = w.branch?.startsWith(heads) ? w.branch.slice(heads.length) : null;
    const found = taskId && !open.has(taskId) ? findV2Task(dirs, taskId, true) : null;
    if (taskId && found?.isLog && openPullRequestOf(found.doc.task)) open.add(taskId);
  }
  return open;
}

/**
 * Every hand-off in the repository that can merge now (task-69): commits
 * not yet in the branch it goes into, nothing uncommitted, not merged
 * already, and no pull request open for it (decision-16: that lands on the
 * forge). `conflicts` says git's merge-tree, which writes nothing, found
 * the merge would conflict. Whether an agent is still at it is the caller's
 * to know.
 */
export function readyToMerge(projectId: string): ReadyHandOff[] {
  const repoRoot = gitToplevel(projectId);
  if (!repoRoot) return [];
  const heads = `refs/heads/${BRANCH_PREFIX}`;
  const ready: ReadyHandOff[] = [];
  for (const w of listWorktrees(repoRoot)) {
    if (!w.branch?.startsWith(heads) || !fs.existsSync(w.path)) continue;
    const taskId = w.branch.slice(heads.length);
    const review = reviewOf(projectId, taskId);
    if (!review?.branch || !review.into || review.ahead === 0 || review.merged || review.uncommitted > 0) continue;
    if (openPullRequestOn(projectId, taskId)) continue;
    ready.push({
      taskId,
      into: review.into,
      ahead: review.ahead,
      added: review.added,
      removed: review.removed,
      conflicts: review.conflicts.length > 0,
    });
  }
  return ready;
}

/** The last line of git's complaint worth showing. */
function said(r: { stderr: string; stdout: string }): string {
  const lines = `${r.stderr}\n${r.stdout}`.split('\n').map((l) => l.replace(/^(error|fatal|hint):\s*/, '').trim());
  return lines.filter(Boolean)[0] ?? 'git refused';
}

/** Lets go of the checkout and its branch, when it has one; drops the repository's folder when it is the last. */
function cleanUp(repoRoot: string, at: string, branch: string | null, force: boolean): void {
  const removed = git(['worktree', 'remove', ...(force ? ['--force'] : []), at], repoRoot);
  if (!removed.ok) throw new Error(`Could not remove the worktree: ${said(removed)}`);
  if (branch) {
    git(['branch', force ? '-D' : '-d', branch], repoRoot);
    git(['config', '--remove-section', `branch.${branch}`], repoRoot);
  }
  try {
    fs.rmdirSync(path.dirname(at));
  } catch {
    /* another hand-off is still there */
  }
}

/** Why Merge would refuse this review, before anything runs; null when it would go ahead. */
export function whyNotMerge(taskId: string, review: HandOffReview | null): string | null {
  if (!review) return `${taskId} has no worktree to merge`;
  const { branch, into } = review;
  if (!branch) return `${taskId} only read: there is nothing to merge`;
  if (!into) return `${branch} has no branch to go into: the trunk is missing`;
  if (review.uncommitted > 0) {
    return `${review.uncommitted} ${review.uncommitted === 1 ? 'file is' : 'files are'} not committed in the worktree: send it back, or commit in your editor`;
  }
  if (review.ahead === 0) return `${branch} has no commits to merge`;
  return null;
}

/** The last lines of what a check said, enough to see why it failed. */
function tail(text: string, lines = 8): string {
  return text.trim().split('\n').slice(-lines).join('\n');
}

/**
 * Runs the contract's checks in the hand-off's worktree, one after another,
 * as a shell would, and stops at the first that fails. Asynchronous: a test
 * suite takes a while, and the agents process keeps answering meanwhile.
 */
export function runChecks(at: string, commands: string[], env: NodeJS.ProcessEnv = process.env, timeoutMs = 15 * 60_000): Promise<{ ok: true } | { ok: false; command: string; output: string }> {
  return (async () => {
    for (const command of commands) {
      const failed = await new Promise<string | null>((resolve) => {
        const child = spawn(command, { cwd: at, env, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
        let output = '';
        const keep = (chunk: Buffer) => {
          output = (output + chunk.toString()).slice(-16_000);
        };
        child.stdout.on('data', keep);
        child.stderr.on('data', keep);
        const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
        child.on('error', (err) => {
          clearTimeout(timer);
          resolve(err.message);
        });
        child.on('close', (code, signal) => {
          clearTimeout(timer);
          resolve(code === 0 ? null : tail(output) || (signal ? `stopped (${signal})` : `exit ${code}`));
        });
      });
      if (failed !== null) return { ok: false as const, command, output: failed };
    }
    return { ok: true as const };
  })();
}

/** A commit a conflict collided with, and the task whose landing brought it, when one did. */
export interface Collision {
  sha: string;
  subject: string;
  taskId?: string;
}

type Refused = { ok: false; kind: 'refused'; error: string };

/** What a landing came to: landed, or why not, with what task-63 needs to send a conflict back. */
export type Landing =
  | { ok: true; message: string }
  | Refused
  | { ok: false; kind: 'conflict'; error: string; branch: string; into: string; files: string[]; collided: Collision[] }
  | { ok: false; kind: 'check'; error: string; branch: string; into: string; command: string; output: string };

/** The files a list names: the first three, and how many more. */
function named(files: string[]): string {
  return files.slice(0, 3).join(', ') + (files.length > 3 ? ` and ${files.length - 3} more` : '');
}

/**
 * What a conflict collided with (task-63): the commits on `into` since the
 * branch started that touch the conflicting files, newest first, each with
 * the task whose landing brought it (`Merge task-N: title`), when one did.
 */
export function collisions(projectId: string, branch: string, into: string, files: string[]): Collision[] {
  const repoRoot = gitToplevel(projectId);
  if (!repoRoot || !files.length) return [];
  const base = git(['merge-base', into, branch], repoRoot).stdout;
  if (!base) return [];
  const log = git(['log', '--no-merges', '--format=%h%x09%s', `${base}..${into}`, '--', ...files], repoRoot);
  // The landings on the trunk's own line since the branch started, oldest first.
  const landings = git(['log', '--first-parent', '--merges', '--reverse', '--format=%H%x09%s', `${base}..${into}`], repoRoot)
    .stdout.split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha, ...subject] = line.split('\t');
      return { sha, taskId: /^Merge ([a-z]+-\d+)\b/.exec(subject.join('\t'))?.[1] };
    });
  return (log.ok ? log.stdout.split('\n').filter(Boolean) : []).slice(0, SHOWN).map((line) => {
    const [sha, ...subject] = line.split('\t');
    // The first landing that holds the commit is the one that brought it; a commit made on the trunk itself has none.
    const by = landings.find((l) => git(['merge-base', '--is-ancestor', sha, l.sha], repoRoot).ok);
    const onTrunk = git(['rev-list', '--first-parent', `${base}..${into}`], repoRoot).stdout.split('\n').some((c) => c.startsWith(sha));
    const taskId = onTrunk ? undefined : by?.taskId;
    return { sha, subject: subject.join('\t'), ...(taskId ? { taskId } : {}) };
  });
}

/**
 * The repository's landing lock (landingLock.ts): in the board's `state/`,
 * which every worktree, the CLI's and the desktop's alike, finds as one;
 * in git's own folder when there is no board to find.
 */
export function landingLockOf(repoRoot: string): string {
  const located = locateBoard(repoRoot, { materialize: false });
  const dir = located.found ? path.join(located.dotDir, BOARD_STATE_DIR) : path.join(gitCommonDir(repoRoot) ?? path.join(repoRoot, '.git'), 'brainfile');
  return landingLockPath(dir);
}

/** One landing at a time per repository, across processes: `work` runs holding the lock, which goes after. */
async function serially<T extends Landing | Refresh>(repoRoot: string, options: LandingLockOptions | undefined, work: () => Promise<T>): Promise<T | Refused> {
  const lock = await takeLandingLock(landingLockOf(repoRoot), options);
  if (!lock.ok) return { ok: false, kind: 'refused', error: lock.error };
  try {
    return await work();
  } finally {
    lock.release();
  }
}

/**
 * Lands the hand-off on the branch it goes into (decision-12), without
 * merging in the person's checkout: the trunk is brought into the branch
 * inside the task's own worktree, `check` runs there on the result, and the
 * landing commit (`Merge task-N: title`, the trunk's tip and the branch) is
 * made with commit-tree. The trunk moves to it only from the tip that was
 * checked: by fast-forward when the person's checkout is on it (which keeps
 * their uncommitted changes, and waits, naming the file, when the landing
 * would overwrite one), else by compare-and-swap with update-ref. If the
 * trunk moved meanwhile it starts again from the new tip. One landing at a
 * time per repository, whichever process lands: another waits for the
 * landing lock (`lock` says how long). The worktree and branch go once
 * landed. `into` lands it on another branch than the one it goes into (an
 * epic's branch somewhere else, decision-16): a local branch, else origin's,
 * made here to follow it.
 */
export function landReview(
  projectId: string,
  taskId: string,
  options: {
    title?: string;
    check?: (at: string) => Promise<{ ok: true } | { ok: false; command: string; output: string }>;
    attempts?: number;
    lock?: LandingLockOptions;
    into?: string;
  } = {}
): Promise<Landing> {
  const repoRoot = gitToplevel(projectId);
  if (!repoRoot) return Promise.resolve({ ok: false, kind: 'refused', error: `${taskId} has no worktree to merge` });
  return serially(repoRoot, options.lock, async (): Promise<Landing> => {
    const review = reviewOf(projectId, taskId);
    const refused = whyNotMerge(taskId, review);
    if (refused || !review?.branch || !review.into) return { ok: false, kind: 'refused', error: refused ?? `${taskId} has no worktree to merge` };
    const { branch, path: at } = review;
    let into = review.into;
    if (options.into && options.into !== into) {
      const local = localBranch(repoRoot, options.into);
      if (!local.ok) return { ok: false, kind: 'refused', error: local.error };
      into = options.into;
    }
    // A branch checked out elsewhere (an epic's branch up for review) would be moved under that checkout, its files left behind.
    const elsewhere = listWorktrees(repoRoot).find((w) => w.branch === `refs/heads/${into}` && fs.existsSync(w.path) && !samePath(w.path, repoRoot));
    if (elsewhere) return { ok: false, kind: 'refused', error: `${into} is checked out at ${elsewhere.path}: merge or discard that first, then Merge again. Nothing was merged.` };
    // Merged elsewhere already (the terminal, a pull request): only the worktree is left to go.
    if (into === review.into ? review.merged : landedIn(repoRoot, branch, into)) {
      cleanUp(repoRoot, at, branch, true);
      return { ok: true, message: `${branch} was already in ${into}` };
    }
    const message = `Merge ${taskId}${options.title ? `: ${options.title}` : ''}`;
    for (let attempt = 0; attempt < (options.attempts ?? 5); attempt++) {
      const old = git(['rev-parse', '--verify', `refs/heads/${into}`], repoRoot).stdout;
      if (!old) return { ok: false, kind: 'refused', error: `${into} is gone: nothing was merged` };
      // The trunk into the branch, in the task's own worktree, unless it is there already.
      if (!git(['merge-base', '--is-ancestor', old, 'HEAD'], at).ok) {
        const brought = git(['merge', '--no-ff', '--no-edit', '-m', `Merge ${into} into ${branch}`, old], at);
        if (!brought.ok) {
          const files = git(['diff', '--name-only', '--diff-filter=U'], at).stdout.split('\n').filter(Boolean);
          git(['merge', '--abort'], at);
          if (files.length) {
            const collided = collisions(projectId, branch, into, files);
            return { ok: false, kind: 'conflict', branch, into, files, collided, error: `${branch} conflicts with ${into} in ${named(files)}. Nothing was merged.` };
          }
          return { ok: false, kind: 'refused', error: `Nothing was merged: ${said(brought)}` };
        }
      }
      if (options.check) {
        const checked = await options.check(at);
        if (!checked.ok) return { ok: false, kind: 'check', branch, into, command: checked.command, output: checked.output, error: `Nothing was merged: \`${checked.command}\` failed.` };
      }
      const head = git(['rev-parse', 'HEAD'], at).stdout;
      const made = git(['commit-tree', `${head}^{tree}`, '-p', old, '-p', head, '-m', message], repoRoot);
      if (!made.ok || !made.stdout) return { ok: false, kind: 'refused', error: `Nothing was merged: ${said(made)}` };
      const landed = made.stdout;
      if (currentBranch(repoRoot) === into) {
        // The person's checkout follows by fast-forward, around their uncommitted changes in other files.
        const ff = git(['merge', '--ff-only', '--quiet', landed], repoRoot);
        if (ff.ok) break;
        if (/would be overwritten/.test(`${ff.stderr}\n${ff.stdout}`)) {
          const files = `${ff.stderr}\n${ff.stdout}`.split('\n').filter((l) => /^\s+\S/.test(l)).map((l) => l.trim());
          return { ok: false, kind: 'refused', error: `The merge changes ${named(files)}, which you have changed in your folder: commit or set ${files.length === 1 ? 'it' : 'them'} aside, then Merge again` };
        }
      } else if (git(['update-ref', '-m', message, `refs/heads/${into}`, landed, old], repoRoot).ok) {
        break;
      }
      // The trunk moved since it was read: again, from its new tip.
      if (attempt === (options.attempts ?? 5) - 1) return { ok: false, kind: 'refused', error: `${into} kept moving: nothing was merged, try again` };
    }
    cleanUp(repoRoot, at, branch, true);
    return { ok: true, message: `Merged ${branch} into ${into}` };
  });
}

/** A log entry is one line: a check's output runs on, its lines marked, its end kept. */
const logLine = (text: string, keep = 600) => text.split('\n').map((l) => l.trim()).filter(Boolean).join(' ⏎ ').slice(-keep);

/** A failed landing goes back with this note (`round` is `n of m`), or stays with the person, who is told why. */
export type SendBack = { ok: true; note: string; round: string } | { ok: false; said: string };

/**
 * What sends a landing that failed back to the agent that did the work
 * (task-63): the note for the task's log, saying what collided (the
 * conflicting files, the commits on `into` and the tasks that brought them)
 * or what failed, and how to settle it. Up to the contract's maxRetries,
 * else once, counted from the send-backs already in the task's log; after
 * that it stays with the person. Who it goes back to, and starting them
 * again, is the caller's.
 */
export function sendBackNote(doc: Pick<TaskDocument, 'task' | 'body'>, landing: Extract<Landing, { kind: 'conflict' | 'check' }>): SendBack {
  const { task, body } = doc;
  const allowed = Math.max(0, task.contract?.maxRetries ?? 1);
  const before = (body.match(/Landing sent back/g) ?? []).length;
  if (before >= allowed) return { ok: false, said: `It was sent back ${before === 1 ? 'once' : `${before} times`} already: settle it, or send it back with a note.` };
  const commands = (task.contract?.validation?.commands ?? []).join(' && ');
  const round = `${before + 1} of ${allowed}`;
  if (landing.kind === 'check') {
    return { ok: true, round, note: `Landing sent back (${round}): with ${landing.into} brought in, \`${landing.command}\` failed: ${logLine(landing.output)}. Fix it on this branch, commit, and run the checks again.` };
  }
  const met = landing.collided.map((c) => `${c.sha} ${c.subject}${c.taskId ? ` (${c.taskId})` : ''}`).join('; ');
  const note =
    `Landing sent back (${round}): ${landing.branch} conflicts with ${landing.into} in ${landing.files.join(', ')}.` +
    (met ? ` On ${landing.into} since this branch started: ${met}.` : '') +
    ` Merge ${landing.into} into this branch (git merge ${landing.into}), keep what both sides meant, commit the merge, and run the checks${commands ? `: ${commands}` : ''}.`;
  return { ok: true, round, note };
}

/** Throws the hand-off's work away: its worktree, uncommitted changes and all, and its branch. */
export function discardReview(projectId: string, taskId: string): { message: string } {
  const repoRoot = gitToplevel(projectId);
  const at = repoRoot ? existing(repoRoot, taskId) : null;
  const reader = repoRoot && !at ? existingReader(repoRoot, taskId) : null;
  if (!repoRoot || (!at && !reader)) throw new Error(`${taskId} has no worktree to discard`);
  if (reader) {
    cleanUp(repoRoot, reader, null, true);
    return { message: `Discarded ${taskId}'s read-only checkout` };
  }
  cleanUp(repoRoot, at!, branchFor(taskId), true);
  return { message: `Discarded ${branchFor(taskId)}` };
}

/**
 * Lets the hand-off's worktree go and keeps its branch (decision-16: an epic
 * kept as a branch, for the person to take on from there). Uncommitted work
 * in it refuses, as Merge does.
 */
export function keepBranch(projectId: string, taskId: string): { message: string } {
  const repoRoot = gitToplevel(projectId);
  const at = repoRoot ? existing(repoRoot, taskId) : null;
  if (!repoRoot || !at) throw new Error(`${taskId} has no worktree to let go`);
  const { count } = uncommittedIn(at);
  if (count > 0) throw new Error(`${count} ${count === 1 ? 'file is' : 'files are'} not committed in the worktree: commit or discard ${count === 1 ? 'it' : 'them'} first`);
  const removed = git(['worktree', 'remove', at], repoRoot);
  if (!removed.ok) throw new Error(`Could not remove the worktree: ${said(removed)}`);
  try {
    fs.rmdirSync(path.dirname(at));
  } catch {
    /* another hand-off is still there */
  }
  return { message: `Kept ${branchFor(taskId)} as a branch` };
}

/** The branches a hand-off could land on, for a picker (decision-16). */
export interface BranchList {
  /** The trunk's name; null when the repository has none. */
  trunk: string | null;
  /** Local branches, the most recently committed first; not hand-offs' own nor the board's. */
  local: string[];
  /** Branches only on origin. */
  remote: string[];
  /** Branches hand-offs here were made to land on, other than the trunk. */
  recent: string[];
}

/** The repository's branches, as Hand to… offers them: never a hand-off's own `dispatch/…` nor the board branch. */
export function branchesOf(projectId: string): BranchList {
  const repoRoot = gitToplevel(projectId);
  if (!repoRoot) return { trunk: null, local: [], remote: [], recent: [] };
  const trunk = trunkOf(repoRoot)?.name ?? null;
  const board = boardBranch(repoRoot);
  const offered = (name: string) => !!name && name !== board && !name.startsWith(BRANCH_PREFIX) && name !== 'HEAD';
  const refs = (pattern: string) => {
    const r = git(['for-each-ref', '--sort=-committerdate', '--format=%(refname)', pattern], repoRoot);
    return r.ok ? r.stdout.split('\n').filter(Boolean) : [];
  };
  const local = refs('refs/heads').map((r) => r.slice('refs/heads/'.length)).filter(offered);
  const remote = refs('refs/remotes/origin')
    .map((r) => r.slice('refs/remotes/origin/'.length))
    .filter((name) => offered(name) && !local.includes(name));
  const bases = git(['config', '--get-regexp', '^branch\\..*\\.brainfilebase$'], repoRoot);
  const recent = (bases.ok ? bases.stdout.split('\n') : [])
    .map((line) => line.split(' ').slice(1).join(' ').trim())
    .filter((name, i, all) => offered(name) && name !== trunk && all.indexOf(name) === i);
  return { trunk, local, remote, recent };
}

/**
 * Lint for targets (decision-16): a task whose `landsOn` names a branch
 * that exists neither here nor on origin, or is not a branch name at all,
 * cannot be handed off. Nothing when `projectId` is not in a repository.
 */
export function lintLandsOn(projectId: string, tasks: Pick<TaskDocument['task'], 'id' | 'landsOn'>[]): LintIssue[] {
  const repoRoot = gitToplevel(projectId);
  if (!repoRoot) return [];
  const issues: LintIssue[] = [];
  for (const task of tasks) {
    const branch = typeof task.landsOn === 'string' ? task.landsOn.trim() : '';
    if (!branch) continue;
    if (!isBranchName(branch)) {
      issues.push({ type: 'warning', code: 'lands-on-invalid', message: `${task.id}: landsOn ${branch} is not a branch name git would take` });
    } else if (!branchRef(repoRoot, branch)) {
      issues.push({ type: 'warning', code: 'lands-on-missing', message: `${task.id} lands on ${branch}, which is not a branch here or on origin: its hand-off cannot fork from it. Make the branch, or change landsOn.` });
    }
  }
  return issues;
}

/**
 * Lets a read-only checkout go once its hand-off has ended, as it keeps
 * nothing. One with changes left in it stays, for the person to look at and
 * discard. True when it went.
 */
export function releaseReader(projectId: string, taskId: string): boolean {
  const repoRoot = gitToplevel(projectId);
  const reader = repoRoot ? existingReader(repoRoot, taskId) : null;
  if (!repoRoot || !reader) return false;
  try {
    cleanUp(repoRoot, reader, null, false);
    return true;
  } catch {
    return false;
  }
}
