import type { ExtensionContext } from '@mariozechner/pi-coding-agent';
import * as fs from 'fs';
import * as path from 'path';
import type { Task } from '@brainfile/core';

import type {
  Rt,
  LocatedTask,
  SchedulerClaimDecision,
  SchedulerClaimLease,
  SchedulerClaimReasonCode,
  SchedulerDispatchSnapshot,
  SchedulerDependencySnapshot,
  SchedulerJoinSnapshot,
} from './types';
import {
  SCHEDULER_LEASE_DIRNAME,
  SCHEDULER_LEASE_TTL_SECONDS,
} from './constants';
import {
  normalizeAssignee,
  assigneeMatches,
  isPoolAssignee,
} from './worker';
import { locateTask } from './board';
import { emitEvent, getProjectedTaskContractStatus } from './events';

type SchedulerLeaseRecord = SchedulerClaimLease & {
  taskId: string;
  issuedAt: string;
  updatedAt: string;
  pid: number;
  dispatch: SchedulerDispatchSnapshot;
};

type SchedulerReadinessResult = {
  ready: boolean;
  reasonCode?: SchedulerClaimReasonCode;
  reasonDetails?: string;
  dependencies?: SchedulerDependencySnapshot;
  join?: SchedulerJoinSnapshot;
};

type JoinPolicy = 'all_success' | 'all_delivered' | 'quorum';
type ReadinessSuccessState = 'done' | 'delivered';

type ResolvedTaskState = {
  taskId: string;
  status: string;
  found: boolean;
  source: 'board' | 'projection' | 'missing';
};

function schedulerLeaseRoot(rt: Rt): string | null {
  if (!rt.boardContext) return null;
  const root = path.join(rt.boardContext.stateDir, SCHEDULER_LEASE_DIRNAME);
  fs.mkdirSync(root, { recursive: true });
  return root;
}

function schedulerLeaseDir(rt: Rt, taskId: string): string | null {
  const root = schedulerLeaseRoot(rt);
  if (!root) return null;
  return path.join(root, encodeURIComponent(taskId));
}

function schedulerLeaseOwnerPath(leaseDir: string): string {
  return path.join(leaseDir, 'owner.json');
}

function readSchedulerLeaseRecord(leaseDir: string): SchedulerLeaseRecord | null {
  try {
    const ownerPath = schedulerLeaseOwnerPath(leaseDir);
    if (!fs.existsSync(ownerPath)) return null;
    const raw = fs.readFileSync(ownerPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<SchedulerLeaseRecord>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.id !== 'string' || !parsed.id) return null;
    if (typeof parsed.taskId !== 'string' || !parsed.taskId) return null;
    if (typeof parsed.token !== 'string' || !parsed.token) return null;
    if (typeof parsed.owner !== 'string' || !parsed.owner) return null;
    if (typeof parsed.expiresAt !== 'string' || !parsed.expiresAt) return null;
    if (typeof parsed.issuedAt !== 'string' || !parsed.issuedAt) return null;
    if (typeof parsed.updatedAt !== 'string' || !parsed.updatedAt) return null;

    const dispatch = normalizeDispatchSnapshot(parsed.dispatch);

    return {
      id: parsed.id,
      taskId: parsed.taskId,
      token: parsed.token,
      owner: parsed.owner,
      expiresAt: parsed.expiresAt,
      issuedAt: parsed.issuedAt,
      updatedAt: parsed.updatedAt,
      pid: typeof parsed.pid === 'number' && Number.isFinite(parsed.pid) && parsed.pid > 0
        ? Math.floor(parsed.pid)
        : 0,
      dispatch,
    };
  } catch {
    return null;
  }
}

