/**
 * Runs and runners on this machine (task-74): the heartbeat and live progress
 * of agent work, kept under `.brainfile/state/`, which is gitignored and
 * never committed. A heartbeat in frontmatter would be a board commit and a
 * push every few seconds; the task carries only the claim
 * (`claimDispatchFile`), which changes when a run starts and ends.
 *
 * - `state/runs/<run-id>.json`: one run as the desktop's AgentRun has it,
 *   with the machine, process, runner, worktree and branch, its `beatAt` and
 *   any ask it is waiting on.
 * - `state/runners/<host>-<pid>.json`: a runner that is up, with its own
 *   `beatAt`.
 *
 * Every write is atomic (a temp file, then a rename), so a reader never sees
 * half a file. All worktrees of a repository reach the same `.brainfile/`, so
 * every runner on the machine sees every run. A run or runner whose process
 * is gone, or whose beat is older than `LOST_AFTER_MS`, is lost; a claim it
 * held can be taken again on this machine (`isClaimLost`). One from another
 * machine is never judged here.
 */
import * as fs from 'fs';
import * as path from 'path';
import { BOARD_STATE_DIR } from './boardRepo';
import { atomicWriteFileSync } from '../utils/files';
import { currentHost, pidAlive } from '../dispatchRecord';
import type { DispatchClaim, DispatchRunner } from '../types/dispatch';

export const RUNS_DIR = 'runs';
export const RUNNERS_DIR = 'runners';
/** How often a runner beats its run and runner files. */
export const BEAT_MS = 10_000;
/** A run or runner not beaten for this long is lost. */
export const LOST_AFTER_MS = 30_000;
/** How long a run that ended is kept, as the desktop's `live` tells it. */
export const ENDED_KEEP_MS = 30 * 60_000;
/** At most this many runs that ended are kept, the latest. */
export const ENDED_KEEP_RUNS = 50;

export type RunFileState = 'starting' | 'working' | 'waiting' | 'done' | 'failed' | 'stopped';

/** States a run is still going in. */
export const LIVE_RUN_STATES: readonly RunFileState[] = ['starting', 'working', 'waiting'];

/** What the agent did on the way to its reply: a tool it ran, or what it said between them. */
export type RunFileStep = { kind: 'tool'; title: string; tool?: string; failed?: boolean } | { kind: 'note'; text: string };

/** An ask the run is waiting on: the agent asking before it acts. */
export interface RunFileAsk {
  id?: string;
  title: string;
  /** The tool's kind as the agent reports it: execute, edit, read, fetch, other. */
  kind?: string;
  options: { optionId: string; name: string; kind: string }[];
}

/** `state/runs/<id>.json`. Times are epoch milliseconds, as AgentRun has them. */
export interface RunFile {
  id: string;
  /** A hand-off, a chat turn, or a turn of an epic's lead. */
  kind: 'dispatch' | 'ask' | 'lead';
  taskId?: string;
  agent: string;
  model?: string;
  effort?: string;
  state: RunFileState;
  /** What kind of work, one word: reading, editing, running, searching, thinking. */
  activity: string;
  reply?: string;
  error?: string;
  steps?: RunFileStep[];
  startedAt: number;
  endedAt?: number;
  /** The machine and the runner's process (`currentHost()`, `process.pid`). */
  host: string;
  pid: number;
  runner: DispatchRunner;
  worktree?: string;
  branch?: string;
  /** The runner's last beat. */
  beatAt: number;
  ask?: RunFileAsk;
  /** The repository the run is in, as its runner names it. */
  projectId?: string;
  /** The chat thread a chat turn belongs to. */
  threadId?: string;
  /** A hand-off the chat made: the chat turn that asked for it. */
  from?: string;
  /** Another process asks the run's runner to stop it (task-80); the runner watches for it. */
  stop?: boolean;
}

/** `state/runners/<host>-<pid>.json`: a runner that is up. */
export interface RunnerFile {
  host: string;
  pid: number;
  runner: DispatchRunner;
  startedAt: number;
  beatAt: number;
}

export interface LostOptions {
  now?: number;
  /** This machine; defaults to `currentHost()`. */
  host?: string;
  /** Whether a process on this machine is running; defaults to `pidAlive`. */
  alive?: (pid: number) => boolean;
}

