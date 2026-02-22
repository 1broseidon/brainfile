import type { ExtensionContext } from '@mariozechner/pi-coding-agent';
import * as fs from 'fs';

import type { Rt, PiEventType, PiEventRecord } from './types';
import { persistState } from './state';
import { normalizeAssignee } from './worker';
import { updateWorkerPresence } from './worker';
import { sendOrchestrationMessage } from './messaging';
import { createRunId, adoptOrphanedTasksForRun } from './pm';

// ── Pure helpers ───────────────────────────────────────────────────────

export function pushUnique(list: string[] | undefined, value: string): string[] {
  const current = Array.isArray(list) ? [...list] : [];
  if (!current.includes(value)) {
    current.push(value);
  }
  return current;
}

// ── Projection queries ─────────────────────────────────────────────────

export function projectionHasDelegation(rt: Rt, runId: string, taskId: string): boolean {
  const delegated = rt.eventProjection.delegatedByRun[runId] || [];
  return delegated.includes(taskId);
}

export function isRunClosed(rt: Rt, runId: string): boolean {
  return typeof rt.eventProjection.runClosedByRun[runId] === 'string';
}

// ── Event log management ───────────────────────────────────────────────

export function ensureEventsLogExists(rt: Rt): void {
  if (!rt.boardContext) return;
  fs.mkdirSync(rt.boardContext.stateDir, { recursive: true });
  if (!fs.existsSync(rt.boardContext.eventsLogPath)) {
    fs.writeFileSync(rt.boardContext.eventsLogPath, '', 'utf-8');
  }
}

export function inferRunIdForTask(rt: Rt, taskId: string | undefined): string | undefined {
  if (!taskId) return undefined;
  const projectedRun = rt.eventProjection.taskRun[taskId];
  if (projectedRun) return projectedRun;
  if (rt.activeRunId) {
    const delegated = rt.eventProjection.delegatedByRun[rt.activeRunId] || [];
    if (delegated.includes(taskId)) return rt.activeRunId;
  }

  if (rt.boardContext && fs.existsSync(rt.boardContext.eventsLogPath)) {
    try {
      const lines = fs
        .readFileSync(rt.boardContext.eventsLogPath, 'utf-8')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      for (let i = lines.length - 1; i >= 0; i -= 1) {
        const parsed = JSON.parse(lines[i]) as PiEventRecord;
        if (parsed.taskId === taskId && parsed.runId) {
          rt.eventProjection.taskRun[taskId] = parsed.runId;
          return parsed.runId;
        }
      }
    } catch {
      // best-effort fallback only
    }
  }

  return undefined;
}

// ── Event emission ─────────────────────────────────────────────────────

export function emitEvent(
  rt: Rt,
  type: PiEventType,
  ctx: ExtensionContext,
  source: string,
  options?: {
    taskId?: string;
    runId?: string;
    assignee?: string;
    data?: Record<string, unknown>;
  }
): void {
  if (!rt.boardContext) return;

  ensureEventsLogExists(rt);

  const runId = options?.runId || inferRunIdForTask(rt, options?.taskId) || (rt.operatingMode === 'pm' ? rt.activeRunId || undefined : undefined);
  const event: PiEventRecord = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    type,
    ...(runId ? { runId } : {}),
    ...(options?.taskId ? { taskId: options.taskId } : {}),
    actorMode: rt.operatingMode,
    ...(options?.assignee ? { actorAssignee: options.assignee } : {}),
    source,
    ...(options?.data ? { data: options.data } : {}),
  };

  fs.appendFileSync(rt.boardContext.eventsLogPath, `${JSON.stringify(event)}\n`, 'utf-8');
}

// ── Event log processing ───────────────────────────────────────────────

