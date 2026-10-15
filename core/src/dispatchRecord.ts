/**
 * The dispatch record on a task (spec-16-1, task-74): `dispatch:` in its
 * frontmatter says who asked for a hand-off, with which agent, model and
 * effort, how far it goes, and which runner claimed it.
 *
 * Every write goes through a compare-and-swap on the task file: under a lock
 * in `.brainfile/state/locks/`, the file is read, the change decided, and the
 * new content renamed into place only if the file still says what was read.
 * Two runners on one machine never both take a claim; the board commit makes
 * it final across machines.
 *
 * Node only (fs, os); not in the browser entry. The heartbeat that says a
 * claim's runner is still up is in run files (`@brainfile/core/repo`), never
 * here: nothing on the task changes while a run goes on.
 *
 * @packageDocumentation
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { LintIssue } from './linter';
import type { DispatchClaim, DispatchOutcome, DispatchRecord, DispatchRequest, Task } from './types';
import { DISPATCH_BY, DISPATCH_OUTCOMES, DISPATCH_ROLES, DISPATCH_RUNNERS, DISPATCH_UNTIL } from './types/dispatch';
import { parseTaskContent, serializeTaskContent } from './taskContent';
import { DOT_BRAINFILE_STATE_DIRNAME, atomicWriteFileSync } from './utils/files';

const REQUEST_KEYS = ['agent', 'model', 'effort', 'by', 'at', 'until', 'role'] as const;

/** A lock older than this was left by a writer that died. */
const LOCK_STALE_MS = 10_000;
/** How long a write waits for another writer's lock before it gives up. */
const LOCK_WAIT_MS = 2_000;
/** How many times a write is decided again when the file changed under it. */
const SWAP_ATTEMPTS = 3;

// ── This machine ────────────────────────────────────────────────────────────

/** This machine's name as a claim gives it: `os.hostname()`, without the `.local` macOS adds on some networks. */
export function currentHost(): string {
  return os.hostname().replace(/\.local$/i, '');
}

/** Whether a process is running on this machine. One we may not signal is running. */
export function pidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

// ── Reading ─────────────────────────────────────────────────────────────────

function isMapping(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** An ISO 8601 time as written; YAML reads an unquoted one as a Date. */
function isoTime(value: unknown): string | undefined {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  if (typeof value === 'string' && value.trim() && !Number.isNaN(Date.parse(value))) return value.trim();
  return undefined;
}

function oneOf(value: unknown, allowed: readonly string[]): boolean {
  return typeof value === 'string' && allowed.includes(value);
}

const nonEmpty = (value: unknown): boolean => typeof value === 'string' && value.trim() !== '';

function claimProblems(value: unknown): string[] {
  if (!isMapping(value)) return ['claim: must be a mapping (host, runner, pid, at)'];
  const problems: string[] = [];
  if (!nonEmpty(value.host)) problems.push('claim.host: must name the machine');
  if (!oneOf(value.runner, DISPATCH_RUNNERS)) problems.push(`claim.runner: must be one of ${DISPATCH_RUNNERS.join(', ')}`);
  if (!Number.isInteger(value.pid) || (value.pid as number) <= 0) problems.push('claim.pid: must be a process id');
  if (!isoTime(value.at)) problems.push('claim.at: must be an ISO 8601 time');
  if (value.ended !== undefined && !isoTime(value.ended)) problems.push('claim.ended: must be an ISO 8601 time');
  if (value.outcome !== undefined) {
    if (!oneOf(value.outcome, DISPATCH_OUTCOMES)) problems.push(`claim.outcome: must be one of ${DISPATCH_OUTCOMES.join(', ')}`);
    else if (value.ended === undefined) problems.push('claim.outcome: only with claim.ended');
  }
  return problems;
}

/**
 * What is wrong with a `dispatch:` value, one line each; empty when it is a
 * record (or absent). Keys core does not know are never a problem.
 */
export function dispatchRecordProblems(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!isMapping(value)) return ['must be a mapping (agent, by, at, ...)'];
  const problems: string[] = [];
  if (!nonEmpty(value.agent)) problems.push('agent: must name the agent');
  for (const key of ['model', 'effort'] as const) {
    if (value[key] !== undefined && !nonEmpty(value[key])) problems.push(`${key}: must be text`);
  }
  if (!oneOf(value.by, DISPATCH_BY)) problems.push(`by: must be one of ${DISPATCH_BY.join(', ')}`);
  if (!isoTime(value.at)) problems.push('at: must be an ISO 8601 time');
  if (value.until !== undefined && !oneOf(value.until, DISPATCH_UNTIL)) problems.push(`until: must be one of ${DISPATCH_UNTIL.join(', ')}`);
  if (value.role !== undefined && !oneOf(value.role, DISPATCH_ROLES)) problems.push(`role: must be one of ${DISPATCH_ROLES.join(', ')}`);
  if (value.claim !== undefined && value.claim !== null) problems.push(...claimProblems(value.claim));
  return problems;
}

