import type { ExtensionContext } from '@mariozechner/pi-coding-agent';
import * as fs from 'fs';

import type { Rt, Envelope, EnvelopeKind } from './types';
import { normalizeEnvelope, isPiEventType } from './types';
import { persistState } from './state';
import { normalizeAssignee, assigneeMatches, getEffectiveListenerAssignee } from './worker';
import { updateWorkerPresence, updateWorkerReadiness } from './worker';
import { sendOrchestrationMessage, emitMessage, isConversationalMessageKind } from './messaging';
import { createRunId, adoptOrphanedTasksForRun } from './pm';

const SEEN_MESSAGE_TTL_MS = 5 * 60 * 1000;
const MAX_SEEN_MESSAGE_IDS = 1000;
const seenMessageIdsByRt = new WeakMap<Rt, Map<string, number>>();

function getSeenMessageIds(rt: Rt): Map<string, number> {
  let seen = seenMessageIdsByRt.get(rt);
  if (!seen) {
    seen = new Map<string, number>();
    seenMessageIdsByRt.set(rt, seen);
  }
  return seen;
}

function pruneSeenMessageIds(seen: Map<string, number>, nowMs: number): void {
  const minSeenAt = nowMs - SEEN_MESSAGE_TTL_MS;

  for (const [messageId, seenAt] of seen.entries()) {
    if (seenAt < minSeenAt) {
      seen.delete(messageId);
    }
  }

  while (seen.size > MAX_SEEN_MESSAGE_IDS) {
    const oldestMessageId = seen.keys().next().value;
    if (typeof oldestMessageId !== 'string') break;
    seen.delete(oldestMessageId);
  }
}

function isDuplicateMessage(rt: Rt, messageId: string, nowMs: number): boolean {
  const seen = getSeenMessageIds(rt);
  pruneSeenMessageIds(seen, nowMs);

  const seenAt = seen.get(messageId);
  if (typeof seenAt === 'number' && nowMs - seenAt <= SEEN_MESSAGE_TTL_MS) {
    return true;
  }

  // Refresh insertion order so size trimming evicts oldest entries first.
  if (typeof seenAt === 'number') {
    seen.delete(messageId);
  }
  seen.set(messageId, nowMs);
  pruneSeenMessageIds(seen, nowMs);
  return false;
}

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
        const parsed = normalizeEnvelope(JSON.parse(lines[i]));
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

/**
 * Resolves the local worker identity (worker-N format).
 */
export function resolveLocalWorkerIdentity(rt: Rt, ctx: ExtensionContext): string {
  const explicit = normalizeAssignee(rt.lastWorkerAssignee || rt.autoWorkerAssignee || rt.listenerAssigneeOverride);
  if (explicit) return explicit;
  return normalizeAssignee(getEffectiveListenerAssignee(rt, ctx));
}

export function emitEvent(
  rt: Rt,
  kind: EnvelopeKind,
  ctx: ExtensionContext,
  source: string,
  options?: {
    taskId?: string;
    runId?: string;
    assignee?: string;
    data?: Record<string, unknown>;
    messageId?: string;
    threadId?: string;
    inReplyTo?: string;
    from?: string;
    to?: string;
    priority?: Envelope['priority'];
    requiresAck?: boolean;
    expiresAt?: string;
  }
): void {
  if (!rt.boardContext) return;

  ensureEventsLogExists(rt);

  const runId = options?.runId || inferRunIdForTask(rt, options?.taskId) || (rt.operatingMode === 'pm' ? rt.activeRunId || undefined : undefined);
  
  // Resolve the "from" identity if not explicitly provided
  const from = options?.from || (rt.operatingMode === 'worker' ? resolveLocalWorkerIdentity(rt, ctx) : normalizeAssignee(getEffectiveListenerAssignee(rt, ctx)));

  const event = normalizeEnvelope({
    id: options?.messageId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    kind,
    ...(isPiEventType(kind) ? { type: kind } : {}),
    ...(runId ? { runId } : {}),
    ...(options?.taskId ? { taskId: options.taskId } : {}),
    actorMode: rt.operatingMode,
    ...(options?.assignee ? { actorAssignee: options.assignee } : {}),
    source,
    ...(options?.data ? { data: options.data } : {}),
    ...(options?.threadId ? { threadId: options.threadId } : {}),
    ...(options?.inReplyTo ? { inReplyTo: options.inReplyTo } : {}),
    ...(from ? { from } : {}),
    ...(options?.to ? { to: options.to } : {}),
    ...(options?.priority ? { priority: options.priority } : {}),
    ...(typeof options?.requiresAck === 'boolean' ? { requiresAck: options.requiresAck } : {}),
    ...(options?.expiresAt ? { expiresAt: options.expiresAt } : {}),
  });

  fs.appendFileSync(rt.boardContext.eventsLogPath, `${JSON.stringify(event)}\n`, 'utf-8');
}

