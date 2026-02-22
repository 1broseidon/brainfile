import type { ExtensionContext } from '@mariozechner/pi-coding-agent';
import * as fs from 'fs';
import * as path from 'path';
import { readTasksDir, taskFileName } from '@brainfile/core';

import type { Rt, LocatedTask } from './types';
import { LISTENER_SAFETY_POLL_INTERVAL_MS } from './constants';
import { persistState } from './state';
import { refreshBoardContext, locateTask } from './board';
import { normalizeAssignee, assigneeBase, isPoolAssignee, getEffectiveListenerAssignee, getWorkerAvailabilitySnapshot, formatWorkerLoad, maybeEmitWorkerPresenceHeartbeat, emitWorkerOffline, releaseWorkerAssigneeClaim } from './worker';
import { ensureEventsLogExists, processEventLog, emitEvent, isRunClosed } from './events';
import { refreshPmLock, maybeEvaluateActiveRun, createRunId, tryAcquirePmLock, startPmLockRefreshTimer, adoptOrphanedTasksForRun } from './pm';
import { pickupContract } from './contract';

// ── Pure helpers ───────────────────────────────────────────────────────

export function listenerNoopMessage(reason: string | undefined, assignee: string, activeTaskId: string | null): string {
  if (reason === 'no_board') return 'No brainfile board found for listener.';
  if (reason === 'no_assignee') return 'Listener has no assignee identity.';
  if (reason === 'active_task') return `Listener is idle: active task ${activeTaskId} already selected.`;
  if (reason === 'no_contracts') return `No ready contracts assigned to "${assignee}".`;
  if (reason === 'paused') return 'Listener paused while user input is being processed.';
  if (reason === 'pickup_failed') return 'Listener found a contract but pickup failed due to status race.';
  return 'Listener did not pick up any task.';
}

function priorityRank(priority: string | undefined): number {
  if (priority === 'critical') return 0;
  if (priority === 'high') return 1;
  if (priority === 'medium') return 2;
  if (priority === 'low') return 3;
  return 4;
}

// ── Contract discovery ─────────────────────────────────────────────────

export function getReadyContractsForAssignee(rt: Rt, assignee: string): LocatedTask[] {
  if (!rt.boardContext) return [];

  const normalizedAssignee = normalizeAssignee(assignee);
  if (!normalizedAssignee) return [];

  const matches: LocatedTask[] = [];

  for (const doc of readTasksDir(rt.boardContext.boardDir)) {
    const contractStatus = (doc.task.contract as any)?.status;
    if (contractStatus !== 'ready') continue;
    if (isPoolAssignee(doc.task.assignee)) {
      // any idle worker can claim
    } else {
      const taskNorm = normalizeAssignee(doc.task.assignee);
      if (taskNorm !== normalizedAssignee && !(taskNorm === 'worker' && assigneeBase(normalizedAssignee) === 'worker')) {
        continue; // specific worker-N only
      }
    }

    matches.push({
      task: doc.task,
      body: doc.body,
      filePath: doc.filePath || path.join(rt.boardContext.boardDir, taskFileName(doc.task.id)),
      isLog: false,
    });
  }

  matches.sort((a, b) => {
    const byPriority = priorityRank(a.task.priority as any) - priorityRank(b.task.priority as any);
    if (byPriority !== 0) return byPriority;

    const aDue = a.task.dueDate || '9999-12-31';
    const bDue = b.task.dueDate || '9999-12-31';
    if (aDue !== bDue) return aDue.localeCompare(bDue);

    const aCreated = a.task.createdAt || '';
    const bCreated = b.task.createdAt || '';
    if (aCreated !== bCreated) return aCreated.localeCompare(bCreated);

    return a.task.id.localeCompare(b.task.id);
  });

  return matches;
}

// ── Auto-pickup ────────────────────────────────────────────────────────

function activeTaskBlocksAutoPickup(rt: Rt): boolean {
  if (!rt.activeTaskId) return false;

  const located = locateTask(rt, rt.activeTaskId, false);
  if (!located) return false;

  return !located.isLog;
}

