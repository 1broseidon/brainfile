import type { ExtensionContext } from '@mariozechner/pi-coding-agent';
import * as fs from 'fs';
import * as path from 'path';
import { readTasksDir, type Task } from '@brainfile/core';

import type { Rt, PiEventRecord, PmLockRecord } from './types';
import {
  PM_LOCK_DIRNAME,
  PM_LOCK_LEASE_SECONDS,
  PM_LOCK_REFRESH_INTERVAL_MS,
} from './constants';
import { persistState } from './state';
import { emitEvent, projectionHasDelegation, isRunClosed, pushUnique } from './events';
import { sendOrchestrationMessage } from './messaging';
import { locateTask } from './board';
import { getContractStatus } from './contract';

// ── Run ID ─────────────────────────────────────────────────────────────

export function createRunId(): string {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const random = Math.random().toString(36).slice(2, 10);
  return `run-${stamp}-${random}`;
}

// ── PM lock ────────────────────────────────────────────────────────────

function pmLockDir(rt: Rt): string | null {
  if (!rt.boardContext) return null;
  return path.join(rt.boardContext.stateDir, PM_LOCK_DIRNAME);
}

function pmLockOwnerPath(lockDir: string): string {
  return path.join(lockDir, 'owner.json');
}

function readPmLockRecord(lockDir: string): PmLockRecord | null {
  try {
    const ownerPath = pmLockOwnerPath(lockDir);
    if (!fs.existsSync(ownerPath)) return null;
    const raw = fs.readFileSync(ownerPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<PmLockRecord>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.token !== 'string' || !parsed.token) return null;
    if (typeof parsed.acquiredAt !== 'string' || typeof parsed.updatedAt !== 'string') return null;
    return {
      token: parsed.token,
      acquiredAt: parsed.acquiredAt,
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return null;
  }
}

function isPmLockFresh(record: PmLockRecord | null, nowMs = Date.now()): boolean {
  if (!record) return false;
  const updatedMs = Date.parse(record.updatedAt);
  if (!Number.isFinite(updatedMs)) return false;
  const ageSeconds = Math.max(0, Math.floor((nowMs - updatedMs) / 1000));
  return ageSeconds <= PM_LOCK_LEASE_SECONDS;
}

function writePmLockRecord(lockDir: string, record: PmLockRecord): boolean {
  try {
    fs.writeFileSync(pmLockOwnerPath(lockDir), `${JSON.stringify(record, null, 2)}\n`, 'utf-8');
    return true;
  } catch {
    return false;
  }
}

export function tryAcquirePmLock(rt: Rt): boolean {
  const dir = pmLockDir(rt);
  if (!dir) return false;

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  // Already held by us — refresh
  if (rt.pmLockHeld) {
    const existing = readPmLockRecord(dir);
    if (existing?.token === rt.pmLockToken) {
      const refreshed: PmLockRecord = { ...existing, updatedAt: nowIso };
      writePmLockRecord(dir, refreshed);
      rt.lastPmLockRefreshAtMs = nowMs;
      return true;
    }
    // Lost the lock (stale cleanup by another agent?)
    rt.pmLockHeld = false;
  }

  // Check if lock directory exists
  if (fs.existsSync(dir)) {
    const existing = readPmLockRecord(dir);
    if (existing?.token === rt.pmLockToken) {
      // We own it (recovering from crash/restart?)
      rt.pmLockHeld = true;
      const refreshed: PmLockRecord = { ...existing, updatedAt: nowIso };
      writePmLockRecord(dir, refreshed);
      rt.lastPmLockRefreshAtMs = nowMs;
      return true;
    }
    if (isPmLockFresh(existing, nowMs)) {
      // Another PM holds a fresh lock
      return false;
    }
    // Stale lock — remove it
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      return false;
    }
  }

  // Acquire: atomic mkdir
  try {
    fs.mkdirSync(dir);
  } catch {
    // Race: another agent got it first
    const existing = readPmLockRecord(dir);
    if (existing?.token === rt.pmLockToken) {
      rt.pmLockHeld = true;
      return true;
    }
    return false;
  }

  const record: PmLockRecord = {
    token: rt.pmLockToken,
    acquiredAt: nowIso,
    updatedAt: nowIso,
  };

  if (!writePmLockRecord(dir, record)) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
    return false;
  }

  rt.pmLockHeld = true;
  rt.lastPmLockRefreshAtMs = nowMs;
  return true;
}

