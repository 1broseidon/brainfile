/**
 * The runner (task-80, spec-16): one place that queues, claims, starts,
 * stops and lands hand-offs, whatever runs it. The desktop's agents process
 * is a thin adapter over it; `brainfile run` and the MCP tools (task-81,
 * task-82) are others. No daemon: a runner lives as long as the process that
 * made it.
 *
 * - The request is `dispatch:` on the task (dispatchRecord.ts): `queue`
 *   writes it. `start` takes the claim on it by compare-and-swap, so two
 *   runners, in one process or two, never start one task.
 * - A run is a file under `.brainfile/state/runs/` (runFiles.ts), written on
 *   every change and beaten every 10 s, beside the runner's own file. Every
 *   runner on the machine reads them: a task another runner works is busy
 *   here too, and `stop` reaches a run another process started by writing
 *   `stop: true` in its file, which that runner watches, then by SIGTERM.
 * - A hand-off forks from and lands on its target (decision-16), waits on
 *   its dependsOn (decision-15: open, or complete with its branch not
 *   landed), and lands serially by compare-and-swap (decision-12). A
 *   conflict or a failed check goes back to the same agent and model up to
 *   the contract's maxRetries, then it parks in Review.
 *
 * What it writes on the board goes through `RunnerBoard`, so the desktop's
 * writes keep going through its host and commit there; `fileBoard()` writes
 * the files and commits as the CLI does. Asks go to the host's `ask`.
 */
import { readBoardConfig } from '../boardFile';
import { claimHeld, currentHost, readDispatchRecord, claimDispatchFile, releaseDispatchFile, requestDispatchFile, type ClaimInput } from '../dispatchRecord';
import { readTasksDir } from '../taskFile';
import { appendLog, completeTaskFile, moveTaskFileToColumn } from '../taskOperations';
import { findV2Task, getV2Dirs } from '../workspace';
import type { ColumnConfig, DispatchBy, DispatchClaim, DispatchOutcome, DispatchRecord, DispatchRequest, DispatchRunner, DispatchUntil, Task } from '../types';
import { openPullRequestOf } from '../pullRequest';
import { scheduleBoardCommit } from '../repo/boardRepo';
import { locateBoard } from '../repo/locate';
import {
  BEAT_MS,
  isClaimLost,
  isRunEnded,
  isRunLost,
  listRunFiles,
  pruneRunFiles,
  readRunFile,
  removeRunnerFile,
  writeRunFile,
  writeRunnerFile,
  type RunFile,
  type RunFileAsk,
} from '../repo/runFiles';
import { handOffTarget, prepareTarget, refreshTarget } from '../repo/target';
import { landReview, onlyReads, prepareWorktree, releaseReader, runChecks, sendBackNote, unlanded, type Landing, type Refresh, type Worktree } from '../repo/worktree';
import { agentEnv, allAgents, nameOf, whyNot } from './agents';
import { brief } from './brief';
import { policyFor, readSettings } from './settings';
import { close as closeSession, open as openSession, turn as takeTurn, wasStopped, type Session, type SessionContext } from './session';
import { Startups } from './startup';
import type { AgentId, AgentRun, PermissionAsk, Result, RunState } from './types';

/** How many hand-offs run at once on a repository when the board does not say (spec-16-5). */
export const DEFAULT_MAX_RUNNING = 3;
/** How often a runner looks for `stop: true` in its runs' files. */
export const STOP_WATCH_MS = 1_000;
/** How long a stop written in another runner's run file has before that runner is sent SIGTERM. */
export const STOP_GRACE_MS = 15_000;

const LIVE: ReadonlySet<RunState> = new Set(['starting', 'working', 'waiting']);

// ── The board's writes ──────────────────────────────────────────────────────

/** A claim refused: `held` when another runner holds the task, else the write itself failed. */
export type ClaimTaken = { ok: true } | { ok: false; held: boolean; error: string };

/**
 * The writes a runner makes on the board. Each commits like any other board
 * change: the desktop's go through its host, `fileBoard()`'s straight to the
 * files with the CLI's debounced commit.
 */
export interface RunnerBoard {
  /** `dispatch:` on the task (requestDispatchFile), with the agent as its assignee. */
  request(projectId: string, taskId: string, request: DispatchRequest): Promise<Result>;
  /**
   * The runner's claim, by compare-and-swap (claimDispatchFile). A lost
   * claim (isClaimLost) is taken; `takeOwn` also takes one this same runner
   * holds for a run that has ended. `request` is written in the same swap
   * when the task has none.
   */
  claim(projectId: string, taskId: string, claim: ClaimInput, options: { takeOwn?: boolean; request?: DispatchRequest }): Promise<ClaimTaken>;
  /** The claim given back when its run ends, kept with how it ended. */
  release(projectId: string, taskId: string, holder: Pick<DispatchClaim, 'host' | 'pid'>, outcome: DispatchOutcome): Promise<Result>;
  /** A line in the task's log. */
  note(projectId: string, taskId: string, text: string): Promise<Result>;
  /** After a landing: done, unless subtasks are left, which send it back to work. */
  settleLanded(projectId: string, taskId: string): Promise<Result<{ completed: boolean; left: number }>>;
  /** Into the board's review column, for the person: a landing that may not go back again. */
  park(projectId: string, taskId: string): Promise<Result>;
}

/** The board's review column: by id or title, as the brief's finish line finds it. */
export function reviewColumn<C extends Pick<ColumnConfig, 'id' | 'title'>>(columns: C[]): C | undefined {
  return columns.find((c) => /review/i.test(c.id) || /review/i.test(c.title ?? ''));
}

