import type { ExtensionAPI, ExtensionContext } from '@mariozechner/pi-coding-agent';
import { truncateToWidth, visibleWidth } from '@mariozechner/pi-tui';
import * as path from 'path';

import type { EventProjection, Rt } from './types';
import {
  STATUS_KEY,
  WIDGET_KEY,
  STATE_ENTRY_TYPE,
  BF_MUTATING_TOOLS,
  WRITE_BUILTINS,
} from './constants';
import { createRt, persistState, normalizeEventProjection } from './state';
import {
  refreshBoardContext,
  ensureBoardContext,
  readBoardConfig,
  locateTask,
  findChildTasks,
  taskSummary,
  boardSummary,
  resolveColumn,
  getColumns,
  columnTitleForId,
  normalizeColumnInput,
  extractDescription,
  isTaskCompletable,
} from './board';
import {
  normalizeAssignee,
  assigneeMatches,
  getEffectiveListenerAssignee,
  getWorkerAvailabilitySnapshot,
  getInProgressTaskOwnersSnapshot,
  formatWorkerLoad,
  resolveOperatingMode,
  releaseWorkerAssigneeClaim,
  emitWorkerOffline,
  maybeEmitWorkerPresenceHeartbeat,
  cleanupStaleWorkerClaims,
} from './worker';
import {
  emitEvent,
  isRunClosed,
  maybeEmitDelegatedEvent,
} from './events';
import {
  createRunId,
  tryAcquirePmLock,
  releasePmLock,
  startPmLockRefreshTimer,
  stopPmLockRefreshTimer,
  isPmClaimedByOther,
  adoptOrphanedTasksForRun,
  tryPromoteAutoWorkerToPm,
} from './pm';
import {
  asJson,
  isSafePlanBashCommand,
  makeToolResponse,
  normalizePathInput,
  extractRuleText,
  getNextRuleId,
  applyTaskPatch,
  ensureTaskHasContract,
  getContractStatus,
  pickupContract,
  deliverContractWithEvidence,
  runContractValidation,
  formatValidationFeedback,
  setContractStatus,
  parseDeliverableSpecs,
  buildContractContextPayload,
} from './contract';
import {
  stopListener,
  setListenMode,
  runListenerCycle,
} from './listener';
import {
  requestTaskPickupAuthorization,
  buildClaimDecisionOrchestration,
} from './scheduler';
import { createLocalMessageBus, type MessageBus } from './bus';
import { registerBrainfileTools } from './tools';
import { moveTaskFile, readTasksDir as readTasksDirFn } from '@brainfile/core';

// ── Extension entry point ──────────────────────────────────────────────

