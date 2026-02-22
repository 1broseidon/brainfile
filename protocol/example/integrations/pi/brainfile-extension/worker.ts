import type { ExtensionContext } from '@mariozechner/pi-coding-agent';
import * as fs from 'fs';
import * as path from 'path';

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

export function inferAssigneeFromModel(ctx: ExtensionContext): string | null {
  const model = ctx.model as any;
  const haystack = `${model?.provider || ''} ${model?.id || ''} ${model?.name || ''}`.toLowerCase();

  if (!haystack.trim()) return null;

  if (haystack.includes('codex')) return 'codex';
  if (haystack.includes('claude')) return 'claude';
  if (haystack.includes('gemini')) return 'gemini';
  if (haystack.includes('cursor')) return 'cursor';

  return null;
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

export function assigneeMatches(taskAssignee: string | null | undefined, workerAssignee: string | null | undefined): boolean {
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

// ── Worker claim functions ─────────────────────────────────────────────

function getWorkerClaimsDir(rt: Rt): string | null {
  if (!rt.boardContext) return null;
  const claimsDir = path.join(rt.boardContext.stateDir, WORKER_CLAIMS_DIRNAME);
  fs.mkdirSync(claimsDir, { recursive: true });
  return claimsDir;
}

function workerClaimLockDir(rt: Rt, base: string, slot: number): string | null {
  const claimsDir = getWorkerClaimsDir(rt);
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

function clearWorkerClaimMemory(rt: Rt): void {
  rt.workerClaimBase = null;
  rt.workerClaimSlot = null;
  rt.lastWorkerClaimRefreshAtMs = 0;
}

export function tryAcquireWorkerSlotClaim(rt: Rt, base: string, slot: number): boolean {
  if (!rt.boardContext || slot <= 0) return false;

  const lockDir = workerClaimLockDir(rt, base, slot);
  if (!lockDir) return false;

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const assignee = `${base}-${slot}`;

  const refreshOwnedClaim = (existing: WorkerClaimRecord) => {
    if (nowMs - rt.lastWorkerClaimRefreshAtMs < WORKER_CLAIM_REFRESH_INTERVAL_MS) {
      rt.workerClaimBase = base;
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
    rt.workerClaimBase = base;
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

  rt.workerClaimBase = base;
  rt.workerClaimSlot = slot;
  rt.lastWorkerClaimRefreshAtMs = nowMs;
  return true;
}

export function releaseWorkerAssigneeClaim(rt: Rt): void {
  if (!rt.boardContext || !rt.workerClaimBase || rt.workerClaimSlot === null) {
    clearWorkerClaimMemory(rt);
    return;
  }

  const lockDir = workerClaimLockDir(rt, rt.workerClaimBase, rt.workerClaimSlot);
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

export function inferOperatingModeFromModel(ctx: ExtensionContext): 'pm' | 'worker' {
  const baseAssignee = assigneeBase(inferAssigneeFromModel(ctx));
  if (baseAssignee === 'codex' || baseAssignee === 'gemini' || baseAssignee === 'cursor') {
    return 'worker';
  }
  return 'pm';
}

export function resolveOperatingMode(rt: Rt, ctx: ExtensionContext): 'pm' | 'worker' {
  return rt.operatingModeOverride || inferOperatingModeFromModel(ctx);
}

// ── Auto assignee ──────────────────────────────────────────────────────

export function ensureAutoWorkerAssignee(rt: Rt, ctx: ExtensionContext): string {
  const inferred = normalizeAssignee(inferAssigneeFromModel(ctx));
  const base = assigneeBase(inferred || DEFAULT_LISTENER_ASSIGNEE) || 'codex';

  if (rt.workerClaimBase && rt.workerClaimBase !== base) {
    releaseWorkerAssigneeClaim(rt);
  }

  const preferred = normalizeAssignee(rt.autoWorkerAssignee);
  const preferredSlot = preferred && assigneeBase(preferred) === base ? assigneeSlot(preferred) : null;

  const claimPreferred = (slot: number | null): string | null => {
    if (slot === null || slot <= 0) return null;
    if (!tryAcquireWorkerSlotClaim(rt, base, slot)) return null;
    return `${base}-${slot}`;
  };

  let claimed = claimPreferred(rt.workerClaimBase === base ? rt.workerClaimSlot : null);
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

  if (normalizeAssignee(rt.autoWorkerAssignee) !== claimed) {
    rt.autoWorkerAssignee = claimed;
    persistState(rt);
  }

  return claimed;
}

export function getEffectiveListenerAssignee(rt: Rt, ctx: ExtensionContext): string {
  const override = normalizeAssignee(rt.listenerAssigneeOverride);
  if (override) return override;

  if (rt.operatingMode === 'worker') {
    if (rt.listenMode) {
      return ensureAutoWorkerAssignee(rt, ctx);
    }

    const cached = normalizeAssignee(rt.autoWorkerAssignee);
    if (cached) return cached;

    const base = assigneeBase(inferAssigneeFromModel(ctx) || DEFAULT_LISTENER_ASSIGNEE) || 'codex';
    return `${base}-1`;
  }

  return inferAssigneeFromModel(ctx) || DEFAULT_LISTENER_ASSIGNEE;
}

// ── Worker presence / heartbeat ────────────────────────────────────────

export function updateWorkerPresence(rt: Rt, worker: string, status: 'online' | 'offline', at: string): void {
  rt.eventProjection.workerPresence[worker] = {
    status,
    lastSeenAt: at,
    lastEventAt: at,
  };
}

export function getWorkerAvailabilitySnapshot(rt: Rt, nowMs = Date.now()): {
  available: Array<{ worker: string; ageSeconds: number; lastSeenAt: string }>;
  unavailable: Array<{ worker: string; reason: 'offline' | 'expired'; ageSeconds: number; lastSeenAt: string }>;
} {
  const available: Array<{ worker: string; ageSeconds: number; lastSeenAt: string }> = [];
  const unavailable: Array<{ worker: string; reason: 'offline' | 'expired'; ageSeconds: number; lastSeenAt: string }> = [];

  for (const [worker, presence] of Object.entries(rt.eventProjection.workerPresence)) {
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

export function maybeEmitWorkerPresenceHeartbeat(rt: Rt, ctx: ExtensionContext, source: string): void {
  if (rt.operatingMode !== 'worker' || !rt.listenMode) return;

  const assignee = normalizeAssignee(getEffectiveListenerAssignee(rt, ctx));
  if (!assignee) return;
  rt.lastWorkerAssignee = assignee;

  const nowIso = new Date().toISOString();
  const nowMs = Date.now();

  if (!rt.workerOnlineEmitted) {
    emitEvent(rt, 'worker.online', ctx, source, {
      assignee,
      data: {
        ttlSeconds: DEFAULT_WORKER_PRESENCE_TTL_SECONDS,
      },
    });
    updateWorkerPresence(rt, assignee, 'online', nowIso);
    rt.workerOnlineEmitted = true;
    rt.lastWorkerHeartbeatAtMs = nowMs;
    persistState(rt);
    return;
  }

  if (nowMs - rt.lastWorkerHeartbeatAtMs < WORKER_HEARTBEAT_INTERVAL_MS) {
    return;
  }

  emitEvent(rt, 'worker.heartbeat', ctx, source, {
    assignee,
    data: {
      ttlSeconds: DEFAULT_WORKER_PRESENCE_TTL_SECONDS,
    },
  });
  updateWorkerPresence(rt, assignee, 'online', nowIso);
  rt.lastWorkerHeartbeatAtMs = nowMs;
  persistState(rt);
}

export function emitWorkerOffline(rt: Rt, ctx: ExtensionContext, source: string): void {
  const fallbackAssignee = normalizeAssignee(
    rt.lastWorkerAssignee || rt.autoWorkerAssignee || rt.listenerAssigneeOverride || inferAssigneeFromModel(ctx) || DEFAULT_LISTENER_ASSIGNEE
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
