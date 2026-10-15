/**
 * The hand-offs `npm run link:dev` shows a phone (link.md, Merge from the
 * phone), without git: on the `brainfile` project, task-7 can merge (+42 −7,
 * three commits, into main) and task-5 would conflict in src/a.ts. They
 * answer review, readyToMerge, mergeReview and discardReview as the agents
 * process does, in its words (agents.ts, worktree.ts): a clean landing takes
 * a moment for its checks, then goes; a conflict goes back to the agent that
 * did the work, which settles it, and then it can merge too.
 */
import * as path from 'path';
import type { ReadyView, Result, ReviewView } from '../shared/api';

export interface DevReviewsOptions {
  /** The project the hand-offs are on. */
  projectId: string;
  /** Where their worktrees would be. */
  worktrees: string;
  /** How long a clean landing's checks take. */
  mergeMs?: number;
  /** The name of the agent at work on the task, while one is: Merge and Discard wait for it, and it is not ready yet. */
  working(projectId: string, taskId: string): string | null;
  /** A conflict goes back to the agent with a note in the task's log, as the desk sends a landing back. */
  sendBack(projectId: string, taskId: string, agentId: string, note: string): Promise<Result<unknown>>;
  nameOf(agentId: string): string;
}

interface HandOff {
  review: ReviewView;
  /** The agent that did the work, who settles a conflict. */
  agentId: string;
  /** Sent back to settle its conflict: settled once that run has ended. */
  settling: boolean;
}

/** The two hand-offs, fresh: task-7 clean, task-5 conflicting. */
export function devHandOffs(worktrees: string): Map<string, Omit<HandOff, 'settling'>> {
  const view = (taskId: string, rest: Pick<ReviewView, 'commits' | 'files' | 'conflicts'>): ReviewView => ({
    branch: `dispatch/${taskId}`,
    path: path.join(worktrees, taskId),
    base: 'main',
    into: 'main',
    checkout: 'main',
    ahead: rest.commits.length,
    filesChanged: rest.files.length,
    added: rest.files.reduce((sum, f) => sum + f.added, 0),
    removed: rest.files.reduce((sum, f) => sum + f.removed, 0),
    uncommitted: 0,
    merged: false,
    ...rest,
  });
  return new Map([
    [
      'task-7',
      {
        agentId: 'claude',
        review: view('task-7', {
          commits: [
            { sha: 'a41c9e2', subject: 'Settings: the desk name under the QR' },
            { sha: '7d03b51', subject: 'Link: the name travels in the pairing link' },
            { sha: 'c2e8f10', subject: 'Test a name past 64 characters' },
          ],
          files: [
            { path: 'src/renderer/components/Settings.svelte', added: 24, removed: 5 },
            { path: 'src/link/server.ts', added: 11, removed: 2 },
            { path: 'test/link.test.ts', added: 7, removed: 0 },
          ],
          conflicts: [],
        }),
      },
    ],
    [
      'task-5',
      {
        agentId: 'codex',
        review: view('task-5', {
          commits: [
            { sha: 'e91b7a4', subject: 'Draw the QR as one SVG path' },
            { sha: '3f6d2c8', subject: 'Quiet zone and plate colours' },
          ],
          files: [
            { path: 'src/a.ts', added: 18, removed: 4 },
            { path: 'src/renderer/components/Qr.svelte', added: 36, removed: 0 },
          ],
          conflicts: ['src/a.ts'],
        }),
      },
    ],
  ]);
}

export class DevReviews {
  private readonly handOffs = new Map<string, HandOff>();
  /** Landings go one at a time, as the desk's do. */
  private landing: Promise<unknown> = Promise.resolve();

  constructor(private readonly options: DevReviewsOptions) {
    for (const [taskId, handOff] of devHandOffs(options.worktrees)) this.handOffs.set(taskId, { ...handOff, settling: false });
  }

  review(projectId: string, taskId: string): Result<ReviewView | null> {
    const handOff = this.find(projectId, taskId);
    return { ok: true, value: handOff ? { ...handOff.review } : null };
  }

  /** The board's hand-offs that can merge, or would conflict; one an agent is still at is not ready yet. */
  ready(projectId: string): Result<ReadyView[]> {
    if (projectId !== this.options.projectId) return { ok: true, value: [] };
    const ready: ReadyView[] = [];
    for (const taskId of this.handOffs.keys()) {
      const handOff = this.find(projectId, taskId);
      if (!handOff || this.options.working(projectId, taskId)) continue;
      const { into, ahead, added, removed, conflicts } = handOff.review;
      ready.push({ taskId, into: into!, ahead, added, removed, conflicts: conflicts.length > 0 });
    }
    return { ok: true, value: ready };
  }

  merge(projectId: string, taskId: string): Promise<Result<{ message: string }>> {
    const next = this.landing.then(() => this.land(projectId, taskId));
    this.landing = next.catch(() => {});
    return next;
  }

  discard(projectId: string, taskId: string): Result<{ message: string }> {
    const working = this.options.working(projectId, taskId);
    if (working) return { ok: false, error: `${working} is still working on ${taskId}` };
    const handOff = this.find(projectId, taskId);
    if (!handOff) return { ok: false, error: `${taskId} has no worktree to discard` };
    this.handOffs.delete(taskId);
    return { ok: true, value: { message: `Discarded ${handOff.review.branch}` } };
  }

  private async land(projectId: string, taskId: string): Promise<Result<{ message: string }>> {
    const working = this.options.working(projectId, taskId);
    if (working) return { ok: false, error: `${working} is still working on ${taskId}` };
    const handOff = this.find(projectId, taskId);
    if (!handOff) return { ok: false, error: `${taskId} has no worktree to merge` };
    const { branch, into, conflicts } = handOff.review;
    if (conflicts.length) {
      // git finds the conflict before any check runs: quickly.
      await sleep((this.options.mergeMs ?? 2000) / 4);
      const files = conflicts.join(', ');
      const round = '1 of 1';
      const note =
        `Landing sent back (${round}): ${branch} conflicts with ${into} in ${files}.` +
        ` Merge ${into} into this branch (git merge ${into}), keep what both sides meant, commit the merge, and run the checks.`;
      const sent = await this.options.sendBack(projectId, taskId, handOff.agentId, note);
      if (!sent.ok) return { ok: false, error: `${branch} conflicts with ${into} in ${files}. Nothing was merged. It could not be sent back: ${sent.error}` };
      handOff.settling = true;
      return { ok: false, error: `${taskId} conflicts with ${into} in ${files}: sent back to ${this.options.nameOf(handOff.agentId)} to settle (${round})` };
    }
    await sleep(this.options.mergeMs ?? 2000);
    // Gone already: a second Merge pressed while the first was checking.
    if (!this.handOffs.has(taskId)) return { ok: false, error: `${taskId} has no worktree to merge` };
    this.handOffs.delete(taskId);
    return { ok: true, value: { message: `Merged ${branch} into ${into}` } };
  }

  /** The hand-off on this project, its conflict settled once the agent sent back to it has finished. */
  private find(projectId: string, taskId: string): HandOff | undefined {
    if (projectId !== this.options.projectId) return undefined;
    const handOff = this.handOffs.get(taskId);
    if (handOff?.settling && !this.options.working(projectId, taskId)) {
      const { review } = handOff;
      handOff.settling = false;
      handOff.review = {
        ...review,
        ahead: review.ahead + 1,
        commits: [{ sha: '5b0e4d1', subject: `Merge ${review.into} into ${review.branch}` }, ...review.commits],
        conflicts: [],
      };
    }
    return handOff;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
