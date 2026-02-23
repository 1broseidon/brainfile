import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import {
  writeTaskFile,
  readTaskFile,
  appendLog,
  type Task,
  type TaskDocument,
} from '@brainfile/core';

import type { Rt, LocatedTask, SchedulerClaimLease } from './types';
import { SAFE_BASH_PATTERNS, DESTRUCTIVE_BASH_PATTERNS } from './constants';
import { extractDescription, setDescriptionSection } from './board';
import {
  normalizeAssignee,
  assigneeMatches,
  isPoolAssignee,
  invalidateInProgressTaskOwnerSnapshot,
} from './worker';
import {
  TASK_PICKUP_LOCK_DIRNAME,
  TASK_PICKUP_LOCK_STALE_SECONDS,
} from './constants';
import {
  validateTaskPickupAuthorization,
  consumeTaskPickupAuthorization,
  releaseTaskPickupAuthorization,
} from './scheduler';

// ── Pure utilities (no Rt dependency) ──────────────────────────────────

export function asJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export function extractRuleText(title: string): string {
  const withoutPrefix = title.trim().replace(/^ADR-\d+\s*:\s*/i, '').trim();
  return withoutPrefix.length > 0 ? withoutPrefix : title.trim();
}

export function getNextRuleId(rules: Record<string, unknown> | undefined): number {
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

export function normalizePathInput(value: string): string {
  return value.startsWith('@') ? value.slice(1) : value;
}

function hasUnsafePlanConstructs(command: string): boolean {
  return /[`$]|\$\(|\$\{|\b`/.test(command);
}

function hasUnsafePlanMutationFlags(command: string): boolean {
  const trimmed = command.trim();
  if (!trimmed) return true;

  // Fail-closed guard: block in-place edit modes even when command families are
  // otherwise allowlisted for read-only usage.
  return (
    /\b(?:sed|gsed)\b[^\n]*\s--in-place(?:[=\s]|$)/i.test(trimmed) ||
    /\b(?:sed|gsed)\b[^\n]*\s-i(?:[^\w-]|$)/i.test(trimmed) ||
    /\b(?:awk|gawk)\b[^\n]*\s-i(?:[^\w-]|$)/i.test(trimmed) ||
    /\b(?:awk|gawk)\b[^\n]*\binplace\b/i.test(trimmed) ||
    /\bjq\b[^\n]*\s--in-place(?:[=\s]|$)/i.test(trimmed) ||
    /\bjq\b[^\n]*\s-i(?:[^\w-]|$)/i.test(trimmed)
  );
}

function splitCommandSegments(command: string): string[] | null {
  const segments: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;

  for (let i = 0; i < command.length; i += 1) {
    const char = command[i];

    if (char === '\n' || char === '\r') {
      return null;
    }

    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (!inSingleQuote && char === '\\') {
      escaped = true;
      current += char;
      continue;
    }

    if (char === "'") {
      inSingleQuote = !inSingleQuote;
      current += char;
      continue;
    }

    if (!inSingleQuote && char === '"') {
      inDoubleQuote = !inDoubleQuote;
      current += char;
      continue;
    }

    if (inSingleQuote || inDoubleQuote) {
      current += char;
      continue;
    }

    if (char === ';') {
      segments.push(current);
      current = '';
      continue;
    }

    if (char === '&') {
      if (command[i + 1] === '&') {
        segments.push(current);
        current = '';
        i += 1;
        continue;
      }
      return null; // background jobs are blocked in plan mode.
    }

    if (char === '|') {
      if (command[i + 1] === '|') {
        segments.push(current);
        current = '';
        i += 1;
        continue;
      }
      return null; // raw pipes are blocked in plan mode.
    }

    current += char;
  }

  segments.push(current);
  return segments;
}

function isSafeCommandSegment(segment: string): boolean {
  const trimmed = segment.trim();
  if (!trimmed) return false;
  if (hasUnsafePlanConstructs(trimmed)) return false;
  if (hasUnsafePlanMutationFlags(trimmed)) return false;

  const allowlisted = SAFE_BASH_PATTERNS.some((pattern) => pattern.test(trimmed));
  const destructive = DESTRUCTIVE_BASH_PATTERNS.some((pattern) => pattern.test(trimmed));
  return allowlisted && !destructive;
}

export function isSafePlanBashCommand(command: string): boolean {
  if (!command || command.trim().length === 0) return false;
  const segments = splitCommandSegments(command);
  if (!segments) return false;

  for (const segment of segments) {
    if (!isSafeCommandSegment(segment)) {
      return false;
    }
  }

  return true;
}

export function truncateText(value: string | undefined, maxChars: number): string {
  if (!value) return '';
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n... [truncated ${value.length - maxChars} chars]`;
}

export function detectDirectoryChangeWarning(command: string): string | undefined {
  const patterns = [/\bcd\s+[^\s;|&]+/, /\bpushd\s+/i, /\bchdir\s+/i];
  for (const pattern of patterns) {
    if (pattern.test(command)) {
      return 'Command changes directory. If it invokes brainfile CLI internally, pass -f explicitly to avoid path ambiguity.';
    }
  }
  return undefined;
}

export function makeToolResponse(payload: unknown, isError = false) {
  return {
    content: [{ type: 'text' as const, text: asJson(payload) }],
    details: payload,
    ...(isError ? { isError: true } : {}),
  };
}

export function parseDeliverableSpecs(specs?: string[]): { deliverables: any[]; errors: string[] } {
  const deliverables: any[] = [];
  const errors: string[] = [];

  for (const raw of specs || []) {
    const input = String(raw || '').trim();
    if (!input) continue;

    const parts = input.split(':');
    if (parts.length < 2) {
      errors.push(`Invalid deliverable \"${input}\". Expected format type:path:description or path:description.`);
      continue;
    }

    let type: string | undefined;
    let pathPart = '';
    let description = '';

    if (parts.length >= 3) {
      type = parts.shift();
      pathPart = parts.shift() || '';
      description = parts.join(':').trim();
    } else {
      pathPart = parts.shift() || '';
      description = parts.join(':').trim();
    }

    pathPart = normalizePathInput(pathPart);
    if (!pathPart) {
      errors.push(`Deliverable \"${input}\" is missing path.`);
      continue;
    }

    deliverables.push({
      ...(type ? { type: type.trim() } : {}),
      path: pathPart,
      ...(description ? { description } : {}),
    });
  }

  return { deliverables, errors };
}

