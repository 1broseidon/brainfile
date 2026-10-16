/**
 * `brainfile discuss <task>` (task-110, decision-19): talking a task over
 * with an agent in a terminal, under the same rules as the desktop's Discuss.
 *
 * - The session is core's, opened through a Runner as `brainfile run` opens
 *   its agents: its `brainfile mcp` runs in role discuss (task-81), and the
 *   context, the rules, the mode and the refusals are
 *   `@brainfile/core/dispatch`'s (discussSession, discussPermission,
 *   discussMode). It never runs in bypass, only reads when the agent offers
 *   a mode for it, and what the rules refuse is refused before anyone is
 *   asked.
 * - Every other ask comes to this prompt through `brainfile run`'s
 *   terminalAsk: Allow once · Always · Deny.
 * - The turn loop is all that is its own: read a line, send it, print the
 *   reply.
 * - Ctrl-C (or the end of input) ends it: the agent is told the person is
 *   done, so it notes what was agreed on the task as the rules say, then the
 *   session is let go. A second Ctrl-C leaves at once.
 */
import * as readline from 'readline';
import chalk from 'chalk';
import { findV2Task, getV2Dirs, readDispatchRecord } from '@brainfile/core';
import {
  Runner,
  close as closeSession,
  dataDir as dispatchDataDir,
  discussContext,
  discussMode,
  discussPermission,
  discussSession,
  discussWork,
  fileBoard,
  allAgents,
  listAgents,
  nameOf,
  open as openSession,
  turn as takeTurn,
  type AgentId,
  type AgentRun,
  type RunnerOptions,
  type Session,
} from '@brainfile/core/dispatch';
import { flushBoardCommits, projectOfBoard } from '@brainfile/core/repo';
import { type Logger, defaultLogger } from '../utils/logger';
import { CLIError } from '../utils/cli-error';
import { resolveCliBrainfilePath } from '../utils/brainfile-path';
import { assertV2Brainfile } from '../utils/v2-only';
import { agentNamed } from './dispatch';
import { terminalAsk } from './run';

export const DISCUSS_COMMAND_HELP = `
Examples:
  brainfile discuss task-12                          Talk task-12 over with the agent it was handed to
  brainfile discuss task-12 --agent claude --model opus --effort high

The agent is given what the board says about the task, and its branch and
worktree if it was handed off. It may read the code and the board, and with
your yes change the task's description, subtasks and contract, record
decisions, and note what was agreed. It writes no code and hands nothing off:
an edit or a command that changes anything is refused before you are asked.
Anything else it asks comes to this prompt.

Type a line and press Enter to send it. Ctrl-C ends the discussion: the agent
notes what was agreed on the task first. A second Ctrl-C leaves at once.
`.trimEnd();

/** What the agent is told when the person ends the discussion: the rules say what it does then. */
export const DISCUSS_DONE = 'The person says the discussion is done.';

export interface DiscussOptions {
  file?: string;
  agent?: string;
  model?: string;
  effort?: string;
}

export interface DiscussLoopOptions {
  agent: AgentId;
  model?: string;
  effort?: string;
  /** Where the person types and the prompt goes; the process's own by default. */
  input?: NodeJS.ReadableStream & { isTTY?: boolean };
  output?: NodeJS.WritableStream;
  /** Ends it when aborted, as Ctrl-C does. */
  signal?: AbortSignal;
  /** Ctrl-C ends it (the command's own; off for a caller that aborts it). Default true. */
  sigint?: boolean;
  /** For tests: the runner's own options. */
  runner?: Partial<RunnerOptions>;
}

export interface DiscussSummary {
  task: string;
  agent: AgentId;
  /** The lines the person sent. */
  said: number;
  /** The agent's replies, in order, the opening one first. */
  replies: string[];
  /** Left at once (a second Ctrl-C), without the agent's last turn. */
  leftAtOnce: boolean;
}

