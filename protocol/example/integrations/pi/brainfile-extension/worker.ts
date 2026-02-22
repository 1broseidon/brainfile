import type { ExtensionContext } from '@mariozechner/pi-coding-agent';
import * as fs from 'fs';
import * as path from 'path';
import { readTasksDir } from '@brainfile/core';

import type { Rt, WorkerClaimRecord } from './types';
import {
  DEFAULT_LISTENER_ASSIGNEE,
  DEFAULT_WORKER_PRESENCE_TTL_SECONDS,
  WORKER_HEARTBEAT_INTERVAL_MS,
  WORKER_CLAIM_REFRESH_INTERVAL_MS,
  WORKER_CLAIM_LEASE_SECONDS,
  WORKER_CLAIM_MAX_SLOT,
  WORKER_CLAIMS_DIRNAME,
} from './constants';
import { persistState } from './state';
import { emitEvent } from './events';

// ── Pure helpers (no Rt dependency) ────────────────────────────────────

export function normalizeAssignee(value: string | null | undefined): string {
  const normalized = (value || '').trim().toLowerCase();
  if (!normalized) return '';

  // Be forgiving with quoted inputs, e.g. /listen assignee "pi-1"
  return normalized.replace(/^["'`]+|["'`]+$/g, '');
}

function getModelMetadata(ctx: ExtensionContext): { provider: string; id: string; name: string } {
  const model = ctx.model as any;
  return {
    provider: model?.provider || 'unknown',
    id: model?.id || 'unknown',
    name: model?.name || 'unknown',
  };
}

export function inferAssigneeFromSlot(slotNumber: number): string {
  return `worker-${Math.max(1, Math.floor(slotNumber))}`;
}

export function assigneeBase(value: string | null | undefined): string {
  return normalizeAssignee(value).replace(/-\d+$/g, '');
}

export function assigneeSlot(value: string | null | undefined): number | null {
  const normalized = normalizeAssignee(value);
  if (!normalized) return null;

  const match = normalized.match(/-(\d+)$/);
  if (!match) return null;

  const slot = Number.parseInt(match[1], 10);
  if (!Number.isFinite(slot) || slot <= 0) return null;
  return slot;
}

export function isPoolAssignee(assignee: string | null | undefined): boolean {
  if (!assignee) return true;
  const norm = normalizeAssignee(assignee);
  if (!norm || norm === 'pool') return true;
  // Legacy: old model-family names treated as pool
  if (['codex', 'claude', 'gemini', 'cursor'].includes(norm)) return true;
  return false;
}

export function assigneeMatches(taskAssignee: string | null | undefined, workerAssignee: string | null | undefined): boolean {
  if (isPoolAssignee(taskAssignee)) return true;

  const task = normalizeAssignee(taskAssignee);
  const worker = normalizeAssignee(workerAssignee);
  
  if (!task || !worker) return false;
  if (task === worker) return true;

  // Bare "worker" matches any "worker-N"
  if (task === 'worker' && assigneeBase(worker) === 'worker') return true;

  return false;
}

// ── Worker claim functions ─────────────────────────────────────────────

function getWorkerClaimsDir(rt: Rt): string | null {
  if (!rt.boardContext) return null;
  const claimsDir = path.join(rt.boardContext.stateDir, WORKER_CLAIMS_DIRNAME);
  fs.mkdirSync(claimsDir, { recursive: true });
  return claimsDir;
}

function workerClaimLockDir(rt: Rt, slot: number): string | null {
  const claimsDir = getWorkerClaimsDir(rt);
  if (!claimsDir) return null;
  return path.join(claimsDir, `worker-${slot}.lock`);
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

function clearWorkerClaimMemory(rt: Rt): void {
  rt.workerClaimSlot = null;
  rt.lastWorkerClaimRefreshAtMs = 0;
}

export function tryAcquireWorkerSlotClaim(rt: Rt, slot: number): boolean {
  if (!rt.boardContext || slot <= 0) return false;

  const base = 'worker';
  const lockDir = workerClaimLockDir(rt, slot);
  if (!lockDir) return false;

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const assignee = `${base}-${slot}`;

  const refreshOwnedClaim = (existing: WorkerClaimRecord) => {
    if (nowMs - rt.lastWorkerClaimRefreshAtMs < WORKER_CLAIM_REFRESH_INTERVAL_MS) {
      rt.workerClaimSlot = slot;
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
    rt.workerClaimSlot = slot;
    rt.lastWorkerClaimRefreshAtMs = nowMs;
    return true;
  };

  if (fs.existsSync(lockDir)) {
    const existing = readWorkerClaimRecord(lockDir);
    if (existing?.token === rt.workerClaimToken) {
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
    if (existing?.token === rt.workerClaimToken) {
      return refreshOwnedClaim(existing);
    }
    return false;
  }

  const created: WorkerClaimRecord = {
    token: rt.workerClaimToken,
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

  rt.workerClaimSlot = slot;
  rt.lastWorkerClaimRefreshAtMs = nowMs;
  return true;
}

export function releaseWorkerAssigneeClaim(rt: Rt): void {
  if (!rt.boardContext || rt.workerClaimSlot === null) {
    clearWorkerClaimMemory(rt);
    return;
  }

  const lockDir = workerClaimLockDir(rt, rt.workerClaimSlot);
  clearWorkerClaimMemory(rt);
  if (!lockDir || !fs.existsSync(lockDir)) return;

  const existing = readWorkerClaimRecord(lockDir);
  if (existing && existing.token !== rt.workerClaimToken) return;

  try {
    fs.rmSync(lockDir, { recursive: true, force: true });
  } catch {
    // best effort release
  }
}

// ── Operating mode ─────────────────────────────────────────────────────

export function resolveOperatingMode(rt: Rt, ctx: ExtensionContext): 'pm' | 'worker' {
  // If no override is set, default to 'worker'
  // In a real implementation this might check session position > 0 to differentiate PM vs worker.
  return rt.operatingModeOverride || 'worker';
}

// ── Auto assignee ──────────────────────────────────────────────────────

export function ensureAutoWorkerAssignee(rt: Rt): string {
  const base = 'worker';

  const preferred = normalizeAssignee(rt.autoWorkerAssignee);
  const preferredSlot = preferred && assigneeBase(preferred) === base ? assigneeSlot(preferred) : null;

  const claimPreferred = (slot: number | null): string | null => {
    if (slot === null || slot <= 0) return null;
    if (!tryAcquireWorkerSlotClaim(rt, slot)) return null;
    return inferAssigneeFromSlot(slot);
  };

  let claimed = claimPreferred(rt.workerClaimSlot);
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
    claimed = inferAssigneeFromSlot(Math.max(1, Math.floor(Date.now() / 1000) % WORKER_CLAIM_MAX_SLOT));
  }

  if (normalizeAssignee(rt.autoWorkerAssignee) !== claimed) {
    rt.autoWorkerAssignee = claimed;
    persistState(rt);
  }

  return claimed;
}

export function getEffectiveListenerAssignee(rt: Rt, ctx?: ExtensionContext): string {
  const override = normalizeAssignee(rt.listenerAssigneeOverride);
  if (override) return override;

  if (rt.operatingMode === 'worker') {
    if (rt.listenMode) {
      return ensureAutoWorkerAssignee(rt);
    }

    const cached = normalizeAssignee(rt.autoWorkerAssignee);
    if (cached) return cached;

    return inferAssigneeFromSlot(1);
  }

  return 'pm';
}

// ── Worker presence / heartbeat ────────────────────────────────────────

const DEFAULT_WORKER_MAX_CONCURRENCY = 1;

function normalizeMaxConcurrency(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_WORKER_MAX_CONCURRENCY;
  return Math.max(1, Math.floor(value));
}

function normalizeActiveCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function countInProgressTasksForWorker(rt: Rt, workerAssignee: string): number {
  if (!rt.boardContext) return 0;
  let count = 0;
  for (const doc of readTasksDir(rt.boardContext.boardDir)) {
    const contractStatus = (doc.task.contract as any)?.status;
    if (contractStatus !== 'in_progress') continue;
    if (!assigneeMatches(doc.task.assignee, workerAssignee)) continue;
    count += 1;
  }
  return count;
}

function buildWorkerLoad(rt: Rt, workerAssignee: string, maxConcurrency: number): {
  maxConcurrency: number;
  activeCount: number;
  idle: boolean;
} {
  const normalizedMaxConcurrency = normalizeMaxConcurrency(maxConcurrency);
  const activeCount = countInProgressTasksForWorker(rt, workerAssignee);
  return {
    maxConcurrency: normalizedMaxConcurrency,
    activeCount,
    idle: activeCount < normalizedMaxConcurrency,
  };
}

export function updateWorkerReadiness(
  rt: Rt,
  worker: string,
  readiness: { maxConcurrency: number; activeCount: number; idle: boolean },
  at: string
): void {
  const maxConcurrency = normalizeMaxConcurrency(readiness.maxConcurrency);
  const activeCount = normalizeActiveCount(readiness.activeCount);
  const idle = typeof readiness.idle === 'boolean' ? readiness.idle : activeCount < maxConcurrency;

  rt.eventProjection.workerReadiness[worker] = {
    maxConcurrency,
    activeCount,
    idle,
    lastReportedAt: at,
  };
}

export function formatWorkerLoad(worker: {
  worker: string;
  model?: string;
  ageSeconds: number;
  maxConcurrency: number;
  activeCount: number;
  idle: boolean;
}): string {
  const state = worker.idle ? 'idle' : 'at-max';
  const modelStr = worker.model ? ` (${worker.model})` : '';
  return `${worker.worker}${modelStr} [${state}]`;
}

export function updateWorkerPresence(rt: Rt, worker: string, status: 'online' | 'offline', at: string, model?: { provider: string; id: string; name: string }): void {
  const existing = rt.eventProjection.workerPresence[worker];
  rt.eventProjection.workerPresence[worker] = {
    status,
    lastSeenAt: at,
    lastEventAt: at,
    model: model || existing?.model,
  };
}

export function getWorkerAvailabilitySnapshot(rt: Rt, nowMs = Date.now()): {
  available: Array<{
    worker: string;
    model?: string;
    ageSeconds: number;
    lastSeenAt: string;
    maxConcurrency: number;
    activeCount: number;
    idle: boolean;
  }>;
  unavailable: Array<{ worker: string; model?: string; reason: 'offline' | 'expired'; ageSeconds: number; lastSeenAt: string }>;
} {
  const available: Array<{
    worker: string;
    model?: string;
    ageSeconds: number;
    lastSeenAt: string;
    maxConcurrency: number;
    activeCount: number;
    idle: boolean;
  }> = [];
  const unavailable: Array<{ worker: string; model?: string; reason: 'offline' | 'expired'; ageSeconds: number; lastSeenAt: string }> = [];

  for (const [worker, presence] of Object.entries(rt.eventProjection.workerPresence)) {
    const seenMs = Date.parse(presence.lastSeenAt);
    const ageSeconds = Number.isFinite(seenMs) ? Math.max(0, Math.floor((nowMs - seenMs) / 1000)) : Number.MAX_SAFE_INTEGER;
    const expired = !Number.isFinite(seenMs) || ageSeconds > DEFAULT_WORKER_PRESENCE_TTL_SECONDS;
    const model = presence.model ? (presence.model.name || presence.model.id || presence.model.provider || undefined) : undefined;

    if (presence.status === 'online' && !expired) {
      const readiness = rt.eventProjection.workerReadiness[worker];
      const maxConcurrency = normalizeMaxConcurrency(readiness?.maxConcurrency);
      const fallbackActiveCount = countInProgressTasksForWorker(rt, worker);
      const activeCount = readiness ? normalizeActiveCount(readiness.activeCount) : fallbackActiveCount;
      const idle = readiness ? (typeof readiness.idle === 'boolean' ? readiness.idle : activeCount < maxConcurrency) : activeCount < maxConcurrency;

      available.push({
        worker,
        model,
        ageSeconds,
        lastSeenAt: presence.lastSeenAt,
        maxConcurrency,
        activeCount,
        idle,
      });
    } else {
      unavailable.push({
        worker,
        model,
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

export function maybeEmitWorkerPresenceHeartbeat(rt: Rt, ctx: ExtensionContext, source: string, force = false): void {
  if (rt.operatingMode !== 'worker' || !rt.listenMode) return;

  const assignee = normalizeAssignee(getEffectiveListenerAssignee(rt, ctx));
  if (!assignee) return;
  rt.lastWorkerAssignee = assignee;

  const nowIso = new Date().toISOString();
  const nowMs = Date.now();
  const load = buildWorkerLoad(rt, assignee, DEFAULT_WORKER_MAX_CONCURRENCY);
  const modelMetadata = getModelMetadata(ctx);

  if (!rt.workerOnlineEmitted) {
    emitEvent(rt, 'worker.online', ctx, source, {
      assignee,
      data: {
        ttlSeconds: DEFAULT_WORKER_PRESENCE_TTL_SECONDS,
        model: modelMetadata,
      },
    });
    emitEvent(rt, 'worker.ready', ctx, source, {
      assignee,
      data: {
        model: modelMetadata,
        maxConcurrency: load.maxConcurrency,
        activeCount: load.activeCount,
        idle: load.idle,
      },
    });
    updateWorkerPresence(rt, assignee, 'online', nowIso, modelMetadata);
    updateWorkerReadiness(rt, assignee, load, nowIso);
    rt.workerOnlineEmitted = true;
    rt.lastWorkerHeartbeatAtMs = nowMs;
    persistState(rt);
    return;
  }

  if (!force && nowMs - rt.lastWorkerHeartbeatAtMs < WORKER_HEARTBEAT_INTERVAL_MS) {
    return;
  }

  emitEvent(rt, 'worker.heartbeat', ctx, source, {
    assignee,
    data: {
      ttlSeconds: DEFAULT_WORKER_PRESENCE_TTL_SECONDS,
      model: modelMetadata,
    },
  });
  emitEvent(rt, 'worker.ready', ctx, source, {
    assignee,
    data: {
      model: modelMetadata,
      maxConcurrency: load.maxConcurrency,
      activeCount: load.activeCount,
      idle: load.idle,
    },
  });
  updateWorkerPresence(rt, assignee, 'online', nowIso, modelMetadata);
  updateWorkerReadiness(rt, assignee, load, nowIso);
  rt.lastWorkerHeartbeatAtMs = nowMs;
  persistState(rt);
}

export function emitWorkerOffline(rt: Rt, ctx: ExtensionContext, source: string): void {
  const fallbackAssignee = normalizeAssignee(
    rt.lastWorkerAssignee || rt.autoWorkerAssignee || rt.listenerAssigneeOverride || DEFAULT_LISTENER_ASSIGNEE
  );
  if (!fallbackAssignee) {
    releaseWorkerAssigneeClaim(rt);
    return;
  }

  emitEvent(rt, 'worker.offline', ctx, source, {
    assignee: fallbackAssignee,
    data: {
      bestEffort: true,
    },
  });
  updateWorkerPresence(rt, fallbackAssignee, 'offline', new Date().toISOString());
  rt.workerOnlineEmitted = false;
  rt.lastWorkerHeartbeatAtMs = 0;
  rt.lastWorkerAssignee = fallbackAssignee;
  releaseWorkerAssigneeClaim(rt);
  persistState(rt);
}
