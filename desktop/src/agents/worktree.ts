/**
 * A worktree per hand-off (spec-14): each dispatched task gets its own git
 * worktree and branch, so two agents, or an agent and the person, never
 * share one checkout, and an agent never edits the running app's own files.
 * The board is still shared: it lives on the board branch, which every
 * worktree of the repository reaches.
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
/** How many commits and files a review lists; the totals cover the rest. */
const SHOWN = 12;

/** Where hand-offs are checked out: out of the person's projects, and out of the running app's checkout. */
export function worktreesRoot(): string {
  return process.env.BRAINFILE_WORKTREES ?? path.join(os.homedir(), '.brainfile-worktrees');
}

export const branchFor = (taskId: string): string => `${BRANCH_PREFIX}${taskId}`;

export interface Worktree {
  path: string;
  branch: string;
  /** The branch it was started from, or the commit when that was detached. */
  base: string | null;
  /** The branch already carries commits: this is not the first pass. */
  resumed: boolean;
}

/** `<root>/<repo>-<hash>/<task-id>`: one folder per repository, so two repos' task-1 never meet. */
function worktreePath(repoRoot: string, taskId: string, root: string): string {
  const hash = createHash('sha1').update(repoRoot).digest('hex').slice(0, 6);
  return path.join(root, `${path.basename(repoRoot)}-${hash}`, taskId);
}

function currentBranch(cwd: string): string | null {
  const r = git(['symbolic-ref', '--quiet', '--short', 'HEAD'], cwd);
  return r.ok && r.stdout ? r.stdout : null;
}