function normalizeDispatchSnapshot(value: unknown): SchedulerDispatchSnapshot {
  if (!value || typeof value !== 'object') {
    return {
      mode: 'pool',
      source: 'default',
    };
  }

  const raw = value as Record<string, unknown>;
  const mode = raw.mode === 'direct' ? 'direct' : 'pool';
  const target = typeof raw.target === 'string' ? normalizeAssignee(raw.target) : '';
  const source = raw.source === 'orchestration' || raw.source === 'assignee'
    ? raw.source
    : 'default';

  return {
    mode,
    ...(target ? { target } : {}),
    source,
  };
}

function schedulerLeaseIsFresh(record: SchedulerLeaseRecord | null, nowMs = Date.now()): boolean {
  if (!record) return false;

  const expiresAtMs = Date.parse(record.expiresAt);
  if (!Number.isFinite(expiresAtMs)) return false;

  return expiresAtMs > nowMs;
}

function writeSchedulerLeaseRecord(leaseDir: string, record: SchedulerLeaseRecord): boolean {
  try {
    fs.writeFileSync(schedulerLeaseOwnerPath(leaseDir), `${JSON.stringify(record, null, 2)}\n`, 'utf-8');
    return true;
  } catch {
    return false;
  }
}

function removeSchedulerLeaseDir(leaseDir: string): void {
  try {
    fs.rmSync(leaseDir, { recursive: true, force: true });
  } catch {
    // best-effort cleanup only
  }
}

function createSchedulerLeaseRecord(taskId: string, owner: string, dispatch: SchedulerDispatchSnapshot): SchedulerLeaseRecord {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + SCHEDULER_LEASE_TTL_SECONDS * 1000).toISOString();

  return {
    id: `lease-${nowMs.toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    taskId,
    token: `${nowMs.toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    owner,
    expiresAt,
    issuedAt: nowIso,
    updatedAt: nowIso,
    pid: process.pid,
    dispatch,
  };
}

function refreshSchedulerLeaseRecord(record: SchedulerLeaseRecord): SchedulerLeaseRecord {
  const nowMs = Date.now();
  return {
    ...record,
    updatedAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + SCHEDULER_LEASE_TTL_SECONDS * 1000).toISOString(),
    pid: process.pid,
  };
}

function toClaimLease(record: SchedulerLeaseRecord): SchedulerClaimLease {
  return {
    id: record.id,
    token: record.token,
    owner: record.owner,
    expiresAt: record.expiresAt,
  };
}

function issueOrRefreshSchedulerLease(
  rt: Rt,
  taskId: string,
  claimant: string,
  dispatch: SchedulerDispatchSnapshot,
): { ok: true; lease: SchedulerClaimLease } | { ok: false; reasonDetails: string } {
  const leaseDir = schedulerLeaseDir(rt, taskId);
  if (!leaseDir) {
    return {
      ok: false,
      reasonDetails: 'Scheduler lease state is unavailable for this workspace.',
    };
  }

  const nowMs = Date.now();

  const tryCreate = (): { ok: true; lease: SchedulerClaimLease } | { ok: false } => {
    try {
      fs.mkdirSync(leaseDir);
    } catch {
      return { ok: false };
    }

    const created = createSchedulerLeaseRecord(taskId, claimant, dispatch);
    if (!writeSchedulerLeaseRecord(leaseDir, created)) {
      removeSchedulerLeaseDir(leaseDir);
      return { ok: false };
    }

    return {
      ok: true,
      lease: toClaimLease(created),
    };
  };

  const created = tryCreate();
  if (created.ok) return created;

  const existing = readSchedulerLeaseRecord(leaseDir);
  if (schedulerLeaseIsFresh(existing, nowMs)) {
    if (existing && assigneeMatches(existing.owner, claimant)) {
      const refreshed = refreshSchedulerLeaseRecord(existing);
      if (!writeSchedulerLeaseRecord(leaseDir, refreshed)) {
        return {
          ok: false,
          reasonDetails: 'Failed to refresh existing scheduler lease for this worker.',
        };
      }

      return {
        ok: true,
        lease: toClaimLease(refreshed),
      };
    }

    const holder = existing?.owner || 'another worker';
    return {
      ok: false,
      reasonDetails: `Task is already leased by ${holder}.`,
    };
  }

  removeSchedulerLeaseDir(leaseDir);

  const createdAfterCleanup = tryCreate();
  if (createdAfterCleanup.ok) return createdAfterCleanup;

  return {
    ok: false,
    reasonDetails: 'Could not acquire scheduler lease due to concurrent claim activity.',
  };
}