// ── Where ───────────────────────────────────────────────────────────────────

const SAFE_NAME = /^[A-Za-z0-9._-]+$/;

function safeName(name: string, what: string): string {
  if (!SAFE_NAME.test(name) || name === '.' || name === '..') throw new Error(`Not a ${what}: ${name}`);
  return name;
}

export function runsDir(dotDir: string): string {
  return path.join(dotDir, BOARD_STATE_DIR, RUNS_DIR);
}

export function runnersDir(dotDir: string): string {
  return path.join(dotDir, BOARD_STATE_DIR, RUNNERS_DIR);
}

export function runFilePath(dotDir: string, runId: string): string {
  return path.join(runsDir(dotDir), `${safeName(runId, 'run id')}.json`);
}

export function runnerFilePath(dotDir: string, host: string, pid: number): string {
  if (!Number.isInteger(pid) || pid <= 0) throw new Error(`Not a process id: ${pid}`);
  return path.join(runnersDir(dotDir), `${host.replace(/[^A-Za-z0-9._-]/g, '_')}-${pid}.json`);
}

// ── Reading and writing ─────────────────────────────────────────────────────

function writeJson(file: string, value: unknown): void {
  atomicWriteFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson<T>(file: string): T | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as unknown;
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as T) : null;
  } catch {
    return null;
  }
}

/** The JSON files in a folder, read; temp files mid-write and unreadable ones are skipped. */
function readFolder<T>(dir: string, valid: (value: T) => boolean): { file: string; value: T }[] {
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const out: { file: string; value: T }[] = [];
  for (const name of names) {
    if (name.startsWith('.') || !name.endsWith('.json')) continue;
    const file = path.join(dir, name);
    const value = readJson<T>(file);
    if (value && valid(value)) out.push({ file, value });
  }
  return out;
}

const isRun = (run: RunFile): boolean =>
  typeof run.id === 'string' && typeof run.state === 'string' && typeof run.startedAt === 'number' && typeof run.beatAt === 'number';

const isRunner = (runner: RunnerFile): boolean =>
  typeof runner.host === 'string' && typeof runner.pid === 'number' && typeof runner.beatAt === 'number';

/** Write a run's file, whole and atomically. */
export function writeRunFile(dotDir: string, run: RunFile): void {
  writeJson(runFilePath(dotDir, run.id), run);
}

export function readRunFile(dotDir: string, runId: string): RunFile | null {
  const run = readJson<RunFile>(runFilePath(dotDir, runId));
  return run && isRun(run) ? run : null;
}

/** Every run on this machine, oldest first. */
export function listRunFiles(dotDir: string): RunFile[] {
  return readFolder<RunFile>(runsDir(dotDir), isRun)
    .map((entry) => entry.value)
    .sort((a, b) => a.startedAt - b.startedAt);
}

/** Beat a run: its `beatAt` is now. Null when it has no file. */
export function beatRun(dotDir: string, runId: string, now = Date.now()): RunFile | null {
  const run = readRunFile(dotDir, runId);
  if (!run) return null;
  const beaten = { ...run, beatAt: now };
  writeRunFile(dotDir, beaten);
  return beaten;
}

export function removeRunFile(dotDir: string, runId: string): void {
  fs.rmSync(runFilePath(dotDir, runId), { force: true });
}

/** Say a runner is up, or beat it: its file, written whole. */
export function writeRunnerFile(dotDir: string, runner: RunnerFile): void {
  writeJson(runnerFilePath(dotDir, runner.host, runner.pid), runner);
}

export function readRunnerFile(dotDir: string, host: string, pid: number): RunnerFile | null {
  const runner = readJson<RunnerFile>(runnerFilePath(dotDir, host, pid));
  return runner && isRunner(runner) ? runner : null;
}

/** Every runner file on this machine, lost ones included (`isRunnerLost`). */
export function listRunners(dotDir: string): RunnerFile[] {
  return readFolder<RunnerFile>(runnersDir(dotDir), isRunner).map((entry) => entry.value);
}

/** Beat a runner: its `beatAt` is now. Null when it has no file. */
export function beatRunner(dotDir: string, host: string, pid: number, now = Date.now()): RunnerFile | null {
  const runner = readRunnerFile(dotDir, host, pid);
  if (!runner) return null;
  const beaten = { ...runner, beatAt: now };
  writeRunnerFile(dotDir, beaten);
  return beaten;
}