/** A `dispatch:` value as a record, times as ISO strings and unknown keys kept; null when it is absent or malformed. */
export function parseDispatchRecord(value: unknown): DispatchRecord | null {
  if (!isMapping(value) || dispatchRecordProblems(value).length > 0) return null;
  const record = { ...value, at: isoTime(value.at)! } as DispatchRecord;
  if (isMapping(value.claim)) {
    const ended = isoTime(value.claim.ended);
    record.claim = { ...value.claim, at: isoTime(value.claim.at)!, ...(ended ? { ended } : {}) } as DispatchClaim;
  } else {
    delete record.claim;
  }
  return record;
}

/** A task's dispatch record; null when it has none or it is malformed (`lintDispatchRecords` says how). */
export function readDispatchRecord(task: { dispatch?: unknown }): DispatchRecord | null {
  return parseDispatchRecord(task.dispatch);
}

/** Whether a claim still holds the task: it is there and has not ended. */
export function claimHeld(claim: DispatchClaim | undefined): claim is DispatchClaim {
  return !!claim && claim.ended === undefined;
}

// ── Lint ────────────────────────────────────────────────────────────────────

/** A warning for each task whose `dispatch:` is not a record a runner can read. */
export function lintDispatchRecords(tasks: ReadonlyArray<{ id: string; dispatch?: unknown }>): LintIssue[] {
  const issues: LintIssue[] = [];
  for (const task of tasks) {
    for (const problem of dispatchRecordProblems(task.dispatch)) {
      issues.push({
        type: 'warning',
        message: `${task.id}: dispatch ${problem}`,
        fixable: false,
        code: 'MALFORMED_DISPATCH',
      });
    }
  }
  return issues;
}

// ── Changing the record (in memory) ─────────────────────────────────────────

function requestFields(request: DispatchRequest): DispatchRequest {
  const problems = dispatchRecordProblems({ ...request, claim: undefined });
  if (problems.length > 0) throw new Error(`Not a dispatch request: ${problems.join('; ')}`);
  return {
    agent: request.agent,
    ...(request.model ? { model: request.model } : {}),
    ...(request.effort ? { effort: request.effort } : {}),
    by: request.by,
    at: isoTime(request.at)!,
    ...(request.until ? { until: request.until } : {}),
    ...(request.role ? { role: request.role } : {}),
  };
}

/**
 * The task with this request as its `dispatch:`. Keys core does not know are
 * kept; a claim that still holds is kept (its run is still going), one that
 * ended goes with the request it answered. Throws on a malformed request.
 */
export function withDispatchRequest(task: Task, request: DispatchRequest): Task {
  const old = isMapping(task.dispatch) ? (task.dispatch as Record<string, unknown>) : {};
  const unknown = Object.fromEntries(
    Object.entries(old).filter(([key]) => key !== 'claim' && !(REQUEST_KEYS as readonly string[]).includes(key))
  );
  const claim = parseDispatchRecord(old)?.claim;
  const dispatch: DispatchRecord = { ...requestFields(request), ...unknown, ...(claimHeld(claim) ? { claim } : {}) };
  return { ...task, dispatch };
}

/** The runner taking a claim; `at` defaults to now. */
export type ClaimInput = Pick<DispatchClaim, 'host' | 'runner' | 'pid'> & { at?: string };

export interface ClaimOptions {
  /** Take a claim that still holds, even one from another machine. */
  force?: boolean;
  /**
   * Whether a claim on this machine has lost its runner, so it can be taken
   * again. By default, whether its process is gone; `isClaimLost` from
   * `@brainfile/core/repo` also reads the runner's heartbeat.
   */
  isLost?: (claim: DispatchClaim) => boolean;
  /** Write this request in the same swap, for a hand-off asked for and started at once. */
  request?: DispatchRequest;
}

export type ClaimRefusal = 'no-request' | 'malformed' | 'claimed' | 'other-host' | 'missing' | 'busy';

export type ClaimResult =
  | { ok: true; task: Task; record: DispatchRecord; /** A lost (or forced) claim this one replaced. */ replaced?: DispatchClaim }
  | { ok: false; reason: ClaimRefusal; error: string; /** The claim that holds the task. */ holder?: DispatchClaim };

function claimFields(claim: ClaimInput): DispatchClaim {
  const at = claim.at ?? new Date().toISOString();
  const problems = claimProblems({ host: claim.host, runner: claim.runner, pid: claim.pid, at });
  if (problems.length > 0) throw new Error(`Not a claim: ${problems.join('; ')}`);
  return { host: claim.host, runner: claim.runner, pid: claim.pid, at };
}

