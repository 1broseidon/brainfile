/**
 * Ledger utilities for append-only task completion history (`logs/ledger.jsonl`).
 * @packageDocumentation
 */

import * as fs from 'fs';
import * as path from 'path';
import { readTasksDir } from './taskFile';
import type {
  Deliverable,
  FileHistoryOptions,
  BuildLedgerRecordOptions,
  LedgerContractStatus,
  LedgerDateRange,
  LedgerQueryFilters,
  LedgerRecord,
  LedgerRecordType,
  Task,
  TaskContextDeliverable,
  TaskContextEntry,
  TaskContextOptions,
  TaskDocument,
} from './types';
import { LEDGER_CONTRACT_STATUSES } from './types/ledger';

const LEDGER_FILE_NAME = 'ledger.jsonl';
const LEGACY_WARNING_TRACKER = new Set<string>();

function getLedgerPath(logsDir: string): string {
  return path.join(logsDir, LEDGER_FILE_NAME);
}

export function normalizePathValue(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '').trim();
}

function toUniqueStrings(values?: readonly string[]): string[] {
  if (!values) {
    return [];
  }

  const unique = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || unique.has(trimmed)) {
      continue;
    }
    unique.add(trimmed);
    result.push(trimmed);
  }

  return result;
}

function toUniquePaths(values?: readonly string[]): string[] {
  if (!values) {
    return [];
  }

  const unique = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }

    const normalized = normalizePathValue(trimmed);
    if (unique.has(normalized)) {
      continue;
    }

    unique.add(normalized);
    result.push(normalized);
  }

  return result;
}

function parseTimestamp(value?: string): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function timestampOr(value: string | undefined, fallback: number): number {
  const parsed = parseTimestamp(value);
  return parsed === null ? fallback : parsed;
}

function matchesDateRange(completedAt: string, dateRange?: LedgerDateRange): boolean {
  if (!dateRange) {
    return true;
  }

  const completedMs = parseTimestamp(completedAt);
  if (completedMs === null) {
    return false;
  }

  const fromMs = dateRange.from ? parseTimestamp(dateRange.from) : null;
  const toMs = dateRange.to ? parseTimestamp(dateRange.to) : null;

  if (fromMs !== null && completedMs < fromMs) {
    return false;
  }
  if (toMs !== null && completedMs > toMs) {
    return false;
  }

  return true;
}

function isLedgerType(value: string | undefined): value is LedgerRecordType {
  return value === 'task' || value === 'epic' || value === 'adr';
}

function normalizeLedgerType(task: Task): LedgerRecordType {
  if (isLedgerType(task.type)) {
    return task.type;
  }
  if (task.id.startsWith('epic-')) {
    return 'epic';
  }
  if (task.id.startsWith('adr-')) {
    return 'adr';
  }
  return 'task';
}

export function isLedgerContractStatus(value: string | undefined): value is LedgerContractStatus {
  return LEDGER_CONTRACT_STATUSES.includes(value as LedgerContractStatus);
}

function extractDeliverablePaths(deliverables?: Deliverable[]): string[] {
  if (!deliverables) {
    return [];
  }
  return toUniquePaths(deliverables.map((deliverable) => deliverable.path));
}

function isTaskDocument(value: TaskDocument | Task): value is TaskDocument {
  return (
    typeof value === 'object' &&
    value !== null &&
    'task' in value &&
    typeof (value as TaskDocument).task === 'object' &&
    (value as TaskDocument).task !== null
  );
}

function normalizeTaskInput(taskOrDocument: TaskDocument | Task): Task {
  if (isTaskDocument(taskOrDocument)) {
    return taskOrDocument.task;
  }
  return taskOrDocument;
}

function deriveSummary(body: string, fallbackTitle: string): string {
  const lines = body.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    return trimmed;
  }
  return `Completed: ${fallbackTitle}`;
}

function defaultFilesChanged(task: Task): string[] {
  const deliverablePaths = extractDeliverablePaths(task.contract?.deliverables);
  if (deliverablePaths.length > 0) {
    return deliverablePaths;
  }

  const relatedFiles = toUniquePaths(task.relatedFiles);
  if (relatedFiles.length > 0) {
    return relatedFiles;
  }

  return [`${task.id}.md`];
}

function computeCycleTimeHours(createdAt: string, completedAt: string): number {
  const createdMs = parseTimestamp(createdAt);
  const completedMs = parseTimestamp(completedAt);
  if (createdMs === null || completedMs === null) {
    return 0;
  }

  const elapsedHours = (completedMs - createdMs) / (1000 * 60 * 60);
  if (!Number.isFinite(elapsedHours) || elapsedHours < 0) {
    return 0;
  }

  return Number(elapsedHours.toFixed(3));
}

function normalizeValidationAttempts(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return Math.floor(value);
}

function countSubtasks(task: Task): { total: number; completed: number; hasSubtasks: boolean } {
  if (!task.subtasks || !Array.isArray(task.subtasks)) {
    return { total: 0, completed: 0, hasSubtasks: false };
  }

  let completed = 0;
  for (const subtask of task.subtasks) {
    if (subtask.completed) {
      completed += 1;
    }
  }

  return {
    total: task.subtasks.length,
    completed,
    hasSubtasks: true,
  };
}

