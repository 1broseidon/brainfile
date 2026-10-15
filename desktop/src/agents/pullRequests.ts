/**
 * Following the hand-offs opened as pull requests (decision-16, spec-18-5):
 * whenever Ready to merge is asked again (a board change, a run ending, the
 * window's slow timer), the board's open pull requests are asked of the forge,
 * each at most once a minute. Merged, the task completes as after a Merge, and
 * its worktree and branch go (core's followHandOffPullRequest does the git and
 * the record); closed without merging, it is back in Ready to merge. One an
 * agent is still at is left until the agent is done.
 */
import type { Result } from '../shared/api';

/** A pull request is asked about no more often than this. */
export const FOLLOW_EVERY_MS = 60_000;
/** The board is looked through for open pull requests no more often than this. */
export const SCAN_EVERY_MS = 15_000;

/** What the forge said, and what was done about it (core's PullRequestFollow, as far as this needs it). */
export type Followed = { state: 'open' } | { state: 'closed' } | { state: 'merged'; released: boolean; said: string };

export interface PullRequestWatchDeps {
  /** The tasks on the board whose pull request is open. */
  open(projectId: string): string[];
  /** Asks the forge where the task's pull request stands and acts on it; null when it has none open. */
  follow(projectId: string, taskId: string): Promise<{ ok: true; value: Followed } | { ok: false; error: string } | null>;
  /** A merged one is the person's yes, as Merge is: the task completes, unless subtasks are left. */
  settle(projectId: string, taskId: string): Promise<Result<unknown>>;
  /** An agent at work on the task, or a hand-off starting on it. */
  busy(projectId: string, taskId: string): boolean;
  /** What happened, in a sentence, for the lead over the task. */
  said?(projectId: string, taskId: string, text: string): void;
  now?(): number;
}

export class PullRequestWatch {
  readonly #deps: PullRequestWatchDeps;
  /** When each task's pull request was last asked about, by `projectId\ntaskId`. */
  readonly #asked = new Map<string, number>();
  readonly #scanned = new Map<string, number>();
  readonly #following = new Set<string>();

  constructor(deps: PullRequestWatchDeps) {
    this.#deps = deps;
  }

  #now(): number {
    return this.#deps.now?.() ?? Date.now();
  }

  /** Follows the board's open pull requests that are due; resolves once those asked now have been answered and acted on. */
  async check(projectId: string): Promise<void> {
    const now = this.#now();
    if (now - (this.#scanned.get(projectId) ?? -Infinity) < SCAN_EVERY_MS) return;
    this.#scanned.set(projectId, now);
    let open: string[];
    try {
      open = this.#deps.open(projectId);
    } catch {
      return;
    }
    const due = open.filter((taskId) => {
      const key = `${projectId}\n${taskId}`;
      return !this.#following.has(key) && !this.#deps.busy(projectId, taskId) && now - (this.#asked.get(key) ?? -Infinity) >= FOLLOW_EVERY_MS;
    });
    await Promise.all(due.map((taskId) => this.#follow(projectId, taskId)));
  }

  async #follow(projectId: string, taskId: string): Promise<void> {
    const key = `${projectId}\n${taskId}`;
    this.#following.add(key);
    this.#asked.set(key, this.#now());
    try {
      const followed = await this.#deps.follow(projectId, taskId);
      // Not reached, or refused: asked again at the next minute.
      if (!followed?.ok) return;
      const { value } = followed;
      if (value.state === 'closed') this.#deps.said?.(projectId, taskId, `${taskId}'s pull request was closed without merging: it is back in Ready to merge`);
      if (value.state !== 'merged') return;
      const settled = await this.#deps.settle(projectId, taskId);
      const kept = value.released ? '' : ` (${value.said})`;
      this.#deps.said?.(
        projectId,
        taskId,
        settled.ok ? `${taskId} landed: its pull request merged on the forge${kept}` : `${taskId}'s pull request merged, but it stays open: ${settled.error}`
      );
    } catch {
      /* git or the board refused: asked again at the next minute */
    } finally {
      this.#following.delete(key);
    }
  }
}
