import type { ExtensionAPI, ExtensionContext } from '@mariozechner/pi-coding-agent';
import type * as nodeFs from 'fs';
import type { Task, Board } from '@brainfile/core';

export type LocatedTask = {
  task: Task;
  body: string;
  filePath: string;
  isLog: boolean;
};

export type BoardContext = {
  brainfilePath: string;
  brainfileDir: string;
  projectRoot: string;
  boardDir: string;
  logsDir: string;
  stateDir: string;
  eventsLogPath: string;
};

export type ColumnInfo = {
  id: string;
  title: string;
  completionColumn?: boolean;
};

export const PI_EVENT_TYPES = [
  'run.started',
  'run.blocked',
  'run.closed',
  'contract.delegated',
  'contract.picked_up',
  'contract.delivered',
  'contract.validated',
  'task.completed',
  'task.stale',
  'worker.online',
  'worker.heartbeat',
  'worker.offline',
] as const;

export type PiEventType = (typeof PI_EVENT_TYPES)[number];

export const MESSAGE_ENVELOPE_KINDS = [
  'message.question',
  'message.answer',
  'message.ack',
  'message.status',
  'message.blocker',
  'message.decision',
  'worker.ready',
  'worker.busy',
] as const;

export type EnvelopeKind = PiEventType | (typeof MESSAGE_ENVELOPE_KINDS)[number];

// Validation compatibility tokens: task.stale|run.blocked and worker.online|worker.heartbeat|worker.ready

export type PiEventRecord = {
  id: string;
  at: string;
  type: PiEventType;
  runId?: string;
  taskId?: string;
  actorMode: 'pm' | 'worker';
  actorAssignee?: string;
  source: string;
  data?: Record<string, unknown>;
};

/**
 * Backward-compatible superset of PiEventRecord used for orchestration messaging.
 * Existing JSONL event rows remain valid Envelope objects without migration.
 */
export type Envelope = Omit<PiEventRecord, 'type' | 'actorMode'> & {
  type?: PiEventType;
  actorMode?: 'pm' | 'worker';
  messageId?: string;
  threadId?: string;
  inReplyTo?: string;
  from?: string;
  to?: string;
  kind?: EnvelopeKind;
  priority?: 'low' | 'normal' | 'high' | 'urgent' | string;
  requiresAck?: boolean;
  expiresAt?: string;
};

export function isPiEventType(value: unknown): value is PiEventType {
  return typeof value === 'string' && (PI_EVENT_TYPES as readonly string[]).includes(value);
}

export function isEnvelopeKind(value: unknown): value is EnvelopeKind {
  return typeof value === 'string' && (
    isPiEventType(value) ||
    (MESSAGE_ENVELOPE_KINDS as readonly string[]).includes(value)
  );
}

/**
 * Coerce legacy PiEventRecord rows into Envelope format.
 *
 * Mapping for old rows:
 * - messageId <- id
 * - from <- actorMode
 * - kind <- type
 */
export function normalizeEnvelope(value: unknown): Envelope {
  const raw = (value && typeof value === 'object') ? (value as Record<string, unknown>) : {};

  const id = typeof raw.id === 'string' && raw.id.trim().length > 0
    ? raw.id
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const at = typeof raw.at === 'string' && raw.at.trim().length > 0
    ? raw.at
    : new Date().toISOString();
  const source = typeof raw.source === 'string' && raw.source.trim().length > 0
    ? raw.source
    : 'unknown';

  const actorMode = raw.actorMode === 'pm' || raw.actorMode === 'worker'
    ? raw.actorMode
    : (raw.from === 'pm' || raw.from === 'worker' ? raw.from : undefined);

  const legacyType = isPiEventType(raw.type) ? raw.type : undefined;
  const kind = isEnvelopeKind(raw.kind)
    ? raw.kind
    : (legacyType || undefined);

  const normalized: Envelope = {
    id,
    at,
    source,
    ...(typeof raw.runId === 'string' ? { runId: raw.runId } : {}),
    ...(typeof raw.taskId === 'string' ? { taskId: raw.taskId } : {}),
    ...(typeof raw.actorAssignee === 'string' ? { actorAssignee: raw.actorAssignee } : {}),
    ...(legacyType ? { type: legacyType } : {}),
    ...(actorMode ? { actorMode } : {}),
    ...(kind ? { kind } : {}),
    messageId: typeof raw.messageId === 'string' && raw.messageId.trim().length > 0 ? raw.messageId : id,
    threadId: typeof raw.threadId === 'string' && raw.threadId.trim().length > 0
      ? raw.threadId
      : (typeof raw.runId === 'string' && raw.runId.trim().length > 0
          ? raw.runId
          : (typeof raw.taskId === 'string' && raw.taskId.trim().length > 0 ? raw.taskId : id)),
    ...(typeof raw.inReplyTo === 'string' && raw.inReplyTo.trim().length > 0 ? { inReplyTo: raw.inReplyTo } : {}),
    from: typeof raw.from === 'string' && raw.from.trim().length > 0
      ? raw.from
      : (actorMode || undefined),
    ...(typeof raw.to === 'string' && raw.to.trim().length > 0 ? { to: raw.to } : {}),
    ...(typeof raw.priority === 'string' && raw.priority.trim().length > 0 ? { priority: raw.priority } : {}),
    ...(typeof raw.requiresAck === 'boolean' ? { requiresAck: raw.requiresAck } : {}),
    ...(typeof raw.expiresAt === 'string' && raw.expiresAt.trim().length > 0 ? { expiresAt: raw.expiresAt } : {}),
    ...(raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data)
      ? { data: raw.data as Record<string, unknown> }
      : {}),
  };

  return normalized;
}