export function attemptAutoPickupAssignedContract(rt: Rt, ctx: ExtensionContext): {
  picked: boolean;
  assignee: string;
  reason?: string;
  task?: LocatedTask;
} {
  const refreshed = refreshBoardContext(rt, ctx.cwd);
  const assignee = getEffectiveListenerAssignee(rt, ctx);

  if (!refreshed.ok || !rt.boardContext) {
    return { picked: false, assignee, reason: 'no_board' };
  }

  if (!normalizeAssignee(assignee)) {
    return { picked: false, assignee, reason: 'no_assignee' };
  }

  if (activeTaskBlocksAutoPickup(rt)) {
    return { picked: false, assignee, reason: 'active_task' };
  }

  const candidates = getReadyContractsForAssignee(rt, assignee);
  if (candidates.length === 0) {
    return { picked: false, assignee, reason: 'no_contracts' };
  }

  const chosen = candidates[0];
  const pickup = pickupContract(chosen, assignee, 'listener');
  if (!pickup.ok) {
    return { picked: false, assignee, reason: 'pickup_failed' };
  }

  rt.activeTaskId = pickup.task.task.id;
  rt.activeTaskPath = pickup.task.filePath;
  emitEvent(rt, 'contract.picked_up', ctx, 'listener', {
    taskId: pickup.task.task.id,
    assignee,
    data: {
      status: 'in_progress',
    },
  });
  persistState(rt);

  return {
    picked: true,
    assignee,
    task: pickup.task,
  };
}

// ── Auto-start ─────────────────────────────────────────────────────────

export function autoStartPickedTask(
  rt: Rt,
  task: LocatedTask,
  assignee: string,
  ctx: ExtensionContext,
  options?: { wasJustPicked?: boolean }
) {
  const wasJustPicked = options?.wasJustPicked !== false;

  if (!rt.listenerAutoStart) {
    if (wasJustPicked) {
      ctx.ui.notify(`🧠 Listener picked up ${task.task.id} for "${assignee}" and is waiting.`, 'success');
    }
    return;
  }

  const prompt = [
    '[BRAINFILE LISTENER]',
    wasJustPicked
      ? `Contract auto-picked for assignee "${assignee}".`
      : `Active contract for assignee "${assignee}" is already in progress.`,
    `Start implementing task ${task.task.id} now.`,
    'Follow contract constraints and update Brainfile status as you work.',
  ].join('\n');

  if (ctx.isIdle()) {
    rt.pi.sendUserMessage(prompt);
  } else {
    rt.pi.sendUserMessage(prompt, { deliverAs: 'followUp' });
  }

  const actionText = wasJustPicked ? 'picked up' : 'resumed';
  ctx.ui.notify(`🧠 Listener ${actionText} ${task.task.id} for "${assignee}" and started work.`, 'success');
}

// ── Listener cycle ─────────────────────────────────────────────────────