export function refreshPmLock(rt: Rt): void {
  if (!rt.pmLockHeld) return;
  const dir = pmLockDir(rt);
  if (!dir) return;

  const nowMs = Date.now();
  if (nowMs - rt.lastPmLockRefreshAtMs < PM_LOCK_REFRESH_INTERVAL_MS) return;

  const existing = readPmLockRecord(dir);
  if (!existing || existing.token !== rt.pmLockToken) {
    rt.pmLockHeld = false;
    return;
  }

  const refreshed: PmLockRecord = { ...existing, updatedAt: new Date(nowMs).toISOString() };
  writePmLockRecord(dir, refreshed);
  rt.lastPmLockRefreshAtMs = nowMs;
}

export function releasePmLock(rt: Rt): void {
  const wasHeld = rt.pmLockHeld;
  rt.pmLockHeld = false;
  rt.lastPmLockRefreshAtMs = 0;

  if (!wasHeld) return;

  const dir = pmLockDir(rt);
  if (!dir || !fs.existsSync(dir)) return;

  const existing = readPmLockRecord(dir);
  if (existing && existing.token !== rt.pmLockToken) return;

  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // best effort release
  }
}

export function startPmLockRefreshTimer(rt: Rt): void {
  stopPmLockRefreshTimer(rt);
  rt.pmLockTimer = setInterval(() => {
    if (rt.pmLockHeld) refreshPmLock(rt);
  }, PM_LOCK_REFRESH_INTERVAL_MS);
}

export function stopPmLockRefreshTimer(rt: Rt): void {
  if (rt.pmLockTimer) {
    clearInterval(rt.pmLockTimer);
    rt.pmLockTimer = null;
  }
}

/**
 * Check if another PM has the lock OR has an open run in the events log.
 * Combines file-based lock detection with event log detection for robustness.
 */
export function isPmClaimedByOther(rt: Rt): { claimed: boolean; holder?: string } {
  // Check PM lock file first (immediate, works before any run is started)
  const dir = pmLockDir(rt);
  if (dir && fs.existsSync(dir)) {
    const record = readPmLockRecord(dir);
    if (record && record.token !== rt.pmLockToken && isPmLockFresh(record)) {
      return { claimed: true, holder: `pm-lock (acquired ${record.acquiredAt})` };
    }
  }

  // Fall back to event log detection (catches PMs that hold runs but lost their lock file)
  const probe = probeOpenPmRuns(rt, rt.activeRunId ? [rt.activeRunId] : []);
  if (probe.hasConflict) {
    return { claimed: true, holder: `pm-run ${probe.latestRunId}` };
  }

  return { claimed: false };
}

// ── Run probing ────────────────────────────────────────────────────────

export function probeOpenPmRuns(rt: Rt, excludeRunIds: string[] = []): { hasConflict: boolean; latestRunId: string | null; openRunIds: string[] } {
  if (!rt.boardContext || !fs.existsSync(rt.boardContext.eventsLogPath)) {
    return {
      hasConflict: false,
      latestRunId: null,
      openRunIds: [],
    };
  }

  const excluded = new Set(excludeRunIds.map((id) => id.trim()).filter((id) => id.length > 0));
  const startedAtByRun = new Map<string, string>();
  const closedRuns = new Set<string>();

  try {
    const lines = fs
      .readFileSync(rt.boardContext.eventsLogPath, 'utf-8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    for (const line of lines) {
      let parsed: PiEventRecord | null = null;
      try {
        parsed = JSON.parse(line) as PiEventRecord;
      } catch {
        continue;
      }

      if (!parsed.runId) continue;

      if (parsed.type === 'run.started' && parsed.actorMode === 'pm') {
        const runId = parsed.runId;
        const at = typeof parsed.at === 'string' ? parsed.at : '';
        const existing = startedAtByRun.get(runId);
        if (!existing || (Number.isFinite(Date.parse(at)) && Date.parse(at) >= Date.parse(existing))) {
          startedAtByRun.set(runId, at);
        }
        continue;
      }

      if (parsed.type === 'run.closed') {
        closedRuns.add(parsed.runId);
      }
    }
  } catch {
    return {
      hasConflict: false,
      latestRunId: null,
      openRunIds: [],
    };
  }

  const openRuns = [...startedAtByRun.entries()]
    .filter(([runId]) => !closedRuns.has(runId) && !excluded.has(runId))
    .sort((a, b) => {
      const aMs = Date.parse(a[1]);
      const bMs = Date.parse(b[1]);
      if (Number.isFinite(aMs) && Number.isFinite(bMs)) return bMs - aMs;
      if (Number.isFinite(aMs)) return -1;
      if (Number.isFinite(bMs)) return 1;
      return b[0].localeCompare(a[0]);
    })
    .map(([runId]) => runId);

  return {
    hasConflict: openRuns.length > 0,
    latestRunId: openRuns[0] || null,
    openRunIds: openRuns,
  };
}