function normalizeContractStatus(task: Task): LedgerContractStatus | undefined {
  const status = task.contract?.status;
  return typeof status === 'string' && isLedgerContractStatus(status) ? status : undefined;
}

function pathMatches(left: string, right: string): boolean {
  const normalizedLeft = normalizePathValue(left);
  const normalizedRight = normalizePathValue(right);

  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  return (
    normalizedLeft === normalizedRight ||
    normalizedLeft.endsWith(`/${normalizedRight}`) ||
    normalizedRight.endsWith(`/${normalizedLeft}`)
  );
}

function collectRecordFiles(record: LedgerRecord): string[] {
  return toUniquePaths([
    ...(record.filesChanged || []),
    ...(record.relatedFiles || []),
    ...(record.deliverables || []),
  ]);
}

function collectDeliverableInputPaths(deliverables?: TaskContextDeliverable[]): string[] {
  if (!deliverables) {
    return [];
  }

  const paths: string[] = [];
  for (const deliverable of deliverables) {
    if (typeof deliverable === 'string') {
      paths.push(deliverable);
      continue;
    }
    if (deliverable && typeof deliverable.path === 'string') {
      paths.push(deliverable.path);
    }
  }

  return toUniquePaths(paths);
}

function matchedFilesForScope(scopeFiles: string[], recordFiles: string[]): string[] {
  const matched: string[] = [];
  for (const scopeFile of scopeFiles) {
    if (recordFiles.some((recordFile) => pathMatches(recordFile, scopeFile))) {
      matched.push(scopeFile);
    }
  }
  return matched;
}