function branchExists(repoRoot: string, branch: string): boolean {
  return git(['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], repoRoot).ok;
}

function recorded(repoRoot: string, branch: string, key: string): string | null {
  const r = git(['config', '--get', `branch.${branch}.${key}`], repoRoot);
  return r.ok && r.stdout ? r.stdout : null;
}

/**
 * The commit the hand-off started from: recorded when the worktree was made,
 * else where the branch meets the checkout's. Everything after it is the
 * agent's work, merged since or not.
 */
function forkOf(repoRoot: string, branch: string): string | null {
  const fork = recorded(repoRoot, branch, FORK_KEY);
  if (fork && git(['cat-file', '-e', `${fork}^{commit}`], repoRoot).ok) return fork;
  const r = git(['merge-base', 'HEAD', branch], repoRoot);
  return r.ok && r.stdout ? r.stdout : null;
}

/** The hand-off's checkout, when there is one on disk. */
function existing(repoRoot: string, taskId: string): string | null {
  const ref = `refs/heads/${branchFor(taskId)}`;
  const hit = listWorktrees(repoRoot).find((w) => w.branch === ref);
  return hit && fs.existsSync(hit.path) ? hit.path : null;
}

function ahead(repoRoot: string, branch: string): number {
  const fork = forkOf(repoRoot, branch);
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
 * The task's worktree, made on first use from the commit the person's
 * checkout is on, and found again after (a send-back, a second hand-off).
 * Null when the project cannot branch (see canBranch).
 */
export function prepareWorktree(projectId: string, taskId: string, root = worktreesRoot()): Worktree | null {
  const repoRoot = canBranch(projectId);
  if (!repoRoot) return null;
  const branch = branchFor(taskId);
  let at = existing(repoRoot, taskId);
  if (!at) {
    at = worktreePath(repoRoot, taskId, root);
    fs.mkdirSync(path.dirname(at), { recursive: true });
    // A checkout whose folder was deleted still holds its branch until pruned.
    git(['worktree', 'prune'], repoRoot);
    if (branchExists(repoRoot, branch)) {
      const r = git(['worktree', 'add', at, branch], repoRoot);
      if (!r.ok) throw new Error(`Could not check out ${branch}: ${r.stderr || r.stdout}`);
    } else {
      const fork = git(['rev-parse', 'HEAD'], repoRoot).stdout;
      const base = currentBranch(repoRoot) ?? fork;
      const r = git(['worktree', 'add', '-b', branch, at, fork], repoRoot);
      if (!r.ok) throw new Error(`Could not make a worktree for ${taskId}: ${r.stderr || r.stdout}`);
      git(['config', `branch.${branch}.${BASE_KEY}`, base], repoRoot);
      git(['config', `branch.${branch}.${FORK_KEY}`, fork], repoRoot);
    }
  }
  return { path: at, branch, base: recorded(repoRoot, branch, BASE_KEY), resumed: ahead(repoRoot, branch) > 0 };
}

/** The work a hand-off left on its branch, for the review in the task pane; null when it has no worktree. */
export function reviewOf(projectId: string, taskId: string): ReviewView | null {
  const repoRoot = gitToplevel(projectId);
  if (!repoRoot) return null;
  const at = existing(repoRoot, taskId);
  if (!at) return null;
  const branch = branchFor(taskId);
  const into = currentBranch(repoRoot);
  const fork = forkOf(repoRoot, branch);

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

  const status = git(['status', '--porcelain'], at);
  const uncommitted = status.ok ? status.stdout.split('\n').filter(Boolean).length : 0;
  const merged = !!into && commits.length > 0 && git(['merge-base', '--is-ancestor', branch, into], repoRoot).ok;

  return {
    branch,
    path: at,
    base: recorded(repoRoot, branch, BASE_KEY),
    into,
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

/** The files changed in a worktree and not committed, as git names them, the first few; the count covers the rest. */
export function uncommittedIn(at: string): { files: string[]; count: number } {
  const status = git(['status', '--porcelain'], at);
  const lines = status.ok ? status.stdout.split('\n').filter(Boolean) : [];
  // `XY path`; the output comes trimmed, so the first line may have lost a leading blank.
  return { files: lines.slice(0, SHOWN).map((l) => l.replace(/^\s?\S{1,2}\s+/, '')), count: lines.length };
}

/** The last line of git's complaint worth showing. */
function said(r: { stderr: string; stdout: string }): string {
  const lines = `${r.stderr}\n${r.stdout}`.split('\n').map((l) => l.replace(/^(error|fatal|hint):\s*/, '').trim());
  return lines.filter(Boolean)[0] ?? 'git refused';
}

/** Lets go of the checkout and its branch; drops the repository's folder when it is the last. */
function cleanUp(repoRoot: string, at: string, branch: string, force: boolean): void {
  const removed = git(['worktree', 'remove', ...(force ? ['--force'] : []), at], repoRoot);
  if (!removed.ok) throw new Error(`Could not remove the worktree: ${said(removed)}`);
  git(['branch', force ? '-D' : '-d', branch], repoRoot);
  git(['config', '--remove-section', `branch.${branch}`], repoRoot);
  try {
    fs.rmdirSync(path.dirname(at));
  } catch {
    /* another hand-off is still there */
  }
}

/**
 * Merges the hand-off's branch into the branch the person's checkout is on,
 * then lets go of the worktree and the branch. Refuses, and changes nothing,
 * when the agent left work uncommitted or the merge would conflict.
 */
export function mergeReview(projectId: string, taskId: string, title?: string): { message: string } {
  const repoRoot = gitToplevel(projectId);
  const review = reviewOf(projectId, taskId);
  if (!repoRoot || !review) throw new Error(`${taskId} has no worktree to merge`);
  const { branch, path: at, into } = review;
  if (!into) throw new Error('Your checkout is not on a branch: check one out to merge into');
  if (review.uncommitted > 0) {
    throw new Error(`${review.uncommitted} ${review.uncommitted === 1 ? 'file is' : 'files are'} not committed in the worktree: send it back, or commit in your editor`);
  }
  if (review.ahead === 0) throw new Error(`${branch} has no commits to merge`);
  if (!review.merged) {
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
  if (!repoRoot || !at) throw new Error(`${taskId} has no worktree to discard`);
  cleanUp(repoRoot, at, branchFor(taskId), true);
  return { message: `Discarded ${branchFor(taskId)}` };
}
