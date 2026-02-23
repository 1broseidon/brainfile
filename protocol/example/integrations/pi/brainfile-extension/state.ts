import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import type { EventProjection, Rt, WorkerPresence, WorkerReadiness } from './types';
import { STATE_ENTRY_TYPE, DEFAULT_STALE_TIMEOUT_SECONDS } from './constants';

export function createEmptyEventProjection(): EventProjection {
  return {
    lastByteOffset: 0,
    delegatedByRun: {},
    taskRun: {},
    deliveredNotifiedByRun: {},
    validatedNotifiedByRun: {},
    completedNotifiedByRun: {},
    staleNotifiedByRun: {},
    deliveryBatchNotifiedByRun: {},
    blockedNotifiedRuns: [],
    closedNotifiedRuns: [],
    runClosedByRun: {},
    workerPresence: {},
    workerReadiness: {},
    taskAdoptedAt: {},
    taskContractStatus: {},
    taskLastEventAt: {},
  };
}

export function normalizeEventProjection(value: unknown): EventProjection {
  const base = createEmptyEventProjection();
  if (!value || typeof value !== 'object') return base;
  const raw = value as Record<string, unknown>;

  const lastByteOffset = typeof raw.lastByteOffset === 'number' && Number.isFinite(raw.lastByteOffset)
    ? Math.max(0, Math.floor(raw.lastByteOffset))
    : 0;

  const coerceStringArrayRecord = (input: unknown): Record<string, string[]> => {
    if (!input || typeof input !== 'object') return {};
    const source = input as Record<string, unknown>;
    const out: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(source)) {
      if (!Array.isArray(value)) continue;
      out[key] = value.filter((item): item is string => typeof item === 'string');
    }
    return out;
  };

  const coerceStringArray = (input: unknown): string[] => {
    if (!Array.isArray(input)) return [];
    return input.filter((item): item is string => typeof item === 'string');
  };

  const taskRun: Record<string, string> = {};
  if (raw.taskRun && typeof raw.taskRun === 'object') {
    for (const [taskId, runId] of Object.entries(raw.taskRun as Record<string, unknown>)) {
      if (typeof runId === 'string') {
        taskRun[taskId] = runId;
      }
    }
  }

  const runClosedByRun: Record<string, string> = {};
  if (raw.runClosedByRun && typeof raw.runClosedByRun === 'object') {
    for (const [runId, result] of Object.entries(raw.runClosedByRun as Record<string, unknown>)) {
      if (typeof result === 'string') {
        runClosedByRun[runId] = result;
      }
    }
  }

  const workerPresence: Record<string, WorkerPresence> = {};
  if (raw.workerPresence && typeof raw.workerPresence === 'object') {
    for (const [worker, value] of Object.entries(raw.workerPresence as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue;
      const presence = value as Record<string, unknown>;
      const status = presence.status === 'offline' ? 'offline' : presence.status === 'online' ? 'online' : null;
      const lastSeenAt = typeof presence.lastSeenAt === 'string' ? presence.lastSeenAt : null;
      const lastEventAt = typeof presence.lastEventAt === 'string' ? presence.lastEventAt : lastSeenAt;
      if (!status || !lastSeenAt || !lastEventAt) continue;

      let model: WorkerPresence['model'] | undefined;
      if (presence.model && typeof presence.model === 'object') {
        const rawModel = presence.model as Record<string, unknown>;
        const provider = typeof rawModel.provider === 'string' ? rawModel.provider : '';
        const id = typeof rawModel.id === 'string' ? rawModel.id : '';
        const name = typeof rawModel.name === 'string' ? rawModel.name : '';

        if (provider || id || name) {
          model = {
            provider: provider || 'unknown',
            id: id || 'unknown',
            name: name || id || provider || 'unknown',
          };
        }
      }

      workerPresence[worker] = {
        status,
        lastSeenAt,
        lastEventAt,
        ...(model ? { model } : {}),
      };
    }
  }

  const workerReadiness: Record<string, WorkerReadiness> = {};
  if (raw.workerReadiness && typeof raw.workerReadiness === 'object') {
    for (const [worker, value] of Object.entries(raw.workerReadiness as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue;
      const readiness = value as Record<string, unknown>;
      const maxConcurrencyRaw = readiness.maxConcurrency;
      const activeCountRaw = readiness.activeCount;
      const idleRaw = readiness.idle;
      const lastReportedAt = typeof readiness.lastReportedAt === 'string' ? readiness.lastReportedAt : null;
      if (!lastReportedAt) continue;

      const maxConcurrency = typeof maxConcurrencyRaw === 'number' && Number.isFinite(maxConcurrencyRaw)
        ? Math.max(1, Math.floor(maxConcurrencyRaw))
        : null;
      const activeCount = typeof activeCountRaw === 'number' && Number.isFinite(activeCountRaw)
        ? Math.max(0, Math.floor(activeCountRaw))
        : null;
      if (maxConcurrency === null || activeCount === null) continue;

      const idle = typeof idleRaw === 'boolean' ? idleRaw : activeCount < maxConcurrency;

      workerReadiness[worker] = {
        maxConcurrency,
        activeCount,
        idle,
        lastReportedAt,
      };
    }
  }

  return {
    ...base,
    lastByteOffset,
    delegatedByRun: coerceStringArrayRecord(raw.delegatedByRun),
    taskRun,
    deliveredNotifiedByRun: coerceStringArrayRecord(raw.deliveredNotifiedByRun),
    validatedNotifiedByRun: coerceStringArrayRecord(raw.validatedNotifiedByRun),
    completedNotifiedByRun: coerceStringArrayRecord(raw.completedNotifiedByRun),
    staleNotifiedByRun: coerceStringArrayRecord(raw.staleNotifiedByRun),
    deliveryBatchNotifiedByRun: (typeof raw.deliveryBatchNotifiedByRun === 'object' && raw.deliveryBatchNotifiedByRun !== null)
      ? Object.fromEntries(
          Object.entries(raw.deliveryBatchNotifiedByRun as Record<string, unknown>)
            .filter(([, v]) => typeof v === 'number')
            .map(([k, v]) => [k, v as number])
        )
      : {},
    blockedNotifiedRuns: coerceStringArray(raw.blockedNotifiedRuns),
    closedNotifiedRuns: coerceStringArray(raw.closedNotifiedRuns),
    runClosedByRun,
    workerPresence,
    workerReadiness,
    taskAdoptedAt: (() => {
      const out: Record<string, string> = {};
      if (raw.taskAdoptedAt && typeof raw.taskAdoptedAt === 'object') {
        for (const [k, v] of Object.entries(raw.taskAdoptedAt as Record<string, unknown>)) {
          if (typeof v === 'string') out[k] = v;
        }
      }
      return out;
    })(),
    taskContractStatus: (() => {
      const out: Record<string, string> = {};
      if (raw.taskContractStatus && typeof raw.taskContractStatus === 'object') {
        for (const [k, v] of Object.entries(raw.taskContractStatus as Record<string, unknown>)) {
          if (typeof v === 'string') out[k] = v;
        }
      }
      return out;
    })(),
    taskLastEventAt: (() => {
      const out: Record<string, string> = {};
      if (raw.taskLastEventAt && typeof raw.taskLastEventAt === 'object') {
        for (const [k, v] of Object.entries(raw.taskLastEventAt as Record<string, unknown>)) {
          if (typeof v === 'string') out[k] = v;
        }
      }
      return out;
    })(),
  };
}

/**
 * Create the shared runtime state object.
 */
export function createRt(pi: ExtensionAPI): Rt {
  return {
    pi,
    boardContext: null,
    activeTaskId: null,
    activeTaskPath: null,
    planMode: false,
    toolsBeforePlan: null,
    listenMode: false,
    listenerAssigneeOverride: null,
    listenerAutoStart: true,
    listenerTimer: null,
    listenerWatcher: null,
    listenerBusy: false,
    listenerPausedForUserInput: false,
    operatingMode: 'pm',
    operatingModeOverride: null,
    listenerConfiguredExplicitly: false,
    activeRunId: null,
    eventProjection: createEmptyEventProjection(),
    staleTimeoutSeconds: DEFAULT_STALE_TIMEOUT_SECONDS,
    lastWorkerHeartbeatAtMs: 0,
    workerOnlineEmitted: false,
    lastWorkerAssignee: null,
    autoWorkerAssignee: null,
    workerInProgressCache: null,
    workerClaimToken: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    workerClaimSlot: null,
    lastWorkerClaimRefreshAtMs: 0,
    pmLockToken: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    pmLockHeld: false,
    lastPmLockRefreshAtMs: 0,
    pmLockTimer: null,
    publishAuditAppendNotice: null,
    // Placeholder — replaced in extension.ts after definition
    updateStatus: () => {},
  };
}

/**
 * Persist current runtime state as a session entry.
 */
export function persistState(rt: Rt): void {
  rt.pi.appendEntry(STATE_ENTRY_TYPE, {
    activeTaskId: rt.activeTaskId,
    planMode: rt.planMode,
    listenMode: rt.listenMode,
    listenerAssigneeOverride: rt.listenerAssigneeOverride,
    listenerAutoStart: rt.listenerAutoStart,
    operatingMode: rt.operatingMode,
    operatingModeOverride: rt.operatingModeOverride,
    listenerConfiguredExplicitly: rt.listenerConfiguredExplicitly,
    activeRunId: rt.activeRunId,
    eventProjection: rt.eventProjection,
    autoWorkerAssignee: rt.autoWorkerAssignee,
  });
}