function describeReason(code: SchedulerClaimReasonCode, details: string): string {
  if (details.trim().length > 0) return details;

  if (code === 'dispatch_target_mismatch') return 'Direct dispatch target mismatch.';
  if (code === 'lease_conflict') return 'Task lease is currently held by another worker.';
  if (code === 'task_not_ready') return 'Task is not in ready status.';
  if (code === 'authority_violation') return 'Operation requires PM authority.';
  if (code === 'run_not_active') return 'No active scheduler run is available for this claim.';
  if (code === 'dependency_unmet') return 'Task dependencies are not yet satisfied.';
  if (code === 'dependency_failed') return 'Task dependency failure prevents scheduling.';
  if (code === 'join_waiting') return 'Task is waiting on a fan-in barrier.';
  if (code === 'resource_conflict') return 'Task conflicts with active exclusive resources.';

  return 'Scheduler rejected claim.';
}

function normalizeTaskStatus(value: unknown): string {
  if (typeof value !== 'string') return 'none';
  const normalized = value.trim().toLowerCase();
  if (!normalized) return 'none';
  if (normalized === 'in-progress') return 'in_progress';
  if (normalized === 'complete') return 'completed';
  return normalized;
}

function uniqueTaskIds(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const out: string[] = [];

  for (const item of values) {
    if (typeof item !== 'string') continue;
    const normalized = item.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }

  return out;
}

function resolveTaskState(rt: Rt, taskId: string): ResolvedTaskState {
  const located = locateTask(rt, taskId, true);
  if (located) {
    const statusFromTask = normalizeTaskStatus((located.task.contract as any)?.status);

    if (statusFromTask !== 'none') {
      return {
        taskId,
        status: statusFromTask,
        found: true,
        source: 'board',
      };
    }

    if (located.isLog) {
      return {
        taskId,
        status: 'done',
        found: true,
        source: 'board',
      };
    }

    return {
      taskId,
      status: 'none',
      found: true,
      source: 'board',
    };
  }

  const projected = normalizeTaskStatus(getProjectedTaskContractStatus(rt, taskId));
  if (projected !== 'none') {
    return {
      taskId,
      status: projected,
      found: true,
      source: 'projection',
    };
  }

  return {
    taskId,
    status: 'missing',
    found: false,
    source: 'missing',
  };
}

function parseDependencyIds(task: Task): string[] {
  const orchestration = ((task as any)?.orchestration || {}) as Record<string, unknown>;
  const explicitDependsOn = uniqueTaskIds(orchestration.dependsOn);
  if (explicitDependsOn.length > 0) return explicitDependsOn;

  // Compatibility fallback for legacy dependency fields.
  const blockedBy = uniqueTaskIds((task as any)?.blockedBy);
  if (blockedBy.length > 0) return blockedBy;

  return [];
}

function parseReadinessSuccessState(task: Task): ReadinessSuccessState {
  const readiness = (((task as any)?.orchestration || {}) as any)?.readiness;
  const candidate = typeof readiness?.successState === 'string'
    ? readiness.successState.trim().toLowerCase()
    : '';

  return candidate === 'delivered' ? 'delivered' : 'done';
}

function parseJoinPolicy(value: unknown): JoinPolicy {
  if (typeof value !== 'string') return 'all_success';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'all_delivered') return 'all_delivered';
  if (normalized === 'quorum') return 'quorum';
  return 'all_success';
}