const holderLabel = (claim: DispatchClaim): string => `${claim.runner} (pid ${claim.pid}) on ${claim.host}`;

/**
 * Decide a claim on a task in memory. Refused while another claim holds it:
 * one from another machine is taken only with `force`; one on the claimer's
 * machine also when `isLost` says its runner is gone.
 */
export function claimDispatch(task: Task, claim: ClaimInput, options: ClaimOptions = {}): ClaimResult {
  const taking = claimFields(claim);
  const written = task.dispatch !== undefined && task.dispatch !== null;
  const current = parseDispatchRecord(task.dispatch);
  if (written && !current && !options.request) {
    return { ok: false, reason: 'malformed', error: `${task.id}'s dispatch is malformed: ${dispatchRecordProblems(task.dispatch).join('; ')}` };
  }
  if (!current && !options.request) return { ok: false, reason: 'no-request', error: `${task.id} has no dispatch request to claim` };

  let replaced: DispatchClaim | undefined;
  const held = current?.claim;
  if (claimHeld(held)) {
    const isLost = options.isLost ?? ((c: DispatchClaim) => !pidAlive(c.pid));
    if (options.force) replaced = held;
    else if (held.host !== taking.host) {
      return { ok: false, reason: 'other-host', holder: held, error: `${task.id} is claimed by ${holderLabel(held)}; take it with force` };
    } else if (isLost(held)) replaced = held;
    else return { ok: false, reason: 'claimed', holder: held, error: `${task.id} is claimed by ${holderLabel(held)}` };
  }

  const base = options.request ? withDispatchRequest(task, options.request) : task;
  const record: DispatchRecord = { ...(parseDispatchRecord(base.dispatch) as DispatchRecord), claim: taking };
  return { ok: true, task: { ...base, dispatch: record }, record, ...(replaced ? { replaced } : {}) };
}

/** The runner giving a claim back: its machine and process. */
export type ClaimHolder = Pick<DispatchClaim, 'host' | 'pid'>;

export interface ReleaseOptions {
  /** Keep the claim, saying it ended with this outcome, instead of clearing it. */
  outcome?: DispatchOutcome;
  /** When it ended (ISO 8601); defaults to now. */
  at?: string;
}

export type ReleaseResult =
  | { ok: true; task: Task; /** False when there was nothing to give back. */ changed: boolean }
  | { ok: false; reason: 'not-yours' | 'missing' | 'busy'; error: string; holder?: DispatchClaim };

/** Give a claim back in memory: cleared, or kept with `ended` and `outcome`. Only its holder may. */
export function releaseDispatch(task: Task, holder: ClaimHolder, options: ReleaseOptions = {}): ReleaseResult {
  const current = parseDispatchRecord(task.dispatch);
  const claim = current?.claim;
  if (!current || !claimHeld(claim)) return { ok: true, task, changed: false };
  if (claim.host !== holder.host || claim.pid !== holder.pid) {
    return { ok: false, reason: 'not-yours', holder: claim, error: `${task.id} is claimed by ${holderLabel(claim)}` };
  }
  const record: DispatchRecord = { ...current };
  if (options.outcome) {
    if (!DISPATCH_OUTCOMES.includes(options.outcome)) throw new Error(`Not an outcome: ${options.outcome}`);
    record.claim = { ...claim, ended: isoTime(options.at) ?? new Date().toISOString(), outcome: options.outcome };
  } else {
    delete record.claim;
  }
  return { ok: true, task: { ...task, dispatch: record }, changed: true };
}

// ── On disk: the compare-and-swap ───────────────────────────────────────────

/** `.brainfile/state/locks/<file>.lock` for a task file in `.brainfile/board/` or `logs/`. */
function lockPathFor(realFile: string): string {
  const dotDir = path.dirname(path.dirname(realFile));
  return path.join(dotDir, DOT_BRAINFILE_STATE_DIRNAME, 'locks', `${path.basename(realFile)}.lock`);
}

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** What a stale lock says, to take it over by; null when it is held, or gone. */
function staleLock(lock: string): string | null {
  try {
    const stat = fs.statSync(lock);
    const seen = fs.readFileSync(lock, 'utf-8');
    if (Date.now() - stat.mtimeMs > LOCK_STALE_MS) return seen;
    const pid = Number.parseInt(seen, 10);
    return Number.isInteger(pid) && pid > 0 && !pidAlive(pid) ? seen : null;
  } catch {
    return null;
  }
}

/**
 * Lets a stale lock go: moved aside first, which only one taker can do, and
 * put back if what was moved is not the lock judged stale (another took it
 * meanwhile), as the landing lock does.
 */