/** A runner going down says so. */
export function removeRunnerFile(dotDir: string, host: string, pid: number): void {
  fs.rmSync(runnerFilePath(dotDir, host, pid), { force: true });
}

// ── Lost and ended ──────────────────────────────────────────────────────────

/** Whether a run has ended: it says when, or its state is not a live one. */
export function isRunEnded(run: RunFile): boolean {
  return run.endedAt !== undefined || !LIVE_RUN_STATES.includes(run.state);
}

/** On this machine, its process gone or its beat older than `LOST_AFTER_MS`. Another machine's is never lost here. */
function lost(item: { host: string; pid: number; beatAt: number }, options: LostOptions): boolean {
  const host = options.host ?? currentHost();
  if (item.host !== host) return false;
  const alive = options.alive ?? pidAlive;
  return !alive(item.pid) || (options.now ?? Date.now()) - item.beatAt > LOST_AFTER_MS;
}

/** A run that has not ended but whose runner is gone. */
export function isRunLost(run: RunFile, options: LostOptions = {}): boolean {
  return !isRunEnded(run) && lost(run, options);
}

export function isRunnerLost(runner: RunnerFile, options: LostOptions = {}): boolean {
  return lost(runner, options);
}

/** The runners up on this machine (and any another machine's file says is). */
export function liveRunners(dotDir: string, options: LostOptions = {}): RunnerFile[] {
  return listRunners(dotDir).filter((runner) => !isRunnerLost(runner, options));
}

/**
 * Whether a claim on the task has lost its runner, so it can be taken again
 * on this machine (pass it as `claimDispatchFile`'s `isLost`): it ended, or
 * it is this machine's and its process is gone or its runner file was not
 * beaten for `LOST_AFTER_MS`. A runner with no file is judged by its process
 * alone. A claim from another machine is never lost here; that takes force.
 */
export function isClaimLost(dotDir: string, claim: DispatchClaim, options: LostOptions = {}): boolean {
  if (claim.ended !== undefined) return true;
  const host = options.host ?? currentHost();
  if (claim.host !== host) return false;
  const alive = options.alive ?? pidAlive;
  if (!alive(claim.pid)) return true;
  const runner = readRunnerFile(dotDir, claim.host, claim.pid);
  return !!runner && (options.now ?? Date.now()) - runner.beatAt > LOST_AFTER_MS;
}

/**
 * Tidy `state/runs` and `state/runners`: a run that ended more than
 * `ENDED_KEEP_MS` ago or is past the latest `ENDED_KEEP_RUNS` that ended, a
 * lost run last beaten that long ago, a lost runner, and a temp file a write
 * that died left behind. Returns the files removed.
 */
export function pruneRunFiles(dotDir: string, options: LostOptions = {}): string[] {
  const now = options.now ?? Date.now();
  const removed: string[] = [];
  const remove = (file: string) => {
    fs.rmSync(file, { force: true });
    removed.push(file);
  };

  const runs = readFolder<RunFile>(runsDir(dotDir), isRun);
  const ended = runs
    .filter(({ value }) => isRunEnded(value))
    .sort((a, b) => (b.value.endedAt ?? b.value.beatAt) - (a.value.endedAt ?? a.value.beatAt));
  ended.forEach(({ file, value }, index) => {
    if (index >= ENDED_KEEP_RUNS || now - (value.endedAt ?? value.beatAt) > ENDED_KEEP_MS) remove(file);
  });
  for (const { file, value } of runs) {
    if (isRunLost(value, { ...options, now }) && now - value.beatAt > ENDED_KEEP_MS) remove(file);
  }

  for (const { file, value } of readFolder<RunnerFile>(runnersDir(dotDir), isRunner)) {
    if (isRunnerLost(value, { ...options, now })) remove(file);
  }

  for (const dir of [runsDir(dotDir), runnersDir(dotDir)]) {
    let names: string[] = [];
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!name.startsWith('.') || !name.includes('.tmp-')) continue;
      const file = path.join(dir, name);
      try {
        if (now - fs.statSync(file).mtimeMs > LOST_AFTER_MS) remove(file);
      } catch {
        /* gone already */
      }
    }
  }
  return removed;
}