export function formatValidationFeedback(input: {
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

// ── Contract status helpers ────────────────────────────────────────────

export function getContractStatus(task: Task): string {
  return String((task as any)?.contract?.status || 'none');
}

function getContractOwner(task: Task): string | null {
  const contract = (task as any).contract as any;
  const explicitOwner = normalizeAssignee(typeof contract?.pickedUpBy === 'string' ? contract.pickedUpBy : '');
  if (explicitOwner) return explicitOwner;

  const legacyOwner = normalizeAssignee(task.assignee);
  if (!legacyOwner) return null;
  if (isPoolAssignee(legacyOwner)) return null;
  return legacyOwner;
}

export function ensureTaskHasContract(task: Task): { ok: true; contract: any } | { ok: false; error: string } {
  const contract = (task as any).contract;
  if (!contract || typeof contract !== 'object') {
    return { ok: false, error: `Task ${task.id} has no contract.` };
  }
  return { ok: true, contract };
}

// ── Task patching ──────────────────────────────────────────────────────

export function applyTaskPatch(located: LocatedTask, patch: {
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

// ── Contract lifecycle (needs Rt for boardContext) ─────────────────────

function getCanonicalProjectRoot(rt: Rt): string | null {
  if (!rt.boardContext) return null;
  try {
    return fs.realpathSync(rt.boardContext.projectRoot);
  } catch {
    return path.resolve(rt.boardContext.projectRoot);
  }
}

function isSubPath(absPath: string, root: string): boolean {
  const relative = path.relative(root, absPath);
  const firstSegment = relative.split(path.sep)[0] || '';
  return relative === '' || (firstSegment !== '' && firstSegment !== '..');
}

function resolveDeliverablePath(rt: Rt, rawPath: string): string | null {
  if (!rt.boardContext) return null;
  const normalizedPath = normalizePathInput(rawPath.trim());

  if (!normalizedPath || path.isAbsolute(normalizedPath)) {
    return null;
  }

  const rootReal = getCanonicalProjectRoot(rt);
  if (!rootReal) return null;

  const candidate = path.resolve(rootReal, normalizedPath);
  if (!isSubPath(candidate, rootReal)) {
    return null;
  }

  try {
    const resolved = fs.realpathSync(candidate);
    if (!isSubPath(resolved, rootReal)) {
      return null;
    }
    return resolved;
  } catch {
    return candidate;
  }
}

interface TaskPickupLockRecord {
  token: string;
  assignee: string;
  acquiredAt: string;
  updatedAt: string;
  pid: number;
}

function taskPickupLockRoot(rt: Rt): string | null {
  if (!rt.boardContext) return null;
  const lockRoot = path.join(rt.boardContext.stateDir, TASK_PICKUP_LOCK_DIRNAME);
  fs.mkdirSync(lockRoot, { recursive: true });
  return lockRoot;
}

function taskPickupLockDir(rt: Rt, taskId: string): string | null {
  const root = taskPickupLockRoot(rt);
  if (!root) return null;
  return path.join(root, encodeURIComponent(taskId));
}

function taskPickupLockOwnerPath(lockDir: string): string {
  return path.join(lockDir, 'owner.json');
}

function readTaskPickupLockRecord(lockDir: string): TaskPickupLockRecord | null {
  try {
    const ownerPath = taskPickupLockOwnerPath(lockDir);
    if (!fs.existsSync(ownerPath)) return null;
    const raw = fs.readFileSync(ownerPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<TaskPickupLockRecord>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.token !== 'string' || !parsed.token) return null;
    if (typeof parsed.assignee !== 'string' || !parsed.assignee) return null;
    if (typeof parsed.acquiredAt !== 'string' || !parsed.acquiredAt) return null;
    if (typeof parsed.updatedAt !== 'string' || !parsed.updatedAt) return null;
    if (typeof parsed.pid !== 'number' || !Number.isFinite(parsed.pid) || parsed.pid <= 0) return null;
    return {
      token: parsed.token,
      assignee: parsed.assignee,
      acquiredAt: parsed.acquiredAt,
      updatedAt: parsed.updatedAt,
      pid: Math.floor(parsed.pid),
    };
  } catch {
    return null;
  }
}

function isProcessAlive(pid: unknown): boolean {
  if (typeof pid !== 'number' || !Number.isFinite(pid) || pid <= 0) return false;
  const numericPid = Math.floor(pid);
  try {
    process.kill(numericPid, 0);
    return true;
  } catch (error: any) {
    return error?.code === 'EPERM';
  }
}

function isTaskPickupLockStale(record: TaskPickupLockRecord, nowMs: number): boolean {
  const updatedAtMs = Date.parse(record.updatedAt);
  if (!Number.isFinite(updatedAtMs)) return true;

  if (isProcessAlive(record.pid)) {
    return false;
  }

  return nowMs - updatedAtMs > TASK_PICKUP_LOCK_STALE_SECONDS * 1000;
}

function writeTaskPickupLockRecord(lockDir: string, record: TaskPickupLockRecord): boolean {
  try {
    fs.writeFileSync(taskPickupLockOwnerPath(lockDir), `${JSON.stringify(record)}\n`, 'utf-8');
    return true;
  } catch {
    return false;
  }
}

type TaskPickupLockHandle = { ok: boolean; lockDir: string | null; token: string | null };

function acquireTaskPickupLock(
  rt: Rt,
  taskId: string,
  assignee: string
): TaskPickupLockHandle {
  const lockDir = taskPickupLockDir(rt, taskId);
  if (!lockDir) return { ok: false, lockDir: null, token: null };

  const token = rt.workerClaimToken || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const now = new Date();
  const nowMs = now.getTime();
  try {
    fs.mkdirSync(lockDir);
    const record: TaskPickupLockRecord = {
      token,
      assignee,
      acquiredAt: now.toISOString(),
      updatedAt: now.toISOString(),
      pid: process.pid,
    };
    if (!writeTaskPickupLockRecord(lockDir, record)) {
      try { fs.rmSync(lockDir, { recursive: true, force: true }); } catch { /* best effort */ }
      return { ok: false, lockDir, token: null };
    }
    return { ok: true, lockDir, token };
  } catch {
    const existing = readTaskPickupLockRecord(lockDir);
    if (existing && !isTaskPickupLockStale(existing, nowMs)) {
      return { ok: false, lockDir, token: null };
    }

    try {
      fs.rmSync(lockDir, { recursive: true, force: true });
    } catch {
      return { ok: false, lockDir, token: null };
    }

    return acquireTaskPickupLock(rt, taskId, assignee);
  }
}

function releaseTaskPickupLock(rt: Rt, lockDir: string | null, token: string | null): void {
  if (!lockDir || !token || !fs.existsSync(lockDir)) return;

  try {
    const existing = readTaskPickupLockRecord(lockDir);
    if (!existing || existing.token !== token) return;

    if (existing.pid !== process.pid) {
      return;
    }

    fs.rmSync(lockDir, { recursive: true, force: true });
  } catch {
    // best effort cleanup
  }
}

export function checkContractDeliverables(rt: Rt, located: LocatedTask): Array<{ ok: boolean; message: string; resolvedPath?: string; deliverable?: any }> {
  if (!rt.boardContext) {
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

    const resolvedPath = resolveDeliverablePath(rt, rawPath);
    if (!resolvedPath) {
      deliverableChecks.push({
        ok: false,
        message: `invalid deliverable path: ${normalizePathInput(rawPath)}`,
        deliverable,
      });
      continue;
    }

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

export function runValidationCommands(
  rt: Rt,
  commands: string[],
  options?: { stopOnFailure?: boolean }
): Array<{ command: string; exitCode: number; stdout: string; stderr: string; warning?: string }> {
  if (!rt.boardContext || commands.length === 0) return [];

  const stopOnFailure = options?.stopOnFailure !== false;
  const commandResults: Array<{ command: string; exitCode: number; stdout: string; stderr: string; warning?: string }> = [];

  for (const command of commands) {
    const warning = detectDirectoryChangeWarning(command);
    const result = spawnSync(command, {
      shell: true,
      cwd: rt.boardContext.projectRoot,
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
  rt: Rt,
  deliverableChecks: Array<{ ok: boolean; message: string; resolvedPath?: string; deliverable?: any }>,
  commandResults: Array<{ command: string; exitCode: number; stdout: string; stderr: string; warning?: string }>
) {
  const capturedAt = new Date().toISOString();

  let gitHead: string | null = null;
  if (rt.boardContext) {
    const gitResult = spawnSync('git rev-parse HEAD', {
      shell: true,
      cwd: rt.boardContext.projectRoot,
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
          path: rt.boardContext ? path.relative(rt.boardContext.projectRoot, check.resolvedPath!) : check.resolvedPath,
          modifiedAt: stats.mtime.toISOString(),
          size: stats.size,
        };
      } catch {
        return {
          path: rt.boardContext ? path.relative(rt.boardContext.projectRoot, check.resolvedPath!) : check.resolvedPath,
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

export function setContractStatus(
  located: LocatedTask,
  status: string,
  options?: { feedback?: string; metricsPatch?: Record<string, unknown>; assignee?: string; runtime?: Rt }
): LocatedTask {
  const updatedTask: Task = { ...located.task };
  const contract = { ...((updatedTask as any).contract || {}) } as any;
  const previousStatus = String(contract.status || 'none');
  contract.status = status;

  const now = new Date();
  const metrics = { ...(contract.metrics || {}) } as any;
  if (status === 'in_progress') {
    metrics.pickedUpAt = now.toISOString();
    if (options?.assignee) {
      contract.pickedUpBy = options.assignee;
    }
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
    if (options?.assignee) {
      contract.deliveredBy = options.assignee;
    }
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

  if (options?.runtime && (status === 'in_progress' || previousStatus === 'in_progress')) {
    invalidateInProgressTaskOwnerSnapshot(options.runtime);
  }

  return {
    ...located,
    task: updatedTask,
  };
}

export function pickupContract(
  located: LocatedTask,
  assignee: string,
  source: 'listener' | 'tool' | 'command',
  runtime?: Rt,
  authorization?: SchedulerClaimLease
): { ok: true; alreadyInProgress?: boolean; task: LocatedTask } | { ok: false; error: string } {
  const fresh = readTaskFile(located.filePath);
  let taskRef = fresh?.task || located.task;
  const normalizedAssignee = normalizeAssignee(assignee);
  const runtimeAssignee = normalizedAssignee || assignee;

  const lockState = runtime
    ? acquireTaskPickupLock(runtime, taskRef.id, runtimeAssignee)
    : { ok: true, lockDir: null, token: null as string | null };

  if (!lockState.ok) {
    return {
      ok: false,
      error: `Contract ${taskRef.id} is currently being claimed by another worker; retry shortly.`,
    };
  }

  let pickupSucceeded = false;

  try {
    const reloaded = readTaskFile(located.filePath);
    taskRef = reloaded?.task || taskRef;

    const taskAssignee = normalizeAssignee(taskRef.assignee);
    if (taskAssignee && !assigneeMatches(taskAssignee, assignee)) {
      return {
        ok: false,
        error: `Contract ${taskRef.id} is assigned to "${taskRef.assignee}", not "${assignee}".`,
      };
    }

    const contractOwner = getContractOwner(taskRef);
    const currentStatus = getContractStatus(taskRef);
    if (currentStatus === 'in_progress') {
      if (!contractOwner) {
        return { ok: true, alreadyInProgress: true, task: { ...located, task: taskRef } };
      }

      if (assigneeMatches(contractOwner, assignee)) {
        return { ok: true, alreadyInProgress: true, task: { ...located, task: taskRef } };
      }

      return {
        ok: false,
        error: `Contract ${taskRef.id} is already in progress by ${contractOwner}.`,
      };
    }

    if (currentStatus !== 'ready') {
      return {
        ok: false,
        error: `Contract ${taskRef.id} is ${currentStatus}; only ready contracts can be picked up.`,
      };
    }

    const requiresSchedulerAuthorization = Boolean(runtime && runtime.operatingMode === 'worker');

    if (requiresSchedulerAuthorization && !authorization) {
      return {
        ok: false,
        error: `Contract ${taskRef.id} requires scheduler pickup authorization before claiming.`,
      };
    }

    if (runtime && authorization) {
      const authCheck = validateTaskPickupAuthorization(runtime, taskRef.id, runtimeAssignee || assignee, authorization);
      if (!authCheck.ok) {
        return {
          ok: false,
          error: `Contract ${taskRef.id} pickup authorization rejected (${authCheck.reasonCode}): ${authCheck.reasonDetails}`,
        };
      }
    }

    const updated = setContractStatus({ ...located, task: taskRef }, 'in_progress', {
      assignee: runtimeAssignee || assignee,
      ...(runtime ? { runtime } : {}),
    });

    if (runtime && authorization) {
      consumeTaskPickupAuthorization(runtime, taskRef.id, authorization, runtimeAssignee || assignee);
    }

    pickupSucceeded = true;
    appendContractHandoffLog(updated, 'pickup', [`assignee: ${assignee}`, `source: ${source}`]);
    return { ok: true, task: updated };
  } finally {
    if (lockState.ok && runtime) {
      releaseTaskPickupLock(runtime, lockState.lockDir, lockState.ok ? lockState.token : null);
    }

    if (!pickupSucceeded && runtime && authorization) {
      releaseTaskPickupAuthorization(runtime, taskRef.id, authorization, runtimeAssignee || assignee);
    }
  }
}

export function deliverContractWithEvidence(
  rt: Rt,
  located: LocatedTask,
  assignee: string,
  source: 'tool' | 'command'
): {
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
  const fresh = readTaskFile(located.filePath);
  const taskRef = fresh?.task || located.task;

  const taskAssignee = normalizeAssignee(taskRef.assignee);
  if (taskAssignee && !assigneeMatches(taskAssignee, assignee)) {
    return {
      ok: false,
      error: `Contract ${taskRef.id} is assigned to "${taskRef.assignee}", not "${assignee}".`,
    };
  }

  const currentStatus = getContractStatus(taskRef);
  const contractOwner = getContractOwner(taskRef);
  const effective = { ...located, task: taskRef };

  if (currentStatus === 'delivered') {
    const contract = taskRef.contract as any;
    return {
      ok: true,
      task: effective,
      deliverableChecks: checkContractDeliverables(rt, effective),
      commandResults: [],
      evidence: contract?.metrics?.deliveryEvidence || null,
    };
  }

  if (currentStatus !== 'in_progress') {
    return {
      ok: false,
      error: `Contract ${taskRef.id} is ${currentStatus}; deliver requires in_progress status.`,
    };
  }

  if (contractOwner && !assigneeMatches(contractOwner, assignee)) {
    return {
      ok: false,
      error: `Contract ${taskRef.id} is owned by ${contractOwner} and can only be delivered by that owner.`,
    };
  }

  const deliverableChecks = checkContractDeliverables(rt, effective);
  const missing = deliverableChecks.filter((check) => !check.ok);
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Cannot deliver ${taskRef.id}: ${missing.length} deliverable(s) missing.`,
      deliverableChecks,
    };
  }

  const contract = (taskRef as any).contract as any;
  const validationCommands = Array.isArray(contract?.validation?.commands)
    ? contract.validation.commands.filter((cmd: unknown) => typeof cmd === 'string' && cmd.trim().length > 0)
    : [];

  const commandResults = runValidationCommands(rt, validationCommands, { stopOnFailure: false });
  const evidence = collectDeliveryEvidence(rt, deliverableChecks, commandResults);
  const normalizedAssignee = normalizeAssignee(assignee);
  const updated = setContractStatus(effective, 'delivered', {
    runtime: rt,
    assignee: normalizedAssignee || assignee,
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

export function runContractValidation(rt: Rt, located: LocatedTask) {
  if (!rt.boardContext) {
    return {
      error: 'Brainfile context unavailable.',
    };
  }

  const contract = (located.task as any).contract as any;
  const validationCommands = Array.isArray(contract?.validation?.commands)
    ? contract.validation.commands.filter((cmd: unknown) => typeof cmd === 'string' && cmd.trim().length > 0)
    : [];

  const deliverableChecks = checkContractDeliverables(rt, located);
  const commandResults: Array<{ command: string; exitCode: number; stdout: string; stderr: string; warning?: string }> = [];

  let ok = deliverableChecks.every((check) => check.ok);

  if (ok) {
    const runResults = runValidationCommands(rt, validationCommands, { stopOnFailure: true });
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

export function buildContractContextPayload(located: LocatedTask) {
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
      pickedUpBy: contract.pickedUpBy,
      deliveredBy: contract.deliveredBy,
      deliverables: contract.deliverables || [],
      constraints: contract.constraints || [],
      validationCommands: contract.validation?.commands || [],
      feedback: contract.feedback,
      metrics: contract.metrics || {},
    },
  };
}