/** Where unfinished work goes back to: in progress by name, else the first open column. */
function workColumn(columns: ColumnConfig[]): ColumnConfig | undefined {
  const review = reviewColumn(columns);
  const open = columns.filter((c) => !c.completionColumn && c !== review);
  return open.find((c) => /progress|doing/i.test(`${c.id} ${c.title}`)) ?? open[0];
}

/** What a write threw, as a Result. */
function attempt<T>(work: () => T): Result<T> {
  try {
    return { ok: true, value: work() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function boardOf(projectId: string): { brainfilePath: string; dotDir: string } {
  const located = locateBoard(projectId, { materialize: false });
  if (!located.found) throw new Error(`No board in ${projectId}`);
  return located;
}

/** The task's file, open or completed. */
function taskFileOf(projectId: string, taskId: string): string {
  const found = findV2Task(getV2Dirs(boardOf(projectId).brainfilePath), taskId, true);
  if (!found) throw new Error(`Task ${taskId} not found`);
  return found.filePath;
}

/**
 * The board's writes made on its files here, each followed by the debounced
 * board commit the CLI's long-running frontends use.
 */
export function fileBoard(): RunnerBoard {
  const committed = <T>(projectId: string, message: string, work: () => T): Promise<Result<T>> => {
    const done = attempt(work);
    if (done.ok) scheduleBoardCommit(boardOf(projectId).brainfilePath, message);
    return Promise.resolve(done);
  };
  const unwrap = <R extends { success: boolean; error?: string }>(r: R): R => {
    if (!r.success) throw new Error(r.error ?? 'The board was not written');
    return r;
  };
  return {
    request: (projectId, taskId, request) =>
      committed(projectId, `dispatch ${taskId}: ${request.agent} (asked by ${request.by})`, () => {
        const written = requestDispatchFile(taskFileOf(projectId, taskId), request, { assignee: true });
        if (!written.ok) throw new Error(written.error);
      }),
    claim(projectId, taskId, claim, options) {
      const { dotDir } = boardOf(projectId);
      const isLost = (held: DispatchClaim) => (!!options.takeOwn && held.host === claim.host && held.pid === claim.pid) || isClaimLost(dotDir, held);
      let taken: ReturnType<typeof claimDispatchFile>;
      try {
        taken = claimDispatchFile(taskFileOf(projectId, taskId), claim, { isLost, ...(options.request ? { request: options.request } : {}) });
      } catch (err) {
        return Promise.resolve({ ok: false, held: false, error: err instanceof Error ? err.message : String(err) });
      }
      if (!taken.ok) return Promise.resolve({ ok: false, held: taken.reason === 'claimed' || taken.reason === 'other-host', error: taken.error });
      scheduleBoardCommit(boardOf(projectId).brainfilePath, `claim ${taskId}: ${claim.runner} on ${claim.host}`);
      return Promise.resolve({ ok: true });
    },
    release: (projectId, taskId, holder, outcome) =>
      committed(projectId, `release ${taskId}: ${outcome}`, () => {
        const released = releaseDispatchFile(taskFileOf(projectId, taskId), holder, { outcome });
        if (!released.ok) throw new Error(released.error);
      }),
    note: (projectId, taskId, text) => committed(projectId, `note ${taskId}`, () => void unwrap(appendLog(taskFileOf(projectId, taskId), text.replace(/\s+/g, ' ').trim()))),
    settleLanded: (projectId, taskId) =>
      committed(projectId, `land ${taskId}`, () => {
        const { brainfilePath } = boardOf(projectId);
        const dirs = getV2Dirs(brainfilePath);
        const found = findV2Task(dirs, taskId, true);
        if (!found) throw new Error(`Could not read ${taskId}`);
        // Its worker completed it before it landed: nothing is left to settle.
        if (found.isLog) return { completed: true, left: 0 };
        const config = readBoardConfig(brainfilePath)?.config;
        const subtasks = found.doc.task.subtasks ?? [];
        const left = subtasks.filter((s) => !s.completed).length;
        if (left > 0) {
          const work = workColumn(config?.columns ?? []);
          if (config && work && work.id !== found.doc.task.column) unwrap(moveTaskFileToColumn(dirs, config, taskId, work.id, { skipAutoComplete: true }));
          unwrap(appendLog(found.filePath, `Merged; ${left} of ${subtasks.length} subtasks left, so it stays open`));
          return { completed: false, left };
        }
        unwrap(completeTaskFile(found.filePath, dirs.logsDir, { types: config?.types }));
        return { completed: true, left: 0 };
      }),
    park: (projectId, taskId) =>
      committed(projectId, `review ${taskId}`, () => {
        const { brainfilePath } = boardOf(projectId);
        const config = readBoardConfig(brainfilePath)?.config;
        const review = reviewColumn(config?.columns ?? []);
        const found = findV2Task(getV2Dirs(brainfilePath), taskId);
        if (config && review && found && found.doc.task.column !== review.id) {
          unwrap(moveTaskFileToColumn(getV2Dirs(brainfilePath), config, taskId, review.id, { skipAutoComplete: true }));
        }
      }),
  };
}

// ── The runner ──────────────────────────────────────────────────────────────

export interface RunnerOptions {
  /** Settings, the model cache and installed agent servers (dataDir()). */
  dataDir: string;
  /** What this runner is, as its claims and run files say. */
  runner: DispatchRunner;
  /** Where its board writes go; `fileBoard()` when not given. */
  board?: RunnerBoard;
  /** An agent asks before it acts: the option the person picked, or null to cancel. The desktop's band, a terminal's prompt. */
  ask(ask: PermissionAsk): Promise<string | null>;
  /** An ask the runner gave up on (its run stopped): the host takes it down. */
  cancelAsk?(askId: string): void;
  /** Every change to a run this runner keeps, a copy, with the state it was in before (null for a new run). */
  onRun?(run: AgentRun, was: RunState | null): void;
  /** The epic whose lead hands this task off (decision-15), for the brief. */
  ledBy?(projectId: string, taskId: string): string | null;
  /** A landing completed the task. */
  landed?(projectId: string, taskId: string): void;
  /** For tests: this machine and process, as the claim and files say. */
  host?: string;
  pid?: number;
  /** How often its runs are beaten (BEAT_MS) and watched for a stop (STOP_WATCH_MS). */
  beatMs?: number;
  watchMs?: number;
  /** How long another runner has to honour a stop before SIGTERM (STOP_GRACE_MS). */
  stopGraceMs?: number;
}

/** How a hand-off is asked for: the request's fields. */
export interface HandOff {
  agent: AgentId;
  model?: string;
  effort?: string;
  until?: DispatchUntil;
  by: DispatchBy;
}

export interface StartOptions {
  /** The agent, model and effort; else the task's dispatch request's. */
  agent?: AgentId;
  model?: string;
  effort?: string;
  /** The chat turn that asked for it (spec-16). */
  from?: string;
  /** Bring an epic's target into its branch first (decision-16). Not for a send-back, which is the same hand-off going on. */
  refresh?: boolean;
  /** The request to write with the claim when the task has none. */
  request?: DispatchRequest;
}

export interface Started {
  run: AgentRun;
  worktree: Worktree | null;
  /** Something the board did not take, said beside the run. */
  note?: string;
}

/** What a landing came to, beyond landed or not. */
export type Landed =
  | { ok: true; message: string; completed: boolean }
  | { ok: false; error: string; kind: Exclude<Landing, { ok: true }>['kind']; sentBack: boolean };

/** What the runner keeps of its own runs beside the run itself. */
interface RunMeta {
  dotDir: string | null;
  worktree?: Worktree | null;
  claimed?: boolean;
  until?: DispatchUntil;
  ask?: RunFileAsk;
}

/** A run file, as a run. */
export function runOf(file: RunFile, projectId: string): AgentRun {
  const extra = file;
  return {
    id: file.id,
    projectId: extra.projectId ?? projectId,
    agentId: file.agent as AgentId,
    kind: file.kind,
    ...(file.taskId ? { taskId: file.taskId } : {}),
    ...(file.model ? { model: file.model } : {}),
    ...(file.effort ? { effort: file.effort } : {}),
    ...(extra.threadId ? { threadId: extra.threadId } : {}),
    ...(extra.from ? { from: extra.from } : {}),
    state: file.state,
    activity: file.activity,
    ...(file.reply !== undefined ? { reply: file.reply } : {}),
    ...(file.error !== undefined ? { error: file.error } : {}),
    startedAt: file.startedAt,
    ...(file.endedAt !== undefined ? { endedAt: file.endedAt } : {}),
    ...(file.steps ? { steps: file.steps } : {}),
  };
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

export class Runner {
  readonly dataDir: string;
  readonly host: string;
  readonly pid: number;
  readonly kind: DispatchRunner;
  readonly board: RunnerBoard;
  /** Open sessions by key, as core's sessions keep them. */
  readonly sessions = new Map<string, Session>();
  /** What core's sessions report to: this runner's runs, and asks through the host. */
  readonly ctx: SessionContext;
  /** Runs whose agent is still starting, so stop reaches them before they have a session. */
  readonly startups = new Startups();

  private readonly options: RunnerOptions;
  private readonly runs = new Map<string, AgentRun>();
  private readonly meta = new Map<string, RunMeta>();
  /** Tasks a hand-off is being started on, held until its run exists (see reserve). */
  private readonly reserved = new Set<string>();
  /** Boards this runner has written a file in, by project. */
  private readonly dirs = new Map<string, string | null>();
  /** Asks waiting on the host, by run, to cancel when the run stops. */
  private readonly asking = new Map<string, Map<string, (optionId: string | null) => void>>();
  /** Projects whose queue `work` keeps taking from as runs end. */
  private readonly working = new Set<string>();
  private nextId = 1;
  private readonly startedAt = Date.now();
  private readonly idBase = this.startedAt.toString(36);
  private ticker: NodeJS.Timeout | null = null;
  private lastBeat = 0;

  /** This runner as a claim names it. */
  private get holder(): Pick<DispatchClaim, 'host' | 'pid'> {
    return { host: this.host, pid: this.pid };
  }

  constructor(options: RunnerOptions) {
    this.options = options;
    this.dataDir = options.dataDir;
    this.kind = options.runner;
    this.host = options.host ?? currentHost();
    this.pid = options.pid ?? process.pid;
    this.board = options.board ?? fileBoard();
    this.ctx = {
      dataDir: this.dataDir,
      sessions: this.sessions,
      update: (run, patch) => this.update(run, patch),
      ask: (ask) => this.ask(ask),
    };
  }

  // ── Runs and their files ──────────────────────────────────────────────────

  /** The board's `.brainfile/` for a project, found once; null when it has none. */
  private dotDirOf(projectId: string): string | null {
    if (this.dirs.has(projectId)) return this.dirs.get(projectId)!;
    let dotDir: string | null = null;
    try {
      const located = locateBoard(projectId, { materialize: false });
      dotDir = located.found ? located.dotDir : null;
    } catch {
      dotDir = null;
    }
    this.dirs.set(projectId, dotDir);
    if (dotDir) {
      try {
        pruneRunFiles(dotDir);
        this.beatRunner(dotDir, Date.now());
      } catch {
        /* state/ cannot be written: the runs go on, unseen by other runners */
      }
    }
    return dotDir;
  }

  private beatRunner(dotDir: string, now: number): void {
    writeRunnerFile(dotDir, { host: this.host, pid: this.pid, runner: this.kind, startedAt: this.startedAt, beatAt: now });
  }

  /** A run's file as it stands; one another runner asked to stop is stopped. */
  private persist(run: AgentRun, now = Date.now()): void {
    const meta = this.meta.get(run.id);
    const dotDir = meta?.dotDir;
    if (!dotDir) return;
    try {
      const was = readRunFile(dotDir, run.id);
      const stop = !!was?.stop;
      const file: RunFile = {
        id: run.id,
        kind: run.kind,
        ...(run.taskId ? { taskId: run.taskId } : {}),
        agent: run.agentId,
        ...(run.model ? { model: run.model } : {}),
        ...(run.effort ? { effort: run.effort } : {}),
        state: run.state,
        activity: run.activity,
        ...(run.reply !== undefined ? { reply: run.reply } : {}),
        ...(run.error !== undefined ? { error: run.error } : {}),
        ...(run.steps ? { steps: run.steps } : {}),
        startedAt: run.startedAt,
        ...(run.endedAt !== undefined ? { endedAt: run.endedAt } : {}),
        host: this.host,
        pid: this.pid,
        runner: this.kind,
        ...(meta.worktree ? { worktree: meta.worktree.path, ...(meta.worktree.branch ? { branch: meta.worktree.branch } : {}) } : {}),
        beatAt: now,
        ...(meta.ask ? { ask: meta.ask } : {}),
        projectId: run.projectId,
        ...(run.threadId ? { threadId: run.threadId } : {}),
        ...(run.from ? { from: run.from } : {}),
        ...(stop ? { stop } : {}),
      };
      writeRunFile(dotDir, file);
      if (stop && LIVE.has(run.state)) queueMicrotask(() => void this.stop(run.id));
    } catch {
      /* state/ cannot be written: the run goes on */
    }
  }

  /** Beats and stop-watching, while the runner has runs: unref'd, so they never keep a process up. */
  private watch(): void {
    if (this.ticker) return;
    this.ticker = setInterval(() => this.tick(), this.options.watchMs ?? STOP_WATCH_MS);
    this.ticker.unref?.();
  }

  private tick(): void {
    const now = Date.now();
    const live = [...this.runs.values()].filter((r) => LIVE.has(r.state));
    for (const run of live) {
      const dotDir = this.meta.get(run.id)?.dotDir;
      const file = dotDir ? readRunFile(dotDir, run.id) : null;
      if (file?.stop) void this.stop(run.id);
    }
    if (now - this.lastBeat < (this.options.beatMs ?? BEAT_MS)) return;
    this.lastBeat = now;
    for (const run of live) this.persist(run, now);
    for (const dotDir of new Set(this.dirs.values())) {
      if (!dotDir) continue;
      try {
        this.beatRunner(dotDir, now);
      } catch {
        /* as persist */
      }
    }
  }

  /** A new run on this runner, written and told. */
  newRun(projectId: string, agentId: AgentId, kind: AgentRun['kind'], taskId?: string, extra: Pick<AgentRun, 'model' | 'effort' | 'from' | 'threadId'> = {}, meta: Omit<RunMeta, 'dotDir'> = {}): AgentRun {
    const run: AgentRun = {
      id: `run-${this.idBase}-${this.nextId++}`,
      projectId,
      agentId,
      kind,
      taskId,
      ...(extra.model ? { model: extra.model } : {}),
      // Effort belongs to a chosen model: the agent's default model takes its own.
      ...(extra.model && extra.effort ? { effort: extra.effort } : {}),
      ...(extra.from ? { from: extra.from } : {}),
      ...(extra.threadId ? { threadId: extra.threadId } : {}),
      state: 'starting',
      activity: 'starting',
      startedAt: Date.now(),
    };
    this.runs.set(run.id, run);
    this.meta.set(run.id, { ...meta, dotDir: this.dotDirOf(projectId) });
    this.persist(run);
    this.watch();
    this.options.onRun?.({ ...run }, null);
    return run;
  }

  /** A run's state changed: written, told, and a hand-off that ended is settled. */
  update(run: AgentRun, patch: Partial<AgentRun>): void {
    const was = run.state;
    Object.assign(run, patch);
    this.persist(run);
    this.options.onRun?.({ ...run }, was);
    if (run.kind === 'dispatch' && LIVE.has(was) && !LIVE.has(run.state)) void this.ended(run);
  }

  /** This runner's runs, as they are. */
  list(): AgentRun[] {
    return [...this.runs.values()];
  }

  get(runId: string): AgentRun | undefined {
    return this.runs.get(runId);
  }

  /** Other runners' runs on this project's board that have not ended and are not lost. */
  private othersLive(projectId: string): AgentRun[] {
    const dotDir = this.dotDirOf(projectId);
    if (!dotDir) return [];
    return listRunFiles(dotDir)
      .filter((f) => !(f.host === this.host && f.pid === this.pid) && !isRunEnded(f) && !isRunLost(f))
      .map((f) => runOf(f, projectId))
      .filter((r) => r.projectId === projectId);
  }

  private liveHere(run: AgentRun): boolean {
    return LIVE.has(run.state) || this.startups.starting(run.id);
  }

  /** Every live hand-off on the project: this runner's and, from their files, every other runner's on this machine. */
  live(projectId: string): AgentRun[] {
    const mine = [...this.runs.values()].filter((r) => r.kind === 'dispatch' && r.projectId === projectId && this.liveHere(r));
    return [...mine, ...this.othersLive(projectId).filter((r) => r.kind === 'dispatch')];
  }

  /** The live hand-off on a task, if any, whichever runner has it. */
  liveDispatch(projectId: string, taskId: string): AgentRun | undefined {
    return this.live(projectId).find((r) => r.taskId === taskId);
  }

  /** Why the task cannot be started, landed or discarded now; null when nothing is at it. */
  busy(projectId: string, taskId: string, verb: 'working' | 'still working' = 'still working'): string | null {
    const live = this.liveDispatch(projectId, taskId);
    if (live) return `${nameOf(this.dataDir, live.agentId)} is ${verb} on ${taskId}`;
    if (this.reserved.has(`${projectId}\n${taskId}`)) return `A hand-off is starting on ${taskId}`;
    return null;
  }

  /** The latest hand-off on a task this runner made. */
  lastRun(projectId: string, taskId: string): AgentRun | undefined {
    return [...this.runs.values()].filter((r) => r.kind === 'dispatch' && r.projectId === projectId && r.taskId === taskId).sort((a, b) => b.startedAt - a.startedAt)[0];
  }

  // ── Asks ──────────────────────────────────────────────────────────────────

  private async ask(ask: PermissionAsk): Promise<string | null> {
    const run = this.runs.get(ask.runId);
    const meta = this.meta.get(ask.runId);
    if (meta) meta.ask = { id: ask.id, title: ask.title, ...(ask.kind ? { kind: ask.kind } : {}), options: ask.options };
    if (run) this.persist(run);
    const pending = this.asking.get(ask.runId) ?? new Map<string, (optionId: string | null) => void>();
    this.asking.set(ask.runId, pending);
    try {
      return await new Promise<string | null>((resolve) => {
        pending.set(ask.id, resolve);
        this.options.ask(ask).then(resolve, () => resolve(null));
      });
    } finally {
      pending.delete(ask.id);
      if (!pending.size) this.asking.delete(ask.runId);
      if (meta) delete meta.ask;
      if (run) this.persist(run);
    }
  }

  // ── Queue, claim and start ────────────────────────────────────────────────

  /**
   * Holds the task for one hand-off: a release, to call once its run exists
   * or it has failed, or why the task cannot be had. Checked and taken in
   * one step, with no await between.
   */
  private reserve(projectId: string, taskId: string): Result<() => void> {
    const busy = this.liveDispatch(projectId, taskId);
    if (busy) return { ok: false, error: `${nameOf(this.dataDir, busy.agentId)} is already working on ${taskId}` };
    const slot = `${projectId}\n${taskId}`;
    if (this.reserved.has(slot)) return { ok: false, error: `A hand-off is already starting on ${taskId}` };
    this.reserved.add(slot);
    return { ok: true, value: () => this.reserved.delete(slot) };
  }

  /** The request each task is handed off with: `dispatch:` on it, the agent its assignee. */
  async queue(projectId: string, taskIds: string[], handOff: HandOff): Promise<Result<string[]>> {
    const request = requestOf(handOff);
    const failed: string[] = [];
    for (const taskId of taskIds) {
      const written = await this.board.request(projectId, taskId, request);
      if (!written.ok) failed.push(`${taskId}: ${written.error}`);
    }
    return failed.length ? { ok: false, error: failed.join('; ') } : { ok: true, value: taskIds };
  }

  /**
   * Asked for and started at once (Hand to…, the desk's dispatch): the
   * request written, then started, the task held across both.
   */
  async dispatch(projectId: string, taskId: string, handOff: HandOff & { from?: string }): Promise<Result<Started>> {
    const behind = await this.refreshFor(projectId, taskId);
    const held = this.reserve(projectId, taskId);
    if (!held.ok) return held;
    try {
      const request = requestOf(handOff);
      const written = await this.board.request(projectId, taskId, request);
      const started = await this.begin(projectId, taskId, { agent: handOff.agent, model: handOff.model, effort: handOff.effort, from: handOff.from, request }, behind);
      if (!started.ok || written.ok) return started;
      return { ok: true, value: { ...started.value, note: `The board record was not written: ${written.error}` } };
    } finally {
      held.value();
    }
  }

  /**
   * Starts the task's hand-off: it waits while a dependsOn is open or not
   * landed (decision-15) or a run is live on it; else the claim is taken,
   * the worktree made on its target (decision-16), the brief written and the
   * agent's turn run. The agent, model and effort are the request's unless
   * given.
   */
  async start(projectId: string, taskId: string, options: StartOptions = {}): Promise<Result<Started>> {
    const behind = options.refresh ? await this.refreshFor(projectId, taskId) : null;
    const held = this.reserve(projectId, taskId);
    if (!held.ok) return held;
    try {
      return await this.begin(projectId, taskId, options, behind);
    } finally {
      held.value();
    }
  }

  /** start's work, the task already held. */
  private async begin(projectId: string, taskId: string, options: StartOptions, behind: Refresh | null): Promise<Result<Started>> {
    let task: Task | undefined;
    try {
      const located = locateBoard(projectId, { materialize: false });
      if (!located.found) return { ok: false, error: `No board in ${projectId}` };
      const dirs = getV2Dirs(located.brainfilePath);
      task = findV2Task(dirs, taskId)?.doc.task;
      if (!task) return { ok: false, error: `Task ${taskId} not found` };
      // Work waits on what it depends on (decision-15): a dependency still open on this board, or complete with its branch not landed yet.
      const waits = (task.dependsOn ?? []).filter((ref) => !ref.includes(':') && (!!findV2Task(dirs, ref) || unlanded(projectId, ref)));
      if (waits.length) return { ok: false, error: `${taskId} waits on ${waits.join(', ')}: hand it off once ${waits.length === 1 ? 'it has' : 'they have'} landed` };
    } catch (err) {
      return { ok: false, error: message(err) };
    }
    const record = readDispatchRecord(task);
    const agentId = (options.agent ?? record?.agent) as AgentId | undefined;
    if (!agentId) return { ok: false, error: `${taskId} has no agent to hand it to: hand it off with one` };
    const model = options.agent ? options.model : (options.model ?? record?.model);
    const effort = options.agent ? options.effort : (options.effort ?? record?.effort);

    // The claim, by compare-and-swap on the task file: of two runners, one starts it.
    const claim: ClaimInput = { host: this.host, runner: this.kind, pid: this.pid };
    const request = record ? undefined : (options.request ?? requestOf({ agent: agentId, model, effort, by: byOf(this.kind) }));
    const claimed = await this.board.claim(projectId, taskId, claim, { takeOwn: true, ...(request ? { request } : {}) });
    if (!claimed.ok && claimed.held) return { ok: false, error: claimed.error };

    let prompt: string;
    let worktree: Worktree | null;
    try {
      const base = prepareTarget(projectId, taskId);
      worktree = prepareWorktree(projectId, taskId, undefined, onlyReads(task.contract), base);
      const first = worktree?.branch ? await this.settleFirst(projectId, taskId, behind) : '';
      prompt = brief(projectId, taskId, worktree, this.options.ledBy?.(projectId, taskId) ?? null, base, first);
    } catch (err) {
      if (claimed.ok) await this.board.release(projectId, taskId, claim, 'failed');
      return { ok: false, error: message(err) };
    }
    const run = this.newRun(projectId, agentId, 'dispatch', taskId, { model, effort, from: options.from }, { worktree, claimed: claimed.ok, until: record?.until ?? options.request?.until });
    void (async () => {
      try {
        const session = await this.startups.open(
          run.id,
          (signal) => openSession(this.ctx, projectId, agentId, run.id, model, { at: worktree?.path, effort, signal }),
          (s) => closeSession(this.ctx, s)
        );
        if (session) await takeTurn(this.ctx, session, run, prompt);
      } catch (err) {
        if (!wasStopped(run)) this.update(run, { state: 'failed', error: message(err), endedAt: Date.now() });
      } finally {
        // A read-only checkout keeps nothing: it goes with its run, unless something was left in it.
        if (worktree && !worktree.branch) releaseReader(projectId, taskId);
      }
    })();
    return { ok: true, value: { run: { ...run }, worktree, ...(claimed.ok ? {} : { note: `The claim was not written: ${claimed.error}` }) } };
  }

  /**
   * Before a hand-off from an epic's own branch, the epic's target is brought
   * into it (decision-16), so the branch does not drift. Null when its target
   * is not an epic's branch.
   */
  private async refreshFor(projectId: string, taskId: string): Promise<Refresh | null> {
    try {
      return await refreshTarget(projectId, taskId);
    } catch {
      return null;
    }
  }

  /**
   * A conflict bringing the epic's target into its branch goes to an agent,
   * as a landing's does (decision-12): the one the task is handed to merges
   * the target into its own branch first. The epic's log says so. What its
   * brief adds.
   */
  private async settleFirst(projectId: string, taskId: string, behind: Refresh | null): Promise<string> {
    if (!behind || behind.ok || behind.kind !== 'conflict') return '';
    const { branch, into, files, collided } = behind;
    const epicId = handOffTarget(projectId, taskId).epic?.id;
    if (epicId) void this.board.note(projectId, epicId, `Bringing ${into} into ${branch} conflicts in ${files.join(', ')}: handed to ${taskId}'s agent to settle on its branch.`);
    const met = collided.map((c) => `${c.sha} ${c.subject}${c.taskId ? ` (${c.taskId})` : ''}`).join('; ');
    return (
      `\n\nBefore you start: ${branch}, which your branch was made from, is behind ${into}, and bringing ${into} in conflicts in ${files.join(', ')}.` +
      (met ? ` On ${into}: ${met}.` : '') +
      ` So, this once, first merge ${into} into your branch (git merge ${into}), keep what both sides meant and commit the merge; then do the task. It lands on ${branch} with your work.`
    );
  }

  // ── Working the queue ─────────────────────────────────────────────────────

  /** The most hand-offs at once on the repository: `dispatch.maxRunning` in the board's config, else the app's setting, else 3. */
  limit(projectId: string): number {
    try {
      const located = locateBoard(projectId, { materialize: false });
      const set = located.found ? readBoardConfig(located.brainfilePath)?.config?.dispatch?.maxRunning : undefined;
      if (typeof set === 'number' && set >= 1) return Math.floor(set);
    } catch {
      /* no config: the default */
    }
    const app = readSettings(this.dataDir).projects?.[projectId]?.concurrency;
    return typeof app === 'number' && app >= 1 ? Math.floor(app) : DEFAULT_MAX_RUNNING;
  }

  /**
   * The tasks asked for and not claimed, oldest request first: a request
   * nobody claimed, or whose claim's runner is lost. One that ended has been
   * answered.
   */
  queued(projectId: string): string[] {
    const dotDir = this.dotDirOf(projectId);
    const located = locateBoard(projectId, { materialize: false });
    if (!located.found || !dotDir) return [];
    return readTasksDir(getV2Dirs(located.brainfilePath).boardDir)
      .map((d) => ({ id: d.task.id, record: readDispatchRecord(d.task) }))
      .filter((t): t is { id: string; record: DispatchRecord } => !!t.record && t.record.role !== 'lead')
      .filter(({ record }) => !record.claim || (claimHeld(record.claim) && isClaimLost(dotDir, record.claim)))
      .sort((a, b) => a.record.at.localeCompare(b.record.at))
      .map((t) => t.id);
  }

  /**
   * Takes queued requests in order while fewer than `limit` run on this
   * repository, whichever runner runs them; one that waits on its
   * dependencies stays queued. From then on, each hand-off that ends here
   * takes the next. What it started.
   */
  async work(projectId: string): Promise<Started[]> {
    this.working.add(projectId);
    const started: Started[] = [];
    const limit = this.limit(projectId);
    for (const taskId of this.queued(projectId)) {
      if (this.live(projectId).length + this.reservedOn(projectId) >= limit) break;
      if (this.busy(projectId, taskId)) continue;
      const begun = await this.start(projectId, taskId, { refresh: true });
      if (begun.ok) started.push(begun.value);
    }
    return started;
  }

  private reservedOn(projectId: string): number {
    return [...this.reserved].filter((slot) => slot.startsWith(`${projectId}\n`)).length;
  }

  /** Stops taking from a project's queue as runs end. */
  idle(projectId: string): void {
    this.working.delete(projectId);
  }

  // ── A hand-off that ended ─────────────────────────────────────────────────

  /**
   * Its claim given back with how it ended; asked for until done in a
   * bypass repository, it is landed first (and sent back when it does not).
   * Then the queue moves on.
   */
  private async ended(run: AgentRun): Promise<void> {
    const meta = this.meta.get(run.id);
    const { projectId, taskId } = run;
    if (!taskId) return;
    const outcome: DispatchOutcome = run.state === 'done' ? 'review' : run.state === 'stopped' ? 'stopped' : 'failed';
    const through = run.state === 'done' && meta?.until === 'done' && !!meta.worktree?.branch && policyFor(this.dataDir, projectId) === 'bypass';
    try {
      if (!through) {
        if (meta?.claimed) await this.board.release(projectId, taskId, this.holder, outcome);
        return;
      }
      const landed = await this.land(projectId, taskId);
      if (landed.ok) {
        if (meta?.claimed) await this.board.release(projectId, taskId, this.holder, 'done');
      } else if (!landed.sentBack) {
        // Not landed and not going back: it stops in Review for the person.
        if (meta?.claimed) await this.board.release(projectId, taskId, this.holder, 'review');
        await this.board.park(projectId, taskId);
        await this.board.note(projectId, taskId, `Not landed: ${landed.error.split('\n')[0]}`);
      }
    } catch {
      /* the board refused: the claim is lost with the runner, and taken again */
    } finally {
      if (this.working.has(projectId)) void this.work(projectId);
    }
  }

  // ── Landing ───────────────────────────────────────────────────────────────

  /**
   * Lands the hand-off (decision-12), with its contract's validation as the
   * check, then settles the task: done, unless subtasks are left. Refused
   * while an agent is at it, or while it is open as a pull request. A
   * conflict, or a check that fails once its target is in, goes back to the
   * agent that did it, up to the contract's maxRetries; then it parks in
   * Review. `into` lands it on another branch than its target.
   */
  async land(projectId: string, taskId: string, options: { into?: string } = {}): Promise<Landed> {
    const busy = this.busy(projectId, taskId);
    if (busy) return { ok: false, kind: 'refused', error: busy, sentBack: false };
    let title: string | undefined;
    let commands: string[] = [];
    try {
      const located = locateBoard(projectId, { materialize: false });
      const task = located.found ? findV2Task(getV2Dirs(located.brainfilePath), taskId, true)?.doc.task : undefined;
      const pr = task ? openPullRequestOf(task) : null;
      if (pr) return { ok: false, kind: 'refused', error: `${taskId} has pull request #${pr.number} open: it lands when that merges on GitHub`, sentBack: false };
      title = task?.title;
      commands = (task?.contract?.validation?.commands ?? []).map((c) => c.trim()).filter(Boolean);
    } catch (err) {
      return { ok: false, kind: 'refused', error: message(err), sentBack: false };
    }
    const landing = await landReview(projectId, taskId, {
      title,
      check: commands.length ? (at) => runChecks(at, commands, agentEnv()) : undefined,
      ...(options.into ? { into: options.into } : {}),
    });
    if (landing.ok) {
      const located = locateBoard(projectId, { materialize: false });
      const open = located.found ? findV2Task(getV2Dirs(located.brainfilePath), taskId) : null;
      if (!open) return { ok: true, message: landing.message, completed: true };
      const settled = await this.board.settleLanded(projectId, taskId);
      if (!settled.ok) return { ok: true, message: `${landing.message}. ${taskId} stays open: ${settled.error}`, completed: false };
      if (settled.value.completed) this.options.landed?.(projectId, taskId);
      const left = settled.value.left;
      return { ok: true, completed: settled.value.completed, message: settled.value.completed ? landing.message : `${landing.message}. ${taskId} stays open: ${left} subtask${left === 1 ? '' : 's'} left` };
    }
    if (landing.kind === 'conflict' || landing.kind === 'check') {
      const back = await this.sendBack(projectId, taskId, landing);
      if (back.sent) return { ok: false, kind: landing.kind, error: back.said, sentBack: true };
      return { ok: false, kind: landing.kind, error: `${landing.error} ${back.said}${landing.kind === 'check' ? `\n${landing.output}` : ''}`, sentBack: false };
    }
    return { ok: false, kind: landing.kind, error: landing.error, sentBack: false };
  }

  /**
   * Sends a landing that failed back to the agent that did the work
   * (task-63): a note in the task's log saying what collided or what failed
   * and how to settle it (sendBackNote, which also says whether it may go
   * back again), then the same agent and model on the same branch. Past the
   * contract's maxRetries it parks in Review.
   */
  private async sendBack(projectId: string, taskId: string, landing: Extract<Landing, { kind: 'conflict' | 'check' }>): Promise<{ sent: boolean; said: string }> {
    const located = locateBoard(projectId, { materialize: false });
    const found = located.found ? findV2Task(getV2Dirs(located.brainfilePath), taskId) : null;
    if (!found) return { sent: false, said: 'Settle it in its worktree, or send it back with a note.' };
    const { task } = found.doc;
    const back = sendBackNote(found.doc, landing);
    if (!back.ok) {
      await this.board.park(projectId, taskId);
      return { sent: false, said: back.said };
    }
    const last = this.lastRun(projectId, taskId);
    const record = readDispatchRecord(task);
    const usable = (id: string | undefined) => (id && allAgents(this.dataDir).some((a) => a.id === id && !whyNot(a)) ? (id as AgentId) : null);
    const agentId = usable(last?.agentId) ?? usable(record?.agent) ?? usable(task.assignee) ?? allAgents(this.dataDir).find((a) => !whyNot(a))?.id ?? null;
    if (!agentId) return { sent: false, said: 'No agent is at hand to settle it.' };
    const same = agentId === last?.agentId ? last : agentId === record?.agent ? { model: record.model, effort: record.effort } : {};
    const { note, round } = back;
    const noted = await this.board.note(projectId, taskId, note);
    if (!noted.ok) return { sent: false, said: `It could not be sent back: ${noted.error}` };
    const started = await this.start(projectId, taskId, { agent: agentId, model: same?.model, effort: same?.effort });
    if (!started.ok) return { sent: false, said: `It could not be sent back: ${started.error}` };
    const what = landing.kind === 'conflict' ? `conflicts with ${landing.into} in ${landing.files.slice(0, 3).join(', ')}` : `failed \`${landing.command}\``;
    return { sent: true, said: `${taskId} ${what}: sent back to ${nameOf(this.dataDir, agentId)} to settle (${round})` };
  }

  // ── Stopping ──────────────────────────────────────────────────────────────

  /**
   * Stops a run. One of this runner's: its asks are cancelled and its
   * session (or its startup) stopped. Another runner's on this machine:
   * `stop: true` in its run file, which that runner watches; if it has not
   * ended within the grace, its process is sent SIGTERM.
   */
  async stop(runId: string, projectId?: string): Promise<Result> {
    const run = this.runs.get(runId);
    if (run) {
      for (const [askId, resolve] of this.asking.get(runId) ?? []) {
        this.options.cancelAsk?.(askId);
        resolve(null);
      }
      const session = [...this.sessions.values()].find((s) => s.run?.id === runId);
      if (LIVE.has(run.state)) this.update(run, { state: 'stopped', endedAt: Date.now() });
      // Still starting: there is no session yet, so the startup is what stops.
      this.startups.stop(runId);
      if (session) {
        await session.connection.cancel({ sessionId: session.sessionId }).catch(() => {});
        if (run.kind === 'dispatch') closeSession(this.ctx, session);
      }
      return { ok: true, value: undefined };
    }
    const dirs = new Set<string>([...(projectId ? [this.dotDirOf(projectId)] : []), ...this.dirs.values()].filter((d): d is string => !!d));
    for (const dotDir of dirs) {
      const file = readRunFile(dotDir, runId);
      if (!file) continue;
      if (isRunEnded(file)) return { ok: true, value: undefined };
      writeRunFile(dotDir, { ...file, stop: true });
      const grace = setTimeout(() => this.enforce(dotDir, runId), this.options.stopGraceMs ?? STOP_GRACE_MS);
      grace.unref?.();
      return { ok: true, value: undefined };
    }
    return { ok: false, error: `No run ${runId} on this machine` };
  }

  /** A stop another runner did not honour in time: its process is sent SIGTERM, if it is on this machine and not this one. */
  private enforce(dotDir: string, runId: string): void {
    const file = readRunFile(dotDir, runId);
    if (!file || isRunEnded(file) || isRunLost(file) || file.host !== this.host || file.pid === process.pid) return;
    try {
      process.kill(file.pid, 'SIGTERM');
    } catch {
      /* gone already */
    }
  }

  /** The runner goes down: its agents are let go, its timers stop and its runner files go. */
  close(): void {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
    for (const session of [...this.sessions.values()]) {
      try {
        session.child.kill();
      } catch {
        /* gone already */
      }
    }
    for (const dotDir of new Set(this.dirs.values())) {
      if (!dotDir) continue;
      try {
        removeRunnerFile(dotDir, this.host, this.pid);
      } catch {
        /* gone already */
      }
    }
  }
}

/** Who asks, by what is running: the desktop's person, the CLI, an MCP client. */
function byOf(runner: DispatchRunner): DispatchBy {
  return runner === 'desktop' ? 'person' : runner;
}

function requestOf(handOff: HandOff): DispatchRequest {
  return {
    agent: handOff.agent,
    ...(handOff.model ? { model: handOff.model } : {}),
    ...(handOff.effort ? { effort: handOff.effort } : {}),
    by: handOff.by,
    at: new Date().toISOString(),
    ...(handOff.until ? { until: handOff.until } : {}),
  };
}