type PendingConversationMessage = {
  kind: string;
  messageId: string;
  threadId: string;
  inReplyTo?: string;
  from?: string;
  to?: string;
  taskId?: string;
  runId?: string;
  body: string;
};

type PendingAckMessage = {
  to: string;
  taskId?: string;
  runId?: string;
  threadId?: string;
  inReplyTo: string;
  kind: string;
};

const ORCHESTRATION_BATCH_KINDS = new Set<string>([
  'message.question',
  'message.answer',
  'message.blocker',
  'message.status',
  'message.decision',
]);


// PM-role canonical keywords. A message addressed to any of these is always
// destined for the PM and never for a worker, regardless of assignee naming.
const PM_ROLE_KEYWORDS = new Set(['pm', 'main', 'planner', 'orchestrator']);

function isEnvelopeAddressedToSession(rt: Rt, ctx: ExtensionContext, parsed: Envelope): boolean {
  const to = typeof parsed.to === 'string' ? parsed.to.trim() : '';
  if (!to) return true;

  const normalizedTo = normalizeAssignee(to) || to.toLowerCase();

  // Keyword aliases for the PM role.
  if (PM_ROLE_KEYWORDS.has(normalizedTo)) {
    return rt.operatingMode === 'pm';
  }

  // Bare 'worker' or 'pool' targets any worker session, as does empty/null.
  if (normalizedTo === 'worker' || normalizedTo === 'pool') {
    return rt.operatingMode === 'worker';
  }

  if (rt.operatingMode === 'worker') {
    // Exact match or pool matching handled by assigneeMatches
    const localWorker = resolveLocalWorkerIdentity(rt, ctx);
    return localWorker ? assigneeMatches(normalizedTo, localWorker) : false;
  }

  // PM mode: require EXACT match with the PM's own assignee identity —
  // never wildcard-match against worker family prefixes (fixes over-matching bug).
  const localPm = normalizeAssignee(getEffectiveListenerAssignee(rt, ctx));
  return localPm ? normalizedTo === localPm : false;
}

function extractMessageBody(parsed: Envelope): string {
  const body = (parsed.data && typeof parsed.data === 'object')
    ? (parsed.data as Record<string, unknown>).body
    : undefined;

  if (typeof body === 'string') return body.trim();
  if (body == null) return '';
  return String(body).trim();
}

function truncateMessageBody(body: string, maxChars = 300): string {
  if (body.length <= maxChars) return body;
  return `${body.slice(0, maxChars)}…`;
}

function formatConversationBatch(messages: PendingConversationMessage[]): string[] {
  const lines: string[] = [`Received ${messages.length} conversational message(s):`];

  for (const message of messages) {
    const route = `${message.from || 'unknown'}${message.to ? ` → ${message.to}` : ''}`;
    const taskPart = message.taskId ? ` task:${message.taskId}` : '';
    lines.push(`- [${message.kind}] ${route} | thread:${message.threadId} | id:${message.messageId}${taskPart}`);
    if (message.inReplyTo) {
      lines.push(`  inReplyTo: ${message.inReplyTo}`);
    }
    if (message.body) {
      lines.push(`  ${truncateMessageBody(message.body)}`);
    }
  }

  lines.push('Reply with brainfile_send_message and include threadId + inReplyTo when continuing a thread.');
  return lines;
}

// ── Event log processing ───────────────────────────────────────────────