function parseJoinQuorum(value: unknown, min = 1): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.max(min, Math.floor(value));
}

function isFailureStatus(status: string): boolean {
  return status === 'failed' || status === 'blocked';
}

function satisfiesDependencySuccessState(status: string, successState: ReadinessSuccessState): boolean {
  if (successState === 'delivered') {
    return status === 'delivered' || status === 'done' || status === 'completed';
  }

  return status === 'done' || status === 'completed';
}

function satisfiesJoinPolicyStatus(status: string, policy: JoinPolicy): boolean {
  if (policy === 'all_delivered') {
    return status === 'delivered' || status === 'done' || status === 'completed';
  }

  // all_success / quorum default to terminal success
  return status === 'done' || status === 'completed';
}

function summarizeDependencyStates(states: ResolvedTaskState[], predicate: (status: string) => boolean): string[] {
  return states
    .filter((state) => predicate(state.status))
    .map((state) => state.taskId);
}

function evaluateDependencies(rt: Rt, task: Task): {
  ready: boolean;
  reasonCode?: SchedulerClaimReasonCode;
  reasonDetails?: string;
  snapshot: SchedulerDependencySnapshot;
} {
  const required = parseDependencyIds(task);
  const successState = parseReadinessSuccessState(task);

  if (required.length === 0) {
    return {
      ready: true,
      snapshot: {
        required: [],
        satisfied: [],
        pending: [],
        failed: [],
        policy: successState === 'delivered' ? 'all_delivered' : 'all_success',
        successState,
      },
    };
  }

  const states = required.map((taskId) => resolveTaskState(rt, taskId));

  const satisfied = summarizeDependencyStates(states, (status) => satisfiesDependencySuccessState(status, successState));
  const failed = summarizeDependencyStates(states, (status) => isFailureStatus(status));
  const pending = required.filter((taskId) => !satisfied.includes(taskId) && !failed.includes(taskId));

  const snapshot: SchedulerDependencySnapshot = {
    required,
    satisfied,
    pending,
    failed,
    policy: successState === 'delivered' ? 'all_delivered' : 'all_success',
    successState,
  };

  if (failed.length > 0) {
    return {
      ready: false,
      reasonCode: 'dependency_failed',
      reasonDetails: `Dependencies failed/blocked: ${failed.join(', ')}.`,
      snapshot,
    };
  }

  if (pending.length > 0) {
    return {
      ready: false,
      reasonCode: 'dependency_unmet',
      reasonDetails: `Dependencies not yet satisfied: ${pending.join(', ')}.`,
      snapshot,
    };
  }

  return {
    ready: true,
    snapshot,
  };
}

