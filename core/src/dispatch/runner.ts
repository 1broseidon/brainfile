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
 *   An ask another process answers (the desktop's band for a terminal's
 *   run, task-84) is `<run-id>.answer.json` beside it, watched the same way.
 * - A hand-off forks from and lands on its target (decision-16), waits on
 *   its dependsOn (decision-15: open, or complete with its branch not
 *   landed), and lands serially by compare-and-swap (decision-12). A
 *   conflict or a failed check goes back to the same agent and model up to
 *   the contract's maxRetries, then it parks in Review.
 *
 * - An epic handed off gets a lead (lead.ts, decision-15, task-83): its
 *   request is `dispatch:` with role lead on the epic, which a runner made
 *   with `leads` takes up from the queue (or `lead` starts at once). The
 *   lead's turns run here; the children it dispatches through its
 *   `brainfile mcp` are queued, and this runner starts them inside the
 *   lead's rules (`workLed`).
 *
 * What it writes on the board goes through `RunnerBoard`, so the desktop's
 * writes keep going through its host and commit there; `fileBoard()` writes
 * the files and commits as the CLI does. Asks go to the host's `ask`.
 */
import * as fs from 'fs';
import * as path from 'path';
import { readBoardConfig } from '../boardFile';
import { claimHeld, currentHost, readDispatchRecord, readLeadRecord, requestDispatchFile, type ClaimInput, type LeadAction } from '../dispatchRecord';
import { readTasksDir } from '../taskFile';
import { appendLog, completeTaskFile, moveTaskFileToColumn } from '../taskOperations';
import { findV2Task, getV2Dirs } from '../workspace';
import type { ColumnConfig, DispatchBy, DispatchClaim, DispatchOutcome, DispatchRecord, DispatchRequest, DispatchRole, DispatchRunner, DispatchUntil, Task } from '../types';
import { openPullRequestOf } from '../pullRequest';
import { scheduleBoardCommit } from '../repo/boardRepo';
import { giveBackClaim, markLead, parkInReview, reviewColumn, takeClaim, type ClaimTaken, type TakeOptions } from '../repo/claims';
import { locateBoard } from '../repo/locate';
import {
  BEAT_MS,
  isClaimLost,
  isRunEnded,
  isRunLost,
  listRunFiles,
  pruneRunFiles,
  readRunAnswer,
  readRunFile,
  removeRunAnswer,
  removeRunnerFile,
  writeRunAnswer,
  writeRunFile,
  writeRunnerFile,
  type RunFile,
  type RunFileAsk,
} from '../repo/runFiles';
import { handOffTarget, offerEpicBranch, prepareEpicBranch, prepareTarget, refreshTarget } from '../repo/target';
import { landReview, onlyReads, prepareWorktree, readyToMerge, releaseReader, runChecks, sendBackNote, unlanded, type Landing, type Refresh, type Worktree } from '../repo/worktree';
import { agentEnv, allAgents, nameOf, whyNot } from './agents';
import { brief } from './brief';
import { leadAbove, Leads, readTree, type Lead, type LeadTurn, type LeadView } from './lead';
import { leadPermission, readOnlyMode } from './readOnly';
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
/** How often a runner with leads looks at its boards for what changed: a pause, a child done or queued. */
export const LEAD_WATCH_MS = 2_000;

const LIVE: ReadonlySet<RunState> = new Set(['starting', 'working', 'waiting']);

