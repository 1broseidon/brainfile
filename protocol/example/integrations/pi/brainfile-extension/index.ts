import type { ExtensionAPI, ExtensionContext } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import {
  Brainfile,
  findBrainfile,
  readTasksDir,
  readTaskFile,
  writeTaskFile,
  taskFileName,
  addTaskFile,
  moveTaskFile,
  completeTaskFile,
  appendLog,
  getBoardTypes,
  validateType,
  type Board,
  type Task,
  type Subtask,
  type TaskDocument,
} from '@brainfile/core';

type LocatedTask = {
  task: Task;
  body: string;
  filePath: string;
  isLog: boolean;
};

type BoardContext = {
  brainfilePath: string;
  brainfileDir: string;
  projectRoot: string;
  boardDir: string;
  logsDir: string;
  stateDir: string;
  eventsLogPath: string;
};

type ColumnInfo = {
  id: string;
  title: string;
  completionColumn?: boolean;
};

type PiEventType =
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

type PiEventRecord = {
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

type WorkerPresence = {
  status: 'online' | 'offline';
  lastSeenAt: string;
  lastEventAt: string;
};

type WorkerClaimRecord = {
  token: string;
  assignee: string;
  base: string;
  slot: number;
  claimedAt: string;
  updatedAt: string;
};

type EventProjection = {
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

const STATE_ENTRY_TYPE = 'brainfile-extension-state';
const STATUS_KEY = 'brainfile';
const WIDGET_KEY = 'brainfile-task';
const LISTENER_POLL_INTERVAL_MS = 10_000;
const DEFAULT_LISTENER_ASSIGNEE = 'codex';
const DEFAULT_STALE_TIMEOUT_SECONDS = 3600;
const DEFAULT_WORKER_PRESENCE_TTL_SECONDS = 45;
const WORKER_HEARTBEAT_INTERVAL_MS = 20_000;
const WORKER_CLAIM_REFRESH_INTERVAL_MS = 10_000;
const WORKER_CLAIM_LEASE_SECONDS = 90;
const WORKER_CLAIM_MAX_SLOT = 256;
const PI_EVENTS_BASENAME = 'pi-events.jsonl';
const WORKER_CLAIMS_DIRNAME = 'worker-claims';

const BF_LIST_TOOL = 'brainfile_list_tasks';
const BF_GET_TOOL = 'brainfile_get_task';
const BF_ADD_TOOL = 'brainfile_add_task';
const BF_PATCH_TOOL = 'brainfile_patch_task';
const BF_MOVE_TOOL = 'brainfile_move_task';
const BF_COMPLETE_TOOL = 'brainfile_complete_task';
const BF_SUBTASK_TOOL = 'brainfile_toggle_subtask';
const BF_LOG_TOOL = 'brainfile_append_log';
const BF_CONTRACT_PICKUP_TOOL = 'brainfile_contract_pickup';
const BF_CONTRACT_DELIVER_TOOL = 'brainfile_contract_deliver';
const BF_CONTRACT_VALIDATE_TOOL = 'brainfile_contract_validate';
const BF_ADR_PROMOTE_TOOL = 'brainfile_adr_promote';

const BF_READ_ONLY_TOOLS = new Set<string>([
  BF_LIST_TOOL,
  BF_GET_TOOL,
]);

const BF_MUTATING_TOOLS = new Set<string>([
  BF_ADD_TOOL,
  BF_PATCH_TOOL,
  BF_MOVE_TOOL,
  BF_COMPLETE_TOOL,
  BF_SUBTASK_TOOL,
  BF_LOG_TOOL,
  BF_CONTRACT_PICKUP_TOOL,
  BF_CONTRACT_DELIVER_TOOL,
  BF_CONTRACT_VALIDATE_TOOL,
  BF_ADR_PROMOTE_TOOL,
]);

const WRITE_BUILTINS = new Set<string>(['edit', 'write']);

const SAFE_BASH_PATTERNS: RegExp[] = [
  /^\s*cat\b/i,
  /^\s*head\b/i,
  /^\s*tail\b/i,
  /^\s*less\b/i,
  /^\s*more\b/i,
  /^\s*grep\b/i,
  /^\s*find\b/i,
  /^\s*rg\b/i,
  /^\s*fd\b/i,
  /^\s*ls\b/i,
  /^\s*pwd\b/i,
  /^\s*tree\b/i,
  /^\s*git\s+(status|log|diff|show|branch|remote|config\s+--get)\b/i,
  /^\s*npm\s+(list|ls|view|info|search|outdated|audit)\b/i,
  /^\s*yarn\s+(list|info|why|audit)\b/i,
  /^\s*node\s+--version\b/i,
  /^\s*python\s+--version\b/i,
  /^\s*echo\b/i,
  /^\s*printf\b/i,
  /^\s*wc\b/i,
  /^\s*sort\b/i,
  /^\s*uniq\b/i,
  /^\s*diff\b/i,
  /^\s*file\b/i,
  /^\s*stat\b/i,
  /^\s*du\b/i,
  /^\s*df\b/i,
  /^\s*uname\b/i,
  /^\s*whoami\b/i,
  /^\s*id\b/i,
  /^\s*date\b/i,
  /^\s*uptime\b/i,
  /^\s*ps\b/i,
  /^\s*top\b/i,
  /^\s*htop\b/i,
  /^\s*free\b/i,
  /^\s*env\b/i,
  /^\s*printenv\b/i,
  /^\s*which\b/i,
  /^\s*whereis\b/i,
  /^\s*type\b/i,
  /^\s*sed\s+-n\b/i,
  /^\s*awk\b/i,
  /^\s*jq\b/i,
];

const DESTRUCTIVE_BASH_PATTERNS: RegExp[] = [
  /\brm\b/i,
  /\brmdir\b/i,
  /\bmv\b/i,
  /\bcp\b/i,
  /\bmkdir\b/i,
  /\btouch\b/i,
  /\bchmod\b/i,
  /\bchown\b/i,
  /\bchgrp\b/i,
  /\bln\b/i,
  /\btee\b/i,
  /(^|[^<])>(?!>)/,
  />>/,
  /\bnpm\s+(install|uninstall|update|ci|link|publish)\b/i,
  /\byarn\s+(add|remove|install|publish)\b/i,
  /\bpnpm\s+(add|remove|install|publish)\b/i,
  /\bpip\s+(install|uninstall)\b/i,
  /\bapt(-get)?\s+(install|remove|purge|update|upgrade)\b/i,
  /\bbrew\s+(install|uninstall|upgrade)\b/i,
  /\bgit\s+(add|commit|push|pull|merge|rebase|reset|checkout|stash|cherry-pick|revert|tag|init|clone)\b/i,
  /\bsudo\b/i,
  /\bsu\b/i,
  /\bkill\b/i,
  /\bpkill\b/i,
  /\bkillall\b/i,
  /\breboot\b/i,
  /\bshutdown\b/i,
  /\bsystemctl\s+(start|stop|restart|enable|disable)\b/i,
  /\bservice\s+\S+\s+(start|stop|restart)\b/i,
  /\b(vim?|nano|emacs|code|subl)\b/i,
];

function asJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

function isTaskCompletable(task: Task, board: Board): boolean {
  const taskType = task.type || 'task';
  if (taskType === 'task') return true;
  const typeConfig = getBoardTypes(board)[taskType];
  return typeConfig?.completable !== false;
}

function extractRuleText(title: string): string {
  const withoutPrefix = title.trim().replace(/^ADR-\d+\s*:\s*/i, '').trim();
  return withoutPrefix.length > 0 ? withoutPrefix : title.trim();
}

function getNextRuleId(rules: Record<string, unknown> | undefined): number {
  if (!rules) return 1;
  let maxId = 0;
  for (const categoryRules of Object.values(rules)) {
    if (!Array.isArray(categoryRules)) continue;
    for (const rule of categoryRules) {
      const id = (rule as any)?.id;
      const parsed = typeof id === 'number' ? id : parseInt(String(id), 10);
      if (Number.isFinite(parsed)) maxId = Math.max(maxId, parsed);
    }
  }
  return maxId + 1;
}

function normalizePathInput(value: string): string {
  return value.startsWith('@') ? value.slice(1) : value;
}

function isSafePlanBashCommand(command: string): boolean {
  const destructive = DESTRUCTIVE_BASH_PATTERNS.some((pattern) => pattern.test(command));
  const allowlisted = SAFE_BASH_PATTERNS.some((pattern) => pattern.test(command));
  return !destructive && allowlisted;
}

function truncateText(value: string | undefined, maxChars: number): string {
  if (!value) return '';
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n... [truncated ${value.length - maxChars} chars]`;
}

function detectDirectoryChangeWarning(command: string): string | undefined {
  const patterns = [/\bcd\s+[^\s;|&]+/, /\bpushd\s+/i, /\bchdir\s+/i];
  for (const pattern of patterns) {
    if (pattern.test(command)) {
      return 'Command changes directory. If it invokes brainfile CLI internally, pass -f explicitly to avoid path ambiguity.';
    }
  }
  return undefined;
}

function normalizeColumnInput(input: string): string {
  return input.trim().toLowerCase();
}

function extractDescription(body: string): string | undefined {
  const match = body.match(/## Description\n([\s\S]*?)(?=\n## |\n*$)/);
  return match ? match[1].trim() || undefined : undefined;
}

function setDescriptionSection(body: string, description: string | undefined): string {
  const sectionRegex = /(^## Description\s*\n)([\s\S]*?)(?=\n## |\n*$)/m;
  const trimmedDescription = description?.trim();

  if (!trimmedDescription) {
    if (!sectionRegex.test(body)) return body.trimEnd();
    const removed = body.replace(sectionRegex, '').replace(/^\s+|\s+$/g, '').replace(/\n{3,}/g, '\n\n');
    return removed.length > 0 ? `${removed}\n` : '';
  }

  const replacement = `## Description\n${trimmedDescription}\n`;

  if (sectionRegex.test(body)) {
    const replaced = body.replace(sectionRegex, replacement).replace(/\n{3,}/g, '\n\n').trimEnd();
    return `${replaced}\n`;
  }

  const remainder = body.trim();
  if (!remainder) {
    return replacement;
  }

  return `${replacement}\n${remainder.endsWith('\n') ? remainder : `${remainder}\n`}`;
}

function makeToolResponse(payload: unknown, isError = false) {
  return {
    content: [{ type: 'text' as const, text: asJson(payload) }],
    details: payload,
    ...(isError ? { isError: true } : {}),
  };
}

function parseDeliverableSpecs(specs?: string[]): { deliverables: any[]; errors: string[] } {
  if (!specs || specs.length === 0) return { deliverables: [], errors: [] };

  const deliverables: any[] = [];
  const errors: string[] = [];

  for (const rawSpec of specs) {
    const spec = rawSpec.trim();
    if (!spec) continue;

    const parts = spec.split(':');
    if (parts.length < 2) {
      errors.push(`Invalid deliverable spec "${spec}". Expected type:path:description`);
      continue;
    }

    const type = parts[0].trim();
    const deliverablePath = normalizePathInput(parts[1].trim());
    const description = parts.slice(2).join(':').trim();

    if (!type || !deliverablePath) {
      errors.push(`Invalid deliverable spec "${spec}". Type and path are required.`);
      continue;
    }

    deliverables.push({
      type,
      path: deliverablePath,
      ...(description ? { description } : {}),
    });
  }

  return { deliverables, errors };
}

function formatValidationFeedback(input: {
  deliverableChecks: Array<{ ok: boolean; message: string }>;
  commandResults: Array<{ command: string; exitCode: number; stdout: string; stderr: string }>;
}): string {
  const lines: string[] = [];

  const failedDeliverables = input.deliverableChecks.filter((check) => !check.ok);
  if (failedDeliverables.length > 0) {
    lines.push('Deliverables failing:');
    for (const check of failedDeliverables) {
      lines.push(`- ${check.message}`);
    }
    lines.push('');
  }

  const failedCommand = input.commandResults.find((result) => result.exitCode !== 0);
  if (failedCommand) {
    lines.push(`Validation command failed: ${failedCommand.command}`);
    if (failedCommand.stderr.trim()) {
      lines.push('stderr:');
      lines.push(truncateText(failedCommand.stderr.trim(), 2000));
    }
    if (failedCommand.stdout.trim()) {
      lines.push('stdout:');
      lines.push(truncateText(failedCommand.stdout.trim(), 2000));
    }
  }

  return lines.join('\n').trim();
}

function createEmptyEventProjection(): EventProjection {
  return {
    cursor: 0,
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
    taskAdoptedAt: {},
  };
}

function normalizeEventProjection(value: unknown): EventProjection {
  const base = createEmptyEventProjection();
  if (!value || typeof value !== 'object') return base;
  const raw = value as Record<string, unknown>;

  const cursor = typeof raw.cursor === 'number' && Number.isFinite(raw.cursor)
    ? Math.max(0, Math.floor(raw.cursor))
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
      workerPresence[worker] = { status, lastSeenAt, lastEventAt };
    }
  }

  return {
    ...base,
    cursor,
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
    taskAdoptedAt: (() => {
      const out: Record<string, string> = {};
      if (raw.taskAdoptedAt && typeof raw.taskAdoptedAt === 'object') {
        for (const [k, v] of Object.entries(raw.taskAdoptedAt as Record<string, unknown>)) {
          if (typeof v === 'string') out[k] = v;
        }
      }
      return out;
    })(),
  };
}

