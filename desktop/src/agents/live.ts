/**
 * The runs `live` tells a phone (task-40, link.md): those not yet ended, and
 * those that ended in the last half hour with their reply or error, the
 * latest 50 of them, so a turn or a hand-off that ends while the phone is
 * away still reaches it when it is back.
 */
import type { AgentRun } from '../shared/api';

/** How long a run that ended is still told. */
export const ENDED_MS = 30 * 60_000;
/** At most this many runs that ended, the latest. */
export const ENDED_RUNS = 50;

/** The runs to tell, in the order given, each a copy. */
export function liveRuns(runs: Iterable<AgentRun>, now = Date.now()): AgentRun[] {
  const all = [...runs];
  const ended = new Set(
    all
      .filter((run) => run.endedAt !== undefined && now - run.endedAt <= ENDED_MS)
      .sort((a, b) => b.endedAt! - a.endedAt!)
      .slice(0, ENDED_RUNS)
  );
  return all.filter((run) => run.endedAt === undefined || ended.has(run)).map((run) => ({ ...run }));
}
