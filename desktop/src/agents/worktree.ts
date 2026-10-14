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
 * Not an IDE: the review says what changed, opens it in the person's editor,
 * merges it or throws it away. It never edits a diff.
 */
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { git, gitToplevel, listWorktrees, locateBoard } from '@brainfile/core/repo';
import type { ReviewView } from '../shared/api';

export const BRANCH_PREFIX = 'dispatch/';
const BASE_KEY = 'brainfileBase';
const FORK_KEY = 'brainfileFork';
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
    if (!name) continue;
    if (branchExists(repoRoot, name)) return { name, ref: name };
    if (git(['show-ref', '--verify', '--quiet', `refs/remotes/origin/${name}`], repoRoot).ok) return { name, ref: `origin/${name}` };
  }
  return null;
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
function existing(repoRoot: string, taskId: string): string | null {
  const ref = `refs/heads/${branchFor(taskId)}`;
  const hit = listWorktrees(repoRoot).find((w) => w.branch === ref);
  return hit && fs.existsSync(hit.path) ? hit.path : null;
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
 * The task's worktree, made on first use from the trunk's tip, and found
 * again after (a send-back, a second hand-off). One that only `reads` gets a
 * detached checkout and no branch, unless the task already has a branch:
 * the work on it is kept. Null when the project cannot branch (see canBranch).
 */
export function prepareWorktree(projectId: string, taskId: string, root = worktreesRoot(), reads = false): Worktree | null {
  const repoRoot = canBranch(projectId);
  if (!repoRoot) return null;
  const branch = branchFor(taskId);
  const trunk = trunkOf(repoRoot);
  // A checkout whose folder was deleted still holds its branch until pruned.
  git(['worktree', 'prune'], repoRoot);
  const reader = existingReader(repoRoot, taskId);
  if (reads && !branchExists(repoRoot, branch)) {
    if (reader) return { path: reader, branch: null, base: trunk?.name ?? null, resumed: false };
    const at = worktreePath(repoRoot, taskId, root);
    fs.mkdirSync(path.dirname(at), { recursive: true });
    const r = git(['worktree', 'add', '--detach', at, trunk?.ref ?? 'HEAD'], repoRoot);
    if (!r.ok) throw new Error(`Could not make a checkout for ${taskId}: ${r.stderr || r.stdout}`);
    return { path: at, branch: null, base: trunk?.name ?? null, resumed: false };
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
      // A repository with no trunk to name forks from the checkout, as before decision-11.
      const fork = git(['rev-parse', trunk?.ref ?? 'HEAD'], repoRoot).stdout;
      const base = trunk?.name ?? currentBranch(repoRoot) ?? fork;
      const r = git(['worktree', 'add', '-b', branch, at, fork], repoRoot);
      if (!r.ok) throw new Error(`Could not make a worktree for ${taskId}: ${r.stderr || r.stdout}`);
      git(['config', `branch.${branch}.${BASE_KEY}`, base], repoRoot);
      git(['config', `branch.${branch}.${FORK_KEY}`, fork], repoRoot);
    }
  }
  return { path: at, branch, base: recorded(repoRoot, branch, BASE_KEY), resumed: ahead(repoRoot, branch) > 0 };
}

/** What is not committed in a checkout. */
function uncommittedIn(at: string): number {
  const status = git(['status', '--porcelain'], at);
  return status.ok ? status.stdout.split('\n').filter(Boolean).length : 0;
}

/** The work a hand-off left on its branch, for the review in the task pane; null when it has no worktree. */
export function reviewOf(projectId: string, taskId: string): ReviewView | null {
  const repoRoot = gitToplevel(projectId);
  if (!repoRoot) return null;
  const at = existing(repoRoot, taskId);
  const checkout = currentBranch(repoRoot);
  if (!at) {
    // A read-only checkout has nothing to merge: only what was left in it, to throw away.
    const reader = existingReader(repoRoot, taskId);
    if (!reader) return null;
    const none = { ahead: 0, commits: [], files: [], filesChanged: 0, added: 0, removed: 0, merged: false };
    return { branch: null, path: reader, base: trunkOf(repoRoot)?.name ?? null, into: null, checkout, ...none, uncommitted: uncommittedIn(reader) };
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

  const uncommitted = uncommittedIn(at);
  const merged = !!into && commits.length > 0 && git(['merge-base', '--is-ancestor', branch, into], repoRoot).ok;

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
  };
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

/**
 * Merges the hand-off's branch into the branch it goes into (the trunk, or
 * the branch it was started from before decision-11), then lets go of the
 * worktree and the branch. The merge happens in the person's checkout, so it
 * must be on that branch, until a hand-off lands from its own worktree
 * (decision-12). Refuses, and changes nothing, when the agent left work
 * uncommitted or the merge would conflict.
 */
export function mergeReview(projectId: string, taskId: string, title?: string): { message: string } {
  const repoRoot = gitToplevel(projectId);
  const review = reviewOf(projectId, taskId);
  if (!repoRoot || !review) throw new Error(`${taskId} has no worktree to merge`);
  const { branch, path: at, into, checkout } = review;
  if (!branch) throw new Error(`${taskId} only read: there is nothing to merge`);
  if (!into) throw new Error(`${branch} has no branch to go into: the trunk is missing`);
  if (review.uncommitted > 0) {
    throw new Error(`${review.uncommitted} ${review.uncommitted === 1 ? 'file is' : 'files are'} not committed in the worktree: send it back, or commit in your editor`);
  }
  if (review.ahead === 0) throw new Error(`${branch} has no commits to merge`);
  if (!review.merged) {
    if (checkout !== into) throw new Error(`${branch} goes into ${into}, and your checkout is on ${checkout ?? 'no branch'}: check out ${into} to merge`);
    const message = `Merge ${taskId}${title ? `: ${title}` : ''}`;
    const r = git(['merge', '--no-ff', '--no-edit', '-m', message, branch], repoRoot);
    if (!r.ok) {
      const conflicted = git(['diff', '--name-only', '--diff-filter=U'], repoRoot).stdout.split('\n').filter(Boolean);
      if (conflicted.length) {
        git(['merge', '--abort'], repoRoot);
        const named = conflicted.slice(0, 3).join(', ') + (conflicted.length > 3 ? ` and ${conflicted.length - 3} more` : '');
        throw new Error(`${branch} conflicts with ${into} in ${named}. Nothing was merged.`);
      }
      throw new Error(`Nothing was merged: ${said(r)}`);
    }
  }
  cleanUp(repoRoot, at, branch, false);
  return { message: `Merged ${branch} into ${into}` };
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