/** Reads the person's lines: one interface per line at a terminal, so an ask's prompt has the input to itself; one for a pipe, which may hold several lines at once. */
function lineReader(input: NodeJS.ReadableStream & { isTTY?: boolean }, output: NodeJS.WritableStream, onSigint: () => void) {
  let cancel: (() => void) | null = null;
  const prompt = '> ';
  if (input.isTTY) {
    return {
      next: () =>
        new Promise<string | null>((resolve) => {
          const rl = readline.createInterface({ input, output });
          let done = false;
          const finish = (line: string | null) => {
            if (done) return;
            done = true;
            cancel = null;
            rl.close();
            resolve(line);
          };
          cancel = () => finish(null);
          rl.on('SIGINT', onSigint);
          rl.on('close', () => finish(null));
          rl.question(prompt, finish);
        }),
      cancel: () => cancel?.(),
      close: () => {},
    };
  }
  const rl = readline.createInterface({ input, terminal: false });
  const waiting: string[] = [];
  let ended = false;
  let wake: (() => void) | null = null;
  rl.on('line', (line) => {
    waiting.push(line);
    wake?.();
  });
  rl.on('close', () => {
    ended = true;
    wake?.();
  });
  return {
    next: async (): Promise<string | null> => {
      output.write(prompt);
      while (!waiting.length && !ended) {
        const woken = await new Promise<boolean>((resolve) => {
          wake = () => resolve(true);
          cancel = () => resolve(false);
        });
        wake = cancel = null;
        if (!woken) return null;
      }
      return waiting.shift() ?? null;
    },
    cancel: () => cancel?.(),
    close: () => rl.close(),
  };
}

/**
 * Talks a task over with an agent here until the person ends it: the first
 * turn is core's discussSession, then each line the person types is a turn
 * and its reply is printed. Lets the session go before it returns, and
 * commits what was written on the board.
 */