function applyEnvelopeToProjection(rt: Rt, ctx: ExtensionContext, parsed: Envelope): void {
  const kind = parsed.kind || parsed.type;
  if (!kind) return;

  const taskId = parsed.taskId;
  const runId = parsed.runId || inferRunIdForTask(rt, taskId);

  if (runId && taskId && kind === 'contract.delegated') {
    rt.eventProjection.delegatedByRun[runId] = pushUnique(rt.eventProjection.delegatedByRun[runId], taskId);
    rt.eventProjection.taskRun[taskId] = runId;
  }

  if (runId && taskId && !rt.eventProjection.taskRun[taskId]) {
    rt.eventProjection.taskRun[taskId] = runId;
  }

  const actorAssignee = normalizeAssignee(parsed.actorAssignee || (typeof parsed.from === 'string' ? parsed.from : undefined));
  if (actorAssignee && (kind === 'worker.online' || kind === 'worker.heartbeat' || kind === 'worker.ready' || kind === 'worker.busy')) {
    const data = (parsed.data && typeof parsed.data === 'object') ? parsed.data as Record<string, unknown> : {};
    const model = (data.model && typeof data.model === 'object') ? data.model as { provider: string; id: string; name: string } : undefined;
    updateWorkerPresence(rt, actorAssignee, 'online', parsed.at || new Date().toISOString(), model);
  }
  if (actorAssignee && kind === 'worker.ready') {
    const data = (parsed.data && typeof parsed.data === 'object') ? parsed.data as Record<string, unknown> : {};
    const maxConcurrency = typeof data.maxConcurrency === 'number' && Number.isFinite(data.maxConcurrency)
      ? Math.max(1, Math.floor(data.maxConcurrency))
      : 1;
    const activeCount = typeof data.activeCount === 'number' && Number.isFinite(data.activeCount)
      ? Math.max(0, Math.floor(data.activeCount))
      : 0;
    const idle = typeof data.idle === 'boolean' ? data.idle : activeCount < maxConcurrency;
    updateWorkerReadiness(rt, actorAssignee, { maxConcurrency, activeCount, idle }, parsed.at || new Date().toISOString());
  }
  if (actorAssignee && kind === 'worker.offline') {
    updateWorkerPresence(rt, actorAssignee, 'offline', parsed.at || new Date().toISOString());
  }

  if (runId && taskId && kind === 'contract.delivered' && projectionHasDelegation(rt, runId, taskId)) {
    const notified = rt.eventProjection.deliveredNotifiedByRun[runId] || [];
    if (!notified.includes(taskId)) {
      rt.eventProjection.deliveredNotifiedByRun[runId] = pushUnique(notified, taskId);
    }
  }

  if (runId && taskId && kind === 'contract.validated' && projectionHasDelegation(rt, runId, taskId)) {
    const notified = rt.eventProjection.validatedNotifiedByRun[runId] || [];
    if (!notified.includes(taskId)) {
      rt.eventProjection.validatedNotifiedByRun[runId] = pushUnique(notified, taskId);
    }
  }

  if (runId && taskId && kind === 'task.completed' && projectionHasDelegation(rt, runId, taskId)) {
    const notified = rt.eventProjection.completedNotifiedByRun[runId] || [];
    if (!notified.includes(taskId)) {
      rt.eventProjection.completedNotifiedByRun[runId] = pushUnique(notified, taskId);
    }
  }

  if (rt.operatingMode === 'pm' && rt.listenMode && runId && kind === 'run.blocked') {
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

  if (rt.operatingMode === 'pm' && rt.listenMode && runId && kind === 'run.closed') {
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

export function processEventLog(rt: Rt, ctx: ExtensionContext): void {
  if (!rt.boardContext) return;
  ensureEventsLogExists(rt);

  let changed = false;

  let lastByteOffset = Number.isFinite(rt.eventProjection.lastByteOffset)
    ? Math.max(0, Math.floor(rt.eventProjection.lastByteOffset))
    : 0;

  let stat: fs.Stats;
  try {
    stat = fs.statSync(rt.boardContext.eventsLogPath);
  } catch {
    return;
  }

  if (stat.size < lastByteOffset) {
    // File truncated/rotated; start over from beginning.
    lastByteOffset = 0;
    rt.eventProjection.lastByteOffset = 0;
    changed = true;
  }

  if (stat.size === lastByteOffset) {
    if (changed) persistState(rt);
    return;
  }

  const bytesToRead = stat.size - lastByteOffset;
  if (bytesToRead <= 0) {
    if (changed) persistState(rt);
    return;
  }

  const pendingMessages: PendingConversationMessage[] = [];
  const pendingAcks: PendingAckMessage[] = [];

  const fd = fs.openSync(rt.boardContext.eventsLogPath, 'r');
  try {
    const buffer = Buffer.alloc(bytesToRead);
    const bytesRead = fs.readSync(fd, buffer, 0, bytesToRead, lastByteOffset);
    if (bytesRead <= 0) {
      if (changed) persistState(rt);
      return;
    }

    const chunk = buffer.subarray(0, bytesRead).toString('utf-8');
    const lastNewlineIndex = chunk.lastIndexOf('\n');

    let consumable = '';
    let consumedBytes = 0;

    if (lastNewlineIndex >= 0) {
      consumable = chunk.slice(0, lastNewlineIndex + 1);
      consumedBytes = Buffer.byteLength(consumable, 'utf-8');
    } else {
      // No newline yet: only process if this chunk is a full JSON row.
      const maybeLine = chunk.trim();
      if (maybeLine.length > 0) {
        try {
          JSON.parse(maybeLine);
          consumable = chunk;
          consumedBytes = bytesRead;
        } catch {
          // Partial write; wait for next append.
        }
      }
    }

    if (consumable.length > 0 && consumedBytes > 0) {
      const lines = consumable
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      for (const line of lines) {
        try {
          const parsed = normalizeEnvelope(JSON.parse(line));
          const nowMs = Date.now();
          const messageId = typeof parsed.messageId === 'string' ? parsed.messageId.trim() : '';
          if (messageId.length > 0 && isDuplicateMessage(rt, messageId, nowMs)) {
            continue;
          }

          applyEnvelopeToProjection(rt, ctx, parsed);

          const kind = parsed.kind || parsed.type;
          if (!kind || !isConversationalMessageKind(kind)) {
            continue;
          }

          if (!isEnvelopeAddressedToSession(rt, ctx, parsed)) {
            continue;
          }

          const resolvedMessageId = messageId || parsed.id;
          const resolvedThreadId = (typeof parsed.threadId === 'string' && parsed.threadId.trim().length > 0)
            ? parsed.threadId.trim()
            : (parsed.taskId ? `task:${parsed.taskId}` : resolvedMessageId);
          const body = extractMessageBody(parsed);

          if (parsed.requiresAck === true && kind !== 'message.ack') {
            const recipient = typeof parsed.from === 'string' ? parsed.from.trim() : '';
            if (recipient) {
              pendingAcks.push({
                to: recipient,
                ...(parsed.taskId ? { taskId: parsed.taskId } : {}),
                ...(parsed.runId ? { runId: parsed.runId } : {}),
                threadId: resolvedThreadId,
                inReplyTo: resolvedMessageId,
                kind,
              });
            }
          }

          if (ORCHESTRATION_BATCH_KINDS.has(kind)) {
            pendingMessages.push({
              kind,
              messageId: resolvedMessageId,
              threadId: resolvedThreadId,
              ...(typeof parsed.inReplyTo === 'string' && parsed.inReplyTo.trim().length > 0
                ? { inReplyTo: parsed.inReplyTo.trim() }
                : {}),
              ...(typeof parsed.from === 'string' && parsed.from.trim().length > 0
                ? { from: parsed.from.trim() }
                : {}),
              ...(typeof parsed.to === 'string' && parsed.to.trim().length > 0
                ? { to: parsed.to.trim() }
                : {}),
              ...(parsed.taskId ? { taskId: parsed.taskId } : {}),
              ...(parsed.runId ? { runId: parsed.runId } : {}),
              body,
            });
          }
        } catch {
          // Skip malformed rows, preserve prior behavior.
        }
      }

      const nextOffset = lastByteOffset + consumedBytes;
      if (nextOffset !== rt.eventProjection.lastByteOffset) {
        rt.eventProjection.lastByteOffset = nextOffset;
        changed = true;
      }
    }

    if (pendingAcks.length > 0) {
      for (const ack of pendingAcks) {
        emitMessage(
          rt,
          ctx,
          (kind, emitCtx, source, options) => emitEvent(rt, kind, emitCtx, source, options),
          'message.ack',
          'listener:auto-ack',
          {
            to: ack.to,
            ...(ack.taskId ? { taskId: ack.taskId } : {}),
            ...(ack.runId ? { runId: ack.runId } : {}),
            ...(ack.threadId ? { threadId: ack.threadId } : {}),
            inReplyTo: ack.inReplyTo,
            body: `Acknowledged ${ack.kind}`,
            requiresAck: false,
          }
        );
      }
    }

    if (pendingMessages.length > 0) {
      sendOrchestrationMessage(rt, ctx, formatConversationBatch(pendingMessages));
    }
  } finally {
    fs.closeSync(fd);
  }

  if (changed) {
    persistState(rt);
  }
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