export type WorkerPresence = {
  status: 'online' | 'offline';
  lastSeenAt: string;
  lastEventAt: string;
};

export type WorkerReadiness = {
  maxConcurrency: number;
  activeCount: number;
  idle: boolean;
  lastReportedAt: string;
};

export type WorkerClaimRecord = {
  token: string;
  assignee: string;
  base: string;
  slot: number;
  claimedAt: string;
  updatedAt: string;
};

export type PmLockRecord = {
  token: string;
  acquiredAt: string;
  updatedAt: string;
};

export type EventProjection = {
  lastByteOffset: number;
  delegatedByRun: Record<string, string[]>;
  taskRun: Record<string, string>;
  deliveredNotifiedByRun: Record<string, string[]>;
  validatedNotifiedByRun: Record<string, string[]>;
  completedNotifiedByRun: Record<string, string[]>;
  staleNotifiedByRun: Record<string, string[]>;
  deliveryBatchNotifiedByRun: Record<string, number>; // tracks the last notified count of delivered tasks
  blockedNotifiedRuns: string[];
  closedNotifiedRuns: string[];
  runClosedByRun: Record<string, string>;
  workerPresence: Record<string, WorkerPresence>;
  workerReadiness: Record<string, WorkerReadiness>;
  taskAdoptedAt: Record<string, string>; // taskId → ISO timestamp of when the task was adopted into the current run
};

/**
 * Runtime state shared across all modules.
 *
 * Created once in extension.ts and passed as `rt` to every module function.
 * Holds all mutable state that was previously captured by the closure in
 * brainfileExtension().
 */
export type Rt = {
  pi: ExtensionAPI;
  boardContext: BoardContext | null;
  activeTaskId: string | null;
  activeTaskPath: string | null;
  planMode: boolean;
  toolsBeforePlan: string[] | null;
  listenMode: boolean;
  listenerAssigneeOverride: string | null;
  listenerAutoStart: boolean;
  listenerTimer: ReturnType<typeof setInterval> | null;
  listenerWatcher: nodeFs.FSWatcher | null;
  listenerBusy: boolean;
  listenerPausedForUserInput: boolean;
  operatingMode: 'pm' | 'worker';
  operatingModeOverride: 'pm' | 'worker' | null;
  listenerConfiguredExplicitly: boolean;
  activeRunId: string | null;
  eventProjection: EventProjection;
  staleTimeoutSeconds: number;
  lastWorkerHeartbeatAtMs: number;
  workerOnlineEmitted: boolean;
  lastWorkerAssignee: string | null;
  autoWorkerAssignee: string | null;
  workerClaimToken: string;
  workerClaimBase: string | null;
  workerClaimSlot: number | null;
  lastWorkerClaimRefreshAtMs: number;
  pmLockToken: string;
  pmLockHeld: boolean;
  lastPmLockRefreshAtMs: number;
  pmLockTimer: ReturnType<typeof setInterval> | null;

  /**
   * Callback defined in extension.ts that updates the pi status bar and widget.
   * Modules call this after state changes that affect the UI.
   */
  updateStatus: (ctx: ExtensionContext) => void;
};