export async function discussLoop(filePath: string, taskId: string, options: DiscussLoopOptions, logger: Logger = defaultLogger): Promise<DiscussSummary> {
  assertV2Brainfile(filePath);
  const projectId = projectOfBoard(filePath);
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const { agent, model, effort } = options;
  // Read before the agent starts, so a task that is not there says so at once.
  let context: ReturnType<typeof discussContext>;
  try {
    context = discussContext(filePath, taskId);
  } catch (err) {
    throw new CLIError(err instanceof Error ? err.message : String(err));
  }
  const asker = terminalAsk(logger, (runId) => runner.get(runId), { input, output });
  const runner: Runner = new Runner({ dataDir: dispatchDataDir(), runner: 'cli', board: fileBoard(), ask: asker.ask, cancelAsk: asker.cancel, ...options.runner });
  const name = nameOf(runner.dataDir, agent);
  const key = `discuss:${taskId}:${process.pid}`;
  const summary: DiscussSummary = { task: taskId, agent, said: 0, replies: [], leftAtOnce: false };
  let session: Session | null = null;
  let current: AgentRun | null = null;
  let ending = false;

  const end = (why: string) => {
    if (ending) return;
    ending = true;
    logger.log(chalk.gray(why));
  };
  const interrupt = () => {
    if (ending) {
      // The second: the agent's last turn is cut short and the session goes now.
      summary.leftAtOnce = true;
      if (current) void runner.stop(current.id);
      if (session) closeSession(runner.ctx, session);
      reader.cancel();
      return;
    }
    end(summary.said ? `Ending: ${name} notes what was agreed on ${taskId}. Ctrl-C again to leave at once.` : 'Ending.');
    if (current) void runner.stop(current.id);
    reader.cancel();
  };
  const reader = lineReader(input, output, interrupt);
  const sigint = options.sigint !== false;
  if (sigint) process.on('SIGINT', interrupt);
  options.signal?.addEventListener('abort', interrupt, { once: true });

  const alive = () => !!session && runner.sessions.has(key);

  /** One turn: the session opened on the first, kept at role discuss with core's rule and mode. */
  const send = async (prompt: string): Promise<AgentRun> => {
    const run = runner.newRun(projectId, agent, 'ask', taskId, { model, effort });
    current = run;
    try {
      if (!session) {
        session = await runner.startups.open(
          run.id,
          (signal) =>
            openSession(runner.ctx, projectId, agent, key, model, {
              role: 'discuss',
              rule: (call) => discussPermission(call.title ?? '', call.kind, 'session', call.rawInput),
              keepsMode: discussMode,
              effort,
              signal,
            }),
          (opened) => closeSession(runner.ctx, opened),
        );
        if (!session) return run;
      }
      await takeTurn(runner.ctx, session, run, prompt);
      // The terminal holds the session until it ends, however long the person takes to answer.
      if (session.idle) clearTimeout(session.idle);
      session.idle = null;
    } catch (err) {
      if (run.state !== 'stopped') runner.update(run, { state: 'failed', error: err instanceof Error ? err.message : String(err), endedAt: Date.now() });
    } finally {
      current = null;
    }
    return run;
  };

  const show = (run: AgentRun) => {
    if (run.state === 'done') {
      summary.replies.push(run.reply ?? '');
      logger.log(`\n${chalk.cyan(name)}  ${run.reply || chalk.gray('(no reply)')}\n`);
    } else if (run.state === 'failed') logger.log(chalk.red(`${name} failed${run.error ? `: ${run.error}` : ''}`));
  };

  try {
    logger.log(chalk.gray(`Discussing ${taskId} with ${name}${model ? ` (${model}${effort ? `, ${effort}` : ''})` : ''}. Ctrl-C ends it.`));
    show(await send(discussSession({ ...context, work: discussWork(projectId, taskId, runner) })));
    while (!ending && alive()) {
      const line = await reader.next();
      if (line === null) {
        end(summary.said ? `Ending: ${name} notes what was agreed on ${taskId}.` : 'Ending.');
        break;
      }
      if (!line.trim()) continue;
      summary.said += 1;
      show(await send(line));
    }
    if (!alive() && !ending) logger.log(chalk.yellow(`${name} has stopped: the discussion ends.`));
    // The person is done: the rules have the agent note what was agreed, if it has not yet.
    if (summary.said && !summary.leftAtOnce && alive()) show(await send(DISCUSS_DONE));
  } finally {
    if (sigint) process.off('SIGINT', interrupt);
    options.signal?.removeEventListener('abort', interrupt);
    reader.close();
    if (session) closeSession(runner.ctx, session);
    await runner.letGo();
    flushBoardCommits();
  }
  return summary;
}

/** The agent to discuss with: the one named, else the one it was last handed to, else its assignee, else the first installed here. */
export function discussAgent(filePath: string, taskId: string, named?: string): AgentId {
  const dir = dispatchDataDir();
  if (named) {
    const id = agentNamed(dir, named);
    if (!id) throw new CLIError(`Unknown agent ${named}`, undefined, `Agents: ${allAgents(dir).map((a) => a.id).join(', ')}`);
    return id;
  }
  const task = findV2Task(getV2Dirs(filePath), taskId, true)?.doc.task;
  if (!task) throw new CLIError(`Task ${taskId} not found`);
  const last = readDispatchRecord(task)?.agent;
  const id = (last ? agentNamed(dir, last) : undefined) ?? (task.assignee ? agentNamed(dir, task.assignee) : undefined) ?? listAgents(dir).find((a) => a.available)?.id;
  if (!id) throw new CLIError('No agent is installed on this machine to discuss it with', undefined, 'brainfile agents lists them; name one with --agent');
  return id;
}

/** `brainfile discuss <task> [--agent --model --effort]`. */
export async function discussCommand(taskId: string, options: DiscussOptions, logger: Logger = defaultLogger): Promise<DiscussSummary> {
  const filePath = resolveCliBrainfilePath(options.file);
  assertV2Brainfile(filePath);
  const agent = discussAgent(filePath, taskId, options.agent);
  return discussLoop(filePath, taskId, { agent, model: options.model, effort: options.effort }, logger);
}