export default function brainfileExtension(pi: ExtensionAPI) {
  let boardContext: BoardContext | null = null;
  let activeTaskId: string | null = null;
  let activeTaskPath: string | null = null;
  let planMode = false;
  let toolsBeforePlan: string[] | null = null;
  let listenMode = false;
  let listenerAssigneeOverride: string | null = null;
  let listenerAutoStart = true;
  let listenerTimer: ReturnType<typeof setInterval> | null = null;
  let listenerBusy = false;
  let listenerPausedForUserInput = false;
  let operatingMode: 'pm' | 'worker' = 'pm';
  let operatingModeOverride: 'pm' | 'worker' | null = null;
  let listenerConfiguredExplicitly = false;
  let activeRunId: string | null = null;
  let eventProjection: EventProjection = createEmptyEventProjection();
  let staleTimeoutSeconds = DEFAULT_STALE_TIMEOUT_SECONDS;
  let lastWorkerHeartbeatAtMs = 0;
  let workerOnlineEmitted = false;
  let lastWorkerAssignee: string | null = null;
  let autoWorkerAssignee: string | null = null;
  const workerClaimToken = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  let workerClaimBase: string | null = null;
  let workerClaimSlot: number | null = null;
  let lastWorkerClaimRefreshAtMs = 0;

  function persistState() {
    pi.appendEntry(STATE_ENTRY_TYPE, {
      activeTaskId,
      planMode,
      listenMode,
      listenerAssigneeOverride,
      listenerAutoStart,
      operatingMode,
      operatingModeOverride,
      listenerConfiguredExplicitly,
      activeRunId,
      eventProjection,
      autoWorkerAssignee,
    });
  }

  function loadWorkspaceExtensionSettings(projectRoot: string): void {
    staleTimeoutSeconds = DEFAULT_STALE_TIMEOUT_SECONDS;

    const settingsPath = path.join(projectRoot, '.pi', 'settings.json');
    if (!fs.existsSync(settingsPath)) return;

    try {
      const raw = fs.readFileSync(settingsPath, 'utf-8');
      const parsed = JSON.parse(raw) as any;
      const candidate = Number(parsed?.brainfileExtension?.staleTimeoutSeconds);
      if (Number.isFinite(candidate) && candidate > 0) {
        staleTimeoutSeconds = Math.max(1, Math.floor(candidate));
      }
    } catch {
      // Ignore malformed settings and continue with defaults.
    }
  }

  function refreshBoardContext(startDir: string): { ok: true } | { ok: false; error: string } {
    const found = findBrainfile(startDir);
    if (!found) {
      boardContext = null;
      return { ok: false, error: 'No brainfile found (expected .brainfile/brainfile.md).' };
    }

    const brainfileDir = path.dirname(found.absolutePath);
    const boardDir = path.join(brainfileDir, 'board');
    const logsDir = path.join(brainfileDir, 'logs');
    const stateDir = path.join(brainfileDir, 'state');
    const eventsLogPath = path.join(stateDir, PI_EVENTS_BASENAME);

    if (path.basename(brainfileDir) !== '.brainfile' || !fs.existsSync(boardDir)) {
      boardContext = null;
      return {
        ok: false,
        error: `Brainfile found at ${path.relative(startDir, found.absolutePath)}, but v2 layout (.brainfile/board/) is missing.`,
      };
    }

    boardContext = {
      brainfilePath: found.absolutePath,
      brainfileDir,
      projectRoot: found.projectRoot,
      boardDir,
      logsDir,
      stateDir,
      eventsLogPath,
    };

    loadWorkspaceExtensionSettings(found.projectRoot);

    return { ok: true };
  }

  function ensureBoardContext(ctx: ExtensionContext): { ok: true } | { ok: false } {
    if (!boardContext) {
      const refreshed = refreshBoardContext(ctx.cwd);
      if (!refreshed.ok) {
        ctx.ui.notify(refreshed.error, 'error');
        return { ok: false };
      }
    }
    return { ok: true };
  }

  function readBoardConfig(): Board | null {
    if (!boardContext) return null;
    try {
      const content = fs.readFileSync(boardContext.brainfilePath, 'utf-8');
      const parsed = Brainfile.parseWithErrors(content);
      return parsed.board || null;
    } catch {
      return null;
    }
  }

  function getColumns(board: Board | null): ColumnInfo[] {
    if (!board) return [];
    return board.columns.map((column) => ({
      id: column.id,
      title: column.title,
      completionColumn: Boolean((column as any).completionColumn),
    }));
  }

  function resolveColumn(columnInput: string, board: Board | null): ColumnInfo | null {
    const normalized = normalizeColumnInput(columnInput);
    const columns = getColumns(board);

    const byId = columns.find((column) => column.id === columnInput);
    if (byId) return byId;

    const byTitle = columns.find((column) => normalizeColumnInput(column.title) === normalized);
    if (byTitle) return byTitle;

    return null;
  }

  function columnTitleForId(columnId: string | undefined, board: Board | null): string {
    if (!columnId) return 'unknown';
    const columns = getColumns(board);
    return columns.find((column) => column.id === columnId)?.title || columnId;
  }

  function locateTask(taskId: string, includeLogs = true): LocatedTask | null {
    if (!boardContext) return null;

    const directTaskPath = path.join(boardContext.boardDir, taskFileName(taskId));
    const directTaskDoc = readTaskFile(directTaskPath);
    if (directTaskDoc && directTaskDoc.task.id === taskId) {
      return {
        task: directTaskDoc.task,
        body: directTaskDoc.body,
        filePath: directTaskPath,
        isLog: false,
      };
    }

    if (includeLogs) {
      const directLogPath = path.join(boardContext.logsDir, taskFileName(taskId));
      const directLogDoc = readTaskFile(directLogPath);
      if (directLogDoc && directLogDoc.task.id === taskId) {
        return {
          task: directLogDoc.task,
          body: directLogDoc.body,
          filePath: directLogPath,
          isLog: true,
        };
      }
    }

    const activeDocs = readTasksDir(boardContext.boardDir);
    const activeMatch = activeDocs.find((doc) => doc.task.id === taskId);
    if (activeMatch) {
      return {
        task: activeMatch.task,
        body: activeMatch.body,
        filePath: activeMatch.filePath || path.join(boardContext.boardDir, taskFileName(taskId)),
        isLog: false,
      };
    }

    if (includeLogs) {
      const logDocs = readTasksDir(boardContext.logsDir);
      const logMatch = logDocs.find((doc) => doc.task.id === taskId);
      if (logMatch) {
        return {
          task: logMatch.task,
          body: logMatch.body,
          filePath: logMatch.filePath || path.join(boardContext.logsDir, taskFileName(taskId)),
          isLog: true,
        };
      }
    }

    return null;
  }

  function findChildTasks(parentId: string, includeLogs = false): LocatedTask[] {
    if (!boardContext) return [];

    const children: LocatedTask[] = [];

    for (const doc of readTasksDir(boardContext.boardDir)) {
      if (doc.task.parentId !== parentId) continue;
      children.push({
        task: doc.task,
        body: doc.body,
        filePath: doc.filePath || path.join(boardContext.boardDir, taskFileName(doc.task.id)),
        isLog: false,
      });
    }

    if (includeLogs) {
      for (const doc of readTasksDir(boardContext.logsDir)) {
        if (doc.task.parentId !== parentId) continue;
        children.push({
          task: doc.task,
          body: doc.body,
          filePath: doc.filePath || path.join(boardContext.logsDir, taskFileName(doc.task.id)),
          isLog: true,
        });
      }
    }

    children.sort((a, b) => {
      const aPos = typeof a.task.position === 'number' ? a.task.position : Number.MAX_SAFE_INTEGER;
      const bPos = typeof b.task.position === 'number' ? b.task.position : Number.MAX_SAFE_INTEGER;
      if (aPos !== bPos) return aPos - bPos;
      return a.task.id.localeCompare(b.task.id);
    });

    return children;
  }

  function taskSummary(located: LocatedTask, board: Board | null) {
    const description = located.task.description || extractDescription(located.body);

    return {
      id: located.task.id,
      title: located.task.title,
      type: located.task.type || 'task',
      parentId: located.task.parentId,
      column: located.isLog ? 'Completed' : columnTitleForId(located.task.column, board),
      columnId: located.task.column,
      priority: located.task.priority,
      tags: located.task.tags || [],
      assignee: located.task.assignee,
      dueDate: located.task.dueDate,
      relatedFiles: located.task.relatedFiles || [],
      subtasks: located.task.subtasks || [],
      contract: located.task.contract || null,
      createdAt: located.task.createdAt,
      updatedAt: located.task.updatedAt,
      completedAt: located.task.completedAt,
      isCompleted: located.isLog,
      filePath: boardContext ? path.relative(boardContext.projectRoot, located.filePath) : located.filePath,
      description,
    };
  }

  function setPlanMode(enabled: boolean, ctx: ExtensionContext) {
    if (enabled === planMode) return;

    if (enabled) {
      toolsBeforePlan = pi.getActiveTools();
      const planTools = toolsBeforePlan.filter((toolName) => {
        if (WRITE_BUILTINS.has(toolName)) return false;
        if (BF_MUTATING_TOOLS.has(toolName)) return false;
        return true;
      });
      pi.setActiveTools(planTools);
      planMode = true;
      ctx.ui.notify('Brainfile plan mode enabled: mutating tools disabled.', 'info');
    } else {
      if (toolsBeforePlan) {
        pi.setActiveTools(toolsBeforePlan);
      }
      toolsBeforePlan = null;
      planMode = false;
      ctx.ui.notify('Brainfile plan mode disabled: tool access restored.', 'info');
    }

    persistState();
    updateStatus(ctx);
  }

  function normalizeAssignee(value: string | null | undefined): string {
    const normalized = (value || '').trim().toLowerCase();
    if (!normalized) return '';

    // Be forgiving with quoted inputs, e.g. /listen assignee "pi-1"
    return normalized.replace(/^["'`]+|["'`]+$/g, '');
  }

  function inferAssigneeFromModel(ctx: ExtensionContext): string | null {
    const model = ctx.model as any;
    const haystack = `${model?.provider || ''} ${model?.id || ''} ${model?.name || ''}`.toLowerCase();

    if (!haystack.trim()) return null;

    if (haystack.includes('codex')) return 'codex';
    if (haystack.includes('claude')) return 'claude';
    if (haystack.includes('gemini')) return 'gemini';
    if (haystack.includes('cursor')) return 'cursor';

    return null;
  }

  function assigneeBase(value: string | null | undefined): string {
    return normalizeAssignee(value).replace(/-\d+$/g, '');
  }

  function assigneeSlot(value: string | null | undefined): number | null {
    const normalized = normalizeAssignee(value);
    if (!normalized) return null;

    const match = normalized.match(/-(\d+)$/);
    if (!match) return null;

    const slot = Number.parseInt(match[1], 10);
    if (!Number.isFinite(slot) || slot <= 0) return null;
    return slot;
  }

  function assigneeMatches(taskAssignee: string | null | undefined, workerAssignee: string | null | undefined): boolean {
    const task = normalizeAssignee(taskAssignee);
    const worker = normalizeAssignee(workerAssignee);
    if (!task || !worker) return false;
    if (task === worker) return true;

    const taskBase = assigneeBase(task);
    const workerBase = assigneeBase(worker);
    if (!taskBase || !workerBase || taskBase !== workerBase) return false;

    const taskSlot = assigneeSlot(task);
    const workerSlot = assigneeSlot(worker);
    if (taskSlot !== null && workerSlot !== null) {
      return taskSlot === workerSlot;
    }

    // Backward compatibility: bare-family assignees (e.g. "codex")
    // still match numbered workers (e.g. "codex-2") and vice versa.
    return true;
  }

  function getWorkerClaimsDir(): string | null {
    if (!boardContext) return null;
    const claimsDir = path.join(boardContext.stateDir, WORKER_CLAIMS_DIRNAME);
    fs.mkdirSync(claimsDir, { recursive: true });
    return claimsDir;
  }

  function workerClaimLockDir(base: string, slot: number): string | null {
    const claimsDir = getWorkerClaimsDir();
    if (!claimsDir) return null;
    return path.join(claimsDir, `${base}-${slot}.lock`);
  }

  function workerClaimOwnerPath(lockDir: string): string {
    return path.join(lockDir, 'owner.json');
  }

  function readWorkerClaimRecord(lockDir: string): WorkerClaimRecord | null {
    try {
      const ownerPath = workerClaimOwnerPath(lockDir);
      if (!fs.existsSync(ownerPath)) return null;
      const raw = fs.readFileSync(ownerPath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<WorkerClaimRecord>;
      if (!parsed || typeof parsed !== 'object') return null;
      if (typeof parsed.token !== 'string' || !parsed.token) return null;
      if (typeof parsed.assignee !== 'string' || !parsed.assignee) return null;
      if (typeof parsed.base !== 'string' || !parsed.base) return null;
      if (typeof parsed.slot !== 'number' || !Number.isFinite(parsed.slot) || parsed.slot <= 0) return null;
      if (typeof parsed.claimedAt !== 'string' || typeof parsed.updatedAt !== 'string') return null;
      return {
        token: parsed.token,
        assignee: parsed.assignee,
        base: parsed.base,
        slot: parsed.slot,
        claimedAt: parsed.claimedAt,
        updatedAt: parsed.updatedAt,
      };
    } catch {
      return null;
    }
  }

  function isWorkerClaimFresh(record: WorkerClaimRecord | null, nowMs = Date.now()): boolean {
    if (!record) return false;
    const updatedMs = Date.parse(record.updatedAt);
    if (!Number.isFinite(updatedMs)) return false;
    const ageSeconds = Math.max(0, Math.floor((nowMs - updatedMs) / 1000));
    return ageSeconds <= WORKER_CLAIM_LEASE_SECONDS;
  }

  function writeWorkerClaimRecord(lockDir: string, record: WorkerClaimRecord): boolean {
    try {
      fs.writeFileSync(workerClaimOwnerPath(lockDir), `${JSON.stringify(record, null, 2)}\n`, 'utf-8');
      return true;
    } catch {
      return false;
    }
  }

  function clearWorkerClaimMemory(): void {
    workerClaimBase = null;
    workerClaimSlot = null;
    lastWorkerClaimRefreshAtMs = 0;
  }

  function tryAcquireWorkerSlotClaim(base: string, slot: number): boolean {
    if (!boardContext || slot <= 0) return false;

    const lockDir = workerClaimLockDir(base, slot);
    if (!lockDir) return false;

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const assignee = `${base}-${slot}`;

    const refreshOwnedClaim = (existing: WorkerClaimRecord) => {
      if (nowMs - lastWorkerClaimRefreshAtMs < WORKER_CLAIM_REFRESH_INTERVAL_MS) {
        workerClaimBase = base;
        workerClaimSlot = slot;
        return true;
      }
      const refreshed: WorkerClaimRecord = {
        ...existing,
        assignee,
        base,
        slot,
        updatedAt: nowIso,
      };
      if (!writeWorkerClaimRecord(lockDir, refreshed)) return false;
      workerClaimBase = base;
      workerClaimSlot = slot;
      lastWorkerClaimRefreshAtMs = nowMs;
      return true;
    };

    if (fs.existsSync(lockDir)) {
      const existing = readWorkerClaimRecord(lockDir);
      if (existing?.token === workerClaimToken) {
        return refreshOwnedClaim(existing);
      }
      if (isWorkerClaimFresh(existing, nowMs)) {
        return false;
      }
      try {
        fs.rmSync(lockDir, { recursive: true, force: true });
      } catch {
        return false;
      }
    }

    try {
      fs.mkdirSync(lockDir);
    } catch {
      const existing = readWorkerClaimRecord(lockDir);
      if (existing?.token === workerClaimToken) {
        return refreshOwnedClaim(existing);
      }
      return false;
    }

    const created: WorkerClaimRecord = {
      token: workerClaimToken,
      assignee,
      base,
      slot,
      claimedAt: nowIso,
      updatedAt: nowIso,
    };

    if (!writeWorkerClaimRecord(lockDir, created)) {
      try {
        fs.rmSync(lockDir, { recursive: true, force: true });
      } catch {
        // best effort cleanup
      }
      return false;
    }

    workerClaimBase = base;
    workerClaimSlot = slot;
    lastWorkerClaimRefreshAtMs = nowMs;
    return true;
  }

  function releaseWorkerAssigneeClaim(): void {
    if (!boardContext || !workerClaimBase || workerClaimSlot === null) {
      clearWorkerClaimMemory();
      return;
    }

    const lockDir = workerClaimLockDir(workerClaimBase, workerClaimSlot);
    clearWorkerClaimMemory();
    if (!lockDir || !fs.existsSync(lockDir)) return;

    const existing = readWorkerClaimRecord(lockDir);
    if (existing && existing.token !== workerClaimToken) return;

    try {
      fs.rmSync(lockDir, { recursive: true, force: true });
    } catch {
      // best effort release
    }
  }

  function ensureAutoWorkerAssignee(ctx: ExtensionContext): string {
    const inferred = normalizeAssignee(inferAssigneeFromModel(ctx));
    const base = assigneeBase(inferred || DEFAULT_LISTENER_ASSIGNEE) || 'codex';

    if (workerClaimBase && workerClaimBase !== base) {
      releaseWorkerAssigneeClaim();
    }

    const preferred = normalizeAssignee(autoWorkerAssignee);
    const preferredSlot = preferred && assigneeBase(preferred) === base ? assigneeSlot(preferred) : null;

    const claimPreferred = (slot: number | null): string | null => {
      if (slot === null || slot <= 0) return null;
      if (!tryAcquireWorkerSlotClaim(base, slot)) return null;
      return `${base}-${slot}`;
    };

    let claimed = claimPreferred(workerClaimBase === base ? workerClaimSlot : null);
    if (!claimed) {
      claimed = claimPreferred(preferredSlot);
    }

    if (!claimed) {
      for (let slot = 1; slot <= WORKER_CLAIM_MAX_SLOT; slot += 1) {
        claimed = claimPreferred(slot);
        if (claimed) break;
      }
    }

    if (!claimed) {
      // Last resort (extremely unlikely unless all slots are exhausted).
      claimed = `${base}-${Math.max(1, Math.floor(Date.now() / 1000) % WORKER_CLAIM_MAX_SLOT)}`;
    }

    if (normalizeAssignee(autoWorkerAssignee) !== claimed) {
      autoWorkerAssignee = claimed;
      persistState();
    }

    return claimed;
  }

  function inferOperatingModeFromModel(ctx: ExtensionContext): 'pm' | 'worker' {
    const baseAssignee = assigneeBase(inferAssigneeFromModel(ctx));
    if (baseAssignee === 'codex' || baseAssignee === 'gemini' || baseAssignee === 'cursor') {
      return 'worker';
    }
    return 'pm';
  }

  function resolveOperatingMode(ctx: ExtensionContext): 'pm' | 'worker' {
    return operatingModeOverride || inferOperatingModeFromModel(ctx);
  }

  function getEffectiveListenerAssignee(ctx: ExtensionContext): string {
    const override = normalizeAssignee(listenerAssigneeOverride);
    if (override) return override;

    if (operatingMode === 'worker') {
      if (listenMode) {
        return ensureAutoWorkerAssignee(ctx);
      }

      const cached = normalizeAssignee(autoWorkerAssignee);
      if (cached) return cached;

      const base = assigneeBase(inferAssigneeFromModel(ctx) || DEFAULT_LISTENER_ASSIGNEE) || 'codex';
      return `${base}-1`;
    }

    return inferAssigneeFromModel(ctx) || DEFAULT_LISTENER_ASSIGNEE;
  }

  function probeOpenPmRuns(excludeRunIds: string[] = []): { hasConflict: boolean; latestRunId: string | null; openRunIds: string[] } {
    if (!boardContext || !fs.existsSync(boardContext.eventsLogPath)) {
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
        .readFileSync(boardContext.eventsLogPath, 'utf-8')
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

  function createRunId(): string {
    const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
    const random = Math.random().toString(36).slice(2, 10);
    return `run-${stamp}-${random}`;
  }

  function ensureEventsLogExists() {
    if (!boardContext) return;
    fs.mkdirSync(boardContext.stateDir, { recursive: true });
    if (!fs.existsSync(boardContext.eventsLogPath)) {
      fs.writeFileSync(boardContext.eventsLogPath, '', 'utf-8');
    }
  }

  function pushUnique(list: string[] | undefined, value: string): string[] {
    const current = Array.isArray(list) ? [...list] : [];
    if (!current.includes(value)) {
      current.push(value);
    }
    return current;
  }

  function inferRunIdForTask(taskId: string | undefined): string | undefined {
    if (!taskId) return undefined;
    const projectedRun = eventProjection.taskRun[taskId];
    if (projectedRun) return projectedRun;
    if (activeRunId) {
      const delegated = eventProjection.delegatedByRun[activeRunId] || [];
      if (delegated.includes(taskId)) return activeRunId;
    }

    if (boardContext && fs.existsSync(boardContext.eventsLogPath)) {
      try {
        const lines = fs
          .readFileSync(boardContext.eventsLogPath, 'utf-8')
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0);
        for (let i = lines.length - 1; i >= 0; i -= 1) {
          const parsed = JSON.parse(lines[i]) as PiEventRecord;
          if (parsed.taskId === taskId && parsed.runId) {
            eventProjection.taskRun[taskId] = parsed.runId;
            return parsed.runId;
          }
        }
      } catch {
        // best-effort fallback only
      }
    }

    return undefined;
  }

  function emitEvent(
    type: PiEventType,
    ctx: ExtensionContext,
    source: string,
    options?: {
      taskId?: string;
      runId?: string;
      assignee?: string;
      data?: Record<string, unknown>;
    }
  ) {
    if (!boardContext) return;

    ensureEventsLogExists();

    const runId = options?.runId || inferRunIdForTask(options?.taskId) || (operatingMode === 'pm' ? activeRunId || undefined : undefined);
    const event: PiEventRecord = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: new Date().toISOString(),
      type,
      ...(runId ? { runId } : {}),
      ...(options?.taskId ? { taskId: options.taskId } : {}),
      actorMode: operatingMode,
      ...(options?.assignee ? { actorAssignee: options.assignee } : {}),
      source,
      ...(options?.data ? { data: options.data } : {}),
    };

    fs.appendFileSync(boardContext.eventsLogPath, `${JSON.stringify(event)}\n`, 'utf-8');
  }

  function projectionHasDelegation(runId: string, taskId: string): boolean {
    const delegated = eventProjection.delegatedByRun[runId] || [];
    return delegated.includes(taskId);
  }

  function isRunClosed(runId: string): boolean {
    return typeof eventProjection.runClosedByRun[runId] === 'string';
  }

  /**
   * Adopt orphaned tasks from prior closed runs into the current PM run.
   *
   * When a new PM run starts, tasks delegated in prior runs may still be
   * in-progress or delivered. Those tasks are invisible to the new run's
   * projection because their events reference the old runId. This function
   * scans the board for such tasks and adopts them so the PM can track and
   * receive notifications about them.
   */
  function adoptOrphanedTasksForRun(ctx: ExtensionContext, runId: string, source: string): void {
    if (!boardContext || operatingMode !== 'pm') return;

    const activeDocs = readTasksDir(boardContext.boardDir);
    const adoptableStatuses = new Set(['ready', 'in_progress', 'delivered', 'failed', 'blocked']);

    const adopted: Array<{ taskId: string; status: string; title: string; assignee?: string }> = [];

    for (const doc of activeDocs) {
      const contractStatus = getContractStatus(doc.task);
      if (!adoptableStatuses.has(contractStatus)) continue;

      // Already tracked by this run
      if (projectionHasDelegation(runId, doc.task.id)) continue;

      // Check if the task belongs to an active (non-closed) run that is NOT this run
      const priorRunId = eventProjection.taskRun[doc.task.id];
      if (priorRunId && priorRunId === runId) continue;
      if (priorRunId && !isRunClosed(priorRunId)) continue; // prior run still active, don't steal

      // Adopt: register the task under the new run
      eventProjection.delegatedByRun[runId] = pushUnique(
        eventProjection.delegatedByRun[runId],
        doc.task.id
      );
      eventProjection.taskRun[doc.task.id] = runId;

      // Record adoption timestamp so stale detection uses this as the
      // baseline for tasks that have no prior progress timestamp, instead
      // of falling back to MAX_SAFE_INTEGER and immediately flagging them.
      eventProjection.taskAdoptedAt[doc.task.id] = new Date().toISOString();

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
      eventProjection.deliveredNotifiedByRun[runId] = pushUnique(
        eventProjection.deliveredNotifiedByRun[runId],
        dt.taskId
      );
    }

    persistState();

    // Notify PM about adopted tasks, especially delivered ones awaiting validation
    if (deliveredTasks.length > 0) {
      sendOrchestrationMessage(ctx, [
        `Run ${runId} adopted ${adopted.length} task(s) from prior closed runs.`,
        `${deliveredTasks.length} task(s) have been DELIVERED and await validation:`,
        ...deliveredTasks.map((t) => `- ${t.taskId}: ${t.title}`),
        'Use brainfile_contract_validate to review each delivery.',
      ]);
    }
  }

  function ensureActiveRunForDelegation(ctx: ExtensionContext, source: string): string | null {
    if (operatingMode !== 'pm') return activeRunId;

    if (activeRunId && !isRunClosed(activeRunId)) {
      return activeRunId;
    }

    activeRunId = createRunId();
    emitEvent('run.started', ctx, source, {
      runId: activeRunId,
      data: {
        mode: operatingMode,
      },
    });
    adoptOrphanedTasksForRun(ctx, activeRunId, `${source}:adopt`);
    persistState();
    return activeRunId;
  }

  // Guard against the race where pi.sendUserMessage() is async internally:
  // ctx.isIdle() may still return true for subsequent synchronous calls
  // in the same tick before the agent enters non-idle state.
  let sentMessageThisTick = false;

  function sendOrchestrationMessage(ctx: ExtensionContext, lines: string[]): void {
    const message = ['[BRAINFILE ORCHESTRATION]', ...lines].join('\n');
    if (!sentMessageThisTick && ctx.isIdle()) {
      sentMessageThisTick = true;
      // Reset after the current synchronous execution completes so that
      // future event loop iterations can send fresh messages normally.
      setTimeout(() => { sentMessageThisTick = false; }, 0);
      pi.sendUserMessage(message);
    } else {
      pi.sendUserMessage(message, { deliverAs: 'followUp' });
    }
  }

  function updateWorkerPresence(worker: string, status: 'online' | 'offline', at: string): void {
    eventProjection.workerPresence[worker] = {
      status,
      lastSeenAt: at,
      lastEventAt: at,
    };
  }

  function getWorkerAvailabilitySnapshot(nowMs = Date.now()): {
    available: Array<{ worker: string; ageSeconds: number; lastSeenAt: string }>;
    unavailable: Array<{ worker: string; reason: 'offline' | 'expired'; ageSeconds: number; lastSeenAt: string }>;
  } {
    const available: Array<{ worker: string; ageSeconds: number; lastSeenAt: string }> = [];
    const unavailable: Array<{ worker: string; reason: 'offline' | 'expired'; ageSeconds: number; lastSeenAt: string }> = [];

    for (const [worker, presence] of Object.entries(eventProjection.workerPresence)) {
      const seenMs = Date.parse(presence.lastSeenAt);
      const ageSeconds = Number.isFinite(seenMs) ? Math.max(0, Math.floor((nowMs - seenMs) / 1000)) : Number.MAX_SAFE_INTEGER;
      const expired = !Number.isFinite(seenMs) || ageSeconds > DEFAULT_WORKER_PRESENCE_TTL_SECONDS;

      if (presence.status === 'online' && !expired) {
        available.push({ worker, ageSeconds, lastSeenAt: presence.lastSeenAt });
      } else {
        unavailable.push({
          worker,
          reason: presence.status === 'offline' ? 'offline' : 'expired',
          ageSeconds,
          lastSeenAt: presence.lastSeenAt,
        });
      }
    }

    available.sort((a, b) => a.worker.localeCompare(b.worker));
    unavailable.sort((a, b) => a.worker.localeCompare(b.worker));

    return { available, unavailable };
  }

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

  function maybeEmitWorkerPresenceHeartbeat(ctx: ExtensionContext, source: string): void {
    if (operatingMode !== 'worker' || !listenMode) return;

    const assignee = normalizeAssignee(getEffectiveListenerAssignee(ctx));
    if (!assignee) return;
    lastWorkerAssignee = assignee;

    const nowIso = new Date().toISOString();
    const nowMs = Date.now();

    if (!workerOnlineEmitted) {
      emitEvent('worker.online', ctx, source, {
        assignee,
        data: {
          ttlSeconds: DEFAULT_WORKER_PRESENCE_TTL_SECONDS,
        },
      });
      updateWorkerPresence(assignee, 'online', nowIso);
      workerOnlineEmitted = true;
      lastWorkerHeartbeatAtMs = nowMs;
      persistState();
      return;
    }

    if (nowMs - lastWorkerHeartbeatAtMs < WORKER_HEARTBEAT_INTERVAL_MS) {
      return;
    }

    emitEvent('worker.heartbeat', ctx, source, {
      assignee,
      data: {
        ttlSeconds: DEFAULT_WORKER_PRESENCE_TTL_SECONDS,
      },
    });
    updateWorkerPresence(assignee, 'online', nowIso);
    lastWorkerHeartbeatAtMs = nowMs;
    persistState();
  }

  function emitWorkerOffline(ctx: ExtensionContext, source: string): void {
    const fallbackAssignee = normalizeAssignee(
      lastWorkerAssignee || autoWorkerAssignee || listenerAssigneeOverride || inferAssigneeFromModel(ctx) || DEFAULT_LISTENER_ASSIGNEE
    );
    if (!fallbackAssignee) {
      releaseWorkerAssigneeClaim();
      return;
    }

    emitEvent('worker.offline', ctx, source, {
      assignee: fallbackAssignee,
      data: {
        bestEffort: true,
      },
    });
    updateWorkerPresence(fallbackAssignee, 'offline', new Date().toISOString());
    workerOnlineEmitted = false;
    lastWorkerHeartbeatAtMs = 0;
    lastWorkerAssignee = fallbackAssignee;
    releaseWorkerAssigneeClaim();
    persistState();
  }

  function summarizeRun(runId: string): {
    result: 'running' | 'success' | 'blocked';
    counts: Record<string, number>;
    staleTasks: Array<{ taskId: string; ageSeconds: number; lastProgressAt?: string }>;
    openTasks: Array<{ taskId: string; status: string; assignee?: string; ageSeconds?: number; lastProgressAt?: string }>;
    blockingReasons: string[];
  } {
    const nowMs = Date.now();
    const delegatedIds = eventProjection.delegatedByRun[runId] || [];

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
      const located = locateTask(taskId, true);
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
        // Fall back to the adoption timestamp for tasks adopted from prior
        // runs that have no progress history. Without this, ageSeconds would
        // be MAX_SAFE_INTEGER, instantly flagging the task as stale and
        // blocking/closing the run before the PM can act.
        const adoptedAt = eventProjection.taskAdoptedAt[taskId];
        const effectiveProgressAt = lastProgressAt || adoptedAt;
        const progressMs = effectiveProgressAt ? Date.parse(effectiveProgressAt) : NaN;
        const ageSeconds = Number.isFinite(progressMs)
          ? Math.max(0, Math.floor((nowMs - progressMs) / 1000))
          : Number.MAX_SAFE_INTEGER;

        openTasks.push({ taskId, status, assignee: located.task.assignee, ageSeconds, lastProgressAt });

        if (ageSeconds >= staleTimeoutSeconds) {
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

  function maybeEvaluateActiveRun(ctx: ExtensionContext, source: string): void {
    if (operatingMode !== 'pm' || !listenMode || !activeRunId) return;
    if (isRunClosed(activeRunId)) return;

    const runId = activeRunId;
    const summary = summarizeRun(runId);
    let changed = false;

    for (const staleTask of summary.staleTasks) {
      const notified = eventProjection.staleNotifiedByRun[runId] || [];
      if (notified.includes(staleTask.taskId)) continue;

      emitEvent('task.stale', ctx, source, {
        taskId: staleTask.taskId,
        runId,
        data: {
          ageSeconds: staleTask.ageSeconds,
          staleTimeoutSeconds,
          lastProgressAt: staleTask.lastProgressAt || null,
        },
      });
      eventProjection.staleNotifiedByRun[runId] = pushUnique(notified, staleTask.taskId);
      changed = true;
    }

    if (summary.result === 'blocked') {
      if (!eventProjection.blockedNotifiedRuns.includes(runId)) {
        emitEvent('run.blocked', ctx, source, {
          runId,
          data: {
            result: 'blocked',
            reasons: summary.blockingReasons,
            counts: summary.counts,
            staleTimeoutSeconds,
            openTasks: summary.openTasks,
          },
        });
        eventProjection.blockedNotifiedRuns = pushUnique(eventProjection.blockedNotifiedRuns, runId);
        sendOrchestrationMessage(ctx, [
          `Run ${runId} is BLOCKED (${summary.blockingReasons.join(', ')}).`,
          `Open tasks: ${summary.openTasks.length}.`,
          `Stale timeout: ${staleTimeoutSeconds}s.`,
        ]);
        changed = true;
      }

      if (!isRunClosed(runId)) {
        emitEvent('run.closed', ctx, source, {
          runId,
          data: {
            result: 'blocked',
            reasons: summary.blockingReasons,
            counts: summary.counts,
            openTasks: summary.openTasks,
          },
        });
        eventProjection.runClosedByRun[runId] = 'blocked';
        if (!eventProjection.closedNotifiedRuns.includes(runId)) {
          eventProjection.closedNotifiedRuns = pushUnique(eventProjection.closedNotifiedRuns, runId);
          sendOrchestrationMessage(ctx, [
            `Run ${runId} closed with result: blocked.`,
            `Remaining/open tasks: ${summary.openTasks.length}.`,
          ]);
        }
        changed = true;
      }

      if (activeRunId === runId) {
        activeRunId = null;
        changed = true;
      }

      if (changed) persistState();
      return;
    }

    // --- Delivery batch notification ---
    // When all remaining open tasks are in 'delivered' status, notify PM once
    // so they can validate. Only fires when the delivered count changes.
    if (summary.result === 'running' && summary.counts.delegated > 0) {
      const deliveredCount = summary.counts.delivered;
      const allOpenAreDelivered = summary.openTasks.length > 0 &&
        summary.openTasks.every((t) => t.status === 'delivered');

      if (allOpenAreDelivered) {
        const prevNotified = eventProjection.deliveryBatchNotifiedByRun[runId] || 0;
        if (deliveredCount > prevNotified) {
          eventProjection.deliveryBatchNotifiedByRun[runId] = deliveredCount;
          const taskLines = summary.openTasks.map((t) => `  - ${t.taskId}${t.assignee ? ` (${t.assignee})` : ''}`);
          sendOrchestrationMessage(ctx, [
            `${deliveredCount} delivered task(s) awaiting your validation:`,
            ...taskLines,
            'Run `brainfile_contract_validate` for each, then `brainfile_complete_task` to finish them.',
          ]);
          changed = true;
        }
      }
    }

    if (summary.result === 'success' && !isRunClosed(runId)) {
      emitEvent('run.closed', ctx, source, {
        runId,
        data: {
          result: 'success',
          counts: summary.counts,
          openTasks: [],
        },
      });
      eventProjection.runClosedByRun[runId] = 'success';
      if (!eventProjection.closedNotifiedRuns.includes(runId)) {
        eventProjection.closedNotifiedRuns = pushUnique(eventProjection.closedNotifiedRuns, runId);
        sendOrchestrationMessage(ctx, [
          `Run ${runId} completed successfully.`,
          `Delegated tasks: ${summary.counts.delegated}.`,
        ]);
      }
      if (activeRunId === runId) {
        activeRunId = null;
      }
      changed = true;
    }

    if (changed) {
      persistState();
    }
  }

  function processEventLog(ctx: ExtensionContext): void {
    if (!boardContext) return;
    ensureEventsLogExists();

    const raw = fs.readFileSync(boardContext.eventsLogPath, 'utf-8');
    const lines = raw
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (eventProjection.cursor > lines.length) {
      eventProjection.cursor = 0;
    }

    if (eventProjection.cursor >= lines.length) return;

    const start = eventProjection.cursor;
    for (let index = start; index < lines.length; index += 1) {
      const line = lines[index];
      let parsed: PiEventRecord | null = null;
      try {
        parsed = JSON.parse(line) as PiEventRecord;
      } catch {
        continue;
      }

      const taskId = parsed.taskId;
      const runId = parsed.runId || inferRunIdForTask(taskId);

      if (runId && taskId && parsed.type === 'contract.delegated') {
        eventProjection.delegatedByRun[runId] = pushUnique(eventProjection.delegatedByRun[runId], taskId);
        eventProjection.taskRun[taskId] = runId;
      }

      if (runId && taskId && !eventProjection.taskRun[taskId]) {
        eventProjection.taskRun[taskId] = runId;
      }

      const actorAssignee = normalizeAssignee(parsed.actorAssignee);
      if (actorAssignee && (parsed.type === 'worker.online' || parsed.type === 'worker.heartbeat')) {
        updateWorkerPresence(actorAssignee, 'online', parsed.at || new Date().toISOString());
      }
      if (actorAssignee && parsed.type === 'worker.offline') {
        updateWorkerPresence(actorAssignee, 'offline', parsed.at || new Date().toISOString());
      }

      if (runId && taskId && parsed.type === 'contract.delivered' && projectionHasDelegation(runId, taskId)) {
        const notified = eventProjection.deliveredNotifiedByRun[runId] || [];
        if (!notified.includes(taskId)) {
          eventProjection.deliveredNotifiedByRun[runId] = pushUnique(notified, taskId);
        }
      }

      if (runId && taskId && parsed.type === 'contract.validated' && projectionHasDelegation(runId, taskId)) {
        const notified = eventProjection.validatedNotifiedByRun[runId] || [];
        if (!notified.includes(taskId)) {
          eventProjection.validatedNotifiedByRun[runId] = pushUnique(notified, taskId);
        }
      }

      if (runId && taskId && parsed.type === 'task.completed' && projectionHasDelegation(runId, taskId)) {
        const notified = eventProjection.completedNotifiedByRun[runId] || [];
        if (!notified.includes(taskId)) {
          eventProjection.completedNotifiedByRun[runId] = pushUnique(notified, taskId);
        }
      }

      if (operatingMode === 'pm' && listenMode && runId && parsed.type === 'run.blocked') {
        if (!eventProjection.blockedNotifiedRuns.includes(runId)) {
          eventProjection.blockedNotifiedRuns = pushUnique(eventProjection.blockedNotifiedRuns, runId);
          const reasons = Array.isArray((parsed.data as any)?.reasons)
            ? ((parsed.data as any).reasons as unknown[]).filter((item): item is string => typeof item === 'string')
            : [];
          sendOrchestrationMessage(ctx, [
            `Run ${runId} is BLOCKED${reasons.length > 0 ? ` (${reasons.join(', ')})` : ''}.`,
            'Review stale/failed tasks and re-delegate as needed.',
          ]);
        }
      }

      if (operatingMode === 'pm' && listenMode && runId && parsed.type === 'run.closed') {
        const result = String((parsed.data || {}).result || 'unknown');
        eventProjection.runClosedByRun[runId] = result;

        if (!eventProjection.closedNotifiedRuns.includes(runId)) {
          eventProjection.closedNotifiedRuns = pushUnique(eventProjection.closedNotifiedRuns, runId);
          const openTasks = Array.isArray((parsed.data as any)?.openTasks) ? (parsed.data as any).openTasks as unknown[] : [];
          sendOrchestrationMessage(ctx, [
            `Run ${runId} closed with result: ${result}.`,
            result === 'success' ? 'All delegated tasks reached terminal success states.' : `Remaining/open tasks: ${openTasks.length}.`,
          ]);
        }

        if (activeRunId === runId) {
          activeRunId = null;
        }
      }
    }

    eventProjection.cursor = lines.length;
    persistState();
  }

  function maybeEmitDelegatedEvent(task: Task, ctx: ExtensionContext, source: string): void {
    if (operatingMode !== 'pm') return;

    const contractStatus = String((task.contract as any)?.status || '');
    const assignee = normalizeAssignee(task.assignee);
    if (contractStatus !== 'ready' || !assignee) return;

    const runId = ensureActiveRunForDelegation(ctx, `${source}:run`);
    if (!runId) return;
    if (projectionHasDelegation(runId, task.id)) return;

    emitEvent('contract.delegated', ctx, source, {
      taskId: task.id,
      runId,
      assignee,
      data: {
        contractStatus,
      },
    });

    eventProjection.delegatedByRun[runId] = pushUnique(eventProjection.delegatedByRun[runId], task.id);
    eventProjection.taskRun[task.id] = runId;
    persistState();
  }

  function priorityRank(priority: string | undefined): number {
    if (priority === 'critical') return 0;
    if (priority === 'high') return 1;
    if (priority === 'medium') return 2;
    if (priority === 'low') return 3;
    return 4;
  }

  function getReadyContractsForAssignee(assignee: string): LocatedTask[] {
    if (!boardContext) return [];

    const normalizedAssignee = normalizeAssignee(assignee);
    if (!normalizedAssignee) return [];

    const matches: LocatedTask[] = [];

    for (const doc of readTasksDir(boardContext.boardDir)) {
      const contractStatus = (doc.task.contract as any)?.status;
      if (contractStatus !== 'ready') continue;
      if (!assigneeMatches(doc.task.assignee, normalizedAssignee)) continue;

      matches.push({
        task: doc.task,
        body: doc.body,
        filePath: doc.filePath || path.join(boardContext.boardDir, taskFileName(doc.task.id)),
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

  function activeTaskBlocksAutoPickup(): boolean {
    if (!activeTaskId) return false;

    const located = locateTask(activeTaskId, false);
    if (!located) return false;

    return !located.isLog;
  }

  function attemptAutoPickupAssignedContract(ctx: ExtensionContext): {
    picked: boolean;
    assignee: string;
    reason?: string;
    task?: LocatedTask;
  } {
    const refreshed = refreshBoardContext(ctx.cwd);
    const assignee = getEffectiveListenerAssignee(ctx);

    if (!refreshed.ok || !boardContext) {
      return { picked: false, assignee, reason: 'no_board' };
    }

    if (!normalizeAssignee(assignee)) {
      return { picked: false, assignee, reason: 'no_assignee' };
    }

    if (activeTaskBlocksAutoPickup()) {
      return { picked: false, assignee, reason: 'active_task' };
    }

    const candidates = getReadyContractsForAssignee(assignee);
    if (candidates.length === 0) {
      return { picked: false, assignee, reason: 'no_contracts' };
    }

    const chosen = candidates[0];
    const pickup = pickupContract(chosen, assignee, 'listener');
    if (!pickup.ok) {
      return { picked: false, assignee, reason: 'pickup_failed' };
    }

    activeTaskId = pickup.task.task.id;
    activeTaskPath = pickup.task.filePath;
    emitEvent('contract.picked_up', ctx, 'listener', {
      taskId: pickup.task.task.id,
      assignee,
      data: {
        status: 'in_progress',
      },
    });
    persistState();

    return {
      picked: true,
      assignee,
      task: pickup.task,
    };
  }

  function listenerNoopMessage(reason: string | undefined, assignee: string): string {
    if (reason === 'no_board') return 'No brainfile board found for listener.';
    if (reason === 'no_assignee') return 'Listener has no assignee identity.';
    if (reason === 'active_task') return `Listener is idle: active task ${activeTaskId} already selected.`;
    if (reason === 'no_contracts') return `No ready contracts assigned to "${assignee}".`;
    if (reason === 'paused') return 'Listener paused while user input is being processed.';
    if (reason === 'pickup_failed') return 'Listener found a contract but pickup failed due to status race.';
    return 'Listener did not pick up any task.';
  }

  function autoStartPickedTask(
    task: LocatedTask,
    assignee: string,
    ctx: ExtensionContext,
    options?: { wasJustPicked?: boolean }
  ) {
    const wasJustPicked = options?.wasJustPicked !== false;

    if (!listenerAutoStart) {
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
      pi.sendUserMessage(prompt);
    } else {
      pi.sendUserMessage(prompt, { deliverAs: 'followUp' });
    }

    const actionText = wasJustPicked ? 'picked up' : 'resumed';
    ctx.ui.notify(`🧠 Listener ${actionText} ${task.task.id} for "${assignee}" and started work.`, 'success');
  }

  function runListenerCycle(ctx: ExtensionContext, source: 'interval' | 'manual' | 'startup') {
    if (!listenMode) return;
    if (listenerPausedForUserInput) {
      if (source === 'manual') {
        ctx.ui.notify(listenerNoopMessage('paused', getEffectiveListenerAssignee(ctx)), 'info');
      }
      updateStatus(ctx);
      return;
    }
    if (listenerBusy) return;

    listenerBusy = true;
    try {
      processEventLog(ctx);

      if (operatingMode === 'pm') {
        maybeEvaluateActiveRun(ctx, `listener:${source}`);
        updateStatus(ctx);
        if (source === 'manual') {
          const tracked = activeRunId ? (eventProjection.delegatedByRun[activeRunId] || []).length : 0;
          const workers = getWorkerAvailabilitySnapshot();
          const available = workers.available.length > 0
            ? workers.available.map((worker) => `${worker.worker} (${worker.ageSeconds}s)`).join(', ')
            : 'none';
          ctx.ui.notify(
            activeRunId
              ? `Main listener active. Run ${activeRunId} tracking ${tracked} delegated task(s).\nAvailable workers: ${available}.\nStale timeout: ${staleTimeoutSeconds}s.`
              : `Main listener active, but no runId is set.\nAvailable workers: ${available}.\nStale timeout: ${staleTimeoutSeconds}s.`,
            'info'
          );
        }
        return;
      }

      maybeEmitWorkerPresenceHeartbeat(ctx, `listener:${source}`);

      const result = attemptAutoPickupAssignedContract(ctx);

      if (result.picked && result.task) {
        updateStatus(ctx);
        autoStartPickedTask(result.task, result.assignee, ctx);
        return;
      }

      updateStatus(ctx);

      if (source === 'manual' && listenerAutoStart && result.reason === 'active_task' && activeTaskId) {
        const activeLocated = locateTask(activeTaskId, false);
        const contractStatus = (activeLocated?.task.contract as any)?.status;
        if (activeLocated && contractStatus === 'in_progress') {
          autoStartPickedTask(activeLocated, result.assignee, ctx, { wasJustPicked: false });
          return;
        }
      }

      if (source === 'manual') {
        ctx.ui.notify(listenerNoopMessage(result.reason, result.assignee), 'info');
      }
    } catch (error) {
      if (source !== 'interval') {
        ctx.ui.notify(`Listener error: ${error instanceof Error ? error.message : String(error)}`, 'error');
      }
    } finally {
      listenerBusy = false;
    }
  }

  function stopListener() {
    if (listenerTimer) {
      clearInterval(listenerTimer);
      listenerTimer = null;
    }
    listenerBusy = false;
    listenerPausedForUserInput = false;
  }

  function startListener(ctx: ExtensionContext) {
    stopListener();

    listenerTimer = setInterval(() => {
      runListenerCycle(ctx, 'interval');
    }, LISTENER_POLL_INTERVAL_MS);
  }

  function setListenMode(enabled: boolean, ctx: ExtensionContext, source: 'manual' | 'startup' = 'manual') {
    if (source === 'manual') {
      listenerConfiguredExplicitly = true;
    }

    if (enabled === listenMode) {
      if (enabled && !listenerTimer) {
        startListener(ctx);
      }
      if (source === 'manual') {
        ctx.ui.notify(`Brainfile listener is already ${enabled ? 'enabled' : 'disabled'}.`, 'info');
      }
      updateStatus(ctx);
      return;
    }

    listenMode = enabled;
    listenerPausedForUserInput = false;

    if (enabled) {
      if (operatingMode === 'pm') {
        const hadRun = Boolean(activeRunId && !isRunClosed(activeRunId));
        if (!activeRunId || isRunClosed(activeRunId)) {
          activeRunId = createRunId();
        }
        if (!hadRun && activeRunId) {
          emitEvent('run.started', ctx, source, {
            runId: activeRunId,
            data: {
              mode: operatingMode,
            },
          });
          adoptOrphanedTasksForRun(ctx, activeRunId, `listen:${source}:adopt`);
        }
      }

      startListener(ctx);
      const workMode = listenerAutoStart ? 'start' : 'wait';
      const modeLabel = operatingMode === 'pm' ? `pm run ${activeRunId || 'none'}` : getEffectiveListenerAssignee(ctx);
      const orchestrationHint = operatingMode === 'pm'
        ? ' Event-driven orchestration is active; avoid sleep/poll waits.'
        : '';
      ctx.ui.notify(`Brainfile listener enabled (${modeLabel}, ${workMode} mode).${orchestrationHint}`, 'success');
      if (operatingMode === 'worker') {
        maybeEmitWorkerPresenceHeartbeat(ctx, `listen:${source}`);
      }
      runListenerCycle(ctx, source);
    } else {
      stopListener();
      if (operatingMode === 'pm') {
        activeRunId = null;
      } else if (workerOnlineEmitted) {
        emitWorkerOffline(ctx, `listen:${source}`);
      } else {
        releaseWorkerAssigneeClaim();
      }
      ctx.ui.notify('Brainfile listener disabled.', 'info');
    }

    persistState();
    updateStatus(ctx);
  }

  function autoClearCompletedActiveTask(ctx: ExtensionContext): boolean {
    if (!activeTaskId) return false;

    const located = locateTask(activeTaskId, true);
    if (!located || !located.isLog) return false;

    const clearedId = activeTaskId;
    activeTaskId = null;
    activeTaskPath = null;
    persistState();

    ctx.ui.notify(`Active task ${clearedId} completed and archived. Auto-cleared active context.`, 'info');
    return true;
  }

  function updateStatus(ctx: ExtensionContext) {
    const segments: string[] = ['bf'];
    const listenIdentity = operatingMode === 'pm'
      ? `main:${activeRunId || 'none'}`
      : getEffectiveListenerAssignee(ctx);
    const listenState = listenMode
      ? `on:${listenIdentity}:${listenerAutoStart ? 'start' : 'wait'}${listenerPausedForUserInput ? ':paused' : ''}`
      : `off:${listenIdentity}:${listenerAutoStart ? 'start' : 'wait'}`;

    if (!boardContext) {
      segments.push('board:missing');
      segments.push(`mode:${operatingMode}`);
      if (operatingMode === 'pm') {
        const workers = getWorkerAvailabilitySnapshot();
        segments.push(`run:${activeRunId || 'none'}`);
        segments.push(`workers:${workers.available.length}`);
      }
      segments.push(`plan:${planMode ? 'on' : 'off'}`);
      segments.push(`listen:${listenState}`);
      ctx.ui.setStatus(STATUS_KEY, segments.join(' · '));
      ctx.ui.setWidget(WIDGET_KEY, undefined);
      return;
    }

    const board = readBoardConfig();

    autoClearCompletedActiveTask(ctx);

    if (activeTaskId) {
      const located = locateTask(activeTaskId, true);
      if (located) {
        activeTaskPath = located.filePath;
        const contractStatus = (located.task.contract as any)?.status;
        const taskSegment = contractStatus
          ? `task:${located.task.id}[${contractStatus}]`
          : `task:${located.task.id}`;
        segments.push(taskSegment);
      } else {
        segments.push(`task:${activeTaskId}[missing]`);
      }
    } else {
      segments.push('task:none');
    }

    segments.push(`mode:${operatingMode}`);
    if (operatingMode === 'pm') {
      const workers = getWorkerAvailabilitySnapshot();
      segments.push(`run:${activeRunId || 'none'}`);
      segments.push(`workers:${workers.available.length}`);
      segments.push(`stale:${staleTimeoutSeconds}s`);
    }
    segments.push(`plan:${planMode ? 'on' : 'off'}`);
    segments.push(`listen:${listenState}`);

    ctx.ui.setStatus(STATUS_KEY, segments.join(' · '));

    if (!activeTaskId) {
      ctx.ui.setWidget(WIDGET_KEY, undefined);
      return;
    }

    const located = locateTask(activeTaskId, true);
    if (!located) {
      ctx.ui.setWidget(WIDGET_KEY, [`Active task ${activeTaskId} not found.`]);
      return;
    }

    const summary = taskSummary(located, board);
    const lines: string[] = [];
    lines.push(`${summary.id}: ${summary.title}`);
    lines.push(`Mode: ${operatingMode.toUpperCase()}`);
    lines.push(`Column: ${summary.column}`);
    if (summary.contract && (summary.contract as any).status) {
      lines.push(`Contract: ${(summary.contract as any).status}`);
    }
    if (listenMode) {
      const pauseText = listenerPausedForUserInput ? ', paused by user input' : '';
      const listenerLabel = operatingMode === 'pm'
        ? `main run ${activeRunId || 'none'}`
        : getEffectiveListenerAssignee(ctx);
      lines.push(`Listener: ON (${listenerLabel}, ${listenerAutoStart ? 'start' : 'wait'}${pauseText})`);
    }
    if (operatingMode === 'pm') {
      const workers = getWorkerAvailabilitySnapshot();
      const availableWorkers = workers.available.length > 0
        ? workers.available.map((worker) => `${worker.worker} (${worker.ageSeconds}s)`).join(', ')
        : 'none';
      lines.push(`Workers: ${availableWorkers}`);
      lines.push(`Stale timeout: ${staleTimeoutSeconds}s`);
    }

    const subtasks = summary.subtasks || [];
    if (subtasks.length > 0) {
      lines.push('Subtasks:');
      for (const subtask of subtasks.slice(0, 8)) {
        lines.push(`${subtask.completed ? '☑' : '☐'} ${subtask.title}`);
      }
      if (subtasks.length > 8) {
        lines.push(`... (${subtasks.length - 8} more)`);
      }
    }

    ctx.ui.setWidget(WIDGET_KEY, lines);
  }

  async function pickTaskInteractively(ctx: ExtensionContext): Promise<void> {
    if (!boardContext) return;

    const board = readBoardConfig();
    const docs = readTasksDir(boardContext.boardDir);
    if (docs.length === 0) {
      ctx.ui.notify('No active tasks found in .brainfile/board/.', 'warning');
      return;
    }

    const choices = docs.map((doc) => {
      const colTitle = columnTitleForId(doc.task.column, board);
      return `${doc.task.id} · ${doc.task.title} [${colTitle}]`;
    });

    const selection = await ctx.ui.select('Select active Brainfile task:', choices);
    if (!selection) return;

    const taskId = selection.split(' · ')[0];
    activeTaskId = taskId;
    const located = locateTask(taskId, true);
    activeTaskPath = located?.filePath || null;

    persistState();
    updateStatus(ctx);
    ctx.ui.notify(`Active task set to ${taskId}`, 'info');
  }

  function setActiveTask(taskId: string, ctx: ExtensionContext): boolean {
    const located = locateTask(taskId, true);
    if (!located) {
      ctx.ui.notify(`Task not found: ${taskId}`, 'error');
      return false;
    }

    activeTaskId = taskId;
    activeTaskPath = located.filePath;
    persistState();
    updateStatus(ctx);
    return true;
  }

  function boardSummary(): { title: string; columns: Array<{ id: string; title: string; count: number }>; total: number } {
    const board = readBoardConfig();
    const title = board?.title || 'Brainfile';
    const columns = getColumns(board);
    const docs = boardContext ? readTasksDir(boardContext.boardDir) : [];

    const counts = new Map<string, number>();
    for (const doc of docs) {
      const column = doc.task.column || 'unknown';
      counts.set(column, (counts.get(column) || 0) + 1);
    }

    const summaryColumns = columns.map((column) => ({
      id: column.id,
      title: column.title,
      count: counts.get(column.id) || 0,
    }));

    return {
      title,
      columns: summaryColumns,
      total: docs.length,
    };
  }

  function applyTaskPatch(located: LocatedTask, patch: {
    title?: string;
    description?: string;
    clearDescription?: boolean;
    priority?: string;
    clearPriority?: boolean;
    tags?: string[];
    clearTags?: boolean;
    assignee?: string;
    clearAssignee?: boolean;
    dueDate?: string;
    clearDueDate?: boolean;
    relatedFiles?: string[];
    clearRelatedFiles?: boolean;
  }): TaskDocument {
    const updatedTask: Task = { ...located.task };
    let updatedBody = located.body;

    if (patch.title !== undefined) updatedTask.title = patch.title;

    if (patch.clearDescription) {
      delete updatedTask.description;
      updatedBody = setDescriptionSection(updatedBody, undefined);
    } else if (patch.description !== undefined) {
      updatedTask.description = patch.description;
      updatedBody = setDescriptionSection(updatedBody, patch.description);
    }

    if (patch.clearPriority) {
      delete updatedTask.priority;
    } else if (patch.priority !== undefined) {
      updatedTask.priority = patch.priority as any;
    }

    if (patch.clearTags) {
      delete updatedTask.tags;
    } else if (patch.tags !== undefined) {
      updatedTask.tags = patch.tags;
    }

    if (patch.clearAssignee) {
      delete updatedTask.assignee;
    } else if (patch.assignee !== undefined) {
      updatedTask.assignee = patch.assignee;
    }

    if (patch.clearDueDate) {
      delete updatedTask.dueDate;
    } else if (patch.dueDate !== undefined) {
      updatedTask.dueDate = patch.dueDate;
    }

    if (patch.clearRelatedFiles) {
      delete updatedTask.relatedFiles;
    } else if (patch.relatedFiles !== undefined) {
      updatedTask.relatedFiles = patch.relatedFiles;
    }

    updatedTask.updatedAt = new Date().toISOString();

    return {
      task: updatedTask,
      body: updatedBody,
      filePath: located.filePath,
    };
  }

  function ensureTaskHasContract(task: Task): { ok: true; contract: any } | { ok: false; error: string } {
    const contract = (task as any).contract;
    if (!contract || typeof contract !== 'object') {
      return { ok: false, error: `Task ${task.id} has no contract.` };
    }
    return { ok: true, contract };
  }

  function getContractStatus(task: Task): string {
    return String((task as any)?.contract?.status || 'none');
  }

  function resolveDeliverablePath(rawPath: string): string {
    if (!boardContext) return rawPath;
    const normalizedPath = normalizePathInput(rawPath.trim());
    return path.isAbsolute(normalizedPath)
      ? normalizedPath
      : path.join(boardContext.projectRoot, normalizedPath);
  }

  function checkContractDeliverables(located: LocatedTask): Array<{ ok: boolean; message: string; resolvedPath?: string; deliverable?: any }> {
    if (!boardContext) {
      return [{ ok: false, message: 'Brainfile context unavailable.' }];
    }

    const contract = (located.task as any).contract as any;
    const deliverables = Array.isArray(contract?.deliverables) ? contract.deliverables : [];
    const deliverableChecks: Array<{ ok: boolean; message: string; resolvedPath?: string; deliverable?: any }> = [];

    for (const deliverable of deliverables) {
      const rawPath = typeof deliverable?.path === 'string' ? deliverable.path.trim() : '';
      if (!rawPath) {
        deliverableChecks.push({
          ok: false,
          message: `Invalid deliverable missing path: ${asJson(deliverable)}`,
          deliverable,
        });
        continue;
      }

      const resolvedPath = resolveDeliverablePath(rawPath);
      const exists = fs.existsSync(resolvedPath);
      deliverableChecks.push({
        ok: exists,
        message: exists
          ? `file exists: ${normalizePathInput(rawPath)}`
          : `file missing: ${normalizePathInput(rawPath)}`,
        resolvedPath,
        deliverable,
      });
    }

    return deliverableChecks;
  }

  function runValidationCommands(
    commands: string[],
    options?: { stopOnFailure?: boolean }
  ): Array<{ command: string; exitCode: number; stdout: string; stderr: string; warning?: string }> {
    if (!boardContext || commands.length === 0) return [];

    const stopOnFailure = options?.stopOnFailure !== false;
    const commandResults: Array<{ command: string; exitCode: number; stdout: string; stderr: string; warning?: string }> = [];

    for (const command of commands) {
      const warning = detectDirectoryChangeWarning(command);
      const result = spawnSync(command, {
        shell: true,
        cwd: boardContext.projectRoot,
        encoding: 'utf-8',
        maxBuffer: 20 * 1024 * 1024,
      });

      const exitCode = typeof result.status === 'number' ? result.status : 1;
      commandResults.push({
        command,
        exitCode,
        stdout: truncateText(result.stdout || '', 4000),
        stderr: truncateText(result.stderr || '', 4000),
        ...(warning ? { warning } : {}),
      });

      if (stopOnFailure && exitCode !== 0) {
        break;
      }
    }

    return commandResults;
  }

  function appendContractHandoffLog(located: LocatedTask, action: 'pickup' | 'deliver', lines: string[]) {
    const entryLines = [`handoff ${action}: ${located.task.id}`, ...lines.filter(Boolean)];
    appendLog(located.filePath, entryLines.join('\n'), 'brainfile-extension');
  }

  function collectDeliveryEvidence(
    deliverableChecks: Array<{ ok: boolean; message: string; resolvedPath?: string; deliverable?: any }>,
    commandResults: Array<{ command: string; exitCode: number; stdout: string; stderr: string; warning?: string }>
  ) {
    const capturedAt = new Date().toISOString();

    let gitHead: string | null = null;
    if (boardContext) {
      const gitResult = spawnSync('git rev-parse HEAD', {
        shell: true,
        cwd: boardContext.projectRoot,
        encoding: 'utf-8',
      });
      if (gitResult.status === 0) {
        const hash = String(gitResult.stdout || '').trim();
        if (hash) gitHead = hash;
      }
    }

    const fileEvidence = deliverableChecks
      .filter((check) => check.ok && typeof check.resolvedPath === 'string' && check.resolvedPath.length > 0)
      .map((check) => {
        try {
          const stats = fs.statSync(check.resolvedPath!);
          return {
            path: boardContext ? path.relative(boardContext.projectRoot, check.resolvedPath!) : check.resolvedPath,
            modifiedAt: stats.mtime.toISOString(),
            size: stats.size,
          };
        } catch {
          return {
            path: boardContext ? path.relative(boardContext.projectRoot, check.resolvedPath!) : check.resolvedPath,
            modifiedAt: null,
            size: null,
          };
        }
      });

    return {
      capturedAt,
      gitHead,
      files: fileEvidence,
      selfCheck: {
        commandsRun: commandResults.length,
        failedCommands: commandResults.filter((result) => result.exitCode !== 0).map((result) => result.command),
      },
    };
  }

  function pickupContract(located: LocatedTask, assignee: string, source: 'listener' | 'tool' | 'command'):
    { ok: true; alreadyInProgress?: boolean; task: LocatedTask } | { ok: false; error: string } {
    const taskAssignee = normalizeAssignee(located.task.assignee);
    if (taskAssignee && !assigneeMatches(taskAssignee, assignee)) {
      return {
        ok: false,
        error: `Contract ${located.task.id} is assigned to "${located.task.assignee}", not "${assignee}".`,
      };
    }

    const currentStatus = getContractStatus(located.task);
    if (currentStatus === 'in_progress') {
      return { ok: true, alreadyInProgress: true, task: located };
    }

    if (currentStatus !== 'ready') {
      return {
        ok: false,
        error: `Contract ${located.task.id} is ${currentStatus}; only ready contracts can be picked up.`,
      };
    }

    const updated = setContractStatus(located, 'in_progress');
    appendContractHandoffLog(updated, 'pickup', [`assignee: ${assignee}`, `source: ${source}`]);
    return { ok: true, task: updated };
  }

  function deliverContractWithEvidence(located: LocatedTask, assignee: string, source: 'tool' | 'command'):
    {
      ok: true;
      task: LocatedTask;
      deliverableChecks: Array<{ ok: boolean; message: string; resolvedPath?: string; deliverable?: any }>;
      commandResults: Array<{ command: string; exitCode: number; stdout: string; stderr: string; warning?: string }>;
      evidence: any;
    } | {
      ok: false;
      error: string;
      deliverableChecks?: Array<{ ok: boolean; message: string; resolvedPath?: string; deliverable?: any }>;
    } {
    const taskAssignee = normalizeAssignee(located.task.assignee);
    if (taskAssignee && !assigneeMatches(taskAssignee, assignee)) {
      return {
        ok: false,
        error: `Contract ${located.task.id} is assigned to "${located.task.assignee}", not "${assignee}".`,
      };
    }

    const currentStatus = getContractStatus(located.task);
    if (currentStatus === 'delivered') {
      const contract = (located.task as any).contract as any;
      return {
        ok: true,
        task: located,
        deliverableChecks: checkContractDeliverables(located),
        commandResults: [],
        evidence: contract?.metrics?.deliveryEvidence || null,
      };
    }

    if (currentStatus !== 'in_progress') {
      return {
        ok: false,
        error: `Contract ${located.task.id} is ${currentStatus}; deliver requires in_progress status.`,
      };
    }

    const deliverableChecks = checkContractDeliverables(located);
    const missing = deliverableChecks.filter((check) => !check.ok);
    if (missing.length > 0) {
      return {
        ok: false,
        error: `Cannot deliver ${located.task.id}: ${missing.length} deliverable(s) missing.`,
        deliverableChecks,
      };
    }

    const contract = (located.task as any).contract as any;
    const validationCommands = Array.isArray(contract?.validation?.commands)
      ? contract.validation.commands.filter((cmd: unknown) => typeof cmd === 'string' && cmd.trim().length > 0)
      : [];

    const commandResults = runValidationCommands(validationCommands, { stopOnFailure: false });
    const evidence = collectDeliveryEvidence(deliverableChecks, commandResults);
    const updated = setContractStatus(located, 'delivered', {
      metricsPatch: {
        deliveryEvidence: evidence,
      },
    });

    const failedSelfChecks = commandResults.filter((result) => result.exitCode !== 0).length;
    appendContractHandoffLog(updated, 'deliver', [
      `assignee: ${assignee}`,
      `source: ${source}`,
      `deliverablesChecked: ${deliverableChecks.length}`,
      `selfChecksFailed: ${failedSelfChecks}`,
      `gitHead: ${evidence.gitHead || 'none'}`,
    ]);

    return {
      ok: true,
      task: updated,
      deliverableChecks,
      commandResults,
      evidence,
    };
  }

  function setContractStatus(
    located: LocatedTask,
    status: string,
    options?: { feedback?: string; metricsPatch?: Record<string, unknown> }
  ): LocatedTask {
    const updatedTask: Task = { ...located.task };
    const contract = { ...((updatedTask as any).contract || {}) } as any;
    const previousStatus = String(contract.status || 'none');
    contract.status = status;

    const now = new Date();
    const metrics = { ...(contract.metrics || {}) } as any;
    if (status === 'in_progress') {
      metrics.pickedUpAt = now.toISOString();
      if (previousStatus === 'failed') {
        if (typeof metrics.reworkCount === 'number' && Number.isFinite(metrics.reworkCount)) {
          metrics.reworkCount = Math.max(0, Math.round(metrics.reworkCount)) + 1;
        } else {
          metrics.reworkCount = 1;
        }
      } else if (typeof metrics.reworkCount !== 'number' || !Number.isFinite(metrics.reworkCount)) {
        metrics.reworkCount = 0;
      }
    } else if (status === 'delivered') {
      metrics.deliveredAt = now.toISOString();
      if (typeof metrics.pickedUpAt === 'string') {
        const pickedUpMs = Date.parse(metrics.pickedUpAt);
        if (Number.isFinite(pickedUpMs)) {
          metrics.duration = Math.max(0, Math.round((now.getTime() - pickedUpMs) / 1000));
        }
      }
    }

    if (options?.metricsPatch && typeof options.metricsPatch === 'object') {
      Object.assign(metrics, options.metricsPatch);
    }
    contract.metrics = metrics;

    if (options?.feedback && options.feedback.trim()) {
      contract.feedback = options.feedback.trim();
    } else {
      delete contract.feedback;
    }

    (updatedTask as any).contract = contract;
    updatedTask.updatedAt = now.toISOString();

    writeTaskFile(located.filePath, updatedTask, located.body);

    return {
      ...located,
      task: updatedTask,
    };
  }

  function runContractValidation(located: LocatedTask) {
    if (!boardContext) {
      return {
        error: 'Brainfile context unavailable.',
      };
    }

    const contract = (located.task as any).contract as any;
    const validationCommands = Array.isArray(contract?.validation?.commands)
      ? contract.validation.commands.filter((cmd: unknown) => typeof cmd === 'string' && cmd.trim().length > 0)
      : [];

    const deliverableChecks = checkContractDeliverables(located);
    const commandResults: Array<{ command: string; exitCode: number; stdout: string; stderr: string; warning?: string }> = [];

    let ok = deliverableChecks.every((check) => check.ok);

    if (ok) {
      const runResults = runValidationCommands(validationCommands, { stopOnFailure: true });
      commandResults.push(...runResults);
      if (runResults.some((result) => result.exitCode !== 0)) {
        ok = false;
      }
    }

    return {
      ok,
      deliverableChecks,
      commandResults,
    };
  }

  function buildContractContextPayload(located: LocatedTask) {
    const task = located.task;
    const contract = (task as any).contract || {};

    return {
      task: {
        id: task.id,
        title: task.title,
        description: task.description || extractDescription(located.body) || '',
        column: task.column,
        relatedFiles: task.relatedFiles || [],
      },
      contract: {
        status: contract.status,
        version: contract.version,
        deliverables: contract.deliverables || [],
        constraints: contract.constraints || [],
        validationCommands: contract.validation?.commands || [],
        feedback: contract.feedback,
        metrics: contract.metrics || {},
      },
    };
  }

  pi.on('session_start', async (_event, ctx) => {
    stopListener();
    operatingMode = inferOperatingModeFromModel(ctx);

    const refreshed = refreshBoardContext(ctx.cwd);
    if (!refreshed.ok) {
      listenMode = false;
      ctx.ui.notify(refreshed.error, 'warning');
      updateStatus(ctx);
      return;
    }

    if (boardContext) {
      ctx.ui.notify(`Brainfile v2 found: ${path.relative(ctx.cwd, boardContext.brainfilePath)}`, 'info');
    }

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
      const located = locateTask(stateEntry.data.activeTaskId, true);
      if (located && !located.isLog) {
        activeTaskId = located.task.id;
        activeTaskPath = located.filePath;
      } else {
        activeTaskId = null;
        activeTaskPath = null;
      }
    }

    operatingModeOverride =
      stateEntry?.data?.operatingModeOverride === 'pm' || stateEntry?.data?.operatingModeOverride === 'worker'
        ? stateEntry.data.operatingModeOverride
        : null;
    operatingMode = resolveOperatingMode(ctx);
    listenerConfiguredExplicitly = stateEntry?.data?.listenerConfiguredExplicitly === true;
    listenerAssigneeOverride = stateEntry?.data?.listenerAssigneeOverride || null;
    listenerAutoStart = stateEntry?.data?.listenerAutoStart !== false;
    autoWorkerAssignee = normalizeAssignee(stateEntry?.data?.autoWorkerAssignee) || null;
    activeRunId = typeof stateEntry?.data?.activeRunId === 'string' ? stateEntry.data.activeRunId : null;
    eventProjection = normalizeEventProjection(stateEntry?.data?.eventProjection);
    listenerPausedForUserInput = false;

    let autoDemotedPmRunId: string | null = null;
    if (!operatingModeOverride && operatingMode === 'pm') {
      const probe = probeOpenPmRuns(activeRunId ? [activeRunId] : []);
      if (probe.hasConflict) {
        operatingMode = 'worker';
        autoDemotedPmRunId = probe.latestRunId;
      }
    }

    if (operatingMode !== 'pm') {
      activeRunId = null;
    }

    const shouldEnablePlanMode = stateEntry?.data?.planMode === true;
    if (shouldEnablePlanMode) {
      setPlanMode(true, ctx);
    } else {
      planMode = false;
      toolsBeforePlan = null;
    }

    const hasPersistedListenMode = typeof stateEntry?.data?.listenMode === 'boolean';
    const shouldEnableListenMode = listenerConfiguredExplicitly && hasPersistedListenMode
      ? stateEntry?.data?.listenMode === true
      : operatingMode === 'worker';

    if (shouldEnableListenMode) {
      setListenMode(true, ctx, 'startup');
    } else {
      listenMode = false;
      stopListener();
    }

    const modeNotice = operatingMode === 'worker'
      ? 'Brainfile mode: Worker mode (listener ON by default).'
      : 'Brainfile mode: PM mode (listener OFF by default).';
    const overrideNotice = operatingModeOverride ? ` Role override active: ${operatingModeOverride.toUpperCase()}.` : '';
    ctx.ui.notify(`${modeNotice}${overrideNotice}`, 'info');

    if (autoDemotedPmRunId) {
      ctx.ui.notify(
        `Detected active PM run ${autoDemotedPmRunId}. Auto-switching this session to Worker mode to avoid PM conflicts. Use /listen role pm to override.`,
        'info'
      );
    }

    updateStatus(ctx);
  });

  pi.on('session_shutdown', async (_event, ctx) => {
    if (operatingMode === 'worker' && workerOnlineEmitted) {
      emitWorkerOffline(ctx, 'session_shutdown');
    } else if (operatingMode === 'worker') {
      releaseWorkerAssigneeClaim();
    }
    stopListener();
  });

  pi.on('model_select', async (_event, ctx) => {
    let nextMode = resolveOperatingMode(ctx);
    let autoDemotedPmRunId: string | null = null;

    if (!operatingModeOverride && nextMode === 'pm') {
      const probe = probeOpenPmRuns(activeRunId ? [activeRunId] : []);
      if (probe.hasConflict) {
        nextMode = 'worker';
        autoDemotedPmRunId = probe.latestRunId;
      }
    }

    if (nextMode !== operatingMode) {
      const previousMode = operatingMode;
      if (previousMode === 'worker' && nextMode !== 'worker' && workerOnlineEmitted) {
        emitWorkerOffline(ctx, 'model_select');
      } else if (previousMode === 'worker' && nextMode !== 'worker') {
        releaseWorkerAssigneeClaim();
      }

      operatingMode = nextMode;

      if (operatingMode !== 'pm') {
        activeRunId = null;
      } else if (listenMode && (!activeRunId || isRunClosed(activeRunId))) {
        activeRunId = createRunId();
        emitEvent('run.started', ctx, 'model_select', {
          runId: activeRunId,
          data: { mode: operatingMode },
        });
        adoptOrphanedTasksForRun(ctx, activeRunId, 'model_select:adopt');
      }

      if (!listenerConfiguredExplicitly) {
        setListenMode(operatingMode === 'worker', ctx, 'startup');
      }

      if (autoDemotedPmRunId) {
        ctx.ui.notify(
          `Detected active PM run ${autoDemotedPmRunId}. Keeping this session in Worker mode to avoid PM conflicts. Use /listen role pm to override.`,
          'info'
        );
      }

      updateStatus(ctx);
      return;
    }

    if (!listenMode || listenerAssigneeOverride) return;
    updateStatus(ctx);
  });

  pi.on('input', async (event, ctx) => {
    if (!listenMode || operatingMode !== 'worker') return;
    if (event.source === 'extension') return;
    if (ctx.isIdle()) return;

    listenerPausedForUserInput = true;
    updateStatus(ctx);
  });

  pi.on('agent_end', async (_event, ctx) => {
    if (!listenerPausedForUserInput) return;
    listenerPausedForUserInput = false;
    updateStatus(ctx);
    if (listenMode) {
      runListenerCycle(ctx, 'startup');
    }
  });

  pi.on('tool_call', async (event) => {
    if (!planMode) return;

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
    if (!boardContext) return;

    const autoCleared = autoClearCompletedActiveTask(ctx);
    if (autoCleared) {
      updateStatus(ctx);
    }

    const parts: string[] = [];

    if (planMode) {
      parts.push(`[BRAINFILE PLAN MODE]\nMutating tools are disabled. Analyze and plan only. Do not execute code or mutate tasks yet.`);
    }

    if (operatingMode === 'pm' && listenMode && activeRunId) {
      parts.push(
        `[BRAINFILE ORCHESTRATION MODE]\n` +
          `Run ID: ${activeRunId}\n` +
          `Delegated delivery updates are event-driven via the listener.\n` +
          `Do NOT use sleep/manual polling loops to wait for workers. Continue other orchestration work and react to orchestration notifications.`
      );
    }

    if (activeTaskId) {
      const board = readBoardConfig();
      const located = locateTask(activeTaskId, true);
      if (located) {
        const summary = taskSummary(located, board);
        parts.push(
          `[BRAINFILE ACTIVE TASK]\n` +
            `ID: ${summary.id}\n` +
            `Title: ${summary.title}\n` +
            `Column: ${summary.column}\n` +
            `${summary.description ? `Description: ${summary.description}\n` : ''}` +
            `${summary.contract ? `Contract Status: ${(summary.contract as any).status || 'none'}\n` : ''}` +
            `${summary.subtasks.length > 0 ? `Subtasks:\n${summary.subtasks.map((s, i) => `${i + 1}. ${s.completed ? '[x]' : '[ ]'} ${s.title}`).join('\n')}` : 'Subtasks: none'}`
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

  async function handleListenCommand(actionParts: string[], ctx: ExtensionContext): Promise<void> {
    const action = (actionParts[0] || '').toLowerCase();

    if (!action) {
      setListenMode(!listenMode, ctx);
      return;
    }

    if (action === 'on' || action === 'enable') {
      setListenMode(true, ctx);
      return;
    }

    if (action === 'off' || action === 'disable') {
      setListenMode(false, ctx);
      return;
    }

    if (action === 'status') {
      const effectiveAssignee = getEffectiveListenerAssignee(ctx);
      const overrideText = listenerAssigneeOverride ? `override: ${listenerAssigneeOverride}` : 'override: auto';
      const workMode = listenerAutoStart ? 'start (auto begin work)' : 'wait (pick up only)';
      const pauseText = listenerPausedForUserInput ? 'paused by user input' : 'active';
      const roleSource = operatingModeOverride
        ? `override (${operatingModeOverride.toUpperCase()})`
        : `auto (${inferOperatingModeFromModel(ctx).toUpperCase()} from model)`;
      const runInfo = operatingMode === 'pm'
        ? (() => {
            const workers = getWorkerAvailabilitySnapshot();
            const availableWorkers = workers.available.length > 0
              ? workers.available.map((worker) => `${worker.worker} (${worker.ageSeconds}s)`).join(', ')
              : 'none';
            return `Run: ${activeRunId || 'none'}\nTracked delegations: ${activeRunId ? (eventProjection.delegatedByRun[activeRunId] || []).length : 0}\nAvailable workers: ${availableWorkers}\nStale timeout: ${staleTimeoutSeconds}s\nOrchestration: event-driven (no sleep/poll waits)`;
          })()
        : `Assignee: ${effectiveAssignee}\n${overrideText}`;
      ctx.ui.notify(
        `Mode: ${operatingMode.toUpperCase()}\nRole source: ${roleSource}\nListener: ${listenMode ? 'ON' : 'OFF'} (${pauseText})\n${runInfo}\nWork mode: ${workMode}`,
        'info'
      );
      updateStatus(ctx);
      return;
    }

    if (action === 'role') {
      const value = (actionParts[1] || '').toLowerCase();

      if (!value || value === 'status') {
        const sourceText = operatingModeOverride
          ? `override (${operatingModeOverride.toUpperCase()})`
          : `auto (${inferOperatingModeFromModel(ctx).toUpperCase()} from model)`;
        ctx.ui.notify(`Role source: ${sourceText}\nEffective mode: ${operatingMode.toUpperCase()}`, 'info');
        return;
      }

      let nextOverride: 'pm' | 'worker' | null = operatingModeOverride;
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

      const previousMode = operatingMode;
      operatingModeOverride = nextOverride;
      operatingMode = resolveOperatingMode(ctx);

      let autoDemotedPmRunId: string | null = null;
      if (!operatingModeOverride && operatingMode === 'pm') {
        const probe = probeOpenPmRuns(activeRunId ? [activeRunId] : []);
        if (probe.hasConflict) {
          operatingMode = 'worker';
          autoDemotedPmRunId = probe.latestRunId;
        }
      }

      if (previousMode === 'worker' && operatingMode !== 'worker' && workerOnlineEmitted) {
        emitWorkerOffline(ctx, 'listen.role');
      } else if (previousMode === 'worker' && operatingMode !== 'worker') {
        releaseWorkerAssigneeClaim();
      }

      if (operatingMode !== 'pm') {
        activeRunId = null;
      } else if (listenMode && (!activeRunId || isRunClosed(activeRunId))) {
        activeRunId = createRunId();
        emitEvent('run.started', ctx, 'listen.role', {
          runId: activeRunId,
          data: { mode: operatingMode },
        });
        adoptOrphanedTasksForRun(ctx, activeRunId, 'listen.role:adopt');
      }

      persistState();

      if (!listenerConfiguredExplicitly && previousMode !== operatingMode) {
        setListenMode(operatingMode === 'worker', ctx, 'startup');
      } else {
        updateStatus(ctx);
      }

      if (listenMode) {
        runListenerCycle(ctx, 'manual');
      }

      const sourceText = operatingModeOverride
        ? `override (${operatingModeOverride.toUpperCase()})`
        : `auto (${inferOperatingModeFromModel(ctx).toUpperCase()} from model)`;
      ctx.ui.notify(`Operating mode set to ${operatingMode.toUpperCase()} (${sourceText}).`, 'success');
      if (autoDemotedPmRunId) {
        ctx.ui.notify(
          `Detected active PM run ${autoDemotedPmRunId}. Auto-switching this session to Worker mode to avoid PM conflicts. Use /listen role pm to override.`,
          'info'
        );
      }
      return;
    }

    if (action === 'mode' || action === 'work') {
      const value = (actionParts[1] || '').toLowerCase();

      if (!value || value === 'status') {
        ctx.ui.notify(`Work mode: ${listenerAutoStart ? 'start' : 'wait'}`, 'info');
        return;
      }

      if (value === 'start' || value === 'on' || value === 'auto') {
        listenerConfiguredExplicitly = true;
        listenerAutoStart = true;
        persistState();
        updateStatus(ctx);
        ctx.ui.notify('Listener work mode set to start.', 'success');
        if (listenMode) {
          runListenerCycle(ctx, 'manual');
        }
        return;
      }

      if (value === 'wait' || value === 'off') {
        listenerConfiguredExplicitly = true;
        listenerAutoStart = false;
        persistState();
        updateStatus(ctx);
        ctx.ui.notify('Listener work mode set to wait.', 'info');
        return;
      }

      ctx.ui.notify('Usage: /listen mode <start|wait>', 'warning');
      return;
    }

    if (action === 'now') {
      runListenerCycle(ctx, 'manual');
      return;
    }

    if (action === 'as' || action === 'assignee' || action === 'asignee') {
      const assignee = normalizeAssignee(actionParts.slice(1).join(' '));
      if (!assignee) {
        ctx.ui.notify('Usage: /listen assignee <name>', 'warning');
        return;
      }

      listenerConfiguredExplicitly = true;
      listenerAssigneeOverride = assignee;
      if (operatingMode === 'worker') {
        releaseWorkerAssigneeClaim();
      }
      persistState();
      updateStatus(ctx);
      ctx.ui.notify(`Listener assignee override set to "${assignee}".`, 'success');
      if (listenMode) {
        runListenerCycle(ctx, 'manual');
      }
      return;
    }

    if (action === 'auto') {
      listenerConfiguredExplicitly = true;
      listenerAssigneeOverride = null;
      persistState();
      updateStatus(ctx);
      ctx.ui.notify(`Listener assignee reset to auto (${getEffectiveListenerAssignee(ctx)}).`, 'info');
      if (listenMode) {
        runListenerCycle(ctx, 'manual');
      }
      return;
    }

    ctx.ui.notify('Usage: /listen [on|off|status|now|assignee <name>|auto|mode <start|wait>|role <pm|worker|auto>]', 'warning');
  }

  pi.registerCommand('bf', {
    description: 'Brainfile status and manual intervention commands',
    handler: async (args, ctx) => {
      if (!ensureBoardContext(ctx).ok || !boardContext) return;

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
        const board = readBoardConfig();
        if (!activeTaskId) {
          const listenerLabel = operatingMode === 'pm'
            ? `main run ${activeRunId || 'none'}`
            : getEffectiveListenerAssignee(ctx);
          const listenerSuffix = listenMode
            ? ` Listener is ON (${listenerLabel}, ${listenerAutoStart ? 'start' : 'wait'}${listenerPausedForUserInput ? ', paused' : ''}).`
            : '';
          const runSuffix = operatingMode === 'pm'
            ? (() => {
                const workers = getWorkerAvailabilitySnapshot();
                const availableWorkers = workers.available.length > 0
                  ? workers.available.map((worker) => `${worker.worker} (${worker.ageSeconds}s)`).join(', ')
                  : 'none';
                return ` Tracked delegations: ${activeRunId ? (eventProjection.delegatedByRun[activeRunId] || []).length : 0}. Available workers: ${availableWorkers}. Stale timeout: ${staleTimeoutSeconds}s.`;
              })()
            : '';
          ctx.ui.notify(
            `No active task selected. Mode: ${operatingMode.toUpperCase()}.${planMode ? ' Plan mode is ON.' : ''}${listenerSuffix}${runSuffix}`,
            'info'
          );
          updateStatus(ctx);
          return;
        }

        const located = locateTask(activeTaskId, true);
        if (!located) {
          ctx.ui.notify(`Active task ${activeTaskId} no longer exists.`, 'warning');
          updateStatus(ctx);
          return;
        }

        const summary = taskSummary(located, board);
        const completedSubtasks = summary.subtasks.filter((subtask) => subtask.completed).length;
        ctx.ui.notify(
          [
            `${summary.id}: ${summary.title}`,
            `Mode: ${operatingMode.toUpperCase()}`,
            `Column: ${summary.column}`,
            `Contract: ${summary.contract ? (summary.contract as any).status || 'none' : 'none'}`,
            `Subtasks: ${completedSubtasks}/${summary.subtasks.length}`,
            `Plan mode: ${planMode ? 'ON' : 'OFF'}`,
            `Listener: ${listenMode ? `ON (${operatingMode === 'pm' ? `main run ${activeRunId || 'none'}` : getEffectiveListenerAssignee(ctx)}, ${listenerAutoStart ? 'start' : 'wait'}${listenerPausedForUserInput ? ', paused' : ''})` : 'OFF'}`,
          ].join('\n'),
          'info'
        );
        updateStatus(ctx);
        return;
      }

      if (subcommand === 'board') {
        const summary = boardSummary();
        const lines = [`${summary.title}`, `Total active tasks: ${summary.total}`];
        for (const column of summary.columns) {
          lines.push(`- ${column.title} (${column.id}): ${column.count}`);
        }
        ctx.ui.notify(lines.join('\n'), 'info');
        return;
      }

      if (subcommand === 'clear') {
        activeTaskId = null;
        activeTaskPath = null;
        persistState();
        updateStatus(ctx);
        ctx.ui.notify('Active task cleared.', 'info');
        return;
      }

      if (subcommand === 'plan') {
        setPlanMode(!planMode, ctx);
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
        const board = readBoardConfig();
        const resolvedColumn = resolveColumn(columnInput, board);

        if (!resolvedColumn) {
          ctx.ui.notify(`Unknown column: ${columnInput}`, 'error');
          return;
        }

        const located = locateTask(taskId, false);
        if (!located) {
          ctx.ui.notify(`Task not found: ${taskId}`, 'error');
          return;
        }

        const moveResult = moveTaskFile(located.filePath, resolvedColumn.id);
        if (!moveResult.success) {
          ctx.ui.notify(moveResult.error || 'Failed to move task.', 'error');
          return;
        }

        if (activeTaskId === taskId) {
          activeTaskPath = located.filePath;
        }

        updateStatus(ctx);
        ctx.ui.notify(`Moved ${taskId} to ${resolvedColumn.title}.`, 'success');
        return;
      }

      if (subcommand === 'contract') {
        if (parts.length < 3) {
          ctx.ui.notify('Usage: /bf contract <pickup|deliver|validate> <task-id>', 'warning');
          return;
        }

        const action = parts[1]?.toLowerCase();
        const taskId = parts[2];
        const located = locateTask(taskId, false);

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
          const assignee = getEffectiveListenerAssignee(ctx);
          const pickup = pickupContract(located, assignee, 'command');
          if (!pickup.ok) {
            ctx.ui.notify(pickup.error, 'error');
            return;
          }

          activeTaskId = pickup.task.task.id;
          activeTaskPath = pickup.task.filePath;
          emitEvent('contract.picked_up', ctx, 'command', {
            taskId: pickup.task.task.id,
            assignee,
            data: {
              status: 'in_progress',
            },
          });
          persistState();
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
          const assignee = getEffectiveListenerAssignee(ctx);
          const delivery = deliverContractWithEvidence(located, assignee, 'command');
          if (!delivery.ok) {
            const missingText = delivery.deliverableChecks
              ? `\n${delivery.deliverableChecks.filter((check) => !check.ok).map((check) => `- ${check.message}`).join('\n')}`
              : '';
            ctx.ui.notify(`${delivery.error}${missingText}`, 'error');
            return;
          }

          emitEvent('contract.delivered', ctx, 'command', {
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
          const validation = runContractValidation(located);
          if (!('ok' in validation)) {
            ctx.ui.notify(validation.error || 'Validation failed.', 'error');
            return;
          }

          if (validation.ok) {
            setContractStatus(located, 'done');
            emitEvent('contract.validated', ctx, 'command', {
              taskId,
              data: {
                result: 'done',
              },
            });
            updateStatus(ctx);
            ctx.ui.notify(`Contract validation passed: ${taskId}`, 'success');
          } else {
            const feedback = formatValidationFeedback(validation);
            setContractStatus(located, 'failed', { feedback });
            emitEvent('contract.validated', ctx, 'command', {
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
      if (!ensureBoardContext(ctx).ok || !boardContext) return;
      const parts = (args || '').trim().split(/\s+/).filter(Boolean);
      await handleListenCommand(parts, ctx);
    },
  });

  pi.registerCommand('plan', {
    description: 'Toggle Brainfile plan mode (mutations disabled)',
    handler: async (_args, ctx) => {
      if (!ensureBoardContext(ctx).ok) return;
      setPlanMode(!planMode, ctx);
    },
  });

  pi.registerTool({
    name: BF_LIST_TOOL,
    label: 'Brainfile List Tasks',
    description: 'List v2 brainfile tasks with optional filters.',
    parameters: Type.Object({
      column: Type.Optional(Type.String({ description: 'Column id or title filter' })),
      tag: Type.Optional(Type.String({ description: 'Tag filter' })),
      priority: Type.Optional(Type.String({ description: 'Priority filter' })),
      assignee: Type.Optional(Type.String({ description: 'Assignee filter' })),
      parent: Type.Optional(Type.String({ description: 'Filter by parent task/document ID' })),
      includeLogs: Type.Optional(Type.Boolean({ description: 'Include completed tasks from logs/' })),
      contractStatus: Type.Optional(Type.String({ description: 'Filter by contract status' })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const refreshed = refreshBoardContext(ctx.cwd);
      if (!refreshed.ok || !boardContext) {
        return makeToolResponse({ error: refreshed.ok ? 'No board context.' : refreshed.error }, true);
      }

      const board = readBoardConfig();
      const includeLogs = params.includeLogs === true;
      const docs: LocatedTask[] = [];

      for (const doc of readTasksDir(boardContext.boardDir)) {
        docs.push({ task: doc.task, body: doc.body, filePath: doc.filePath || path.join(boardContext.boardDir, taskFileName(doc.task.id)), isLog: false });
      }

      if (includeLogs) {
        for (const doc of readTasksDir(boardContext.logsDir)) {
          docs.push({ task: doc.task, body: doc.body, filePath: doc.filePath || path.join(boardContext.logsDir, taskFileName(doc.task.id)), isLog: true });
        }
      }

      const filtered = docs.filter((located) => {
        if (params.column) {
          if (located.isLog) {
            const normalized = normalizeColumnInput(params.column);
            if (normalized !== 'completed' && normalized !== 'done' && normalized !== 'logs') return false;
          } else {
            const col = resolveColumn(params.column, board);
            if (!col || col.id !== located.task.column) return false;
          }
        }

        if (params.tag && !(located.task.tags || []).includes(params.tag)) return false;
        if (params.priority && located.task.priority !== params.priority) return false;
        if (params.assignee && !assigneeMatches(located.task.assignee, params.assignee)) return false;
        if (params.parent && located.task.parentId !== params.parent) return false;

        if (params.contractStatus) {
          const status = (located.task.contract as any)?.status;
          if (status !== params.contractStatus) return false;
        }

        return true;
      });

      const tasks = filtered.map((located) => taskSummary(located, board));

      return makeToolResponse({
        count: tasks.length,
        includeLogs,
        tasks,
      });
    },
  });

  pi.registerTool({
    name: BF_GET_TOOL,
    label: 'Brainfile Get Task',
    description: 'Get full details for a v2 brainfile task.',
    parameters: Type.Object({
      task: Type.String({ description: 'Task ID' }),
      includeBody: Type.Optional(Type.Boolean({ description: 'Include markdown body in result' })),
      includeLogs: Type.Optional(Type.Boolean({ description: 'Search logs/ when task not found in board/' })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const refreshed = refreshBoardContext(ctx.cwd);
      if (!refreshed.ok || !boardContext) {
        return makeToolResponse({ error: refreshed.ok ? 'No board context.' : refreshed.error }, true);
      }

      const board = readBoardConfig();
      const includeLogs = params.includeLogs !== false;
      const located = locateTask(params.task, includeLogs);
      if (!located) {
        return makeToolResponse({ error: `Task not found: ${params.task}` }, true);
      }

      const children = findChildTasks(params.task, includeLogs).map((child) => taskSummary(child, board));
      const activeChildren = children.filter((child) => !child.isCompleted);
      const logChildren = children.filter((child) => child.isCompleted);

      const summary = taskSummary(located, board);
      return makeToolResponse({
        ...summary,
        childCount: children.length,
        activeChildCount: activeChildren.length,
        logChildCount: logChildren.length,
        children,
        ...(params.includeBody ? { body: located.body } : {}),
      });
    },
  });

  pi.registerTool({
    name: BF_ADD_TOOL,
    label: 'Brainfile Add Task',
    description: 'Add a new task file in .brainfile/board/.',
    parameters: Type.Object({
      title: Type.String({ description: 'Task title' }),
      column: Type.Optional(Type.String({ description: 'Column id or title (default: todo)' })),
      description: Type.Optional(Type.String({ description: 'Task description' })),
      priority: Type.Optional(Type.String({ description: 'Priority: low|medium|high|critical' })),
      tags: Type.Optional(Type.Array(Type.String({ description: 'Tag' }))),
      assignee: Type.Optional(Type.String({ description: 'Assignee' })),
      dueDate: Type.Optional(Type.String({ description: 'Due date YYYY-MM-DD' })),
      relatedFiles: Type.Optional(Type.Array(Type.String({ description: 'Related file path' }))),
      subtasks: Type.Optional(Type.Array(Type.String({ description: 'Subtask title' }))),
      type: Type.Optional(Type.String({ description: 'Document type (task, epic, adr, ...)' })),
      withContract: Type.Optional(Type.Boolean({ description: 'Attach a contract with status=ready' })),
      deliverables: Type.Optional(Type.Array(Type.String({ description: 'Deliverable spec type:path:description' }))),
      validationCommands: Type.Optional(Type.Array(Type.String({ description: 'Validation command' }))),
      constraints: Type.Optional(Type.Array(Type.String({ description: 'Contract constraint' }))),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const refreshed = refreshBoardContext(ctx.cwd);
      if (!refreshed.ok || !boardContext) {
        return makeToolResponse({ error: refreshed.ok ? 'No board context.' : refreshed.error }, true);
      }

      const board = readBoardConfig();

      if (params.type) {
        const typeValidation = validateType(board as any, params.type);
        if (!typeValidation.valid) {
          return makeToolResponse({ error: typeValidation.error }, true);
        }
      }

      const requestedColumn = params.column || 'todo';
      const resolvedColumn = resolveColumn(requestedColumn, board);
      if (!resolvedColumn) {
        return makeToolResponse({
          error: `Column not found: ${requestedColumn}`,
          availableColumns: getColumns(board).map((column) => ({ id: column.id, title: column.title })),
        }, true);
      }

      const deliverableParse = parseDeliverableSpecs(params.deliverables);
      if (deliverableParse.errors.length > 0) {
        return makeToolResponse({
          error: 'Invalid deliverables input.',
          details: deliverableParse.errors,
        }, true);
      }

      const creation = addTaskFile(
        boardContext.boardDir,
        {
          title: params.title,
          column: resolvedColumn.id,
          description: params.description,
          priority: params.priority as any,
          tags: params.tags,
          assignee: params.assignee,
          dueDate: params.dueDate,
          relatedFiles: params.relatedFiles,
          subtasks: params.subtasks,
          type: params.type,
        },
        params.description ? `## Description\n${params.description.trim()}\n` : '',
        boardContext.logsDir,
      );

      if (!creation.success || !creation.task || !creation.filePath) {
        return makeToolResponse({ error: creation.error || 'Failed to add task.' }, true);
      }

      const wantsContract =
        params.withContract === true ||
        deliverableParse.deliverables.length > 0 ||
        (params.validationCommands || []).length > 0 ||
        (params.constraints || []).length > 0;

      if (wantsContract) {
        const doc = readTaskFile(creation.filePath);
        if (!doc) {
          return makeToolResponse({
            error: 'Task created but failed to re-open file to attach contract.',
            taskId: creation.task.id,
          }, true);
        }

        const contract: any = {
          status: 'ready',
          version: 1,
          ...(deliverableParse.deliverables.length > 0 ? { deliverables: deliverableParse.deliverables } : {}),
          ...((params.validationCommands || []).length > 0
            ? { validation: { commands: params.validationCommands } }
            : {}),
          ...((params.constraints || []).length > 0 ? { constraints: params.constraints } : {}),
        };

        (doc.task as any).contract = contract;
        doc.task.updatedAt = new Date().toISOString();
        writeTaskFile(creation.filePath, doc.task, doc.body);
      }

      const located = locateTask(creation.task.id, false);
      if (located) {
        maybeEmitDelegatedEvent(located.task, ctx, 'tool:add');
        const summary = taskSummary(located, board);
        updateStatus(ctx);
        return makeToolResponse({
          success: true,
          task: summary,
        });
      }

      updateStatus(ctx);
      return makeToolResponse({
        success: true,
        taskId: creation.task.id,
      });
    },
  });

  pi.registerTool({
    name: BF_PATCH_TOOL,
    label: 'Brainfile Patch Task',
    description: 'Patch mutable fields on an active task file.',
    parameters: Type.Object({
      task: Type.String({ description: 'Task ID' }),
      title: Type.Optional(Type.String({ description: 'New title' })),
      description: Type.Optional(Type.String({ description: 'New description' })),
      clearDescription: Type.Optional(Type.Boolean({ description: 'Remove description' })),
      priority: Type.Optional(Type.String({ description: 'Priority value' })),
      clearPriority: Type.Optional(Type.Boolean({ description: 'Remove priority' })),
      tags: Type.Optional(Type.Array(Type.String({ description: 'Tag' }))),
      clearTags: Type.Optional(Type.Boolean({ description: 'Remove all tags' })),
      assignee: Type.Optional(Type.String({ description: 'Assignee' })),
      clearAssignee: Type.Optional(Type.Boolean({ description: 'Remove assignee' })),
      dueDate: Type.Optional(Type.String({ description: 'Due date YYYY-MM-DD' })),
      clearDueDate: Type.Optional(Type.Boolean({ description: 'Remove due date' })),
      relatedFiles: Type.Optional(Type.Array(Type.String({ description: 'Related file path' }))),
      clearRelatedFiles: Type.Optional(Type.Boolean({ description: 'Remove related files' })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const refreshed = refreshBoardContext(ctx.cwd);
      if (!refreshed.ok || !boardContext) {
        return makeToolResponse({ error: refreshed.ok ? 'No board context.' : refreshed.error }, true);
      }

      const located = locateTask(params.task, false);
      if (!located) {
        return makeToolResponse({ error: `Task not found: ${params.task}` }, true);
      }

      const patched = applyTaskPatch(located, {
        title: params.title,
        description: params.description,
        clearDescription: params.clearDescription,
        priority: params.priority,
        clearPriority: params.clearPriority,
        tags: params.tags,
        clearTags: params.clearTags,
        assignee: params.assignee,
        clearAssignee: params.clearAssignee,
        dueDate: params.dueDate,
        clearDueDate: params.clearDueDate,
        relatedFiles: params.relatedFiles?.map(normalizePathInput),
        clearRelatedFiles: params.clearRelatedFiles,
      });

      writeTaskFile(located.filePath, patched.task, patched.body);

      const board = readBoardConfig();
      const updated = locateTask(params.task, false);
      if (updated) {
        maybeEmitDelegatedEvent(updated.task, ctx, 'tool:patch');
      }
      updateStatus(ctx);

      if (!updated) {
        return makeToolResponse({
          success: true,
          taskId: params.task,
        });
      }

      return makeToolResponse({
        success: true,
        task: taskSummary(updated, board),
      });
    },
  });

  pi.registerTool({
    name: BF_MOVE_TOOL,
    label: 'Brainfile Move Task',
    description: 'Move an active task to another column.',
    parameters: Type.Object({
      task: Type.String({ description: 'Task ID' }),
      column: Type.String({ description: 'Target column id or title' }),
      position: Type.Optional(Type.Number({ description: 'Optional position in target column' })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const refreshed = refreshBoardContext(ctx.cwd);
      if (!refreshed.ok || !boardContext) {
        return makeToolResponse({ error: refreshed.ok ? 'No board context.' : refreshed.error }, true);
      }

      const board = readBoardConfig();
      const resolvedColumn = resolveColumn(params.column, board);
      if (!resolvedColumn) {
        return makeToolResponse({
          error: `Column not found: ${params.column}`,
          availableColumns: getColumns(board).map((column) => ({ id: column.id, title: column.title })),
        }, true);
      }

      const located = locateTask(params.task, false);
      if (!located) {
        return makeToolResponse({ error: `Task not found: ${params.task}` }, true);
      }

      const moveResult = moveTaskFile(located.filePath, resolvedColumn.id, params.position);
      if (!moveResult.success) {
        return makeToolResponse({ error: moveResult.error || 'Failed to move task.' }, true);
      }

      let autoCompleted = false;
      if (resolvedColumn.completionColumn && boardContext && isTaskCompletable(located.task, board!)) {
        const movedPath = path.join(boardContext.boardDir, taskFileName(params.task));
        const completion = completeTaskFile(movedPath, boardContext.logsDir);
        autoCompleted = completion.success;
      }

      if (activeTaskId === params.task) {
        activeTaskPath = located.filePath;
      }

      if (autoCompleted) {
        emitEvent('task.completed', ctx, 'tool', {
          taskId: params.task,
          data: {
            reason: 'completion-column',
          },
        });
      }

      const updated = locateTask(params.task, autoCompleted);
      updateStatus(ctx);

      return makeToolResponse({
        success: true,
        from: located.task.column,
        to: resolvedColumn.id,
        autoCompleted,
        task: updated ? taskSummary(updated, board) : { id: params.task },
      });
    },
  });

  pi.registerTool({
    name: BF_COMPLETE_TOOL,
    label: 'Brainfile Complete Task',
    description: 'Complete an active task by moving it from board/ to logs/.',
    parameters: Type.Object({
      task: Type.String({ description: 'Task ID' }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const refreshed = refreshBoardContext(ctx.cwd);
      if (!refreshed.ok || !boardContext) {
        return makeToolResponse({ error: refreshed.ok ? 'No board context.' : refreshed.error }, true);
      }

      const located = locateTask(params.task, false);
      if (!located) {
        return makeToolResponse({ error: `Task not found: ${params.task}` }, true);
      }

      const completion = completeTaskFile(located.filePath, boardContext.logsDir);
      if (!completion.success) {
        return makeToolResponse({ error: completion.error || 'Failed to complete task.' }, true);
      }

      const completed = locateTask(params.task, true);
      if (activeTaskId === params.task && completed) {
        activeTaskPath = completed.filePath;
      }

      emitEvent('task.completed', ctx, 'tool', {
        taskId: params.task,
        data: {
          reason: 'complete-tool',
        },
      });

      const board = readBoardConfig();
      updateStatus(ctx);

      return makeToolResponse({
        success: true,
        task: completed ? taskSummary(completed, board) : { id: params.task, completed: true },
      });
    },
  });

  pi.registerTool({
    name: BF_SUBTASK_TOOL,
    label: 'Brainfile Toggle Subtask',
    description: 'Toggle (or set) a subtask completion state on an active task.',
    parameters: Type.Object({
      task: Type.String({ description: 'Task ID' }),
      subtaskId: Type.Optional(Type.String({ description: 'Subtask ID' })),
      index: Type.Optional(Type.Number({ description: '1-based subtask index' })),
      completed: Type.Optional(Type.Boolean({ description: 'Set explicit completion value' })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const refreshed = refreshBoardContext(ctx.cwd);
      if (!refreshed.ok || !boardContext) {
        return makeToolResponse({ error: refreshed.ok ? 'No board context.' : refreshed.error }, true);
      }

      const located = locateTask(params.task, false);
      if (!located) {
        return makeToolResponse({ error: `Task not found: ${params.task}` }, true);
      }

      const subtasks = [...(located.task.subtasks || [])];
      if (subtasks.length === 0) {
        return makeToolResponse({ error: `Task ${params.task} has no subtasks.` }, true);
      }

      let subtaskIndex = -1;
      if (params.subtaskId) {
        subtaskIndex = subtasks.findIndex((subtask) => subtask.id === params.subtaskId);
      } else if (typeof params.index === 'number') {
        subtaskIndex = Math.floor(params.index) - 1;
      }

      if (subtaskIndex < 0 || subtaskIndex >= subtasks.length) {
        return makeToolResponse({
          error: 'Subtask not found. Provide subtaskId or valid 1-based index.',
          subtasks,
        }, true);
      }

      const subtask = { ...subtasks[subtaskIndex] };
      subtask.completed = typeof params.completed === 'boolean' ? params.completed : !subtask.completed;
      subtasks[subtaskIndex] = subtask;

      const updatedTask: Task = {
        ...located.task,
        subtasks,
        updatedAt: new Date().toISOString(),
      };

      writeTaskFile(located.filePath, updatedTask, located.body);

      const board = readBoardConfig();
      const updated = locateTask(params.task, false);
      updateStatus(ctx);

      return makeToolResponse({
        success: true,
        updatedSubtask: subtask,
        task: updated ? taskSummary(updated, board) : { id: params.task },
      });
    },
  });

  pi.registerTool({
    name: BF_LOG_TOOL,
    label: 'Brainfile Append Log',
    description: 'Append a timestamped log note to a task in board/ or logs/.',
    parameters: Type.Object({
      task: Type.String({ description: 'Task ID' }),
      entry: Type.String({ description: 'Log entry text' }),
      agent: Type.Optional(Type.String({ description: 'Optional agent attribution' })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const refreshed = refreshBoardContext(ctx.cwd);
      if (!refreshed.ok || !boardContext) {
        return makeToolResponse({ error: refreshed.ok ? 'No board context.' : refreshed.error }, true);
      }

      const located = locateTask(params.task, true);
      if (!located) {
        return makeToolResponse({ error: `Task not found: ${params.task}` }, true);
      }

      const result = appendLog(located.filePath, params.entry, params.agent);
      if (!result.success) {
        return makeToolResponse({ error: result.error || 'Failed to append log.' }, true);
      }

      const board = readBoardConfig();
      const updated = locateTask(params.task, true);
      updateStatus(ctx);

      return makeToolResponse({
        success: true,
        task: updated ? taskSummary(updated, board) : { id: params.task },
      });
    },
  });

  pi.registerTool({
    name: BF_CONTRACT_PICKUP_TOOL,
    label: 'Brainfile Contract Pickup',
    description: 'Set task contract status to in_progress and return contract context.',
    parameters: Type.Object({
      task: Type.String({ description: 'Task ID' }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const refreshed = refreshBoardContext(ctx.cwd);
      if (!refreshed.ok || !boardContext) {
        return makeToolResponse({ error: refreshed.ok ? 'No board context.' : refreshed.error }, true);
      }

      const located = locateTask(params.task, false);
      if (!located) {
        return makeToolResponse({ error: `Task not found: ${params.task}` }, true);
      }

      const contractResult = ensureTaskHasContract(located.task);
      if (!contractResult.ok) {
        return makeToolResponse({ error: contractResult.error }, true);
      }

      const assignee = getEffectiveListenerAssignee(ctx);
      const pickup = pickupContract(located, assignee, 'tool');
      if (!pickup.ok) {
        return makeToolResponse({ error: pickup.error }, true);
      }

      activeTaskId = pickup.task.task.id;
      activeTaskPath = pickup.task.filePath;
      emitEvent('contract.picked_up', ctx, 'tool', {
        taskId: pickup.task.task.id,
        assignee,
        data: {
          status: 'in_progress',
        },
      });
      persistState();
      updateStatus(ctx);

      return makeToolResponse({
        success: true,
        alreadyInProgress: pickup.alreadyInProgress === true,
        context: buildContractContextPayload(pickup.task),
      });
    },
  });

  pi.registerTool({
    name: BF_CONTRACT_DELIVER_TOOL,
    label: 'Brainfile Contract Deliver',
    description: 'Set task contract status to delivered.',
    parameters: Type.Object({
      task: Type.String({ description: 'Task ID' }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const refreshed = refreshBoardContext(ctx.cwd);
      if (!refreshed.ok || !boardContext) {
        return makeToolResponse({ error: refreshed.ok ? 'No board context.' : refreshed.error }, true);
      }

      const located = locateTask(params.task, false);
      if (!located) {
        return makeToolResponse({ error: `Task not found: ${params.task}` }, true);
      }

      const contractResult = ensureTaskHasContract(located.task);
      if (!contractResult.ok) {
        return makeToolResponse({ error: contractResult.error }, true);
      }

      const assignee = getEffectiveListenerAssignee(ctx);
      const delivery = deliverContractWithEvidence(located, assignee, 'tool');
      if (!delivery.ok) {
        return makeToolResponse({
          error: delivery.error,
          deliverableChecks: delivery.deliverableChecks || [],
        }, true);
      }

      emitEvent('contract.delivered', ctx, 'tool', {
        taskId: params.task,
        assignee,
        data: {
          selfCheckFailures: delivery.commandResults.filter((result) => result.exitCode !== 0).length,
        },
      });
      updateStatus(ctx);

      return makeToolResponse({
        success: true,
        context: buildContractContextPayload(delivery.task),
        deliveryEvidence: {
          deliverableChecks: delivery.deliverableChecks,
          selfCheck: delivery.commandResults,
          metrics: delivery.evidence,
        },
      });
    },
  });

  pi.registerTool({
    name: 'brainfile_adr_promote',
    label: 'Brainfile ADR Promote',
    description: 'Promote an ADR to a board rule. Extracts the rule text from the ADR title, appends it to rules.<category> in the board frontmatter, and moves the ADR to logs/ with status: promoted.',
    parameters: Type.Object({
      task: Type.String({ description: 'ADR task ID (must have type: adr)' }),
      category: Type.String({ description: 'Rule category: prefer | always | never | context' }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const refreshed = refreshBoardContext(ctx.cwd);
      if (!refreshed.ok || !boardContext) {
        return makeToolResponse({ error: refreshed.ok ? 'No board context.' : refreshed.error }, true);
      }

      const VALID_CATEGORIES = ['prefer', 'always', 'never', 'context'];
      const category = params.category.trim().toLowerCase();
      if (!VALID_CATEGORIES.includes(category)) {
        return makeToolResponse({ error: `Invalid category: ${params.category}. Valid: ${VALID_CATEGORIES.join(', ')}` }, true);
      }

      const located = locateTask(params.task, false);
      if (!located) {
        return makeToolResponse({ error: `Task not found: ${params.task}` }, true);
      }

      if ((located.task.type || '').toLowerCase() !== 'adr') {
        return makeToolResponse({ error: `Only ADRs can be promoted. ${params.task} has type "${located.task.type || 'task'}".` }, true);
      }

      const content = fs.readFileSync(boardContext.brainfilePath, 'utf-8');
      const parsed = Brainfile.parseWithErrors(content);
      if (!parsed.board) {
        return makeToolResponse({ error: 'Failed to parse board config.' }, true);
      }
      const board = parsed.board as any;

      const ruleText = extractRuleText(located.task.title);
      const ruleId = getNextRuleId(board.rules);
      const newRule = { id: ruleId, rule: ruleText, source: located.task.id };

      if (!board.rules || typeof board.rules !== 'object' || Array.isArray(board.rules)) {
        board.rules = {};
      }
      const existing: unknown[] = Array.isArray(board.rules[category]) ? board.rules[category] : [];
      board.rules[category] = [...existing, newRule];
      fs.writeFileSync(boardContext.brainfilePath, Brainfile.serialize(board), 'utf-8');

      const completedAt = new Date().toISOString();
      const promotedTask: Task = { ...located.task, completedAt } as any;
      (promotedTask as any).status = 'promoted';
      delete promotedTask.column;
      delete (promotedTask as any).position;

      fs.mkdirSync(boardContext.logsDir, { recursive: true });
      const logPath = path.join(boardContext.logsDir, taskFileName(located.task.id));
      writeTaskFile(logPath, promotedTask, located.body);
      fs.unlinkSync(located.filePath);

      if (activeTaskId === params.task) {
        activeTaskId = null;
        activeTaskPath = null;
      }

      emitEvent('task.completed', ctx, 'tool', {
        taskId: params.task,
        data: {
          reason: 'adr-promoted',
        },
      });

      updateStatus(ctx);

      return makeToolResponse({
        success: true,
        taskId: params.task,
        category,
        rule: newRule,
        completedAt,
      });
    },
  });

  pi.registerTool({
    name: BF_CONTRACT_VALIDATE_TOOL,
    label: 'Brainfile Contract Validate',
    description: 'Validate contract deliverables and commands, then set status done or failed.',
    parameters: Type.Object({
      task: Type.String({ description: 'Task ID' }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const refreshed = refreshBoardContext(ctx.cwd);
      if (!refreshed.ok || !boardContext) {
        return makeToolResponse({ error: refreshed.ok ? 'No board context.' : refreshed.error }, true);
      }

      const located = locateTask(params.task, false);
      if (!located) {
        return makeToolResponse({ error: `Task not found: ${params.task}` }, true);
      }

      const contractResult = ensureTaskHasContract(located.task);
      if (!contractResult.ok) {
        return makeToolResponse({ error: contractResult.error }, true);
      }

      const validation = runContractValidation(located);
      if (!('ok' in validation)) {
        return makeToolResponse({ error: validation.error }, true);
      }

      const feedback = validation.ok ? undefined : formatValidationFeedback(validation);
      const updated = setContractStatus(
        located,
        validation.ok ? 'done' : 'failed',
        validation.ok ? undefined : { feedback }
      );
      emitEvent('contract.validated', ctx, 'tool', {
        taskId: params.task,
        data: {
          result: validation.ok ? 'done' : 'failed',
        },
      });
      updateStatus(ctx);

      return makeToolResponse({
        success: validation.ok,
        context: buildContractContextPayload(updated),
        validation: {
          deliverableChecks: validation.deliverableChecks,
          commandResults: validation.commandResults,
        },
      }, !validation.ok);
    },
  });
}
