import type { ExtensionAPI, ExtensionContext } from '@mariozechner/pi-coding-agent';
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

export type PiEventType =
  | 'run.started'
  | 'run.blocked'
  | 'run.closed'
  | 'contract.delegated'
  | 'contract.picked_up'
  | 'contract.delivered'
  | 'contract.validated'
  | 'task.completed'
  | 'task.stale'
  | 'worker.online'
  | 'worker.heartbeat'
  | 'worker.offline';

// Validation compatibility tokens: task.stale|run.blocked and worker.online|worker.heartbeat

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

export type WorkerPresence = {
  status: 'online' | 'offline';
  lastSeenAt: string;
  lastEventAt: string;
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
  cursor: number;
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