function evaluateJoinBarrier(rt: Rt, task: Task, fallbackRequired: string[]): {
  ready: boolean;
  reasonCode?: SchedulerClaimReasonCode;
  reasonDetails?: string;
  snapshot?: SchedulerJoinSnapshot;
} {
  const orchestration = ((task as any)?.orchestration || {}) as Record<string, unknown>;
  const join = (orchestration.join && typeof orchestration.join === 'object')
    ? orchestration.join as Record<string, unknown>
    : null;

  const mode = typeof join?.mode === 'string' ? join.mode.trim().toLowerCase() : 'none';
  if (mode !== 'barrier') {
    return {
      ready: true,
      snapshot: {
        mode: 'none',
        required: [],
        satisfied: [],
        pending: [],
        failed: [],
        policy: 'all_success',
      },
    };
  }

  const required = uniqueTaskIds(join?.requires);
  const effectiveRequired = required.length > 0 ? required : fallbackRequired;
  const policy = parseJoinPolicy(join?.policy);
  const quorum = policy === 'quorum'
    ? parseJoinQuorum(join?.quorum, 1)
    : undefined;

  if (effectiveRequired.length === 0) {
    return {
      ready: true,
      snapshot: {
        mode: 'barrier',
        required: [],
        satisfied: [],
        pending: [],
        failed: [],
        policy,
        ...(typeof quorum === 'number' ? { quorum } : {}),
      },
    };
  }

  const states = effectiveRequired.map((taskId) => resolveTaskState(rt, taskId));
  const satisfied = summarizeDependencyStates(states, (status) => satisfiesJoinPolicyStatus(status, policy));
  const failed = summarizeDependencyStates(states, (status) => isFailureStatus(status));
  const pending = effectiveRequired.filter((taskId) => !satisfied.includes(taskId) && !failed.includes(taskId));

  const snapshot: SchedulerJoinSnapshot = {
    mode: 'barrier',
    required: effectiveRequired,
    satisfied,
    pending,
    failed,
    policy,
    ...(typeof quorum === 'number' ? { quorum } : {}),
  };

  if (policy === 'quorum') {
    const target = Math.max(1, Math.min(effectiveRequired.length, quorum || 1));
    if (satisfied.length >= target) {
      return { ready: true, snapshot };
    }

    const maximumPossible = satisfied.length + pending.length;
    if (maximumPossible < target) {
      return {
        ready: false,
        reasonCode: 'dependency_failed',
        reasonDetails: `Barrier quorum cannot be reached (${satisfied.length}/${target}) due to failed branches: ${failed.join(', ')}.`,
        snapshot,
      };
    }

    return {
      ready: false,
      reasonCode: 'join_waiting',
      reasonDetails: `Barrier quorum waiting (${satisfied.length}/${target}); pending: ${pending.join(', ')}.`,
      snapshot,
    };
  }

  if (failed.length > 0) {
    return {
      ready: false,
      reasonCode: 'dependency_failed',
      reasonDetails: `Barrier blocked by failed branches: ${failed.join(', ')}.`,
      snapshot,
    };
  }

  if (pending.length > 0) {
    return {
      ready: false,
      reasonCode: 'join_waiting',
      reasonDetails: `Barrier waiting for branches: ${pending.join(', ')}.`,
      snapshot,
    };
  }

  return {
    ready: true,
    snapshot,
  };
}

/**
 * Evaluate DAG dependency + fan-in barrier readiness for a task.
 *
 * Event-driven behavior: this check uses the latest board state and a projection
 * fallback populated by processEventLog. It performs no sleep/poll waiting loops.
 */
export function evaluateTaskOrchestrationReadiness(rt: Rt, located: LocatedTask): SchedulerReadinessResult {
  const dependencyResult = evaluateDependencies(rt, located.task);
  if (!dependencyResult.ready) {
    return {
      ready: false,
      reasonCode: dependencyResult.reasonCode,
      reasonDetails: dependencyResult.reasonDetails,
      dependencies: dependencyResult.snapshot,
    };
  }

  const joinResult = evaluateJoinBarrier(rt, located.task, dependencyResult.snapshot.required);
  if (!joinResult.ready) {
    return {
      ready: false,
      reasonCode: joinResult.reasonCode,
      reasonDetails: joinResult.reasonDetails,
      dependencies: dependencyResult.snapshot,
      join: joinResult.snapshot,
    };
  }

  return {
    ready: true,
    dependencies: dependencyResult.snapshot,
    join: joinResult.snapshot,
  };
}

function emitClaimDecision(rt: Rt, ctx: ExtensionContext, decision: SchedulerClaimDecision, source: string): void {
  const orchestration = buildClaimDecisionOrchestration(decision);
  const summary = decision.accepted
    ? `Scheduler accepted claim for ${decision.taskId} (${decision.claimant}).`
    : `Scheduler rejected claim for ${decision.taskId} (${decision.claimant}): ${describeReason(decision.reasonCode || 'task_not_ready', decision.reasonDetails || '')}`;

  emitEvent(rt, 'message.decision', ctx, source, {
    taskId: decision.taskId,
    threadId: `task:${decision.taskId}`,
    to: decision.claimant,
    from: 'pm',
    data: {
      body: summary,
      orchestration,
    },
  });

  if (decision.claimant !== 'pm') {
    emitEvent(rt, 'message.status', ctx, source, {
      taskId: decision.taskId,
      threadId: `task:${decision.taskId}`,
      to: 'pm',
      from: 'pm',
      data: {
        body: summary,
        orchestration,
      },
    });
  }
}