// ── Orphan adoption ────────────────────────────────────────────────────

export function adoptOrphanedTasksForRun(rt: Rt, ctx: ExtensionContext, runId: string, source: string): void {
  if (!rt.boardContext || rt.operatingMode !== 'pm') return;

  const activeDocs = readTasksDir(rt.boardContext.boardDir);
  const adoptableStatuses = new Set(['ready', 'in_progress', 'delivered', 'failed', 'blocked']);

  const adopted: Array<{ taskId: string; status: string; title: string; assignee?: string }> = [];

  for (const doc of activeDocs) {
    const contractStatus = getContractStatus(doc.task);
    if (!adoptableStatuses.has(contractStatus)) continue;

    // Already tracked by this run
    if (projectionHasDelegation(rt, runId, doc.task.id)) continue;

    // Check if the task belongs to an active (non-closed) run that is NOT this run
    const priorRunId = rt.eventProjection.taskRun[doc.task.id];
    if (priorRunId && priorRunId === runId) continue;
    if (priorRunId && !isRunClosed(rt, priorRunId)) continue; // prior run still active, don't steal

    // Adopt: register the task under the new run
    rt.eventProjection.delegatedByRun[runId] = pushUnique(
      rt.eventProjection.delegatedByRun[runId],
      doc.task.id
    );
    rt.eventProjection.taskRun[doc.task.id] = runId;

    // Record adoption timestamp so stale detection uses this as the
    // baseline for tasks that have no prior progress timestamp, instead
    // of falling back to MAX_SAFE_INTEGER and immediately flagging them.
    rt.eventProjection.taskAdoptedAt[doc.task.id] = new Date().toISOString();

    adopted.push({
      taskId: doc.task.id,
      status: contractStatus,
      title: doc.task.title,
      assignee: doc.task.assignee,
    });
  }

  if (adopted.length === 0) return;

  // Separate delivered tasks that need immediate PM attention
  const deliveredTasks = adopted.filter((t) => t.status === 'delivered');

  // Pre-mark delivered tasks as notified for this run so processEventLog
  // doesn't double-count when it later encounters the original delivery events.
  for (const dt of deliveredTasks) {
    rt.eventProjection.deliveredNotifiedByRun[runId] = pushUnique(
      rt.eventProjection.deliveredNotifiedByRun[runId],
      dt.taskId
    );
  }

  persistState(rt);

  // Notify PM about adopted tasks, especially delivered ones awaiting validation
  if (deliveredTasks.length > 0) {
    sendOrchestrationMessage(rt, ctx, [
      `Run ${runId} adopted ${adopted.length} task(s) from prior closed runs.`,
      `${deliveredTasks.length} task(s) have been DELIVERED and await validation:`,
      ...deliveredTasks.map((t) => `- ${t.taskId}: ${t.title}`),
      'Use brainfile_contract_validate to review each delivery.',
    ]);
  }
}

export function ensureActiveRunForDelegation(rt: Rt, ctx: ExtensionContext, source: string): string | null {
  if (rt.operatingMode !== 'pm') return rt.activeRunId;

  if (rt.activeRunId && !isRunClosed(rt, rt.activeRunId)) {
    return rt.activeRunId;
  }

  rt.activeRunId = createRunId();
  emitEvent(rt, 'run.started', ctx, source, {
    runId: rt.activeRunId,
    data: {
      mode: rt.operatingMode,
    },
  });
  adoptOrphanedTasksForRun(rt, ctx, rt.activeRunId, `${source}:adopt`);
  persistState(rt);
  return rt.activeRunId;
}

// ── Task progress helpers ──────────────────────────────────────────────

