/**
 * The dispatch record on a task (spec-16-1, task-74): who asked for a
 * hand-off, with what and how far, and the claim of the runner that started
 * it. It is written on the task as `dispatch:` in its frontmatter, so it is
 * committed and synced like any change.
 *
 * Nothing in it changes while a run goes on: the heartbeat and live progress
 * are this machine's, in `.brainfile/state/runs/` (`@brainfile/core/repo`
 * run files), never on the board.
 *
 * @packageDocumentation
 */

/** Who asked for the hand-off. */
export type DispatchBy = 'chat' | 'cli' | 'mcp' | 'lead' | 'phone' | 'person';

/** How far the hand-off goes on its own: stop in Review for the person, or go through to done. */
export type DispatchUntil = 'review' | 'done';

/** A worker does the task in its worktree; a lead orchestrates a parent's children (decision-15). */
export type DispatchRole = 'worker' | 'lead';

/** What started the run. */
export type DispatchRunner = 'desktop' | 'cli' | 'mcp';

/** How a claimed run ended. `lost`: its runner went away without saying. */
export type DispatchOutcome = 'done' | 'review' | 'failed' | 'stopped' | 'lost';

/**
 * The runner that started the task. Taken by a compare-and-swap on the task
 * file before the run starts; the board commit makes it final. Cleared when
 * the run ends, or kept with `ended` and `outcome`.
 */
export interface DispatchClaim {
  /** The machine, as `os.hostname()` names it (without `.local`). */
  host: string;
  runner: DispatchRunner;
  /** The runner's process on that machine. */
  pid: number;
  /** ISO 8601. */
  at: string;
  /** ISO 8601, when the run ended; a claim that has ended holds nothing. */
  ended?: string;
  outcome?: DispatchOutcome;

  /** Keys core does not know are kept. */
  [key: string]: unknown;
}

/** The request, as a caller asks for it: the record without a claim. */
export interface DispatchRequest {
  agent: string;
  /** The model asked for, when one was; unset is the agent's default. */
  model?: string;
  /** The effort asked for with the model, when one was. */
  effort?: string;
  by: DispatchBy;
  /** ISO 8601. */
  at: string;
  until?: DispatchUntil;
  role?: DispatchRole;
}

/** `dispatch:` on a task: the request, and the claim once a runner took it. */
export interface DispatchRecord extends DispatchRequest {
  claim?: DispatchClaim;
  /**
   * How many hand-offs of the task a runner has started: one for each claim
   * taken for a worker. Kept across requests, so an epic's lead counts its
   * tries from the board (task-83).
   */
  tries?: number;
  /** On a lead's record (role lead): when the person paused it (ISO 8601). A new request drops it. */
  paused?: string;

  /** Keys core does not know are kept. */
  [key: string]: unknown;
}

export const DISPATCH_BY: readonly DispatchBy[] = ['chat', 'cli', 'mcp', 'lead', 'phone', 'person'];
export const DISPATCH_UNTIL: readonly DispatchUntil[] = ['review', 'done'];
export const DISPATCH_ROLES: readonly DispatchRole[] = ['worker', 'lead'];
export const DISPATCH_RUNNERS: readonly DispatchRunner[] = ['desktop', 'cli', 'mcp'];
export const DISPATCH_OUTCOMES: readonly DispatchOutcome[] = ['done', 'review', 'failed', 'stopped', 'lost'];