export function resolveSchedulerDispatch(task: Task): SchedulerDispatchSnapshot {
  const orchestrationDispatch = ((task as any)?.orchestration?.dispatch || {}) as Record<string, unknown>;
  const explicitMode = typeof orchestrationDispatch.mode === 'string'
    ? orchestrationDispatch.mode.trim().toLowerCase()
    : '';
  const explicitTarget = normalizeAssignee(
    typeof orchestrationDispatch.target === 'string' ? orchestrationDispatch.target : ''
  );

  if (explicitMode === 'direct' && explicitTarget) {
    return {
      mode: 'direct',
      target: explicitTarget,
      source: 'orchestration',
    };
  }

  if (explicitMode === 'pool') {
    return {
      mode: 'pool',
      source: 'orchestration',
    };
  }

  const normalizedAssignee = normalizeAssignee(task.assignee);
  if (!normalizedAssignee || normalizedAssignee === 'worker' || isPoolAssignee(normalizedAssignee)) {
    return {
      mode: 'pool',
      source: normalizedAssignee ? 'assignee' : 'default',
    };
  }

  return {
    mode: 'direct',
    target: normalizedAssignee,
    source: 'assignee',
  };
}

function buildRejectedDecision(input: {
  taskId: string;
  claimant: string;
  dispatch: SchedulerDispatchSnapshot;
  reasonCode: SchedulerClaimReasonCode;
  reasonDetails: string;
  dependencies?: SchedulerDependencySnapshot;
  join?: SchedulerJoinSnapshot;
}): SchedulerClaimDecision {
  return {
    taskId: input.taskId,
    claimant: input.claimant,
    dispatch: input.dispatch,
    accepted: false,
    reasonCode: input.reasonCode,
    reasonDetails: describeReason(input.reasonCode, input.reasonDetails),
    ...(input.dependencies ? { dependencies: input.dependencies } : {}),
    ...(input.join ? { join: input.join } : {}),
  };
}

function buildAcceptedDecision(input: {
  taskId: string;
  claimant: string;
  dispatch: SchedulerDispatchSnapshot;
  lease: SchedulerClaimLease;
  dependencies?: SchedulerDependencySnapshot;
  join?: SchedulerJoinSnapshot;
}): SchedulerClaimDecision {
  return {
    taskId: input.taskId,
    claimant: input.claimant,
    dispatch: input.dispatch,
    accepted: true,
    lease: input.lease,
    ...(input.dependencies ? { dependencies: input.dependencies } : {}),
    ...(input.join ? { join: input.join } : {}),
  };
}