function takeOver(lock: string, seen: string): void {
  const aside = `${lock}.${process.pid}.${Date.now()}.gone`;
  try {
    fs.renameSync(lock, aside);
  } catch {
    return; // Another taker moved it first.
  }
  let moved = '';
  try {
    moved = fs.readFileSync(aside, 'utf-8');
  } catch {
    /* gone already */
  }
  if (moved !== seen) {
    try {
      fs.linkSync(aside, lock);
    } catch {
      /* someone holds it anew */
    }
  }
  fs.rmSync(aside, { force: true });
}

/** Take the file's lock, waiting a moment for another writer; the release, or null when it stayed busy. */
function takeLock(lock: string): (() => void) | null {
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try {
      const fd = fs.openSync(lock, 'wx');
      const mine = `${process.pid} ${Math.random().toString(36).slice(2)}`;
      try {
        fs.writeSync(fd, mine);
      } finally {
        fs.closeSync(fd);
      }
      // Only its own: a lock taken over meanwhile is another's now.
      return () => {
        try {
          if (fs.readFileSync(lock, 'utf-8') === mine) fs.rmSync(lock, { force: true });
        } catch {
          /* gone already */
        }
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }
    const stale = staleLock(lock);
    if (stale !== null) {
      takeOver(lock, stale);
      continue;
    }
    if (Date.now() > deadline) return null;
    sleep(10);
  }
}

type Swapped<R> = R | { ok: false; reason: 'missing' | 'busy'; error: string };

/**
 * Read the task file, decide, and write the decision only if the file still
 * says what was read, under the file's lock. `decide` returns the result and
 * the task to write, or no task to leave the file alone. An edit that lands
 * while deciding is decided again.
 */
function swapTaskFile<R>(filePath: string, decide: (task: Task) => { result: R; next?: Task }): Swapped<R> {
  let real: string;
  try {
    real = fs.realpathSync(filePath);
  } catch {
    return { ok: false, reason: 'missing', error: `No task file at ${filePath}` };
  }
  const release = takeLock(lockPathFor(real));
  if (!release) return { ok: false, reason: 'busy', error: `${path.basename(real)} is being written by another runner` };
  try {
    for (let attempt = 0; attempt < SWAP_ATTEMPTS; attempt++) {
      const before = fs.readFileSync(real, 'utf-8');
      const parsed = parseTaskContent(before);
      if (!parsed) return { ok: false, reason: 'missing', error: `${path.basename(real)} is not a task file` };
      const { result, next } = decide(parsed.task);
      if (!next) return result;
      if (fs.readFileSync(real, 'utf-8') !== before) continue;
      atomicWriteFileSync(real, serializeTaskContent({ ...next, updatedAt: new Date().toISOString() }, parsed.body));
      return result;
    }
    return { ok: false, reason: 'busy', error: `${path.basename(real)} kept changing while it was written` };
  } finally {
    release();
  }
}

export interface RequestOptions {
  /** Also make the request's agent the task's assignee, as Hand to… does. */
  assignee?: boolean;
}

export type RequestResult =
  | { ok: true; task: Task; record: DispatchRecord }
  | { ok: false; reason: 'missing' | 'busy'; error: string };

/** Write a dispatch request on the task file (see `withDispatchRequest`). Throws on a malformed request. */
export function requestDispatchFile(filePath: string, request: DispatchRequest, options: RequestOptions = {}): RequestResult {
  requestFields(request);
  return swapTaskFile<RequestResult>(filePath, (task) => {
    const requested = withDispatchRequest(task, request);
    const next = options.assignee ? { ...requested, assignee: request.agent } : requested;
    return { result: { ok: true, task: next, record: next.dispatch as DispatchRecord }, next };
  });
}

/**
 * Take the claim on the task file before the run starts (see
 * `claimDispatch`), by compare-and-swap: of two runners claiming at once,
 * one gets it and the other is refused with the holder.
 */
export function claimDispatchFile(filePath: string, claim: ClaimInput, options: ClaimOptions = {}): ClaimResult {
  claimFields(claim);
  return swapTaskFile<ClaimResult>(filePath, (task) => {
    const result = claimDispatch(task, claim, options);
    return { result, ...(result.ok ? { next: result.task } : {}) };
  });
}

/** Give the claim on the task file back when the run ends (see `releaseDispatch`). */
export function releaseDispatchFile(filePath: string, holder: ClaimHolder, options: ReleaseOptions = {}): ReleaseResult {
  return swapTaskFile<ReleaseResult>(filePath, (task) => {
    const result = releaseDispatch(task, holder, options);
    return { result, ...(result.ok && result.changed ? { next: result.task } : {}) };
  });
}