export function processEventLog(rt: Rt, ctx: ExtensionContext): void {
  if (!rt.boardContext) return;
  ensureEventsLogExists(rt);

  const raw = fs.readFileSync(rt.boardContext.eventsLogPath, 'utf-8');
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (rt.eventProjection.cursor > lines.length) {
    rt.eventProjection.cursor = 0;
  }

  if (rt.eventProjection.cursor >= lines.length) return;

  const start = rt.eventProjection.cursor;
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index];
    let parsed: PiEventRecord | null = null;
    try {
      parsed = JSON.parse(line) as PiEventRecord;
    } catch {
      continue;
    }

    const taskId = parsed.taskId;
    const runId = parsed.runId || inferRunIdForTask(rt, taskId);

    if (runId && taskId && parsed.type === 'contract.delegated') {
      rt.eventProjection.delegatedByRun[runId] = pushUnique(rt.eventProjection.delegatedByRun[runId], taskId);
      rt.eventProjection.taskRun[taskId] = runId;
    }

    if (runId && taskId && !rt.eventProjection.taskRun[taskId]) {
      rt.eventProjection.taskRun[taskId] = runId;
    }

    const actorAssignee = normalizeAssignee(parsed.actorAssignee);
    if (actorAssignee && (parsed.type === 'worker.online' || parsed.type === 'worker.heartbeat')) {
      updateWorkerPresence(rt, actorAssignee, 'online', parsed.at || new Date().toISOString());
    }
    if (actorAssignee && parsed.type === 'worker.offline') {
      updateWorkerPresence(rt, actorAssignee, 'offline', parsed.at || new Date().toISOString());
    }

    if (runId && taskId && parsed.type === 'contract.delivered' && projectionHasDelegation(rt, runId, taskId)) {
      const notified = rt.eventProjection.deliveredNotifiedByRun[runId] || [];
      if (!notified.includes(taskId)) {
        rt.eventProjection.deliveredNotifiedByRun[runId] = pushUnique(notified, taskId);
      }
    }

    if (runId && taskId && parsed.type === 'contract.validated' && projectionHasDelegation(rt, runId, taskId)) {
      const notified = rt.eventProjection.validatedNotifiedByRun[runId] || [];
      if (!notified.includes(taskId)) {
        rt.eventProjection.validatedNotifiedByRun[runId] = pushUnique(notified, taskId);
      }
    }

    if (runId && taskId && parsed.type === 'task.completed' && projectionHasDelegation(rt, runId, taskId)) {
      const notified = rt.eventProjection.completedNotifiedByRun[runId] || [];
      if (!notified.includes(taskId)) {
        rt.eventProjection.completedNotifiedByRun[runId] = pushUnique(notified, taskId);
      }
    }

    if (rt.operatingMode === 'pm' && rt.listenMode && runId && parsed.type === 'run.blocked') {
      if (!rt.eventProjection.blockedNotifiedRuns.includes(runId)) {
        rt.eventProjection.blockedNotifiedRuns = pushUnique(rt.eventProjection.blockedNotifiedRuns, runId);
        const reasons = Array.isArray((parsed.data as any)?.reasons)
          ? ((parsed.data as any).reasons as unknown[]).filter((item): item is string => typeof item === 'string')
          : [];
        sendOrchestrationMessage(rt, ctx, [
          `Run ${runId} is BLOCKED${reasons.length > 0 ? ` (${reasons.join(', ')})` : ''}.`,
          'Review stale/failed tasks and re-delegate as needed.',
        ]);
      }
    }

    if (rt.operatingMode === 'pm' && rt.listenMode && runId && parsed.type === 'run.closed') {
      const result = String((parsed.data || {}).result || 'unknown');
      rt.eventProjection.runClosedByRun[runId] = result;

      if (!rt.eventProjection.closedNotifiedRuns.includes(runId)) {
        rt.eventProjection.closedNotifiedRuns = pushUnique(rt.eventProjection.closedNotifiedRuns, runId);
        const openTasks = Array.isArray((parsed.data as any)?.openTasks) ? (parsed.data as any).openTasks as unknown[] : [];
        sendOrchestrationMessage(rt, ctx, [
          `Run ${runId} closed with result: ${result}.`,
          result === 'success' ? 'All delegated tasks reached terminal success states.' : `Remaining/open tasks: ${openTasks.length}.`,
        ]);
      }

      if (rt.activeRunId === runId) {
        rt.activeRunId = null;
      }
    }
  }

  rt.eventProjection.cursor = lines.length;
  persistState(rt);
}

// ── Delegation event emission ──────────────────────────────────────────

export function maybeEmitDelegatedEvent(rt: Rt, task: import('@brainfile/core').Task, ctx: ExtensionContext, source: string): void {
  if (rt.operatingMode !== 'pm') return;

  const contractStatus = String((task.contract as any)?.status || '');
  const assignee = normalizeAssignee(task.assignee);
  if (contractStatus !== 'ready' || !assignee) return;

  if (rt.activeRunId && !isRunClosed(rt, rt.activeRunId)) {
    // Use existing run
  } else {
    rt.activeRunId = createRunId();
    emitEvent(rt, 'run.started', ctx, source, {
      runId: rt.activeRunId,
      data: {
        mode: rt.operatingMode,
      },
    });
    adoptOrphanedTasksForRun(rt, ctx, rt.activeRunId!, `${source}:adopt`);
    persistState(rt);
  }

  const runId = rt.activeRunId;
  if (!runId) return;
  if (projectionHasDelegation(rt, runId, task.id)) return;

  emitEvent(rt, 'contract.delegated', ctx, source, {
    taskId: task.id,
    runId,
    assignee,
    data: {
      contractStatus,
    },
  });

  rt.eventProjection.delegatedByRun[runId] = pushUnique(rt.eventProjection.delegatedByRun[runId], task.id);
  rt.eventProjection.taskRun[task.id] = runId;
  persistState(rt);
}