function parseLedgerLine(line: string, lineNumber: number, ledgerPath: string): LedgerRecord | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch (error) {
    console.warn(
      `[brainfile/core] Failed to parse ledger line ${lineNumber} in ${ledgerPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    console.warn(`[brainfile/core] Ignoring invalid ledger line ${lineNumber} in ${ledgerPath}`);
    return null;
  }

  return parsed as LedgerRecord;
}

function shouldWarnLegacyFallback(logsDir: string): boolean {
  const key = path.resolve(logsDir);
  if (LEGACY_WARNING_TRACKER.has(key)) {
    return false;
  }
  LEGACY_WARNING_TRACKER.add(key);
  return true;
}

function readLegacyMarkdownLedger(logsDir: string): LedgerRecord[] {
  const docs = readTasksDir(logsDir);
  if (docs.length === 0) {
    return [];
  }

  if (shouldWarnLegacyFallback(logsDir)) {
    console.warn(
      `[brainfile/core] ledger.jsonl not found in ${logsDir}; falling back to legacy markdown logs.`,
    );
  }

  return docs.map((doc) => {
    const completedAt = doc.task.completedAt || doc.task.updatedAt || doc.task.createdAt || new Date(0).toISOString();
    return buildLedgerRecord(doc.task, doc.body, { completedAt });
  });
}

/**
 * Build a single ledger record from task metadata + markdown body.
 */
export function buildLedgerRecord(
  taskOrDocument: TaskDocument | Task,
  body: string,
  options: BuildLedgerRecordOptions = {},
): LedgerRecord {
  const task = normalizeTaskInput(taskOrDocument);
  const completedAt = options.completedAt || task.completedAt || new Date().toISOString();
  const createdAt = task.createdAt || completedAt;

  const filesChanged = toUniquePaths(options.filesChanged);
  const effectiveFilesChanged = filesChanged.length > 0 ? filesChanged : defaultFilesChanged(task);
  const summary = options.summary?.trim() || deriveSummary(body, task.title);
  const deliverables = extractDeliverablePaths(task.contract?.deliverables);
  const tags = toUniqueStrings(task.tags);
  const relatedFiles = toUniquePaths(task.relatedFiles);
  const constraints = toUniqueStrings(task.contract?.constraints);
  const columnHistory = toUniqueStrings(options.columnHistory ?? (task.column ? [task.column] : undefined));
  const contractStatus = normalizeContractStatus(task);
  const validationAttempts = normalizeValidationAttempts(
    options.validationAttempts ?? task.contract?.metrics?.reworkCount,
  );
  const subtaskCounts = countSubtasks(task);

  const record: LedgerRecord = {
    id: task.id,
    type: normalizeLedgerType(task),
    title: task.title,
    filesChanged: effectiveFilesChanged,
    createdAt,
    completedAt,
    cycleTimeHours: computeCycleTimeHours(createdAt, completedAt),
    summary,
  };

  if (columnHistory.length > 0) {
    record.columnHistory = columnHistory;
  }
  if (task.assignee) {
    record.assignee = task.assignee;
  }
  if (task.priority) {
    record.priority = task.priority;
  }
  if (tags.length > 0) {
    record.tags = tags;
  }
  if (task.parentId) {
    record.parentId = task.parentId;
  }
  if (relatedFiles.length > 0) {
    record.relatedFiles = relatedFiles;
  }
  if (deliverables.length > 0) {
    record.deliverables = deliverables;
  }
  if (contractStatus) {
    record.contractStatus = contractStatus;
  }
  if (validationAttempts !== undefined) {
    record.validationAttempts = validationAttempts;
  }
  if (constraints.length > 0) {
    record.constraints = constraints;
  }
  if (subtaskCounts.hasSubtasks) {
    record.subtasksCompleted = subtaskCounts.completed;
    record.subtasksTotal = subtaskCounts.total;
  }

  return record;
}

/**
 * Append a single record to `logs/ledger.jsonl`.
 *
 * @returns Absolute path to the ledger file.
 */
export function appendLedgerRecord(logsDir: string, record: LedgerRecord): string {
  fs.mkdirSync(logsDir, { recursive: true });
  const ledgerPath = getLedgerPath(logsDir);
  fs.appendFileSync(ledgerPath, `${JSON.stringify(record)}\n`, 'utf-8');
  return ledgerPath;
}

/**
 * Read all ledger records.
 *
 * Backward compatibility: if `ledger.jsonl` is missing but legacy markdown logs
 * exist, they are converted on read with a warning.
 */
export function readLedger(logsDir: string): LedgerRecord[] {
  const ledgerPath = getLedgerPath(logsDir);
  if (!fs.existsSync(ledgerPath)) {
    return readLegacyMarkdownLedger(logsDir);
  }

  const content = fs.readFileSync(ledgerPath, 'utf-8');
  const lines = content.split('\n');
  const records: LedgerRecord[] = [];

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim();
    if (!line) {
      continue;
    }

    const parsed = parseLedgerLine(line, index + 1, ledgerPath);
    if (parsed) {
      records.push(parsed);
    }
  }

  return records;
}

/**
 * Query ledger records using simple indexed filters.
 */
export function queryLedger(logsDir: string, filters: LedgerQueryFilters = {}): LedgerRecord[] {
  const all = readLedger(logsDir);

  // Pre-compute filter values once
  const queryTags = filters.tags?.length ? filters.tags.map((t) => t.toLowerCase()) : null;
  const statusSet = filters.contractStatus
    ? new Set(Array.isArray(filters.contractStatus) ? filters.contractStatus : [filters.contractStatus])
    : null;
  const queryFiles = filters.files?.length ? toUniquePaths(filters.files) : null;

  return all.filter((record) => {
    if (filters.assignee && record.assignee !== filters.assignee) return false;

    if (queryTags) {
      const tags = (record.tags || []).map((t) => t.toLowerCase());
      if (!queryTags.some((t) => tags.includes(t))) return false;
    }

    if (filters.dateRange && !matchesDateRange(record.completedAt, filters.dateRange)) return false;

    if (statusSet && (!record.contractStatus || !statusSet.has(record.contractStatus))) return false;

    if (queryFiles) {
      const recordFiles = collectRecordFiles(record);
      if (!queryFiles.some((qf) => recordFiles.some((rf) => pathMatches(rf, qf)))) return false;
    }

    return true;
  });
}

/**
 * Get file history from records whose `filesChanged` include the target path.
 */
export function getFileHistory(
  logsDir: string,
  filePath: string,
  options: FileHistoryOptions = {},
): LedgerRecord[] {
  const normalizedTarget = normalizePathValue(filePath);
  if (!normalizedTarget) {
    return [];
  }

  let records = readLedger(logsDir).filter((record) =>
    (record.filesChanged || []).some((changedFile) => pathMatches(changedFile, normalizedTarget)),
  );

  if (options.dateRange) {
    records = records.filter((record) => matchesDateRange(record.completedAt, options.dateRange));
  }

  records.sort((a, b) => timestampOr(b.completedAt, 0) - timestampOr(a.completedAt, 0));

  if (options.limit !== undefined && options.limit > 0) {
    return records.slice(0, options.limit);
  }

  return records;
}

/**
 * Build recent task context by intersecting task-scoped files with ledger history.
 */
export function getTaskContext(
  logsDir: string,
  relatedFiles: string[],
  deliverables?: TaskContextDeliverable[],
  options: TaskContextOptions = {},
): TaskContextEntry[] {
  const scopeFiles = toUniquePaths([
    ...relatedFiles,
    ...collectDeliverableInputPaths(deliverables),
  ]);

  if (scopeFiles.length === 0) {
    return [];
  }

  let entries = readLedger(logsDir)
    .filter((record) => matchesDateRange(record.completedAt, options.dateRange))
    .map((record) => {
      const matchedFiles = matchedFilesForScope(scopeFiles, collectRecordFiles(record));
      return { record, matchedFiles };
    })
    .filter((entry) => entry.matchedFiles.length > 0);

  entries.sort((a, b) => timestampOr(b.record.completedAt, 0) - timestampOr(a.record.completedAt, 0));

  if (options.limit !== undefined && options.limit > 0) {
    entries = entries.slice(0, options.limit);
  }

  return entries;
}