function getTaskProgressTimestamp(task: Task): string | undefined {
  const contractMetrics = ((task as any)?.contract?.metrics || {}) as Record<string, unknown>;
  const candidates = [
    task.updatedAt,
    typeof contractMetrics.deliveredAt === 'string' ? contractMetrics.deliveredAt : undefined,
    typeof contractMetrics.pickedUpAt === 'string' ? contractMetrics.pickedUpAt : undefined,
    task.createdAt,
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

  if (candidates.length === 0) return undefined;

  let latest = candidates[0];
  let latestMs = Date.parse(latest);

  for (const candidate of candidates.slice(1)) {
    const candidateMs = Date.parse(candidate);
    if (!Number.isFinite(candidateMs)) continue;
    if (!Number.isFinite(latestMs) || candidateMs > latestMs) {
      latest = candidate;
      latestMs = candidateMs;
    }
  }

  return latest;
}

// ── Run summarization and evaluation ───────────────────────────────────

export function summarizeRun(rt: Rt, runId: string): {
  result: 'running' | 'success' | 'blocked';
  counts: Record<string, number>;
  staleTasks: Array<{ taskId: string; ageSeconds: number; lastProgressAt?: string }>;
  openTasks: Array<{ taskId: string; status: string; assignee?: string; ageSeconds?: number; lastProgressAt?: string }>;
  blockingReasons: string[];
} {
  const nowMs = Date.now();
  const delegatedIds = rt.eventProjection.delegatedByRun[runId] || [];

  const counts: Record<string, number> = {
    delegated: delegatedIds.length,
    completed: 0,
    done: 0,
    delivered: 0,
    in_progress: 0,
    ready: 0,
    blocked: 0,
    failed: 0,
    missing: 0,
    none: 0,
    stale: 0,
  };

  const staleTasks: Array<{ taskId: string; ageSeconds: number; lastProgressAt?: string }> = [];
  const openTasks: Array<{ taskId: string; status: string; assignee?: string; ageSeconds?: number; lastProgressAt?: string }> = [];

  for (const taskId of delegatedIds) {
    const located = locateTask(rt, taskId, true);
    if (!located) {
      counts.missing += 1;
      openTasks.push({ taskId, status: 'missing' });
      continue;
    }

    if (located.isLog) {
      counts.completed += 1;
      continue;
    }

    const status = getContractStatus(located.task);
    if (status === 'done') {
      counts.done += 1;
      continue;
    }
    if (status === 'delivered') {
      counts.delivered += 1;
      openTasks.push({ taskId, status, assignee: located.task.assignee });
      continue;
    }
    if (status === 'ready') {
      counts.ready += 1;
      openTasks.push({ taskId, status, assignee: located.task.assignee });
      continue;
    }
    if (status === 'blocked') {
      counts.blocked += 1;
      openTasks.push({ taskId, status, assignee: located.task.assignee });
      continue;
    }
    if (status === 'failed') {
      counts.failed += 1;
      openTasks.push({ taskId, status, assignee: located.task.assignee });
      continue;
    }
    if (status === 'in_progress') {
      counts.in_progress += 1;
      const lastProgressAt = getTaskProgressTimestamp(located.task);
      const adoptedAt = rt.eventProjection.taskAdoptedAt[taskId];
      const effectiveProgressAt = lastProgressAt || adoptedAt;
      const progressMs = effectiveProgressAt ? Date.parse(effectiveProgressAt) : NaN;
      const ageSeconds = Number.isFinite(progressMs)
        ? Math.max(0, Math.floor((nowMs - progressMs) / 1000))
        : Number.MAX_SAFE_INTEGER;

      openTasks.push({ taskId, status, assignee: located.task.assignee, ageSeconds, lastProgressAt });

      if (ageSeconds >= rt.staleTimeoutSeconds) {
        counts.stale += 1;
        staleTasks.push({ taskId, ageSeconds, lastProgressAt });
      }
      continue;
    }

    counts.none += 1;
    openTasks.push({ taskId, status, assignee: located.task.assignee });
  }

  const blockingReasons: string[] = [];
  if (counts.stale > 0) blockingReasons.push('stale');
  if (counts.failed > 0) blockingReasons.push('failed');
  if (counts.blocked > 0) blockingReasons.push('blocked');

  const result: 'running' | 'success' | 'blocked' =
    delegatedIds.length === 0
      ? 'running'
      : blockingReasons.length > 0
        ? 'blocked'
        : openTasks.length === 0
          ? 'success'
          : 'running';

  return {
    result,
    counts,
    staleTasks,
    openTasks,
    blockingReasons,
  };
}

export function maybeEvaluateActiveRun(rt: Rt, ctx: ExtensionContext, source: string): void {
  if (rt.operatingMode !== 'pm' || !rt.listenMode || !rt.activeRunId) return;
  if (isRunClosed(rt, rt.activeRunId)) return;

  const runId = rt.activeRunId;
  const summary = summarizeRun(rt, runId);
  let changed = false;

  for (const staleTask of summary.staleTasks) {
    const notified = rt.eventProjection.staleNotifiedByRun[runId] || [];
    if (notified.includes(staleTask.taskId)) continue;

    emitEvent(rt, 'task.stale', ctx, source, {
      taskId: staleTask.taskId,
      runId,
      data: {
        ageSeconds: staleTask.ageSeconds,
        staleTimeoutSeconds: rt.staleTimeoutSeconds,
        lastProgressAt: staleTask.lastProgressAt || null,
      },
    });
    rt.eventProjection.staleNotifiedByRun[runId] = pushUnique(notified, staleTask.taskId);
    changed = true;
  }

  if (summary.result === 'blocked') {
    if (!rt.eventProjection.blockedNotifiedRuns.includes(runId)) {
      emitEvent(rt, 'run.blocked', ctx, source, {
        runId,
        data: {
          result: 'blocked',
          reasons: summary.blockingReasons,
          counts: summary.counts,
          staleTimeoutSeconds: rt.staleTimeoutSeconds,
          openTasks: summary.openTasks,
        },
      });
      rt.eventProjection.blockedNotifiedRuns = pushUnique(rt.eventProjection.blockedNotifiedRuns, runId);
      sendOrchestrationMessage(rt, ctx, [
        `Run ${runId} is BLOCKED (${summary.blockingReasons.join(', ')}).`,
        `Open tasks: ${summary.openTasks.length}.`,
        `Stale timeout: ${rt.staleTimeoutSeconds}s.`,
      ]);
      changed = true;
    }

    if (!isRunClosed(rt, runId)) {
      emitEvent(rt, 'run.closed', ctx, source, {
        runId,
        data: {
          result: 'blocked',
          reasons: summary.blockingReasons,
          counts: summary.counts,
          openTasks: summary.openTasks,
        },
      });
      rt.eventProjection.runClosedByRun[runId] = 'blocked';
      if (!rt.eventProjection.closedNotifiedRuns.includes(runId)) {
        rt.eventProjection.closedNotifiedRuns = pushUnique(rt.eventProjection.closedNotifiedRuns, runId);
        sendOrchestrationMessage(rt, ctx, [
          `Run ${runId} closed with result: blocked.`,
          `Remaining/open tasks: ${summary.openTasks.length}.`,
        ]);
      }
      changed = true;
    }

    if (rt.activeRunId === runId) {
      rt.activeRunId = null;
      changed = true;
    }

    if (changed) persistState(rt);
    return;
  }

  // --- Delivery batch notification ---
  if (summary.result === 'running' && summary.counts.delegated > 0) {
    const deliveredCount = summary.counts.delivered;
    const allOpenAreDelivered = summary.openTasks.length > 0 &&
      summary.openTasks.every((t) => t.status === 'delivered');

    if (allOpenAreDelivered) {
      const prevNotified = rt.eventProjection.deliveryBatchNotifiedByRun[runId] || 0;
      if (deliveredCount > prevNotified) {
        rt.eventProjection.deliveryBatchNotifiedByRun[runId] = deliveredCount;
        const taskLines = summary.openTasks.map((t) => `  - ${t.taskId}${t.assignee ? ` (${t.assignee})` : ''}`);
        sendOrchestrationMessage(rt, ctx, [
          `${deliveredCount} delivered task(s) awaiting your validation:`,
          ...taskLines,
          'Run `brainfile_contract_validate` for each, then `brainfile_complete_task` to finish them.',
        ]);
        changed = true;
      }
    }
  }

  if (summary.result === 'success' && !isRunClosed(rt, runId)) {
    emitEvent(rt, 'run.closed', ctx, source, {
      runId,
      data: {
        result: 'success',
        counts: summary.counts,
        openTasks: [],
      },
    });
    rt.eventProjection.runClosedByRun[runId] = 'success';
    if (!rt.eventProjection.closedNotifiedRuns.includes(runId)) {
      rt.eventProjection.closedNotifiedRuns = pushUnique(rt.eventProjection.closedNotifiedRuns, runId);
      sendOrchestrationMessage(rt, ctx, [
        `Run ${runId} completed successfully.`,
        `Delegated tasks: ${summary.counts.delegated}.`,
      ]);
    }
    if (rt.activeRunId === runId) {
      rt.activeRunId = null;
    }
    changed = true;
  }

  if (changed) {
    persistState(rt);
  }
}
