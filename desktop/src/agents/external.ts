/**
 * Runs started outside this window (task-84): a hand-off or an epic's lead
 * that `brainfile run`, `brainfile dispatch --now` or an MCP client runs on
 * this machine. Core's Runner reads their files under `.brainfile/state/runs/`
 * (`others`); this keeps what was last seen of them, per board, and says
 * each change as the window's own runs are said: a run event, an ask in the
 * band, the ask taken down. Each is marked with where it runs
 * (`in a terminal`).
 *
 * An ask is answered through core too (`answer`): `<run-id>.answer.json`
 * beside the run, which its runner applies within a second, taking its own
 * prompt down. A run whose runner went away without ending it is said as
 * failed, so no row or tab is left working.
 *
 * Nothing here touches Electron, so it is tested on its own.
 */
import { isRunEnded, isRunLost, type RunFile } from '@brainfile/core/repo';
import { runOf } from '@brainfile/core/dispatch';
import type { AgentEvent, AgentRun, PermissionAsk, Result } from '../shared/api';

/** Where a run of another runner works, as the window says it. */
export function whereOf(runner: RunFile['runner']): string {
  if (runner === 'cli') return 'in a terminal';
  if (runner === 'mcp') return 'from an MCP client';
  return 'in another Brainfile window';
}

/** What the window needs from the agents process. */
export interface ExternalDeps {
  /** Other runners' run files on the board, ended and lost ones too (core's Runner.others). */
  others(projectId: string): RunFile[];
  /** Answer another runner's ask through its answer file (core's Runner.answerAsk). */
  answer(runId: string, askId: string, optionId: string | null, projectId: string): Result;
  emit(event: AgentEvent): void;
}

/** An ask as the window names it: the run's id and the ask's own, since every runner counts its asks from 1. */
const askKey = (runId: string, askId: string) => `${runId}/${askId}`;

/** A run file as the window shows it: a run marked with where it works; a lost one has failed. */
export function externalRun(file: RunFile, projectId: string): AgentRun {
  const run: AgentRun = { ...(runOf(file, projectId) as AgentRun), where: whereOf(file.runner) };
  if (!isRunLost(file)) return run;
  return { ...run, state: 'failed', error: 'Its runner went away before it finished', endedAt: file.beatAt };
}

/** The ask a run file says it waits on, as the band shows it; none for a run that ended, or an ask with no id to answer. */
export function externalAsk(file: RunFile, run: AgentRun): PermissionAsk | null {
  const ask = file.ask;
  if (!ask?.id || isRunEnded(file) || isRunLost(file)) return null;
  return {
    id: askKey(file.id, ask.id),
    runId: file.id,
    projectId: run.projectId,
    agentId: run.agentId,
    title: ask.title,
    ...(ask.kind ? { kind: ask.kind } : {}),
    options: ask.options,
    where: run.where,
  };
}

export class ExternalRuns {
  private readonly runs = new Map<string, Map<string, { run: AgentRun; said: string }>>();
  private readonly asking = new Map<string, PermissionAsk>();
  /** Asks answered here whose runner has not applied the answer yet: not put up again meanwhile. */
  private readonly answered = new Map<string, string>();

  constructor(private readonly deps: ExternalDeps) {}

  /**
   * Reads the board's run files again and says what changed: a new run, a
   * change to one, an ask that came or went. A run file pruned away is let
   * go quietly: it ended long ago.
   */
  look(projectId: string): void {
    let files: RunFile[];
    try {
      files = this.deps.others(projectId).filter((f) => f.kind !== 'ask');
    } catch {
      return;
    }
    const before = this.runs.get(projectId) ?? new Map<string, { run: AgentRun; said: string }>();
    const now = new Map<string, { run: AgentRun; said: string }>();
    const asks = new Map<string, PermissionAsk>();
    for (const file of files) {
      const run = externalRun(file, projectId);
      const said = JSON.stringify(run);
      now.set(run.id, { run, said });
      if (before.get(run.id)?.said !== said) this.deps.emit({ kind: 'run', run: { ...run } });
      const ask = externalAsk(file, run);
      if (ask) asks.set(ask.id, ask);
    }
    this.runs.set(projectId, now);
    for (const [id, on] of this.answered) if (on === projectId && !asks.has(id)) this.answered.delete(id);
    for (const [id, ask] of this.asking) {
      if (ask.projectId !== projectId || asks.has(id)) continue;
      this.asking.delete(id);
      this.deps.emit({ kind: 'permission-done', id });
    }
    for (const [id, ask] of asks) {
      if (this.asking.has(id) || this.answered.has(id)) continue;
      this.asking.set(id, ask);
      this.deps.emit({ kind: 'permission', ask });
    }
  }

  /** Every run seen, each a copy. */
  list(): AgentRun[] {
    return [...this.runs.values()].flatMap((runs) => [...runs.values()].map(({ run }) => ({ ...run })));
  }

  /** The asks waiting now. */
  asks(): PermissionAsk[] {
    return [...this.asking.values()];
  }

  /** The board one of these runs is on; undefined when it is not one of them. */
  projectOf(runId: string): string | undefined {
    for (const [projectId, runs] of this.runs) if (runs.has(runId)) return projectId;
    return undefined;
  }

  /** Whether an ask is one of these. */
  has(askId: string): boolean {
    return this.asking.has(askId);
  }

  /** Boards with a run still going, to look at again in case a runner went away without a word. */
  going(): string[] {
    return [...this.runs].filter(([, runs]) => [...runs.values()].some(({ run }) => run.endedAt === undefined)).map(([projectId]) => projectId);
  }

  /**
   * The person's answer, written for the run's runner to apply; the band
   * takes the ask down now, and it stays down unless the runner asks again.
   */
  answer(askId: string, optionId: string | null): Result {
    const ask = this.asking.get(askId);
    if (!ask) return { ok: false, error: 'That ask has gone' };
    const own = askId.slice(ask.runId.length + 1);
    const written = this.deps.answer(ask.runId, own, optionId, ask.projectId);
    if (!written.ok) return written;
    this.asking.delete(askId);
    this.answered.set(askId, ask.projectId);
    this.deps.emit({ kind: 'permission-done', id: askId });
    return written;
  }
}