export default function brainfileExtension(pi: ExtensionAPI) {
  const rt: Rt = createRt(pi);

function getShortModelName(modelId: string): string {
  if (!modelId) return 'unknown';
  const parts = modelId.split('/');
  let name = parts[parts.length - 1];
  
  const prefixes = ['claude-3-5-', 'claude-3-', 'claude-', 'gpt-4o-', 'gpt-4-', 'gemini-1.5-', 'gemini-'];
  for (const p of prefixes) {
    if (name.startsWith(p)) {
      name = name.slice(p.length);
      break;
    }
  }
  
  const suffixes = ['-latest', '-20250514', '-20241022', '-20240229', '-0125', '-1106', '-0613'];
  for (const s of suffixes) {
    if (name.endsWith(s)) name = name.slice(0, -s.length);
  }
  return name;
}

let tuiRef: any = null;
let messageBus: MessageBus | null = null;
let disposeMessageBusSubscriptions: Array<() => void> = [];

function teardownMessageBus() {
  for (const dispose of disposeMessageBusSubscriptions) {
    try {
      dispose();
    } catch {
      // best effort
    }
  }
  disposeMessageBusSubscriptions = [];

  if (messageBus) {
    messageBus.stop();
    messageBus = null;
  }

  rt.publishAuditAppendNotice = null;
}

function setupMessageBus(ctx: ExtensionContext) {
  teardownMessageBus();

  if (!rt.boardContext) {
    return;
  }

  messageBus = createLocalMessageBus(rt.boardContext.stateDir);

  disposeMessageBusSubscriptions.push(
    messageBus.subscribe((notice) => {
      if (!rt.boardContext) return;

      const localLogPath = path.resolve(rt.boardContext.eventsLogPath);
      const remoteLogPath = path.resolve(notice.logPath);
      if (localLogPath !== remoteLogPath) return;
      if (!rt.listenMode) return;

      runListenerCycle(rt, ctx, 'watch');
    })
  );

  disposeMessageBusSubscriptions.push(
    messageBus.onLifecycle((event) => {
      if (!rt.listenMode) return;
      if (event.state !== 'connected' && event.state !== 'reconnected') return;

      // Catch up any missed audit rows after transport reconnect.
      runListenerCycle(rt, ctx, 'startup');
    })
  );

  rt.publishAuditAppendNotice = (notice) => {
    if (!messageBus) return;
    messageBus.publishAuditAppend(notice);
  };

  messageBus.start();
}


  // ── UI state ───────────────────────────────────────────────────────

  function autoClearCompletedActiveTask(ctx: ExtensionContext): boolean {
    if (!rt.activeTaskId) return false;

    const located = locateTask(rt, rt.activeTaskId, true);
    if (!located || !located.isLog) return false;

    const clearedId = rt.activeTaskId;
    rt.activeTaskId = null;
    rt.activeTaskPath = null;
    persistState(rt);

    ctx.ui.notify(`Active task ${clearedId} completed and archived. Auto-cleared active context.`, 'info');
    return true;
  }

  function updateStatus(ctx: ExtensionContext) {
    autoClearCompletedActiveTask(ctx);

    if (tuiRef) {
      tuiRef.requestRender();
    }

    if (!rt.boardContext || !rt.activeTaskId) {
      ctx.ui.setWidget(WIDGET_KEY, undefined);
      return;
    }

    const located = locateTask(rt, rt.activeTaskId, true);
    if (!located) {
      ctx.ui.setWidget(WIDGET_KEY, undefined);
      return;
    }

    const board = readBoardConfig(rt);
    const summary = taskSummary(rt, located, board);

    const lines: string[] = [];
    
    // Line 1
    const titleTruncated = summary.title.length > 50 ? summary.title.slice(0, 49) + '…' : summary.title;
    const contractStatus = (summary.contract as any)?.status || 'none';
    lines.push(`${summary.id}: ${titleTruncated}  ${summary.column} → ${contractStatus}`);

    // Line 2
    if (rt.operatingMode === 'pm') {
      const workers = getWorkerAvailabilitySnapshot(rt);
      const taskOwners = getInProgressTaskOwnersSnapshot(rt);
      if (workers.available.length > 0) {
        const workerInfos = workers.available.map((w: any) => {
          const wModel = (w.model || '').split('/').pop() || 'unknown';
          const shortModel = getShortModelName(wModel);
          const snapshot = taskOwners[normalizeAssignee(w.worker) || w.worker];
          const stateStr = snapshot?.activeTaskId || 'idle';
          return `⬡ ${w.worker} (${shortModel}) ${stateStr}`;
        });
        lines.push(workerInfos.join('  '));
      }
    } else {
      const subtasks = summary.subtasks || [];
      if (subtasks.length > 0) {
        const completed = subtasks.filter((s: any) => s.completed).length;
        lines.push(`☑ ${completed}/${subtasks.length} subtasks`);
      }
    }

    ctx.ui.setWidget(WIDGET_KEY, lines.length > 1 ? lines : lines.slice(0, 1));
  }

  // Wire updateStatus into rt so modules can call it
  rt.updateStatus = updateStatus;

  // ── Plan mode ──────────────────────────────────────────────────────

  function setPlanMode(enabled: boolean, ctx: ExtensionContext) {
    if (enabled === rt.planMode) return;

    if (enabled) {
      rt.toolsBeforePlan = pi.getActiveTools();
      const planTools = rt.toolsBeforePlan.filter((toolName) => {
        if (WRITE_BUILTINS.has(toolName)) return false;
        if (BF_MUTATING_TOOLS.has(toolName)) return false;
        return true;
      });
      pi.setActiveTools(planTools);
      rt.planMode = true;
      ctx.ui.notify('Brainfile plan mode enabled: mutating tools disabled.', 'info');
    } else {
      if (rt.toolsBeforePlan) {
        pi.setActiveTools(rt.toolsBeforePlan);
      }
      rt.toolsBeforePlan = null;
      rt.planMode = false;
      ctx.ui.notify('Brainfile plan mode disabled: tool access restored.', 'info');
    }

    persistState(rt);
    updateStatus(ctx);
  }

  // ── Task picking ───────────────────────────────────────────────────

  async function pickTaskInteractively(ctx: ExtensionContext): Promise<void> {
    if (!rt.boardContext) return;

    const board = readBoardConfig(rt);
    const docs = readTasksDirFn(rt.boardContext.boardDir);
    if (docs.length === 0) {
      ctx.ui.notify('No active tasks found in .brainfile/board/.', 'warning');
      return;
    }

    const choices = docs.map((doc: any) => {
      const colTitle = columnTitleForId(doc.task.column, board);
      return `${doc.task.id} · ${doc.task.title} [${colTitle}]`;
    });

    const selection = await ctx.ui.select('Select active Brainfile task:', choices);
    if (!selection) return;

    const taskId = selection.split(' · ')[0];
    rt.activeTaskId = taskId;
    const located = locateTask(rt, taskId, true);
    rt.activeTaskPath = located?.filePath || null;

    persistState(rt);
    updateStatus(ctx);
    ctx.ui.notify(`Active task set to ${taskId}`, 'info');
  }

  function setActiveTask(taskId: string, ctx: ExtensionContext): boolean {
    const located = locateTask(rt, taskId, true);
    if (!located) {
      ctx.ui.notify(`Task not found: ${taskId}`, 'error');
      return false;
    }

    rt.activeTaskId = taskId;
    rt.activeTaskPath = located.filePath;
    persistState(rt);
    updateStatus(ctx);
    return true;
  }

  // ── /listen command handler ────────────────────────────────────────

  async function handleListenCommand(actionParts: string[], ctx: ExtensionContext): Promise<void> {
    const action = (actionParts[0] || '').toLowerCase();

    if (!action) {
      setListenMode(rt, !rt.listenMode, ctx);
      return;
    }

    if (action === 'on' || action === 'enable') {
      setListenMode(rt, true, ctx);
      return;
    }

    if (action === 'off' || action === 'disable') {
      setListenMode(rt, false, ctx);
      return;
    }

    if (action === 'status') {
      const effectiveAssignee = getEffectiveListenerAssignee(rt, ctx);
      const overrideText = rt.listenerAssigneeOverride ? `override: ${rt.listenerAssigneeOverride}` : 'override: auto';
      const workMode = rt.listenerAutoStart ? 'start (auto begin work)' : 'wait (pick up only)';
      const pauseText = rt.listenerPausedForUserInput ? 'paused by user input' : 'active';
      const roleSource = rt.operatingModeOverride
        ? `override (${rt.operatingModeOverride.toUpperCase()})`
        : `auto`;
      const runInfo = rt.operatingMode === 'pm'
        ? (() => {
            const workers = getWorkerAvailabilitySnapshot(rt);
            const availableWorkers = workers.available.length > 0
              ? workers.available.map((worker) => formatWorkerLoad(worker)).join(', ')
              : 'none';
            return `Run: ${rt.activeRunId || 'none'}\nTracked delegations: ${rt.activeRunId ? (rt.eventProjection.delegatedByRun[rt.activeRunId] || []).length : 0}\nAvailable workers: ${availableWorkers}\nStale timeout: ${rt.staleTimeoutSeconds}s\nOrchestration: event-driven (no sleep/poll waits)`;
          })()
        : `Assignee: ${effectiveAssignee}\n${overrideText}`;
      ctx.ui.notify(
        `Mode: ${rt.operatingMode.toUpperCase()}\nRole source: ${roleSource}\nListener: ${rt.listenMode ? 'ON' : 'OFF'} (${pauseText})\n${runInfo}\nWork mode: ${workMode}`,
        'info'
      );
      updateStatus(ctx);
      return;
    }

    if (action === 'role') {
      const value = (actionParts[1] || '').toLowerCase();

      if (!value || value === 'status') {
        const sourceText = rt.operatingModeOverride
          ? `override (${rt.operatingModeOverride.toUpperCase()})`
          : `auto`;
        ctx.ui.notify(`Role source: ${sourceText}\nEffective mode: ${rt.operatingMode.toUpperCase()}`, 'info');
        return;
      }

      let nextOverride: 'pm' | 'worker' | null = rt.operatingModeOverride;
      if (value === 'auto' || value === 'model' || value === 'default') {
        nextOverride = null;
      } else if (value === 'pm' || value === 'main' || value === 'planner' || value === 'orchestrator') {
        nextOverride = 'pm';
      } else if (value === 'worker' || value === 'agent') {
        nextOverride = 'worker';
      } else {
        ctx.ui.notify('Usage: /listen role <pm|worker|auto>', 'warning');
        return;
      }

      const previousMode = rt.operatingMode;
      rt.operatingModeOverride = nextOverride;
      rt.operatingMode = resolveOperatingMode(rt, ctx);

      let autoDemotedPmHolder: string | null = null;
      if (rt.operatingMode === 'pm') {
        const pmCheck = isPmClaimedByOther(rt);
        if (pmCheck.claimed && !rt.operatingModeOverride) {
          rt.operatingMode = 'worker';
          autoDemotedPmHolder = pmCheck.holder || 'unknown';
        } else if (!tryAcquirePmLock(rt)) {
          if (!rt.operatingModeOverride) {
            rt.operatingMode = 'worker';
            autoDemotedPmHolder = 'pm-lock (race)';
          }
        } else {
          startPmLockRefreshTimer(rt);
        }
      }

      if (!rt.operatingModeOverride && rt.operatingMode === 'worker') {
        const autoPromoted = tryPromoteAutoWorkerToPm(rt, ctx, 'listen.role');
        if (autoPromoted.promoted) {
          autoDemotedPmHolder = null;
        }
      }

      if (previousMode === 'worker' && rt.operatingMode !== 'worker' && rt.workerOnlineEmitted) {
        emitWorkerOffline(rt, ctx, 'listen.role');
      } else if (previousMode === 'worker' && rt.operatingMode !== 'worker') {
        releaseWorkerAssigneeClaim(rt);
      }

      if (previousMode === 'pm' && rt.operatingMode !== 'pm') {
        releasePmLock(rt);
        stopPmLockRefreshTimer(rt);
      }

      if (rt.operatingMode !== 'pm') {
        rt.activeRunId = null;
      } else if (rt.listenMode && (!rt.activeRunId || isRunClosed(rt, rt.activeRunId))) {
        rt.activeRunId = createRunId();
        emitEvent(rt, 'run.started', ctx, 'listen.role', {
          runId: rt.activeRunId,
          data: { mode: rt.operatingMode },
        });
        adoptOrphanedTasksForRun(rt, ctx, rt.activeRunId, 'listen.role:adopt');
      }

      persistState(rt);

      if (!rt.listenerConfiguredExplicitly && previousMode !== rt.operatingMode) {
        setListenMode(rt, rt.operatingMode === 'worker', ctx, 'startup');
      } else {
        updateStatus(ctx);
      }

      if (rt.listenMode) {
        runListenerCycle(rt, ctx, 'manual');
      }

      const sourceText = rt.operatingModeOverride
        ? `override (${rt.operatingModeOverride.toUpperCase()})`
        : `auto`;
      ctx.ui.notify(`Operating mode set to ${rt.operatingMode.toUpperCase()} (${sourceText}).`, 'success');
      if (autoDemotedPmHolder) {
        ctx.ui.notify(
          `Detected active PM (${autoDemotedPmHolder}). Auto-switching this session to Worker mode to avoid PM conflicts. Use /listen role pm to override.`,
          'info'
        );
      }
      return;
    }

    if (action === 'mode' || action === 'work') {
      const value = (actionParts[1] || '').toLowerCase();

      if (!value || value === 'status') {
        ctx.ui.notify(`Work mode: ${rt.listenerAutoStart ? 'start' : 'wait'}`, 'info');
        return;
      }

      if (value === 'start' || value === 'on' || value === 'auto') {
        rt.listenerConfiguredExplicitly = true;
        rt.listenerAutoStart = true;
        persistState(rt);
        updateStatus(ctx);
        ctx.ui.notify('Listener work mode set to start.', 'success');
        if (rt.listenMode) {
          runListenerCycle(rt, ctx, 'manual');
        }
        return;
      }

      if (value === 'wait' || value === 'off') {
        rt.listenerConfiguredExplicitly = true;
        rt.listenerAutoStart = false;
        persistState(rt);
        updateStatus(ctx);
        ctx.ui.notify('Listener work mode set to wait.', 'info');
        return;
      }

      ctx.ui.notify('Usage: /listen mode <start|wait>', 'warning');
      return;
    }

    if (action === 'now') {
      runListenerCycle(rt, ctx, 'manual');
      return;
    }

    if (action === 'as' || action === 'assignee' || action === 'asignee') {
      const assignee = normalizeAssignee(actionParts.slice(1).join(' '));
      if (!assignee) {
        ctx.ui.notify('Usage: /listen assignee <name>', 'warning');
        return;
      }

      rt.listenerConfiguredExplicitly = true;
      rt.listenerAssigneeOverride = assignee;
      if (rt.operatingMode === 'worker') {
        releaseWorkerAssigneeClaim(rt);
      }
      persistState(rt);
      updateStatus(ctx);
      ctx.ui.notify(`Listener assignee override set to "${assignee}".`, 'success');
      if (rt.listenMode) {
        runListenerCycle(rt, ctx, 'manual');
      }
      return;
    }

    if (action === 'auto') {
      rt.listenerConfiguredExplicitly = true;
      rt.listenerAssigneeOverride = null;
      rt.operatingMode = resolveOperatingMode(rt, ctx);

      if (!rt.operatingModeOverride && rt.operatingMode === 'worker') {
        const autoPromoted = tryPromoteAutoWorkerToPm(rt, ctx, 'listen.role');
        if (autoPromoted.promoted) {
          ctx.ui.notify('Listener role auto-promoted to PM after lock arbitration.', 'info');
        }
      }

      persistState(rt);
      updateStatus(ctx);
      ctx.ui.notify(`Listener assignee reset to auto (${getEffectiveListenerAssignee(rt, ctx)}).`, 'info');
      if (rt.listenMode) {
        runListenerCycle(rt, ctx, 'manual');
      }
      return;
    }

    ctx.ui.notify('Usage: /listen [on|off|status|now|assignee <name>|auto|mode <start|wait>|role <pm|worker|auto>]', 'warning');
  }

  // ── Event handlers ─────────────────────────────────────────────────

  pi.on('session_start', async (_event, ctx) => {
    stopListener(rt);
    teardownMessageBus();
    rt.operatingMode = resolveOperatingMode(rt, ctx);
    ctx.ui.setFooter((tui, theme, footerData) => {
      tuiRef = tui;
      const unsub = footerData.onBranchChange(() => tui.requestRender());
      return {
        dispose: () => {
          unsub();
          tuiRef = null;
        },
        invalidate() {},
        render(width: number): string[] {
          const icon = rt.listenMode ? (rt.listenerPausedForUserInput ? '🟡' : '🟢') : '⏸';
          const role = rt.operatingMode === 'pm' ? 'PM' : getEffectiveListenerAssignee(rt, ctx);
          let taskStr = 'no task';
          let planStr = rt.planMode ? '  📋 plan' : '';
          
          if (rt.activeTaskId) {
            const contractStatus = (locateTask(rt, rt.activeTaskId, true)?.task?.contract as any)?.status || 'working';
            taskStr = `${rt.activeTaskId} [${contractStatus}]`;
          } else if (rt.operatingMode === 'worker') {
            taskStr = 'idle';
          }
          
          let fmtIcon = icon;
          if (icon === '🟡' || icon === '⏸' || planStr) {
            fmtIcon = theme.fg('warning', icon);
            if (planStr) planStr = theme.fg('warning', planStr);
          }
          
          let fmtTaskStr = taskStr;
          if (rt.activeTaskId && taskStr.startsWith(rt.activeTaskId)) {
            fmtTaskStr = taskStr.replace(rt.activeTaskId, theme.fg('accent', rt.activeTaskId));
          }
          
          const left = `${fmtIcon} ${role}  ${fmtTaskStr}${planStr}`;
          
          const branch = footerData.getGitBranch() || 'main';
          const rawModelId = ctx.model ? ((ctx.model as any).id || '').split('/').pop() : 'unknown';
          const shortModel = getShortModelName(rawModelId);
          
          let rightStr = '';
          if (rt.operatingMode === 'pm') {
            const workers = getWorkerAvailabilitySnapshot(rt);
            rightStr = `${workers.available.length}↑ workers · ${shortModel} · ${branch}`;
          } else {
            const taskOwners = getInProgressTaskOwnersSnapshot(rt);
            const normalizedRole = normalizeAssignee(role) || role;
            const inProgressCount = taskOwners[normalizedRole]?.count || 0;
            if (inProgressCount === 1) {
              rightStr = `${shortModel} · idle after`;
            } else if (inProgressCount > 0) {
              rightStr = `${shortModel} · ${inProgressCount} active`;
            } else {
              rightStr = `${shortModel}`;
            }
          }
          const right = theme.fg('dim', rightStr);
          
          const pad = ' '.repeat(Math.max(1, width - visibleWidth(left) - visibleWidth(right)));
          return [truncateToWidth(left + pad + right, width)];
        }
      };
    });


    const refreshed = refreshBoardContext(rt, ctx.cwd);
    if (!refreshed.ok) {
      rt.listenMode = false;
      ctx.ui.notify(refreshed.error, 'warning');
      updateStatus(ctx);
      return;
    }

    if (rt.boardContext) {
      ctx.ui.notify(`Brainfile v2 found: ${path.relative(ctx.cwd, rt.boardContext.brainfilePath)}`, 'info');
      const cleanedClaims = cleanupStaleWorkerClaims(rt);
      if (cleanedClaims.removed > 0) {
        ctx.ui.notify(`Cleaned ${cleanedClaims.removed} stale worker claim lock(s).`, 'info');
      }
    }

    setupMessageBus(ctx);

    const stateEntry = ctx.sessionManager
      .getEntries()
      .filter((entry: any) => entry.type === 'custom' && entry.customType === STATE_ENTRY_TYPE)
      .pop() as {
      data?: {
        activeTaskId?: string;
        planMode?: boolean;
        listenMode?: boolean;
        listenerAssigneeOverride?: string | null;
        listenerAutoStart?: boolean;
        operatingMode?: 'pm' | 'worker';
        operatingModeOverride?: 'pm' | 'worker' | null;
        listenerConfiguredExplicitly?: boolean;
        activeRunId?: string | null;
        eventProjection?: EventProjection;
        autoWorkerAssignee?: string | null;
      };
    } | undefined;

    if (stateEntry?.data?.activeTaskId) {
      const located = locateTask(rt, stateEntry.data.activeTaskId, true);
      if (located && !located.isLog) {
        rt.activeTaskId = located.task.id;
        rt.activeTaskPath = located.filePath;
      } else {
        rt.activeTaskId = null;
        rt.activeTaskPath = null;
      }
    }

    rt.operatingModeOverride =
      stateEntry?.data?.operatingModeOverride === 'pm' || stateEntry?.data?.operatingModeOverride === 'worker'
        ? stateEntry.data.operatingModeOverride
        : null;

    rt.listenerConfiguredExplicitly = stateEntry?.data?.listenerConfiguredExplicitly === true;
    rt.listenerAssigneeOverride = stateEntry?.data?.listenerAssigneeOverride || null;
    rt.listenerAutoStart = stateEntry?.data?.listenerAutoStart !== false;
    rt.autoWorkerAssignee = normalizeAssignee(stateEntry?.data?.autoWorkerAssignee) || null;
    rt.activeRunId = typeof stateEntry?.data?.activeRunId === 'string' ? stateEntry.data.activeRunId : null;
    rt.eventProjection = normalizeEventProjection(stateEntry?.data?.eventProjection);
    rt.listenerPausedForUserInput = false;

    let autoDemotedPmHolder: string | null = null;
    
    if (rt.operatingModeOverride) {
      rt.operatingMode = rt.operatingModeOverride;
    } else {
      const promoted = tryPromoteAutoWorkerToPm(rt, ctx, 'session_start');
      if (!promoted.promoted && !promoted.blocked) {
        const pmCheck = isPmClaimedByOther(rt);
        if (pmCheck.claimed) {
          rt.operatingMode = 'worker';
          autoDemotedPmHolder = pmCheck.holder || 'unknown';
        } else {
          if (!tryAcquirePmLock(rt)) {
            rt.operatingMode = 'worker';
            autoDemotedPmHolder = 'pm-lock (race)';
          } else {
            rt.operatingMode = 'pm';
            startPmLockRefreshTimer(rt);
          }
        }
      }
    }

    if (rt.operatingMode !== 'pm') {
      rt.activeRunId = null;
      releasePmLock(rt);
      stopPmLockRefreshTimer(rt);
    }

    const shouldEnablePlanMode = stateEntry?.data?.planMode === true;
    if (shouldEnablePlanMode) {
      setPlanMode(true, ctx);
    } else {
      rt.planMode = false;
      rt.toolsBeforePlan = null;
    }

    const hasPersistedListenMode = typeof stateEntry?.data?.listenMode === 'boolean';
    const shouldEnableListenMode = rt.listenerConfiguredExplicitly && hasPersistedListenMode
      ? stateEntry?.data?.listenMode === true
      : rt.operatingMode === 'worker';

    if (shouldEnableListenMode) {
      setListenMode(rt, true, ctx, 'startup');
    } else {
      rt.listenMode = false;
      stopListener(rt);
    }

    const modeNotice = rt.operatingMode === 'worker'
      ? 'Brainfile mode: Worker mode (listener ON by default).'
      : 'Brainfile mode: PM mode (listener OFF by default).';
    const overrideNotice = rt.operatingModeOverride ? ` Role override active: ${rt.operatingModeOverride.toUpperCase()}.` : '';
    ctx.ui.notify(`${modeNotice}${overrideNotice}`, 'info');

    if (autoDemotedPmHolder) {
      ctx.ui.notify(
        `Detected active PM (${autoDemotedPmHolder}). Auto-switching this session to Worker mode to avoid PM conflicts. Use /listen role pm to override.`,
        'info'
      );
    }

    updateStatus(ctx);
  });

  pi.on('session_shutdown', async (_event, ctx) => {
    if (rt.operatingMode === 'worker' && rt.workerOnlineEmitted) {
      emitWorkerOffline(rt, ctx, 'session_shutdown');
    } else if (rt.operatingMode === 'worker') {
      releaseWorkerAssigneeClaim(rt);
    }

    if (rt.operatingMode === 'pm' && rt.activeRunId && !isRunClosed(rt, rt.activeRunId)) {
      emitEvent(rt, 'run.closed', ctx, 'session_shutdown', {
        runId: rt.activeRunId,
        data: {
          result: 'aborted',
          reason: 'session_shutdown',
        },
      });
      rt.eventProjection.runClosedByRun[rt.activeRunId] = 'aborted';
      rt.activeRunId = null;
      persistState(rt);
    }

    releasePmLock(rt);
    stopPmLockRefreshTimer(rt);
    stopListener(rt);
    teardownMessageBus();
  });

  pi.on('model_select', async (_event, ctx) => {
    const rawModelId = ctx.model ? ((ctx.model as any).id || '').split('/').pop() : 'unknown';
    ctx.ui.notify(
      `Model changed to ${rawModelId}. Identity and operating mode remain unchanged.`,
      'info'
    );
    
    if (rt.operatingMode === 'worker' && rt.listenMode) {
      maybeEmitWorkerPresenceHeartbeat(rt, ctx, 'model_select', true);
    }
    updateStatus(ctx);
  });

  pi.on('input', async (event, ctx) => {
    if (!rt.listenMode || rt.operatingMode !== 'worker') return;
    if (event.source === 'extension') return;
    if (ctx.isIdle()) return;

    rt.listenerPausedForUserInput = true;
    updateStatus(ctx);
  });

  pi.on('agent_end', async (_event, ctx) => {
    if (!rt.listenerPausedForUserInput) return;
    rt.listenerPausedForUserInput = false;
    updateStatus(ctx);
    if (rt.listenMode) {
      runListenerCycle(rt, ctx, 'startup');
    }
  });

  pi.on('tool_call', async (event) => {
    if (!rt.planMode) return;

    if (event.toolName === 'bash') {
      const command = String((event.input as any).command || '');
      if (!isSafePlanBashCommand(command)) {
        return {
          block: true,
          reason: `Plan mode: blocked bash command. Allowed commands are read-only. Command: ${command}`,
        };
      }
      return;
    }

    if (WRITE_BUILTINS.has(event.toolName) || BF_MUTATING_TOOLS.has(event.toolName)) {
      return {
        block: true,
        reason: `Plan mode: tool ${event.toolName} is disabled until plan mode is turned off.`,
      };
    }
  });

  pi.on('before_agent_start', async (_event, ctx) => {
    if (!rt.boardContext) return;

    const autoCleared = autoClearCompletedActiveTask(ctx);
    if (autoCleared) {
      updateStatus(ctx);
    }

    const parts: string[] = [];

    if (rt.planMode) {
      parts.push(`[BRAINFILE PLAN MODE]\nMutating tools are disabled. Analyze and plan only. Do not execute code or mutate tasks yet.`);
    }

    if (rt.operatingMode === 'pm' && rt.listenMode && rt.activeRunId) {
      parts.push(
        `[BRAINFILE ORCHESTRATION MODE]\n` +
          `Run ID: ${rt.activeRunId}\n` +
          `Delegated delivery updates are event-driven via the listener.\n` +
          `Do NOT use sleep/manual polling loops to wait for workers. Continue other orchestration work and react to orchestration notifications.`
      );
    }

    if (rt.activeTaskId) {
      const board = readBoardConfig(rt);
      const located = locateTask(rt, rt.activeTaskId, true);
      if (located) {
        const summary = taskSummary(rt, located, board);
        parts.push(
          `[BRAINFILE ACTIVE TASK]\n` +
            `ID: ${summary.id}\n` +
            `Title: ${summary.title}\n` +
            `Column: ${summary.column}\n` +
            `${summary.description ? `Description: ${summary.description}\n` : ''}` +
            `${summary.contract ? `Contract Status: ${(summary.contract as any).status || 'none'}\n` : ''}` +
            `${summary.subtasks.length > 0 ? `Subtasks:\n${summary.subtasks.map((s: any, i: number) => `${i + 1}. ${s.completed ? '[x]' : '[ ]'} ${s.title}`).join('\n')}` : 'Subtasks: none'}`
        );
      }
    }

    if (parts.length === 0) return;

    return {
      message: {
        customType: 'brainfile-context',
        content: parts.join('\n\n'),
        display: false,
      },
    };
  });

  // ── Commands ───────────────────────────────────────────────────────

  pi.registerCommand('bf', {
    description: 'Brainfile status and manual intervention commands',
    handler: async (args, ctx) => {
      if (!ensureBoardContext(rt, ctx).ok || !rt.boardContext) return;

      const parts = (args || '').trim().split(/\s+/).filter(Boolean);
      const subcommand = (parts[0] || 'pick').toLowerCase();

      if (subcommand === 'pick') {
        const taskArg = parts[1];
        if (taskArg) {
          if (setActiveTask(taskArg, ctx)) {
            ctx.ui.notify(`Active task set to ${taskArg}`, 'success');
          }
          return;
        }
        await pickTaskInteractively(ctx);
        return;
      }

      if (subcommand === 'status') {
        const board = readBoardConfig(rt);
        if (!rt.activeTaskId) {
          const listenerLabel = rt.operatingMode === 'pm'
            ? `main run ${rt.activeRunId || 'none'}`
            : getEffectiveListenerAssignee(rt, ctx);
          const listenerSuffix = rt.listenMode
            ? ` Listener is ON (${listenerLabel}, ${rt.listenerAutoStart ? 'start' : 'wait'}${rt.listenerPausedForUserInput ? ', paused' : ''}).`
            : '';
          const runSuffix = rt.operatingMode === 'pm'
            ? (() => {
                const workers = getWorkerAvailabilitySnapshot(rt);
                const availableWorkers = workers.available.length > 0
                  ? workers.available.map((worker) => formatWorkerLoad(worker)).join(', ')
                  : 'none';
                return ` Tracked delegations: ${rt.activeRunId ? (rt.eventProjection.delegatedByRun[rt.activeRunId] || []).length : 0}. Available workers: ${availableWorkers}. Stale timeout: ${rt.staleTimeoutSeconds}s.`;
              })()
            : '';
          ctx.ui.notify(
            `No active task selected. Mode: ${rt.operatingMode.toUpperCase()}.${rt.planMode ? ' Plan mode is ON.' : ''}${listenerSuffix}${runSuffix}`,
            'info'
          );
          updateStatus(ctx);
          return;
        }

        const located = locateTask(rt, rt.activeTaskId, true);
        if (!located) {
          ctx.ui.notify(`Active task ${rt.activeTaskId} no longer exists.`, 'warning');
          updateStatus(ctx);
          return;
        }

        const summary = taskSummary(rt, located, board);
        const completedSubtasks = summary.subtasks.filter((subtask: any) => subtask.completed).length;
        ctx.ui.notify(
          [
            `${summary.id}: ${summary.title}`,
            `Mode: ${rt.operatingMode.toUpperCase()}`,
            `Column: ${summary.column}`,
            `Contract: ${summary.contract ? (summary.contract as any).status || 'none' : 'none'}`,
            `Subtasks: ${completedSubtasks}/${summary.subtasks.length}`,
            `Plan mode: ${rt.planMode ? 'ON' : 'OFF'}`,
            `Listener: ${rt.listenMode ? `ON (${rt.operatingMode === 'pm' ? `main run ${rt.activeRunId || 'none'}` : getEffectiveListenerAssignee(rt, ctx)}, ${rt.listenerAutoStart ? 'start' : 'wait'}${rt.listenerPausedForUserInput ? ', paused' : ''})` : 'OFF'}`,
          ].join('\n'),
          'info'
        );
        updateStatus(ctx);
        return;
      }

      if (subcommand === 'board') {
        const summary = boardSummary(rt);
        const lines = [`${summary.title}`, `Total active tasks: ${summary.total}`];
        for (const column of summary.columns) {
          lines.push(`- ${column.title} (${column.id}): ${column.count}`);
        }
        ctx.ui.notify(lines.join('\n'), 'info');
        return;
      }

      if (subcommand === 'clear') {
        rt.activeTaskId = null;
        rt.activeTaskPath = null;
        persistState(rt);
        updateStatus(ctx);
        ctx.ui.notify('Active task cleared.', 'info');
        return;
      }

      if (subcommand === 'plan') {
        setPlanMode(!rt.planMode, ctx);
        return;
      }

      if (subcommand === 'listen') {
        await handleListenCommand(parts.slice(1), ctx);
        return;
      }

      if (subcommand === 'move') {
        if (parts.length < 3) {
          ctx.ui.notify('Usage: /bf move <task-id> <column-id-or-title>', 'warning');
          return;
        }

        const taskId = parts[1];
        const columnInput = parts.slice(2).join(' ');
        const board = readBoardConfig(rt);
        const resolvedCol = resolveColumn(columnInput, board);

        if (!resolvedCol) {
          ctx.ui.notify(`Unknown column: ${columnInput}`, 'error');
          return;
        }

        const located = locateTask(rt, taskId, false);
        if (!located) {
          ctx.ui.notify(`Task not found: ${taskId}`, 'error');
          return;
        }

        const hasContract = Boolean(located.task.contract && typeof located.task.contract === 'object');
        const contractStatus = String((located.task.contract as any)?.status || '').toLowerCase();
        if (resolvedCol.completionColumn && hasContract) {
          const actor = getEffectiveListenerAssignee(rt, ctx);

          if (rt.operatingMode !== 'pm') {
            emitEvent(rt, 'message.decision', ctx, 'command:move', {
              taskId,
              to: 'pm',
              threadId: `task:${taskId}`,
              data: {
                body: `Rejected completion move for ${taskId}: PM authority required.`,
                orchestration: {
                  action: 'terminal_transition',
                  decision: 'rejected',
                  reasonCode: 'authority_violation',
                  reasonDetails: 'Only PM mode can transition contracted tasks to completion.',
                  authority: {
                    required: 'pm',
                    enforced: true,
                    actor,
                  },
                },
              },
            });
            ctx.ui.notify('Only PM mode can move contracted tasks into completion columns.', 'error');
            return;
          }

          if (contractStatus !== 'done') {
            ctx.ui.notify(`Contracted task ${taskId} must be in done status before completion (current: ${contractStatus || 'none'}).`, 'error');
            return;
          }
        }

        const moveResult = moveTaskFile(located.filePath, resolvedCol.id);
        if (!moveResult.success) {
          ctx.ui.notify(moveResult.error || 'Failed to move task.', 'error');
          return;
        }

        if (rt.activeTaskId === taskId) {
          rt.activeTaskPath = located.filePath;
        }

        updateStatus(ctx);
        ctx.ui.notify(`Moved ${taskId} to ${resolvedCol.title}.`, 'success');
        return;
      }

      if (subcommand === 'contract') {
        if (parts.length < 3) {
          ctx.ui.notify('Usage: /bf contract <pickup|deliver|validate> <task-id>', 'warning');
          return;
        }

        const action = parts[1]?.toLowerCase();
        const taskId = parts[2];
        const located = locateTask(rt, taskId, false);

        if (!located) {
          ctx.ui.notify(`Task not found: ${taskId}`, 'error');
          return;
        }

        const contractResult = ensureTaskHasContract(located.task);
        if (!contractResult.ok) {
          ctx.ui.notify(contractResult.error, 'error');
          return;
        }

        if (action === 'pickup') {
          const assignee = getEffectiveListenerAssignee(rt, ctx);
          const decision = requestTaskPickupAuthorization(rt, ctx, located, assignee, 'command');
          if (!decision.accepted || !decision.lease) {
            ctx.ui.notify(
              decision.reasonDetails ||
              (decision.reasonCode
                ? `Claim rejected (${decision.reasonCode}).`
                : 'Claim rejected by scheduler.'),
              'error'
            );
            return;
          }

          const pickup = pickupContract(located, assignee, 'command', rt, decision.lease);
          if (!pickup.ok) {
            ctx.ui.notify(pickup.error, 'error');
            return;
          }

          rt.activeTaskId = pickup.task.task.id;
          rt.activeTaskPath = pickup.task.filePath;
          emitEvent(rt, 'contract.picked_up', ctx, 'command', {
            taskId: pickup.task.task.id,
            assignee,
            data: {
              status: 'in_progress',
              orchestration: buildClaimDecisionOrchestration(decision),
            },
          });
          persistState(rt);
          updateStatus(ctx);
          ctx.ui.notify(
            pickup.alreadyInProgress
              ? `Contract already in progress: ${taskId}`
              : `Contract picked up: ${taskId}`,
            'success'
          );
          return;
        }

        if (action === 'deliver') {
          const assignee = getEffectiveListenerAssignee(rt, ctx);
          const delivery = deliverContractWithEvidence(rt, located, assignee, 'command');
          if (!delivery.ok) {
            const missingText = delivery.deliverableChecks
              ? `\n${delivery.deliverableChecks.filter((check) => !check.ok).map((check) => `- ${check.message}`).join('\n')}`
              : '';
            ctx.ui.notify(`${delivery.error}${missingText}`, 'error');
            return;
          }

          emitEvent(rt, 'contract.delivered', ctx, 'command', {
            taskId,
            assignee,
            data: {
              selfCheckFailures: delivery.commandResults.filter((result) => result.exitCode !== 0).length,
            },
          });
          updateStatus(ctx);
          ctx.ui.notify(
            `Contract delivered: ${taskId}${delivery.commandResults.some((result) => result.exitCode !== 0) ? ' (self-check warnings)' : ''}`,
            'success'
          );
          return;
        }

        if (action === 'validate') {
          // Contract validation is an authority action that can move status to
          // done/failed and must stay PM-only by design.
          if (rt.operatingMode !== 'pm') {
            ctx.ui.notify('Only PM mode can run contract.validate. Switch to PM mode or delegate this task to PM.', 'error');
            return;
          }

          const validation = runContractValidation(rt, located);
          if (!('ok' in validation)) {
            ctx.ui.notify(validation.error || 'Validation failed.', 'error');
            return;
          }

          if (validation.ok) {
            setContractStatus(located, 'done', { runtime: rt });
            emitEvent(rt, 'contract.validated', ctx, 'command', {
              taskId,
              data: {
                result: 'done',
              },
            });
            updateStatus(ctx);
            ctx.ui.notify(`Contract validation passed: ${taskId}`, 'success');
          } else {
            const feedback = formatValidationFeedback(validation);
            setContractStatus(located, 'failed', { feedback, runtime: rt });
            emitEvent(rt, 'contract.validated', ctx, 'command', {
              taskId,
              data: {
                result: 'failed',
              },
            });
            updateStatus(ctx);
            ctx.ui.notify(`Contract validation failed: ${taskId}`, 'error');
          }
          return;
        }

        ctx.ui.notify(`Unknown contract action: ${action}`, 'error');
        return;
      }

      if (setActiveTask(subcommand, ctx)) {
        ctx.ui.notify(`Active task set to ${subcommand}`, 'success');
        return;
      }

      ctx.ui.notify('Unknown /bf command. Try: pick, status, board, move, contract, plan, listen, clear', 'warning');
    },
  });

  pi.registerCommand('listen', {
    description: 'Toggle and control Brainfile contract listener',
    handler: async (args, ctx) => {
      if (!ensureBoardContext(rt, ctx).ok || !rt.boardContext) return;
      const parts = (args || '').trim().split(/\s+/).filter(Boolean);
      await handleListenCommand(parts, ctx);
    },
  });

  pi.registerCommand('plan', {
    description: 'Toggle Brainfile plan mode (mutations disabled)',
    handler: async (_args, ctx) => {
      if (!ensureBoardContext(rt, ctx).ok) return;
      setPlanMode(!rt.planMode, ctx);
    },
  });

  // ── Tool registration ──────────────────────────────────────────────

  const runtime = {
    get boardContext() { return rt.boardContext; },
    get activeTaskId() { return rt.activeTaskId; },
    set activeTaskId(value: string | null) { rt.activeTaskId = value; },
    get activeTaskPath() { return rt.activeTaskPath; },
    set activeTaskPath(value: string | null) { rt.activeTaskPath = value; },
    get operatingMode() { return rt.operatingMode; },
    get lastWorkerAssignee() { return rt.lastWorkerAssignee; },
    get autoWorkerAssignee() { return rt.autoWorkerAssignee; },
    get listenerAssigneeOverride() { return rt.listenerAssigneeOverride; },
  };

  registerBrainfileTools(pi, {
    runtime,
    refreshBoardContext: (startDir: string) => refreshBoardContext(rt, startDir),
    readBoardConfig: () => readBoardConfig(rt),
    locateTask: (taskId: string, includeLogs?: boolean) => locateTask(rt, taskId, includeLogs),
    findChildTasks: (parentId: string, includeLogs?: boolean) => findChildTasks(rt, parentId, includeLogs),
    taskSummary: (located: any, board: any) => taskSummary(rt, located, board),
    resolveColumn,
    getColumns,
    normalizeColumnInput,
    assigneeMatches,
    makeToolResponse,
    maybeEmitDelegatedEvent: (task: any, ctx: ExtensionContext, source: string) => maybeEmitDelegatedEvent(rt, task, ctx, source),
    updateStatus,
    normalizePathInput,
    applyTaskPatch,
    ensureTaskHasContract,
    getEffectiveListenerAssignee: (ctx: ExtensionContext) => getEffectiveListenerAssignee(rt, ctx),
    pickupContract: (located: any, assignee: string, source: any, _runtime?: any, authorization?: any) => pickupContract(located, assignee, source, rt, authorization),
    requestTaskPickupAuthorization: (_runtime: any, ctx: ExtensionContext, located: any, assignee: string, source: 'listener' | 'tool' | 'command') =>
      requestTaskPickupAuthorization(rt, ctx, located, assignee, source),
    buildClaimDecisionOrchestration,
    emitEvent: (type: any, ctx: ExtensionContext, source: string, opts?: any) => emitEvent(rt, type, ctx, source, opts),
    persistState: () => persistState(rt),
    buildContractContextPayload,
    deliverContractWithEvidence: (located: any, assignee: string, source: any) => deliverContractWithEvidence(rt, located, assignee, source),
    extractRuleText,
    getNextRuleId,
    runContractValidation: (located: any) => runContractValidation(rt, located),
    formatValidationFeedback,
    setContractStatus: (located: any, status: string, options?: any) => setContractStatus(located, status, { ...(options || {}), runtime: rt }),
    parseDeliverableSpecs,
    isTaskCompletable,
  });
}