export function buildClaimDecisionOrchestration(decision: SchedulerClaimDecision): Record<string, unknown> {
  const base: Record<string, unknown> = {
    action: 'claim_decision',
    decision: decision.accepted ? 'accepted' : 'rejected',
    dispatch: {
      mode: decision.dispatch.mode,
      ...(decision.dispatch.target ? { target: decision.dispatch.target } : {}),
      source: decision.dispatch.source,
    },
    authority: {
      required: 'pm',
      enforced: true,
      actor: 'pm',
    },
    ...(decision.dependencies
      ? {
          dependencies: {
            required: decision.dependencies.required,
            satisfied: decision.dependencies.satisfied,
            policy: decision.dependencies.policy,
            ...(decision.dependencies.pending.length > 0 ? { pending: decision.dependencies.pending } : {}),
            ...(decision.dependencies.failed.length > 0 ? { failed: decision.dependencies.failed } : {}),
            ...(typeof decision.dependencies.quorum === 'number' ? { quorum: decision.dependencies.quorum } : {}),
            ...(decision.dependencies.successState ? { successState: decision.dependencies.successState } : {}),
          },
        }
      : {}),
    ...(decision.join
      ? {
          join: {
            mode: decision.join.mode,
            required: decision.join.required,
            satisfied: decision.join.satisfied,
            policy: decision.join.policy,
            ...(decision.join.pending.length > 0 ? { pending: decision.join.pending } : {}),
            ...(decision.join.failed.length > 0 ? { failed: decision.join.failed } : {}),
            ...(typeof decision.join.quorum === 'number' ? { quorum: decision.join.quorum } : {}),
          },
        }
      : {}),
  };

  if (!decision.accepted) {
    base.reasonCode = decision.reasonCode;
    base.reasonDetails = decision.reasonDetails;
  }

  if (decision.accepted && decision.lease) {
    base.lease = {
      id: decision.lease.id,
      owner: decision.lease.owner,
      expiresAt: decision.lease.expiresAt,
    };
  }

  return base;
}

export function requestTaskPickupAuthorization(
  rt: Rt,
  ctx: ExtensionContext,
  located: LocatedTask,
  claimant: string,
  source: 'listener' | 'tool' | 'command',
): SchedulerClaimDecision {
  const normalizedClaimant = normalizeAssignee(claimant);
  const dispatch = resolveSchedulerDispatch(located.task);

  if (!normalizedClaimant) {
    const decision = buildRejectedDecision({
      taskId: located.task.id,
      claimant: claimant || 'unknown',
      dispatch,
      reasonCode: 'run_not_active',
      reasonDetails: 'Worker identity is unavailable for claim arbitration.',
    });
    emitClaimDecision(rt, ctx, decision, `scheduler:${source}`);
    return decision;
  }

  const status = String((located.task.contract as any)?.status || 'none');
  if (status !== 'ready') {
    const decision = buildRejectedDecision({
      taskId: located.task.id,
      claimant: normalizedClaimant,
      dispatch,
      reasonCode: 'task_not_ready',
      reasonDetails: `Task contract status is ${status}; only ready tasks can be claimed.`,
    });
    emitClaimDecision(rt, ctx, decision, `scheduler:${source}`);
    return decision;
  }

  if (dispatch.mode === 'direct' && dispatch.target && !assigneeMatches(dispatch.target, normalizedClaimant)) {
    const decision = buildRejectedDecision({
      taskId: located.task.id,
      claimant: normalizedClaimant,
      dispatch,
      reasonCode: 'dispatch_target_mismatch',
      reasonDetails: `Task is direct-targeted to ${dispatch.target}; ${normalizedClaimant} is not authorized.`,
    });
    emitClaimDecision(rt, ctx, decision, `scheduler:${source}`);
    return decision;
  }

  const readiness = evaluateTaskOrchestrationReadiness(rt, located);
  if (!readiness.ready) {
    const decision = buildRejectedDecision({
      taskId: located.task.id,
      claimant: normalizedClaimant,
      dispatch,
      reasonCode: readiness.reasonCode || 'task_not_ready',
      reasonDetails: readiness.reasonDetails || 'Task orchestration prerequisites are not satisfied.',
      ...(readiness.dependencies ? { dependencies: readiness.dependencies } : {}),
      ...(readiness.join ? { join: readiness.join } : {}),
    });
    emitClaimDecision(rt, ctx, decision, `scheduler:${source}`);
    return decision;
  }

  const leaseAttempt = issueOrRefreshSchedulerLease(rt, located.task.id, normalizedClaimant, dispatch);
  if (!leaseAttempt.ok) {
    const decision = buildRejectedDecision({
      taskId: located.task.id,
      claimant: normalizedClaimant,
      dispatch,
      reasonCode: 'lease_conflict',
      reasonDetails: leaseAttempt.reasonDetails,
      ...(readiness.dependencies ? { dependencies: readiness.dependencies } : {}),
      ...(readiness.join ? { join: readiness.join } : {}),
    });
    emitClaimDecision(rt, ctx, decision, `scheduler:${source}`);
    return decision;
  }

  const decision = buildAcceptedDecision({
    taskId: located.task.id,
    claimant: normalizedClaimant,
    dispatch,
    lease: leaseAttempt.lease,
    ...(readiness.dependencies ? { dependencies: readiness.dependencies } : {}),
    ...(readiness.join ? { join: readiness.join } : {}),
  });
  emitClaimDecision(rt, ctx, decision, `scheduler:${source}`);
  return decision;
}

