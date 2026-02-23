import type { ExtensionContext } from '@mariozechner/pi-coding-agent';
import type { Envelope, EnvelopeKind, Rt } from './types';
import { getEffectiveListenerAssignee, normalizeAssignee } from './worker';

export const CONVERSATIONAL_MESSAGE_KINDS = [
  'message.question',
  'message.answer',
  'message.ack',
  'message.status',
  'message.blocker',
  'message.decision',
] as const;

export type ConversationalMessageKind = (typeof CONVERSATIONAL_MESSAGE_KINDS)[number];

export function isConversationalMessageKind(value: unknown): value is ConversationalMessageKind {
  return typeof value === 'string' && (CONVERSATIONAL_MESSAGE_KINDS as readonly string[]).includes(value);
}

function normalizeAddress(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  if (trimmed.toLowerCase() === 'pm') return 'pm';
  if (trimmed.toLowerCase() === 'worker') return 'worker';

  const normalized = normalizeAssignee(trimmed);
  return normalized || trimmed.toLowerCase();
}

function resolveThreadIdForTask(taskId: string | undefined, threadId: string | undefined): string {
  const normalizedTaskId = (taskId || '').trim();
  const trimmedThreadId = (threadId || '').trim();

  if (!normalizedTaskId) {
    return trimmedThreadId;
  }

  const expectedThread = `task:${normalizedTaskId}`;
  if (!trimmedThreadId) {
    return expectedThread;
  }

  if (trimmedThreadId.startsWith('task:') && trimmedThreadId !== expectedThread) {
    // Guardrail: avoid routing messages to the wrong task's thread when a taskId
    // is supplied. Normalize safely to the local task thread to prevent mismatched
    // follow-ups and accidental PM/worker cross-thread leakage.
    return expectedThread;
  }

  return trimmedThreadId;
}

type MessageRuntime = Pick<Rt, 'operatingMode' | 'lastWorkerAssignee' | 'autoWorkerAssignee' | 'listenerAssigneeOverride'>;

export function emitMessage(
  rt: MessageRuntime,
  ctx: ExtensionContext,
  emitEvent: (
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
  ) => void,
  kind: ConversationalMessageKind,
  source: string,
  options: {
    to?: string;
    from?: string;
    taskId?: string;
    runId?: string;
    threadId?: string;
    inReplyTo?: string;
    body: string;
    requiresAck?: boolean;
    assignee?: string;
    messageId?: string;
    priority?: Envelope['priority'];
    expiresAt?: string;
  }
): { messageId: string; threadId: string; from: string; to?: string; kind: ConversationalMessageKind } {
  const defaultFrom = rt.operatingMode === 'pm'
    ? 'pm'
    : normalizeAssignee(
        options.assignee ||
        rt.lastWorkerAssignee ||
        rt.autoWorkerAssignee ||
        rt.listenerAssigneeOverride ||
        getEffectiveListenerAssignee(rt as Rt, ctx) ||
        'worker'
      );

  const from = normalizeAddress(options.from) || defaultFrom || (rt.operatingMode === 'pm' ? 'pm' : 'worker');
  const to = normalizeAddress(options.to);
  const resolvedThreadId = resolveThreadIdForTask(options.taskId, options.threadId);
  const threadId = resolvedThreadId
    || (options.taskId ? `task:${options.taskId}` : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const messageId = (options.messageId || '').trim() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  emitEvent(kind, ctx, source, {
    ...(options.taskId ? { taskId: options.taskId } : {}),
    ...(options.runId ? { runId: options.runId } : {}),
    ...(from && from !== 'pm' && from !== 'worker' ? { assignee: from } : {}),
    data: {
      body: options.body,
    },
    messageId,
    threadId,
    ...(options.inReplyTo ? { inReplyTo: options.inReplyTo } : {}),
    from,
    ...(to ? { to } : {}),
    ...(options.priority ? { priority: options.priority } : {}),
    ...(typeof options.requiresAck === 'boolean' ? { requiresAck: options.requiresAck } : {}),
    ...(options.expiresAt ? { expiresAt: options.expiresAt } : {}),
  });

  return {
    messageId,
    threadId,
    from,
    ...(to ? { to } : {}),
    kind,
  };
}

// Guard against the race where pi.sendUserMessage() is async internally:
// ctx.isIdle() may still return true for subsequent synchronous calls
// in the same tick before the agent enters non-idle state.
let sentMessageThisTick = false;

/**
 * Send an orchestration message to the agent.
 *
 * Uses module-level `sentMessageThisTick` to prevent the race where
 * multiple synchronous calls in the same tick all see ctx.isIdle() === true.
 */
export function sendOrchestrationMessage(rt: Rt, ctx: ExtensionContext, lines: string[]): void {
  const message = ['[BRAINFILE ORCHESTRATION]', ...lines].join('\n');
  if (!sentMessageThisTick && ctx.isIdle()) {
    sentMessageThisTick = true;
    // Reset after the current synchronous execution completes so that
    // future event loop iterations can send fresh messages normally.
    setTimeout(() => {
      sentMessageThisTick = false;
    }, 0);
    rt.pi.sendUserMessage(message);
  } else {
    rt.pi.sendUserMessage(message, { deliverAs: 'followUp' });
  }
}
