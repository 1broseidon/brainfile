/**
 * The fork-and-land choice for a hand-off (decision-16), read from the
 * board: the branch a task's hand-off forks from and lands on (its
 * `landsOn`, inherited up the tree, else the trunk), and an epic's own
 * branch when it is under one with `epicBranch: true`. Built once, here
 * beside the worktrees (task-76), so the desktop, `brainfile run` and the
 * MCP runners (epic-6) choose the same.
 *
 * Node only: it reads the board from disk and asks git.
 */
import { epicBranchOf, landsOnOf, targetOf } from '../landsOn';
import { readTasksDir } from '../taskFile';
import { getV2Dirs } from '../workspace';
import type { Task } from '../types';
import { git } from './boardRepo';
import { locateBoard } from './locate';
import { bringIn, discardReview, prepareBranch, prepareWorktree, reviewOf, type Refresh } from './worktree';

/** Where a task's hand-off forks from and lands on. */
export interface HandOffTarget {
  /** The branch, for prepareWorktree's `base`; absent for the trunk. */
  base?: string;
  /** It is the branch of the epic `id` (epicBranch), which itself lands on `target` (absent: the trunk). */
  epic?: { id: string; branch: string; target?: string };
}

/** Every document on the project's board, open over completed, by ID; empty when there is no board. */
function boardDocs(projectId: string): Map<string, Task> {
  const located = locateBoard(projectId, { materialize: false });
  if (!located.found) return new Map();
  const dirs = getV2Dirs(located.brainfilePath);
  return new Map([...readTasksDir(dirs.logsDir), ...readTasksDir(dirs.boardDir)].map((d) => [d.task.id, d.task]));
}

/** The task's target as the board says it (see targetOf); `{}` is the trunk. */
export function handOffTarget(projectId: string, taskId: string, docs: Map<string, Task> = boardDocs(projectId)): HandOffTarget {
  const target = targetOf(docs, taskId);
  if (!target) return {};
  if (!target.epicBranch) return { base: target.branch };
  const above = landsOnOf(docs, target.from);
  return { base: target.branch, epic: { id: target.from, branch: target.branch, ...(above ? { target: above } : {}) } };
}

/**
 * The branch a hand-off of `taskId` forks from, made ready: an epic's own
 * branch is made from the epic's target when it is not there yet (a child
 * handed off by the person before any lead ran). Undefined is the trunk.
 */
export function prepareTarget(projectId: string, taskId: string): string | undefined {
  const target = handOffTarget(projectId, taskId);
  if (target.epic) prepareBranch(projectId, target.epic.id, target.epic.target);
  return target.base;
}

/**
 * An epic's own branch (decision-16), made from the epic's target if it has
 * `epicBranch: true`: its name, or null when it has none. What an epic's
 * lead calls as it starts.
 */
export function prepareEpicBranch(projectId: string, epicId: string): string | null {
  const docs = boardDocs(projectId);
  if (docs.get(epicId)?.epicBranch !== true) return null;
  return prepareBranch(projectId, epicId, landsOnOf(docs, epicId) ?? undefined)?.branch ?? null;
}

/**
 * Before a hand-off from an epic's own branch: the epic's target brought
 * into it (bringIn), so it does not drift. Null when the task's target is
 * not an epic's branch. It waits for a landing under way only `lockMs`
 * (10s): past that it is refused, and the hand-off goes ahead from the
 * branch as it is; the next one brings the target in.
 */
export function refreshTarget(projectId: string, taskId: string, lockMs = 10_000): Promise<Refresh | null> {
  const target = handOffTarget(projectId, taskId);
  if (!target.epic) return Promise.resolve(null);
  return bringIn(projectId, target.epic.id, { lock: { timeoutMs: lockMs } });
}

/**
 * Its last child done, an epic with a branch of its own is checked out to be
 * merged (decision-16): one item in Ready to merge, its branch into the
 * epic's target. Null when it has no branch of its own, or nothing landed on
 * it, which then goes and leaves the epic to be completed as before.
 */
export function offerEpicBranch(projectId: string, epicId: string): { branch: string; into: string } | null {
  const docs = boardDocs(projectId);
  if (docs.get(epicId)?.epicBranch !== true) return null;
  // Never made (no child was handed off): nothing to merge.
  if (!git(['show-ref', '--verify', '--quiet', `refs/heads/${epicBranchOf(epicId)}`], projectId).ok) return null;
  const made = prepareWorktree(projectId, epicId);
  if (!made?.branch) return null;
  const review = reviewOf(projectId, epicId);
  if (!review?.branch || !review.into) return null;
  if (review.ahead === 0) {
    discardReview(projectId, epicId);
    return null;
  }
  return { branch: review.branch, into: review.into };
}