export function runListenerCycle(rt: Rt, ctx: ExtensionContext, source: 'watch' | 'interval' | 'manual' | 'startup') {
  if (!rt.listenMode) return;
  if (rt.listenerPausedForUserInput) {
    if (source === 'manual') {
      ctx.ui.notify(listenerNoopMessage('paused', getEffectiveListenerAssignee(rt, ctx), rt.activeTaskId), 'info');
    }
    rt.updateStatus(ctx);
    return;
  }
  if (rt.listenerBusy) return;

  rt.listenerBusy = true;
  try {
    processEventLog(rt, ctx);

    if (rt.operatingMode === 'pm') {
      // Keep PM lock fresh while the listener is active
      if (rt.pmLockHeld) refreshPmLock(rt);
      maybeEvaluateActiveRun(rt, ctx, `listener:${source}`);
      rt.updateStatus(ctx);
      if (source === 'manual') {
        const tracked = rt.activeRunId ? (rt.eventProjection.delegatedByRun[rt.activeRunId] || []).length : 0;
        const workers = getWorkerAvailabilitySnapshot(rt);
        const available = workers.available.length > 0
          ? workers.available.map((worker) => formatWorkerLoad(worker)).join(', ')
          : 'none';
        ctx.ui.notify(
          rt.activeRunId
            ? `Main listener active. Run ${rt.activeRunId} tracking ${tracked} delegated task(s).\nAvailable workers: ${available}.\nStale timeout: ${rt.staleTimeoutSeconds}s.`
            : `Main listener active, but no runId is set.\nAvailable workers: ${available}.\nStale timeout: ${rt.staleTimeoutSeconds}s.`,
          'info'
        );
      }
      return;
    }

    maybeEmitWorkerPresenceHeartbeat(rt, ctx, `listener:${source}`);

    const result = attemptAutoPickupAssignedContract(rt, ctx);

    if (result.picked && result.task) {
      rt.updateStatus(ctx);
      autoStartPickedTask(rt, result.task, result.assignee, ctx);
      return;
    }

    rt.updateStatus(ctx);

    if (source === 'manual' && rt.listenerAutoStart && result.reason === 'active_task' && rt.activeTaskId) {
      const activeLocated = locateTask(rt, rt.activeTaskId, false);
      const contractStatus = (activeLocated?.task.contract as any)?.status;
      if (activeLocated && contractStatus === 'in_progress') {
        autoStartPickedTask(rt, activeLocated, result.assignee, ctx, { wasJustPicked: false });
        return;
      }
    }

    if (source === 'manual') {
      ctx.ui.notify(listenerNoopMessage(result.reason, result.assignee, rt.activeTaskId), 'info');
    }
  } catch (error) {
    if (source !== 'interval' && source !== 'watch') {
      ctx.ui.notify(`Listener error: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  } finally {
    rt.listenerBusy = false;
  }
}

// ── Listener start/stop ────────────────────────────────────────────────

export function stopListener(rt: Rt) {
  if (rt.listenerWatcher) {
    try {
      rt.listenerWatcher.close();
    } catch {
      // best-effort cleanup
    }
    rt.listenerWatcher = null;
  }

  if (rt.listenerTimer) {
    clearInterval(rt.listenerTimer);
    rt.listenerTimer = null;
  }

  rt.listenerBusy = false;
  rt.listenerPausedForUserInput = false;
}

export function startListener(rt: Rt, ctx: ExtensionContext) {
  stopListener(rt);

  if (rt.boardContext) {
    ensureEventsLogExists(rt);
    try {
      rt.listenerWatcher = fs.watch(rt.boardContext.eventsLogPath, (eventType) => {
        if (eventType !== 'change') return;
        runListenerCycle(rt, ctx, 'watch');
      });
      rt.listenerWatcher.on('error', () => {
        // fs.watch can be unreliable on some filesystems; the safety poll remains active.
      });
    } catch {
      rt.listenerWatcher = null;
    }
  }

  // Safety net for environments where fs.watch misses events (e.g. NFS/WSL1).
  rt.listenerTimer = setInterval(() => {
    runListenerCycle(rt, ctx, 'interval');
  }, LISTENER_SAFETY_POLL_INTERVAL_MS);
}

// ── Listen mode toggle ─────────────────────────────────────────────────

export function setListenMode(rt: Rt, enabled: boolean, ctx: ExtensionContext, source: 'manual' | 'startup' = 'manual') {
  if (source === 'manual') {
    rt.listenerConfiguredExplicitly = true;
  }

  if (enabled === rt.listenMode) {
    if (enabled && !rt.listenerTimer) {
      startListener(rt, ctx);
    }
    if (source === 'manual') {
      ctx.ui.notify(`Brainfile listener is already ${enabled ? 'enabled' : 'disabled'}.`, 'info');
    }
    rt.updateStatus(ctx);
    return;
  }

  rt.listenMode = enabled;
  rt.listenerPausedForUserInput = false;

  if (enabled) {
    if (rt.operatingMode === 'pm') {
      // Ensure we hold the PM lock before creating a run
      if (!rt.pmLockHeld) tryAcquirePmLock(rt);
      if (rt.pmLockHeld) startPmLockRefreshTimer(rt);

      const hadRun = Boolean(rt.activeRunId && !isRunClosed(rt, rt.activeRunId));
      if (!rt.activeRunId || isRunClosed(rt, rt.activeRunId)) {
        rt.activeRunId = createRunId();
      }
      if (!hadRun && rt.activeRunId) {
        emitEvent(rt, 'run.started', ctx, source, {
          runId: rt.activeRunId,
          data: {
            mode: rt.operatingMode,
          },
        });
        adoptOrphanedTasksForRun(rt, ctx, rt.activeRunId, `listen:${source}:adopt`);
      }
    }

    startListener(rt, ctx);
    const workMode = rt.listenerAutoStart ? 'start' : 'wait';
    const modeLabel = rt.operatingMode === 'pm' ? `pm run ${rt.activeRunId || 'none'}` : getEffectiveListenerAssignee(rt, ctx);
    const orchestrationHint = rt.operatingMode === 'pm'
      ? ' Event-driven orchestration is active; avoid sleep/poll waits.'
      : '';
    ctx.ui.notify(`Brainfile listener enabled (${modeLabel}, ${workMode} mode).${orchestrationHint}`, 'success');
    if (rt.operatingMode === 'worker') {
      maybeEmitWorkerPresenceHeartbeat(rt, ctx, `listen:${source}`);
    }
    runListenerCycle(rt, ctx, source);
  } else {
    stopListener(rt);
    if (rt.operatingMode === 'pm') {
      rt.activeRunId = null;
    } else if (rt.workerOnlineEmitted) {
      emitWorkerOffline(rt, ctx, `listen:${source}`);
    } else {
      releaseWorkerAssigneeClaim(rt);
    }
    ctx.ui.notify('Brainfile listener disabled.', 'info');
  }

  persistState(rt);
  rt.updateStatus(ctx);
}