// ── The board's writes ──────────────────────────────────────────────────────

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
  claim(projectId: string, taskId: string, claim: ClaimInput, options: TakeOptions): Promise<ClaimTaken>;
  /** The claim given back when its run ends, kept with how it ended; with no outcome, cleared, so the task is queued again (a runner letting go). */
  release(projectId: string, taskId: string, holder: Pick<DispatchClaim, 'host' | 'pid'>, outcome?: DispatchOutcome): Promise<Result>;
  /** A line in the task's log. */
  note(projectId: string, taskId: string, text: string): Promise<Result>;
  /** After a landing: done, unless subtasks are left, which send it back to work. */
  settleLanded(projectId: string, taskId: string): Promise<Result<{ completed: boolean; left: number }>>;
  /** Into the board's review column, for the person: a landing that may not go back again. */
  park(projectId: string, taskId: string): Promise<Result>;
  /** An epic's lead paused, resumed or taken off its record (changeLeadFile). */
  lead(projectId: string, epicId: string, action: LeadAction): Promise<Result>;
  /** An epic completed with its last child (the lead's finish). */
  complete(projectId: string, taskId: string): Promise<Result>;
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
      let taken: ClaimTaken;
      try {
        taken = takeClaim(boardOf(projectId).dotDir, taskFileOf(projectId, taskId), claim, options);
      } catch (err) {
        taken = { ok: false, held: false, error: err instanceof Error ? err.message : String(err) };
      }
      if (taken.ok) scheduleBoardCommit(boardOf(projectId).brainfilePath, `claim ${taskId}: ${claim.runner} on ${claim.host}`);
      return Promise.resolve(taken);
    },
    release: (projectId, taskId, holder, outcome) =>
      committed(projectId, `release ${taskId}: ${outcome ?? 'queued again'}`, () => giveBackClaim(taskFileOf(projectId, taskId), holder, outcome)),
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
    park: (projectId, taskId) => committed(projectId, `review ${taskId}`, () => parkInReview(boardOf(projectId).brainfilePath, taskId)),
    lead: (projectId, epicId, action) => committed(projectId, `lead ${epicId}: ${action === 'end' ? 'ended' : action === 'pause' ? 'paused' : 'resumed'}`, () => markLead(taskFileOf(projectId, epicId), action)),
    complete: (projectId, taskId) =>
      committed(projectId, `complete ${taskId}`, () => {
        const { brainfilePath } = boardOf(projectId);
        const found = findV2Task(getV2Dirs(brainfilePath), taskId);
        if (!found) throw new Error(`Task ${taskId} not found`);
        unwrap(completeTaskFile(found.filePath, getV2Dirs(brainfilePath).logsDir, { types: readBoardConfig(brainfilePath)?.config?.types }));
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
  /** An ask no longer open here, answered from another process or given up on (its run stopped): the host takes it down. */
  cancelAsk?(askId: string, why?: 'answered' | 'stopped'): void;
  /** Every change to a run this runner keeps, a copy, with the state it was in before (null for a new run). */
  onRun?(run: AgentRun, was: RunState | null): void;
  /**
   * The chat turn behind a hand-off started from the queue, when it has no
   * `from` of its own: the desktop names its chat's live turn for a request
   * `by: chat`, so the reply says what it handed off (task-84).
   */
  fromOf?(projectId: string, taskId: string, request: DispatchRecord | null): string | undefined;
  /** The epic whose lead hands this task off (decision-15), for the brief; by default the lead above it on the board. */
  ledBy?(projectId: string, taskId: string): string | null;
  /**
   * Take up leads queued on the board (`dispatch:` with role lead) when it
   * works the queue: a runner that stays up (the desktop, `brainfile run`).
   */
  leads?: boolean;
  /** Every change to a lead this runner runs. */
  onLead?(view: LeadView): void;
  /** A landing completed the task. */
  landed?(projectId: string, taskId: string): void;
  /**
   * How a landing that failed goes back to its agent: started here (the
   * default, for a runner that stays up), or queued for whichever runner
   * works the queue (a CLI command or an MCP call that ends when it answers).
   */
  sendBack?: 'start' | 'queue';
  /** How far a hand-off goes when its request names nothing (`brainfile run --until`). */
  until?: DispatchUntil;
  /** At most this many of this runner's own hand-offs at once, within the repository's limit (`brainfile run --max`). */
  maxRunning?: number;
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
  /** `lead` for an epic, which a lead runs (decision-15). */
  role?: DispatchRole;
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
  /** The epics' leads this runner runs (decision-15). */
  readonly leads: Leads;

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
  /** The last pass of `work` on each project, which the next waits for. */
  private readonly passes = new Map<string, Promise<Started[]>>();
  private nextId = 1;
  private readonly startedAt = Date.now();
  private readonly idBase = this.startedAt.toString(36);
  private ticker: NodeJS.Timeout | null = null;
  private lastBeat = 0;
  private lastLook = 0;
  /** What each board's folders looked like when its leads last looked. */
  private readonly stamps = new Map<string, string>();
  /** Hand-offs ending: their claims given back, a landing, the next taken. */
  private readonly ending = new Set<Promise<void>>();
  /** Runs stopped because the runner is letting go: their tasks go back to the queue. */
  private readonly lettingGo = new Set<string>();
  /** Passes over the queue under way, by project. */
  private readonly inPass = new Map<string, number>();
  /** The runner is letting go (letGo): it starts nothing more. */
  private goingDown = false;

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
    this.leads = new Leads({
      tree: (projectId, epicId) => readTree(projectId, epicId, this.holder),
      live: (projectId) => this.live(projectId),
      lastRun: (projectId, taskId) => this.lastRun(projectId, taskId),
      policy: (projectId) => policyFor(this.dataDir, projectId),
      limit: (projectId) => this.limit(projectId),
      turn: (lead, prompt) => this.leadTurn(lead, prompt),
      close: (lead) => this.closeLead(lead),
      claim: async (projectId, epicId, request) => {
        const taken = await this.board.claim(projectId, epicId, { host: this.host, runner: this.kind, pid: this.pid }, { takeOwn: true, ...(request ? { request } : {}) });
        return taken.ok ? { ok: true, value: undefined } : { ok: false, error: taken.held ? `${epicId} has a lead already: ${taken.error}` : taken.error };
      },
      mark: (projectId, epicId, action) => this.board.lead(projectId, epicId, action),
      complete: (projectId, epicId) => this.board.complete(projectId, epicId),
      mergeable(projectId, taskId) {
        try {
          return readyToMerge(projectId).some((r) => r.taskId === taskId && !r.conflicts);
        } catch {
          return false;
        }
      },
      land: async (projectId, taskId) => {
        const landed = await this.land(projectId, taskId);
        return { ok: landed.ok, said: landed.ok ? `${taskId} was landed: ${landed.message}` : `${taskId} could not land: ${landed.error}` };
      },
      branch: (projectId, epicId) => attempt(() => prepareEpicBranch(projectId, epicId)),
      offer: async (projectId, epicId) => attempt(() => offerEpicBranch(projectId, epicId)),
      emit: (view) => {
        this.options.onLead?.(view);
        if (view.state === 'leading' || view.state === 'paused') this.watch();
      },
      later: (ms, fn) => setTimeout(fn, ms),
    });
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
      const meta = this.meta.get(run.id);
      const dotDir = meta?.dotDir;
      const file = dotDir ? readRunFile(dotDir, run.id) : null;
      if (file?.stop) void this.stop(run.id);
      else if (dotDir && meta?.ask) this.takeAnswer(dotDir, run.id);
    }
    if (now - this.lastLook >= LEAD_WATCH_MS) {
      this.lastLook = now;
      this.lookForLeads();
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
    if (run.kind === 'dispatch' && LIVE.has(was) && !LIVE.has(run.state)) {
      const ending: Promise<void> = this.ended(run)
        .catch(() => {})
        .finally(() => this.ending.delete(ending));
      this.ending.add(ending);
    }
  }

  /** This runner's runs, as they are. */
  list(): AgentRun[] {
    return [...this.runs.values()];
  }

  get(runId: string): AgentRun | undefined {
    return this.runs.get(runId);
  }

  /**
   * Other runners' run files on this project's board, oldest first: ended
   * and lost ones too, as the desktop shows them (task-84). `isRunEnded` and
   * `isRunLost` tell them apart.
   */
  others(projectId: string): RunFile[] {
    const dotDir = this.dotDirOf(projectId);
    if (!dotDir) return [];
    return listRunFiles(dotDir).filter((f) => !(f.host === this.host && f.pid === this.pid) && (f.projectId ?? projectId) === projectId);
  }

  /** Other runners' runs on this project's board that have not ended and are not lost. */
  private othersLive(projectId: string): AgentRun[] {
    return this.others(projectId)
      .filter((f) => !isRunEnded(f) && !isRunLost(f))
      .map((f) => runOf(f, projectId));
  }

  private liveHere(run: AgentRun): boolean {
    return LIVE.has(run.state) || this.startups.starting(run.id);
  }

  /** Every live hand-off on the project: this runner's and, from their files, every other runner's on this machine. */
  live(projectId: string): AgentRun[] {
    const mine = [...this.runs.values()].filter((r) => r.kind === 'dispatch' && r.projectId === projectId && this.liveHere(r));
    return [...mine, ...this.othersLive(projectId).filter((r) => r.kind === 'dispatch')];
  }

  /** This runner's own live hand-offs on the project. */
  private ownLive(projectId: string): number {
    return [...this.runs.values()].filter((r) => r.kind === 'dispatch' && r.projectId === projectId && this.liveHere(r)).length;
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

  /**
   * Answers an ask a run is waiting on: one of this runner's at once (its
   * host's prompt is taken down), another runner's on this machine through
   * `<run-id>.answer.json`, which that runner applies within a second.
   */
  answerAsk(runId: string, askId: string, optionId: string | null, projectId?: string): Result {
    if (this.runs.has(runId)) {
      return this.settleAsk(runId, askId, optionId) ? { ok: true, value: undefined } : { ok: false, error: `${runId} is not asking that now` };
    }
    for (const dotDir of this.dirsFor(projectId)) {
      const file = readRunFile(dotDir, runId);
      if (!file) continue;
      if (isRunEnded(file) || isRunLost(file)) return { ok: false, error: `${runId} has ended` };
      if (file.ask?.id !== askId) return { ok: false, error: `${runId} is not asking that now` };
      try {
        writeRunAnswer(dotDir, runId, { askId, optionId });
      } catch (err) {
        return { ok: false, error: message(err) };
      }
      return { ok: true, value: undefined };
    }
    return { ok: false, error: `No run ${runId} on this machine` };
  }

  /** An answer another process left for one of this runner's asks: applied, and its file removed. */
  private takeAnswer(dotDir: string, runId: string): void {
    const answer = readRunAnswer(dotDir, runId);
    if (!answer) return;
    try {
      removeRunAnswer(dotDir, runId);
    } catch {
      return;
    }
    this.settleAsk(runId, answer.askId, answer.optionId);
  }

  /** The ask answered with `optionId`, and taken down where it was asked (the terminal's prompt, the band). */
  private settleAsk(runId: string, askId: string, optionId: string | null): boolean {
    const resolve = this.asking.get(runId)?.get(askId);
    if (!resolve) return false;
    resolve(optionId);
    this.options.cancelAsk?.(askId, 'answered');
    return true;
  }

  /** The boards to look for a run on: the project's, then every one this runner has used. */
  private dirsFor(projectId?: string): Set<string> {
    return new Set<string>([...(projectId ? [this.dotDirOf(projectId)] : []), ...this.dirs.values()].filter((d): d is string => !!d));
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
    // A lead goes as far as the repository lets the app land (decision-15).
    const request = requestOf(handOff.role === 'lead' ? { ...handOff, until: policyFor(this.dataDir, projectId) === 'bypass' ? 'done' : 'review' } : handOff);
    const failed: string[] = [];
    for (const taskId of taskIds) {
      const written = await this.board.request(projectId, taskId, request);
      if (!written.ok) failed.push(`${taskId}: ${written.error}`);
    }
    return failed.length ? { ok: false, error: failed.join('; ') } : { ok: true, value: taskIds };
  }

  /**
   * Asked for and started at once (Hand to…): the
   * request written, then started, the task held across both.
   */
  async dispatch(projectId: string, taskId: string, handOff: HandOff & { from?: string }): Promise<Result<Started>> {
    if (this.goingDown) return { ok: false, error: 'This runner is letting go: it starts nothing more' };
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
    if (this.goingDown) return { ok: false, error: 'This runner is letting go: it starts nothing more' };
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
    // Each hand-off started is one more try on the task's record, which its lead counts (task-83).
    const claimed = await this.board.claim(projectId, taskId, claim, { takeOwn: true, count: true, ...(request ? { request } : {}) });
    if (!claimed.ok && claimed.held) return { ok: false, error: claimed.error };

    let prompt: string;
    let worktree: Worktree | null;
    try {
      const base = prepareTarget(projectId, taskId);
      worktree = prepareWorktree(projectId, taskId, undefined, onlyReads(task.contract), base);
      const first = worktree?.branch ? await this.settleFirst(projectId, taskId, behind) : '';
      prompt = brief(projectId, taskId, worktree, this.ledBy(projectId, taskId), base, first);
    } catch (err) {
      if (claimed.ok) await this.board.release(projectId, taskId, claim, 'failed');
      return { ok: false, error: message(err) };
    }
    const from = options.from ?? this.options.fromOf?.(projectId, taskId, record);
    const run = this.newRun(projectId, agentId, 'dispatch', taskId, { model, effort, from }, { worktree, claimed: claimed.ok, until: record?.until ?? options.request?.until ?? this.options.until });
    void (async () => {
      try {
        const session = await this.startups.open(
          run.id,
          // A worker's board lists no dispatch, stop or land (decision-15): a hand-off never hands off.
          (signal) => openSession(this.ctx, projectId, agentId, run.id, model, { at: worktree?.path, effort, signal, role: 'worker' }),
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
   * answered, and so has one the desktop wrote before runners claimed
   * (`answeredBefore`).
   */
  queued(projectId: string): string[] {
    const dotDir = this.dotDirOf(projectId);
    const located = locateBoard(projectId, { materialize: false });
    if (!located.found || !dotDir) return [];
    const columns = readBoardConfig(located.brainfilePath)?.config?.columns ?? [];
    return readTasksDir(getV2Dirs(located.brainfilePath).boardDir)
      .map((d) => ({ id: d.task.id, column: d.task.column, record: readDispatchRecord(d.task) }))
      .filter((t): t is { id: string; column: string | undefined; record: DispatchRecord } => !!t.record && t.record.role !== 'lead')
      .filter(({ column, record }) => !answeredBefore(record, column, columns))
      .filter(({ record }) => !record.claim || (claimHeld(record.claim) && isClaimLost(dotDir, record.claim)))
      .sort((a, b) => a.record.at.localeCompare(b.record.at))
      .map((t) => t.id);
  }

  /**
   * Takes queued requests in order while fewer than `limit` run on this
   * repository, whichever runner runs them; one that waits on its
   * dependencies stays queued. From then on, each hand-off that ends here
   * takes the next. What it started. Passes on a project run one after
   * another, so two runs ending at once never start past the limit.
   */
  work(projectId: string): Promise<Started[]> {
    if (this.goingDown) return Promise.resolve([]);
    this.working.add(projectId);
    // A runner that works a queue is up for it: its runner file is written and beaten while it lives, runs or none.
    this.dotDirOf(projectId);
    this.watch();
    return this.chain(projectId, false);
  }

  /** A pass after the one before it on the project, counted from when it is asked for until it is done. */
  private chain(projectId: string, onlyLed: boolean): Promise<Started[]> {
    this.inPass.set(projectId, (this.inPass.get(projectId) ?? 0) + 1);
    const next = (this.passes.get(projectId) ?? Promise.resolve([]))
      .catch(() => [])
      .then(() => this.pass(projectId, onlyLed))
      .finally(() => {
        const left = (this.inPass.get(projectId) ?? 1) - 1;
        if (left) this.inPass.set(projectId, left);
        else this.inPass.delete(projectId);
      });
    this.passes.set(projectId, next);
    return next;
  }

  private async pass(projectId: string, onlyLed = false): Promise<Started[]> {
    const started: Started[] = [];
    if (this.options.leads && !onlyLed) await this.takeLeads(projectId);
    const limit = this.limit(projectId);
    const max = this.options.maxRunning;
    for (const taskId of this.queued(projectId)) {
      if (this.goingDown) break;
      if (this.live(projectId).length + this.reservedOn(projectId) >= limit) break;
      if (max && this.ownLive(projectId) + this.reservedOn(projectId) >= max) break;
      if (this.busy(projectId, taskId)) continue;
      const lead = this.leads.leadOver(projectId, taskId);
      if (onlyLed && !lead) continue;
      if (!(await this.mayStart(projectId, taskId, lead))) continue;
      const begun = await this.start(projectId, taskId, { refresh: true });
      if (begun.ok) started.push(begun.value);
    }
    return started;
  }

  /**
   * A queued task in a led tree (decision-15): one its lead asked for goes
   * only inside the lead's rules, from the runner that leads it; one whose
   * tries are spent waits in Review for the person, and its lead hears so.
   * The person's own request is theirs to make.
   */
  private async mayStart(projectId: string, taskId: string, lead: Lead | undefined): Promise<boolean> {
    let record: DispatchRecord | null = null;
    try {
      const located = locateBoard(projectId, { materialize: false });
      const task = located.found ? findV2Task(getV2Dirs(located.brainfilePath), taskId)?.doc.task : undefined;
      record = task ? readDispatchRecord(task) : null;
    } catch {
      return false;
    }
    if (record?.by !== 'lead') return true;
    if (!lead) {
      // Its lead runs elsewhere, or waits for a runner to take it up: that runner starts it.
      return !leadAbove(projectId, taskId);
    }
    const may = this.leads.mayDispatch(projectId, lead.epicId, taskId);
    if (may.ok) return true;
    if (may.then === 'review' || may.then === 'never') await this.answer(projectId, taskId, may.error, may.then === 'review');
    return false;
  }

  /** A request that will not be started: answered, so it leaves the queue; into Review for the person when `review`; its lead hears why. */
  private async answer(projectId: string, taskId: string, why: string, review: boolean): Promise<void> {
    const claim: ClaimInput = { host: this.host, runner: this.kind, pid: this.pid };
    const taken = await this.board.claim(projectId, taskId, claim, { takeOwn: true });
    if (taken.ok) await this.board.release(projectId, taskId, claim, review ? 'review' : 'failed');
    if (review) await this.board.park(projectId, taskId);
    await this.board.note(projectId, taskId, `Not handed off: ${why}`);
    this.leads.wake(projectId, taskId, `${taskId} was not handed off: ${why}`);
  }

  private reservedOn(projectId: string): number {
    return [...this.reserved].filter((slot) => slot.startsWith(`${projectId}\n`)).length;
  }

  /**
   * Starts what the leads this runner runs have queued in their trees, inside
   * their rules: for a runner that does not work the whole queue. Passes run
   * one after another, as work's do.
   */
  workLed(projectId: string): Promise<Started[]> {
    if (!this.leads.running(projectId).length || this.goingDown) return Promise.resolve([]);
    return this.chain(projectId, true);
  }

  /**
   * Nothing of this runner's is under way on the project: no hand-off of its
   * own live or starting, none ending (its claim given back, a landing), no
   * pass taking from the queue, and no lead of its own in a turn or with one
   * coming. A lead that waits on what it handed off, or on the person, is
   * settled. `brainfile run --once` returns when this holds and a pass
   * starts nothing.
   */
  settled(projectId: string): boolean {
    if (this.ownLive(projectId) || this.reservedOn(projectId) || this.ending.size || this.inPass.has(projectId)) return false;
    if ([...this.runs.values()].some((r) => r.projectId === projectId && r.kind === 'lead' && this.liveHere(r))) return false;
    return !this.leads
      .running(projectId)
      .some((l) => l.state === 'leading' && (l.busy || l.queue.length > 0 || l.timer !== null || l.landing.size > 0 || l.marking > 0));
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
    if (this.lettingGo.has(run.id)) {
      // Stopped as the runner lets go: the task goes back to the queue for the next runner, and its lead hears nothing.
      if (meta?.claimed) await this.board.release(projectId, taskId, this.holder).catch(() => {});
      return;
    }
    // A child of a lead this runner runs is landed by its lead, which hears how it went.
    const led = this.leads.leadOver(projectId, taskId);
    const through = !led && run.state === 'done' && meta?.until === 'done' && !!meta.worktree?.branch && policyFor(this.dataDir, projectId) === 'bypass';
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
      if (led && !this.goingDown) await this.leads.childEnded(run).catch(() => {});
      if (this.goingDown) {
        /* it starts nothing more */
      } else if (this.working.has(projectId)) void this.work(projectId);
      else void this.workLed(projectId);
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
    const what = landing.kind === 'conflict' ? `conflicts with ${landing.into} in ${landing.files.slice(0, 3).join(', ')}` : `failed \`${landing.command}\``;
    if (this.options.sendBack === 'queue') {
      const handOff: HandOff = { agent: agentId, model: same?.model, effort: same?.effort, until: record?.until, by: byOf(this.kind) };
      const queued = await this.queue(projectId, [taskId], handOff);
      if (!queued.ok) return { sent: false, said: `It could not be sent back: ${queued.error}` };
      return { sent: true, said: `${taskId} ${what}: sent back to ${nameOf(this.dataDir, agentId)} to settle (${round}); it waits in the queue for a runner` };
    }
    const started = await this.start(projectId, taskId, { agent: agentId, model: same?.model, effort: same?.effort });
    if (!started.ok) return { sent: false, said: `It could not be sent back: ${started.error}` };
    return { sent: true, said: `${taskId} ${what}: sent back to ${nameOf(this.dataDir, agentId)} to settle (${round})` };
  }

  // ── Leads (decision-15) ───────────────────────────────────────────────────

  /** The epic whose lead hands this task off: a lead this runner runs, else the lead above it on the board. */
  ledBy(projectId: string, taskId: string): string | null {
    if (this.options.ledBy) return this.options.ledBy(projectId, taskId);
    const here = this.leads.leadOver(projectId, taskId);
    if (here) return here.epicId === taskId ? null : here.epicId;
    try {
      return leadAbove(projectId, taskId)?.epicId ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Whether `by` may hand off `taskId` here (decision-15): in a led tree, a
   * lead here or another runner's on the board, the chat is refused and only
   * the lead hands off; the person's own is theirs to make.
   */
  guard(projectId: string, taskId: string, by: DispatchBy): Result {
    const here = this.leads.guard(projectId, taskId, by);
    if (!here.ok || this.leads.leadOver(projectId, taskId) || by !== 'chat') return here;
    let above: ReturnType<typeof leadAbove> = null;
    try {
      above = leadAbove(projectId, taskId, { self: true });
    } catch {
      above = null;
    }
    if (!above) return { ok: true, value: undefined };
    return { ok: false, error: `${above.epicId}'s lead runs ${above.epicId === taskId ? 'it' : 'that tree'}: only the lead hands off its children. Pause or stop it first.` };
  }

  /**
   * The epics whose lead waits for a runner, oldest request first: a lead
   * record nobody holds, or whose runner is lost (the `lead:` the desktop
   * wrote before is one too).
   */
  queuedLeads(projectId: string): string[] {
    const dotDir = this.dotDirOf(projectId);
    const located = locateBoard(projectId, { materialize: false });
    if (!located.found || !dotDir) return [];
    return readTasksDir(getV2Dirs(located.brainfilePath).boardDir)
      .map((d) => ({ id: d.task.id, record: readLeadRecord(d.task as Task & { lead?: unknown }) }))
      .filter((t): t is { id: string; record: DispatchRecord } => !!t.record)
      .filter(({ record }) => !claimHeld(record.claim) || isClaimLost(dotDir, record.claim))
      .sort((a, b) => a.record.at.localeCompare(b.record.at))
      .map((t) => t.id);
  }

  /** Takes up the leads waiting on the board, each from its record. */
  private async takeLeads(projectId: string): Promise<void> {
    for (const epicId of this.queuedLeads(projectId)) {
      if (this.leads.get(projectId, epicId)?.state === 'leading' || this.leads.get(projectId, epicId)?.state === 'paused') continue;
      await this.lead(projectId, epicId);
    }
  }

  /**
   * Starts a lead on an epic here (decision-15): with `handOff`, a new
   * request (Hand to…, the chat); without, the one on the board, taken up
   * where it was left (resumed when a runner led it before, paused when it
   * was paused). Refused while another runner holds the tree's lead.
   */
  async lead(projectId: string, epicId: string, handOff?: Omit<HandOff, 'role' | 'until'>): Promise<Result<{ lead: LeadView; run: AgentRun | null }>> {
    if (handOff) {
      return this.leads.start(projectId, epicId, handOff.agent, { model: handOff.model, effort: handOff.effort, by: handOff.by });
    }
    let record: DispatchRecord | null = null;
    let legacy = false;
    try {
      const located = locateBoard(projectId, { materialize: false });
      const epic = located.found ? findV2Task(getV2Dirs(located.brainfilePath), epicId)?.doc.task : undefined;
      if (!epic) return { ok: false, error: `${epicId} is not on this board` };
      record = readLeadRecord(epic as Task & { lead?: unknown });
      legacy = !!record && readDispatchRecord(epic)?.role !== 'lead';
    } catch (err) {
      return { ok: false, error: message(err) };
    }
    if (!record) return { ok: false, error: `${epicId} has no lead to take up: hand it off with an agent` };
    return this.leads.start(projectId, epicId, record.agent as AgentId, {
      model: record.model,
      effort: record.effort,
      by: record.by,
      at: record.at,
      // A runner led it before (its claim is there, lost or ended), or the desktop did (`lead:`): it carries on from its notes.
      resumed: legacy || !!record.claim,
      paused: !!record.paused,
      fromBoard: !legacy,
    });
  }

  /** Pauses an epic's lead: here, or on the board for the runner that leads it. */
  async pauseLead(projectId: string, epicId: string): Promise<Result> {
    if (this.leads.get(projectId, epicId)?.state === 'leading') return this.leads.pause(projectId, epicId);
    return this.board.lead(projectId, epicId, 'pause');
  }

  /**
   * Resumes an epic's lead: one paused here carries on; one another runner
   * leads hears it from the board; one no runner leads is taken up here when
   * `here` (the desktop's Resume), else left on the board for a runner.
   * What happened, in a line.
   */
  async resumeLead(projectId: string, epicId: string, options: { here?: boolean } = {}): Promise<Result<string>> {
    const mine = this.leads.get(projectId, epicId);
    if (mine?.state === 'paused' || mine?.state === 'leading') {
      const resumed = await this.leads.resume(projectId, epicId);
      return resumed.ok ? { ok: true, value: `${epicId}'s lead carries on` } : resumed;
    }
    const marked = await this.board.lead(projectId, epicId, 'resume');
    if (!marked.ok) return marked;
    const held = this.leadHeldElsewhere(projectId, epicId);
    if (held) return { ok: true, value: `${epicId}'s lead carries on, in ${held}` };
    if (!options.here) return { ok: true, value: `${epicId}'s lead waits for a runner to take it up` };
    const started = await this.lead(projectId, epicId);
    return started.ok ? { ok: true, value: `${epicId}'s lead carries on here` } : started;
  }

  /** Stops an epic's lead: here, or taken off the board, which the runner leading it follows. What it handed off goes on. */
  async stopLead(projectId: string, epicId: string): Promise<Result> {
    return this.leads.stop(projectId, epicId);
  }

  /** Where another runner leads the epic, when one is up; null when none. */
  private leadHeldElsewhere(projectId: string, epicId: string): string | null {
    const dotDir = this.dotDirOf(projectId);
    const located = locateBoard(projectId, { materialize: false });
    const epic = located.found ? findV2Task(getV2Dirs(located.brainfilePath), epicId)?.doc.task : undefined;
    const claim = epic ? readLeadRecord(epic as Task & { lead?: unknown })?.claim : undefined;
    if (!claimHeld(claim) || (dotDir && isClaimLost(dotDir, claim)) || (claim.host === this.host && claim.pid === this.pid)) return null;
    return `${claim.runner} on ${claim.host} (pid ${claim.pid})`;
  }

  /**
   * The board changed: the leads here read it back (a pause, a child done,
   * the last one landed) and what they queued is started. The desktop calls
   * this on every change; any runner with leads also looks every
   * LEAD_WATCH_MS while it has them.
   */
  boardChanged(projectId: string): void {
    this.leads.boardChanged(projectId);
    void this.workLed(projectId);
  }

  /** Each board with a lead here, looked at when its folders changed. */
  private lookForLeads(): void {
    for (const projectId of new Set(this.leads.running().map((l) => l.projectId))) {
      const stamp = this.stampOf(projectId);
      if (stamp === this.stamps.get(projectId)) continue;
      this.stamps.set(projectId, stamp);
      this.boardChanged(projectId);
    }
  }

  /** The board's task files and their times: what changes when anything on it does. */
  private stampOf(projectId: string): string {
    try {
      const located = locateBoard(projectId, { materialize: false });
      if (!located.found) return '';
      const dirs = getV2Dirs(located.brainfilePath);
      return [dirs.boardDir, dirs.logsDir]
        .flatMap((dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).map((name) => `${name}:${fs.statSync(path.join(dir, name)).mtimeMs}`) : []))
        .join('|');
    } catch {
      return '';
    }
  }

  /**
   * One turn of a lead, in its session or a new one: no worktree, the board's
   * tools only for its tree (role lead, its epic as scope, task-81), read-only
   * (leadPermission), in a mode that only reads. Once the turn ends, what it
   * queued is started.
   */
  private leadTurn(lead: Lead, prompt: (fresh: boolean) => string): LeadTurn {
    const run = this.newRun(lead.projectId, lead.agentId, 'lead', lead.epicId, { model: lead.model, effort: lead.effort });
    const key = leadKey(lead);
    const done = (async () => {
      try {
        const existing = this.sessions.get(key);
        const session =
          existing ??
          (await this.startups.open(
            run.id,
            (signal) =>
              openSession(this.ctx, lead.projectId, lead.agentId, key, lead.model, {
                effort: lead.effort,
                signal,
                role: 'lead',
                leadScope: lead.epicId,
                rule: (call) => leadPermission(call.title ?? '', call.kind, call.rawInput),
                keepsMode: readOnlyMode,
              }),
            (s) => closeSession(this.ctx, s)
          ));
        if (session) await takeTurn(this.ctx, session, run, prompt(!existing));
      } catch (err) {
        if (!wasStopped(run)) this.update(run, { state: 'failed', error: message(err), endedAt: Date.now() });
      } finally {
        void this.workLed(lead.projectId);
      }
      return { ok: run.state === 'done', stopped: run.state === 'stopped', reply: run.reply, error: run.error };
    })();
    return { run: { ...run }, done };
  }

  /** A lead's turn under way is stopped and its session let go. */
  private closeLead(lead: Lead): void {
    const live = [...this.runs.values()].find((r) => r.kind === 'lead' && r.projectId === lead.projectId && r.taskId === lead.epicId && LIVE.has(r.state));
    if (live) void this.stop(live.id);
    const session = this.sessions.get(leadKey(lead));
    if (session) closeSession(this.ctx, session);
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
        this.options.cancelAsk?.(askId, 'stopped');
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
    for (const dotDir of this.dirsFor(projectId)) {
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

  /**
   * The runner lets go of what it holds before it goes down (`brainfile run`
   * on Ctrl-C, or done with `--once`), so another runner takes it up at once
   * rather than once this process is gone: it starts nothing more; what is
   * ending (a landing) finishes; its hand-offs are stopped and their claims
   * cleared, so their tasks wait in the queue again; its leads end here,
   * their claims given back as stopped, so a runner takes each up from its
   * record and notes. Then it closes. Worktrees stay as they are.
   */
  async letGo(): Promise<void> {
    this.goingDown = true;
    this.working.clear();
    await Promise.allSettled([...this.passes.values()]);
    const live = [...this.runs.values()].filter((r) => r.kind === 'dispatch' && this.liveHere(r));
    for (const run of live) this.lettingGo.add(run.id);
    await Promise.allSettled(live.map((run) => this.stop(run.id)));
    while (this.ending.size) await Promise.allSettled([...this.ending]);
    const leads = this.leads.running();
    this.leads.closeAll();
    for (const lead of leads) await this.board.release(lead.projectId, lead.epicId, this.holder, 'stopped').catch(() => {});
    this.close();
  }

  /** The runner goes down: its leads and agents are let go, its timers stop and its runner files go. Its leads' records stay, for another runner to take up. */
  close(): void {
    this.leads.closeAll();
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

const leadKey = (lead: Lead) => `lead:${lead.projectId}\n${lead.epicId}`;

/**
 * A request the desktop wrote before runners claimed (task-74's record:
 * Hand to…, its chat or its lead started the agent at once): no claim and no
 * `tries`, which every start under a runner counts, on a task already in
 * Review or done. Its hand-off has run; working the queue must not run it
 * again (task-84). One a send-back queued carries its `tries`.
 */
export function answeredBefore(record: DispatchRecord, column: string | undefined, columns: ColumnConfig[]): boolean {
  if (record.claim || record.tries !== undefined || !['person', 'chat', 'lead'].includes(record.by)) return false;
  const at = columns.find((c) => c.id === column);
  return !!at && (at === reviewColumn(columns) || !!at.completionColumn);
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
    ...(handOff.role ? { role: handOff.role } : {}),
  };
}
