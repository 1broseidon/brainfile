/**
 * `brainfile run` (task-82, spec-16-8): a foreground runner, left open in a
 * terminal split. Not a daemon: it lives as long as the terminal does.
 *
 * - It works the board's queue through core's Runner (task-80), with the
 *   board's own files as its board: its runner file in state/runners says it
 *   is up, it claims each task by compare-and-swap (so it and the desktop, or
 *   two of these, never start one task), and it takes up epics' leads
 *   (task-83) and starts what they queue inside their rules.
 * - It prints one plain line per change: `task-74 · codex · editing`,
 *   `task-74 in Review`, `epic-6 · lead · codex · leading`.
 * - An agent's ask comes to its prompt, one at a time, naming the run.
 * - Ctrl-C lets go: its sessions stop, its run files end, and the tasks it
 *   had go back to the queue on the board, its leads' with them, for the next
 *   runner. A second Ctrl-C leaves at once.
 * - `--once` returns when nothing it started is still going and nothing
 *   queued can start.
 *
 * `brainfile dispatch --now` is this loop too, given the tasks and epics it
 * just queued instead of the whole queue.
 */
import * as path from 'path';
import * as readline from 'readline';
import chalk from 'chalk';
import { findV2Task, getV2Dirs, readDispatchRecord, type DispatchUntil } from '@brainfile/core';
import {
  Runner,
  dataDir as dispatchDataDir,
  fileBoard,
  type AgentRun,
  type LeadView,
  type PermissionAsk,
  type RunnerOptions,
} from '@brainfile/core/dispatch';
import { flushBoardCommits, projectOfBoard, unlanded } from '@brainfile/core/repo';
import { type Logger, defaultLogger } from '../utils/logger';
import { CLIError } from '../utils/cli-error';
import { agentLabel } from '../utils/agent-label';
import { callerAccess, refuseInAgent } from '../utils/agent-role';
import { resolveCliBrainfilePath } from '../utils/brainfile-path';
import { assertV2Brainfile } from '../utils/v2-only';

export const RUN_COMMAND_HELP = `
Examples:
  brainfile run                     Work the queue here until Ctrl-C
  brainfile run --once              Work it until nothing more can start, then return
  brainfile run --max 1             One hand-off at a time from this terminal
  brainfile run --until done        A hand-off whose request names nothing lands on its own where the repository allows

It works what \`brainfile dispatch\` (or an agent's dispatch tool) queued on
this board, at most dispatch.maxRunning at once on the repository (else 3),
whichever runner runs them, and takes up epics' leads. Brainfile's window and
another \`brainfile run\` share the queue: each task is claimed by one runner.

Asks come to this terminal. Ctrl-C lets go: the agents stop, their worktrees
stay, and their tasks wait in the queue for the next runner.
`.trimEnd();

/** How often it looks at the queue for what was queued, or let go, elsewhere. */
export const RUN_LOOK_MS = 1_000;

const LIVE = new Set(['starting', 'working', 'waiting']);

export interface RunOptions {
  file?: string;
  /** Return once nothing more can start. */
  once?: boolean;
  /** At most this many of its own hand-offs at once. */
  max?: number | string;
  /** How far a hand-off goes when its request names nothing. */
  until?: string;
}

export interface RunLoopOptions {
  once?: boolean;
  max?: number;
  until?: DispatchUntil;
  /** Only these, just queued, instead of the queue (`dispatch --now`): tasks started here, epics led here. */
  only?: { tasks: string[]; leads: string[] };
  /** Lets go when aborted, as Ctrl-C does. */
  signal?: AbortSignal;
  /** Ctrl-C lets go (the command's own; off for a caller that aborts it). Default true. */
  sigint?: boolean;
  /** For tests: the runner's own options (another pid, quicker beats). */
  runner?: Partial<RunnerOptions>;
  /** Where its asks are put and answered; the process's own stdin and stdout by default. */
  input?: NodeJS.ReadableStream & { isTTY?: boolean };
  output?: NodeJS.WritableStream;
}