export function validateTaskPickupAuthorization(
  rt: Rt,
  taskId: string,
  claimant: string,
  lease: SchedulerClaimLease,
): { ok: true; lease: SchedulerClaimLease } | { ok: false; reasonCode: SchedulerClaimReasonCode; reasonDetails: string } {
  const normalizedClaimant = normalizeAssignee(claimant);
  if (!normalizedClaimant) {
    return {
      ok: false,
      reasonCode: 'run_not_active',
      reasonDetails: 'Worker identity is unavailable for lease validation.',
    };
  }

  const leaseDir = schedulerLeaseDir(rt, taskId);
  if (!leaseDir) {
    return {
      ok: false,
      reasonCode: 'run_not_active',
      reasonDetails: 'Scheduler lease state is unavailable.',
    };
  }

  const record = readSchedulerLeaseRecord(leaseDir);
  if (!schedulerLeaseIsFresh(record)) {
    removeSchedulerLeaseDir(leaseDir);
    return {
      ok: false,
      reasonCode: 'lease_conflict',
      reasonDetails: 'Scheduler lease is missing or expired.',
    };
  }

  if (!record || record.taskId !== taskId) {
    return {
      ok: false,
      reasonCode: 'lease_conflict',
      reasonDetails: 'Scheduler lease does not match the requested task.',
    };
  }

  if (!assigneeMatches(record.owner, normalizedClaimant)) {
    return {
      ok: false,
      reasonCode: 'dispatch_target_mismatch',
      reasonDetails: `Scheduler lease belongs to ${record.owner}, not ${normalizedClaimant}.`,
    };
  }

  if (record.id !== lease.id || record.token !== lease.token) {
    return {
      ok: false,
      reasonCode: 'lease_conflict',
      reasonDetails: 'Scheduler lease token mismatch. Request a fresh authorization.',
    };
  }

  return {
    ok: true,
    lease: {
      id: record.id,
      token: record.token,
      owner: record.owner,
      expiresAt: record.expiresAt,
    },
  };
}

export function releaseTaskPickupAuthorization(
  rt: Rt,
  taskId: string,
  lease: SchedulerClaimLease,
  claimant?: string,
): void {
  const leaseDir = schedulerLeaseDir(rt, taskId);
  if (!leaseDir || !fs.existsSync(leaseDir)) return;

  const record = readSchedulerLeaseRecord(leaseDir);
  if (!record) {
    removeSchedulerLeaseDir(leaseDir);
    return;
  }

  if (record.id !== lease.id || record.token !== lease.token) return;

  if (claimant) {
    const normalizedClaimant = normalizeAssignee(claimant);
    if (normalizedClaimant && !assigneeMatches(record.owner, normalizedClaimant)) {
      return;
    }
  }

  removeSchedulerLeaseDir(leaseDir);
}

export function consumeTaskPickupAuthorization(
  rt: Rt,
  taskId: string,
  lease: SchedulerClaimLease,
  claimant?: string,
): void {
  releaseTaskPickupAuthorization(rt, taskId, lease, claimant);
}