export interface RunSummary {
  /** The tasks it started a hand-off on, in order (a task sent back is there again). */
  started: string[];
  /** The epics it led. */
  led: string[];
  /** What it gave back to the queue when it let go. */
  letGo: string[];
  /** Still queued when it returned, with what each waits on. */
  queued: { task: string; waitsOn?: string[] }[];
  /** It returned because it was stopped (Ctrl-C), not because the work was done. */
  interrupted: boolean;
}

/**
 * Works the board's queue here until stopped, or with `once` until nothing
 * it started is still going and nothing queued can start. Lets go of what it
 * holds before it returns, and commits what it wrote on the board.
 */
export async function runLoop(filePath: string, options: RunLoopOptions = {}, logger: Logger = defaultLogger): Promise<RunSummary> {
  assertV2Brainfile(filePath);
  const projectId = projectOfBoard(filePath);
  const summary: RunSummary = { started: [], led: [], letGo: [], queued: [], interrupted: false };
  let wake = () => {};
  let stopping = false;
  const said = new Map<string, string>();
  const say = (key: string, line: string) => {
    if (said.get(key) === line) return;
    said.set(key, line);
    logger.log(line);
  };
  const asker = terminalAsk(logger, (runId) => runner.get(runId), { input: options.input, output: options.output });
  const runner: Runner = new Runner({
    dataDir: dispatchDataDir(),
    runner: 'cli',
    board: fileBoard(),
    leads: true,
    // It stays up, so a landing that fails goes back to its agent here.
    sendBack: 'start',
    ...(options.until ? { until: options.until } : {}),
    ...(options.max ? { maxRunning: options.max } : {}),
    ask: asker.ask,
    cancelAsk: asker.cancel,
    onRun(run, was) {
      if (run.kind !== 'dispatch') return;
      if (!was && run.taskId) summary.started.push(run.taskId);
      say(run.id, runLineText(run, untilOf(runner, filePath, projectId, run.taskId, options.until)));
      wake();
    },
    onLead(view) {
      if (!summary.led.includes(view.epicId)) summary.led.push(view.epicId);
      say(`lead ${view.epicId}`, leadLineText(view));
      wake();
    },
    landed(_projectId, taskId) {
      logger.log(chalk.green(`${taskId} landed`));
      wake();
    },
    ...options.runner,
  });

  const interrupt = () => {
    if (stopping) {
      logger.log(chalk.yellow('Left at once: claims this runner held are taken again once it is gone.'));
      flushBoardCommits();
      process.exit(130);
    }
    stopping = true;
    summary.interrupted = true;
    logger.log(chalk.gray('Letting go: the agents stop and their tasks go back to the queue. Ctrl-C again to leave at once.'));
    wake();
  };
  const sigint = options.sigint !== false;
  if (sigint) process.on('SIGINT', interrupt);
  options.signal?.addEventListener('abort', interrupt, { once: true });

  const pending = [...(options.only?.tasks ?? [])];
  const waits = (taskId: string) => waitsOf(getV2Dirs(filePath), projectId, taskId);
  try {
    if (!options.only) {
      const max = options.max ? `, ${options.max} of them from here` : '';
      logger.log(chalk.gray(`Working the queue on ${path.basename(projectId)}: at most ${runner.limit(projectId)} at once${max}. Ctrl-C lets go.`));
    }
    for (const epicId of options.only?.leads ?? []) {
      const started = await runner.lead(projectId, epicId);
      if (!started.ok) logger.log(chalk.yellow(`${epicId}: ${started.error}`));
    }
    while (!stopping) {
      let began = 0;
      if (options.only) {
        for (const id of [...pending]) {
          if (stopping || runner.live(projectId).length >= runner.limit(projectId)) break;
          // One that waits on a dependency (decision-15) stays pending, said once by dispatch: it starts here once
          // that has landed, by another of these or elsewhere, while anything of this run is still going.
          if (waits(id).length) continue;
          pending.splice(pending.indexOf(id), 1);
          const started = await runner.start(projectId, id, { refresh: true });
          if (started.ok) began += 1;
          else logger.log(chalk.yellow(`${id}: ${started.error}`));
        }
      } else {
        began = (await runner.work(projectId)).length;
      }
      // Given only these: done once nothing of them is going and what is left can only wait.
      const done = options.only ? runner.settled(projectId) && pending.every((id) => waits(id).length > 0) : options.once && !began && runner.settled(projectId);
      if (done) break;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, RUN_LOOK_MS);
        wake = () => {
          clearTimeout(timer);
          resolve();
        };
      });
    }
  } finally {
    if (sigint) process.off('SIGINT', interrupt);
    options.signal?.removeEventListener('abort', interrupt);
    const mine = runner.list().filter((r) => r.kind === 'dispatch' && LIVE.has(r.state) && r.taskId).map((r) => r.taskId!);
    const leading = runner.leads.running(projectId).map((l) => l.epicId);
    await runner.letGo();
    flushBoardCommits();
    summary.letGo = [...mine, ...leading];
    if (mine.length) logger.log(chalk.yellow(`Back in the queue: ${mine.join(', ')}. Their worktrees stay.`));
    if (leading.length) logger.log(chalk.yellow(`${leading.map((id) => `${id}'s lead`).join(', ')} ${leading.length === 1 ? 'waits' : 'wait'} for a runner to take ${leading.length === 1 ? 'it' : 'them'} up.`));
  }
  summary.queued = leftQueued(runner, filePath, projectId);
  if (!summary.interrupted && !options.only) {
    logger.log(
      summary.queued.length
        ? `Still queued: ${summary.queued.map((q) => (q.waitsOn ? `${q.task} (waits on ${q.waitsOn.join(', ')})` : q.task)).join(', ')}.`
        : 'The queue is empty.',
    );
  }
  return summary;
}

/** What is queued on the board, with what each still waits on. */
function leftQueued(runner: Runner, filePath: string, projectId: string): RunSummary['queued'] {
  const dirs = getV2Dirs(filePath);
  return runner.queued(projectId).map((task) => {
    const waits = waitsOf(dirs, projectId, task);
    return { task, ...(waits.length ? { waitsOn: waits } : {}) };
  });
}

/** The dependsOn a task still waits on (decision-15): open on this board, or complete with its branch not landed; none for a task that is gone. */
function waitsOf(dirs: ReturnType<typeof getV2Dirs>, projectId: string, taskId: string): string[] {
  try {
    const doc = findV2Task(dirs, taskId)?.doc.task;
    return (doc?.dependsOn ?? []).filter((ref) => !ref.includes(':') && (!!findV2Task(dirs, ref) || unlanded(projectId, ref)));
  } catch {
    return [];
  }
}

/** How far the run's hand-off goes: its lead's rule, its request's, else the runner's. */
function untilOf(runner: Runner, filePath: string, projectId: string, taskId: string | undefined, fallback?: DispatchUntil): DispatchUntil {
  if (!taskId) return 'review';
  const lead = runner.leads.leadOver(projectId, taskId);
  if (lead) return lead.until;
  try {
    const task = findV2Task(getV2Dirs(filePath), taskId)?.doc.task;
    return (task ? readDispatchRecord(task)?.until : undefined) ?? fallback ?? 'review';
  } catch {
    return fallback ?? 'review';
  }
}

/** A run's line: `task-74 · codex · editing`; once it ends, where its task is. */
export function runLineText(run: AgentRun, until: DispatchUntil = 'review'): string {
  const who = `${run.taskId ?? run.id} · ${agentLabel(run.agentId)}`;
  if (run.state === 'waiting') return `${who} · asking`;
  if (LIVE.has(run.state)) return `${who} · ${run.activity}`;
  if (run.state === 'done') return until === 'done' ? `${who} · done, landing it` : chalk.green(`${run.taskId ?? run.id} in Review`);
  return run.state === 'stopped' ? chalk.yellow(`${who} · stopped`) : chalk.red(`${who} · failed${run.error ? `: ${run.error}` : ''}`);
}

/** An epic's lead's line: `epic-6 · lead · codex · leading`. */
export function leadLineText(view: LeadView): string {
  const who = `${view.epicId} · lead · ${agentLabel(view.agentId)}`;
  const note = view.note ? `: ${view.note.split('\n')[0]}` : '';
  if (view.state === 'leading') return `${who} · leading${note}`;
  if (view.state === 'paused') return chalk.yellow(`${who} · paused${note}`);
  return view.state === 'done' ? chalk.green(`${who} · done${note}`) : chalk.yellow(`${who} · stopped${note}`);
}

/**
 * Asks at this terminal, one at a time, naming the run: the agent's own
 * options (Allow once · Always · Deny), picked by number. An ask answered
 * from another process (the desktop's band) or given up on (its run stopped)
 * is taken down, saying which. With no terminal, nothing is allowed.
 */
export function terminalAsk(
  logger: Logger,
  runOf: (runId: string) => AgentRun | undefined,
  io: { input?: NodeJS.ReadableStream & { isTTY?: boolean }; output?: NodeJS.WritableStream } = {},
): { ask: (ask: PermissionAsk) => Promise<string | null>; cancel: (askId: string, why?: 'answered' | 'stopped') => void } {
  const input = io.input ?? process.stdin;
  const output = io.output ?? process.stdout;
  let turn: Promise<unknown> = Promise.resolve();
  const open = new Map<string, () => void>();
  const cancelled = new Set<string>();
  const ask = (asked: PermissionAsk): Promise<string | null> => {
    const answer = turn.then(async () => {
      if (cancelled.delete(asked.id)) return null;
      const run = runOf(asked.runId);
      const who = `${run?.taskId ?? asked.runId} · ${agentLabel(asked.agentId)}`;
      if (!(input as { isTTY?: boolean }).isTTY) {
        logger.log(chalk.yellow(`${who} asks: ${asked.title}. Refused: no terminal to answer in.`));
        return null;
      }
      const choices = asked.options.map((o, i) => `${i + 1}) ${o.name}`).join('  ');
      const rl = readline.createInterface({ input, output });
      // Ctrl-C at the prompt is the runner's Ctrl-C.
      rl.on('SIGINT', () => process.emit('SIGINT'));
      try {
        const reply = await new Promise<string | null>((resolve) => {
          open.set(asked.id, () => resolve(null));
          rl.question(`${who} asks: ${asked.title}\n  ${choices}  > `, resolve);
        });
        return reply === null ? null : (asked.options[Number(reply.trim()) - 1]?.optionId ?? null);
      } finally {
        open.delete(asked.id);
        rl.close();
      }
    });
    turn = answer.catch(() => null);
    return answer;
  };
  const cancel = (askId: string, why: 'answered' | 'stopped' = 'stopped') => {
    const close = open.get(askId);
    if (close) {
      logger.log(chalk.gray(why === 'answered' ? 'That ask was answered outside this terminal.' : 'That ask was withdrawn: its run stopped.'));
      close();
    } else cancelled.add(askId);
  };
  return { ask, cancel };
}

/** `brainfile run [--once] [--max N] [--until review|done]`. */
export async function runCommand(options: RunOptions, logger: Logger = defaultLogger): Promise<RunSummary> {
  refuseInAgent(callerAccess(), 'run a runner');
  const filePath = resolveCliBrainfilePath(options.file);
  const until = options.until;
  if (until !== undefined && until !== 'review' && until !== 'done') throw new CLIError(`--until is review or done, not ${until}`);
  let max: number | undefined;
  if (options.max !== undefined) {
    max = Number(options.max);
    if (!Number.isInteger(max) || max < 1) throw new CLIError(`--max is a whole number of at least 1, not ${options.max}`);
  }
  return runLoop(filePath, { once: options.once, max, until }, logger);
}

