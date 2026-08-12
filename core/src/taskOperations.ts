/**
 * File-based task operations for per-task file architecture (v2).
 *
 * These functions operate on individual task files in `.brainfile/board/`
 * and `.brainfile/logs/`. Unlike the v1 board operations (operations.ts),
 * these have filesystem side effects (reading/writing/moving files).
 *
 * @packageDocumentation
 */

import * as fs from 'fs';
import * as path from 'path';
import type { BoardConfig, Subtask, Task, TaskDocument } from './types';
import type { Contract, ContractStatus, ContractMetrics } from './types/contract';
import type { V2Dirs } from './workspace';
import { isTypeCompletable, validateColumn } from './boardValidation';
import { buildContract } from './contractSpec';
import { generateNextSubtaskId } from './idGen';
import { readTaskFile, writeTaskFile, readTasksDir, taskFileName, serializeTaskContent } from './taskFile';
import { readLedger } from './ledger';
import { appendLedgerRecord, buildLedgerRecord } from './ledger';

/**
 * Result of a file-based task operation
 */
export interface TaskOperationResult {
  success: boolean;
  task?: Task;
  filePath?: string;
  error?: string;
  /**
   * Populated only when the completed task is type `epic` and has children.
   * Present on both blocked failures and forced-through successes.
   */
  incompleteChildren?: Array<{ id: string; title: string }>;
}

/**
 * Input for creating a new task file
 */
export interface TaskFileInput {
  id?: string;
  title: string;
  column: string;
  position?: number;
  description?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  tags?: string[];
  assignee?: string;
  dueDate?: string;
  relatedFiles?: string[];
  template?: 'bug' | 'feature' | 'refactor';
  subtasks?: string[];
  /** Optional parent task/document ID for first-class parent-child linking. */
  parentId?: string;
  /** Task IDs that must be completed before this task can run. */
  dependsOn?: string[];
  /** Document type (e.g., 'epic', 'adr'). When set, IDs use this as prefix (epic-1, adr-1). */
  type?: string;
  /** Optional contract to attach at creation time (single-write, avoids a second file write). */
  contract?: Contract;
  /**
   * Free-form document status/lifecycle string (e.g. "draft" | "active" | "superseded"
   * for plan documents). Not validated by core — convention lives at the frontend level.
   */
  status?: string;
}

/**
 * Field-level patch for an existing task file.
 *
 * `undefined` leaves the field untouched; `null` deletes it.
 */
export interface TaskFilePatch {
  title?: string;
  description?: string | null;
  priority?: 'low' | 'medium' | 'high' | 'critical' | null;
  tags?: string[] | null;
  assignee?: string | null;
  dueDate?: string | null;
  relatedFiles?: string[] | null;
  parentId?: string | null;
  status?: string | null;
}

/**
 * Filters for listing tasks
 */
export interface TaskFilters {
  column?: string;
  tag?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  assignee?: string;
  parentId?: string;
  /** Document type filter (e.g. 'plan', 'epic'). Untyped tasks match 'task'. */
  type?: string;
}

export interface CompleteTaskFileOptions {
  /** Keep legacy behavior: move completed task markdown file into logs/. */
  legacyMode?: boolean;
  summary?: string;
  filesChanged?: string[];
  columnHistory?: string[];
  validationAttempts?: number;
  /** Complete an epic even if it has incomplete (still-active) child tasks. */
  force?: boolean;
}

type ChildTaskStateStatus = 'active' | 'completed' | 'missing';

interface ChildTaskSummary {
  id: string;
  title: string;
  status: ChildTaskStateStatus;
}

function normalizeTaskDependencyIds(values?: string[]): string[] | undefined {
  if (!Array.isArray(values)) {
    return undefined;
  }

  const deps = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  return deps.length > 0 ? deps : undefined;
}

function appendBodySection(body: string, section: string): string {
  const trimmed = body.trimEnd();
  if (!trimmed) {
    return `${section}\n`;
  }
  return `${trimmed}\n\n${section}\n`;
}

function extractEpicChildTaskIds(task: Task): string[] {
  const rawSubtasks = (task as { subtasks?: unknown }).subtasks;
  if (!Array.isArray(rawSubtasks)) {
    return [];
  }

  const childIds: string[] = [];

  for (const subtask of rawSubtasks) {
    if (typeof subtask === 'string' && subtask.trim() !== '') {
      childIds.push(subtask.trim());
      continue;
    }

    if (subtask && typeof subtask === 'object') {
      const candidateId = (subtask as { id?: unknown }).id;
      if (typeof candidateId === 'string' && candidateId.trim() !== '') {
        childIds.push(candidateId.trim());
      }
    }
  }

  return [...new Set(childIds)];
}

function resolveChildTaskStates(
  childIds: string[],
  boardDir: string,
  logsDir: string,
): ChildTaskSummary[] {
  if (childIds.length === 0) {
    return [];
  }

  const activeById = new Map<string, string>();
  for (const doc of readTasksDir(boardDir)) {
    if (!activeById.has(doc.task.id)) {
      activeById.set(doc.task.id, doc.task.title);
    }
  }

  const completedById = new Map<string, string>();
  for (const doc of readTasksDir(logsDir)) {
    if (!completedById.has(doc.task.id)) {
      completedById.set(doc.task.id, doc.task.title);
    }
  }

  return childIds.map((childId) => {
    const activeTitle = activeById.get(childId);
    if (activeTitle) {
      return { id: childId, title: activeTitle, status: 'active' as const };
    }

    const completedTitle = completedById.get(childId);
    if (completedTitle) {
      return { id: childId, title: completedTitle, status: 'completed' as const };
    }

    return { id: childId, title: 'Unknown task reference', status: 'missing' as const };
  });
}

function resolveParentLinkedChildStates(
  epicId: string,
  boardDir: string,
  logsDir: string,
): ChildTaskSummary[] {
  const activeChildren = readTasksDir(boardDir)
    .filter((doc) => doc.task.parentId === epicId)
    .map((doc) => ({ id: doc.task.id, title: doc.task.title, status: 'active' as const }));

  const completedChildren = readTasksDir(logsDir)
    .filter((doc) => doc.task.parentId === epicId)
    .map((doc) => ({ id: doc.task.id, title: doc.task.title, status: 'completed' as const }));

  return [...activeChildren, ...completedChildren];
}

/**
 * Resolve an epic's child tasks and their completion states.
 *
 * First-class `parentId` links win when any exist; otherwise the epic's
 * legacy `subtasks` ID references are resolved against board/ and logs/.
 */
function resolveEpicChildStates(
  task: Task,
  boardDir: string,
  logsDir: string,
): ChildTaskSummary[] {
  const linkedByParentId = resolveParentLinkedChildStates(task.id, boardDir, logsDir);
  if (linkedByParentId.length > 0) {
    return linkedByParentId;
  }

  return resolveChildTaskStates(extractEpicChildTaskIds(task), boardDir, logsDir);
}

function buildChildTasksSection(childTasks: ChildTaskSummary[]): string {
  if (childTasks.length === 0) {
    return '## Child Tasks\nNo child tasks recorded.';
  }

  const totalChildren = childTasks.length;
  const completedChildren = childTasks.filter((child) => child.status === 'completed').length;

  const lines: string[] = [
    '## Child Tasks',
    `Summary: ${completedChildren}/${totalChildren} children completed.`,
  ];

  for (const child of childTasks) {
    const statusLabel =
      child.status === 'completed'
        ? 'completed'
        : child.status === 'active'
          ? 'incomplete'
          : 'missing';

    lines.push(`- ${child.id}: ${child.title} (${statusLabel})`);
  }

  return lines.join('\n');
}

function writeTaskFileExclusive(filePath: string, task: Task, body: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const content = serializeTaskContent(task, body);
  fs.writeFileSync(filePath, content, { encoding: 'utf-8', flag: 'wx' });
}

function rollbackLedgerAppend(logsDir: string, appendedRecord: ReturnType<typeof buildLedgerRecord>): void {
  const ledgerPath = path.join(logsDir, 'ledger.jsonl');
  const appendedLine = `${JSON.stringify(appendedRecord)}\n`;
  const appendedBytes = Buffer.byteLength(appendedLine, 'utf-8');

  try {
    const stat = fs.statSync(ledgerPath);
    const newSize = stat.size - appendedBytes;
    if (newSize >= 0) {
      fs.truncateSync(ledgerPath, newSize);
    }
  } catch {
    // Best effort rollback only.
  }
}

function completeTaskFileLegacy(
  taskPath: string,
  logsDir: string,
  doc: TaskDocument,
  completedTask: Task,
  childStates?: ChildTaskSummary[],
): TaskOperationResult {
  const baseName = path.basename(taskPath);
  const destPath = path.join(logsDir, baseName);
  let completedBody = doc.body;

  if (doc.task.type === 'epic') {
    const childTasksSection = buildChildTasksSection(childStates ?? []);
    completedBody = appendBodySection(doc.body, childTasksSection);
  }

  if (fs.existsSync(destPath)) {
    return { success: false, error: `Task already exists in logs: ${doc.task.id}` };
  }

  try {
    fs.mkdirSync(logsDir, { recursive: true });
    writeTaskFileExclusive(destPath, completedTask, completedBody);
  } catch (err) {
    return { success: false, error: `Failed to complete task: ${err}` };
  }

  try {
    fs.unlinkSync(taskPath);
    return { success: true, task: completedTask, filePath: destPath };
  } catch (err) {
    // Roll back the new log file to avoid duplicated active/completed copies.
    try {
      fs.unlinkSync(destPath);
    } catch {
      // Best effort rollback.
    }
    return { success: false, error: `Failed to finalize completion: ${err}` };
  }
}

/**
 * Generate the next task ID by scanning an existing tasks directory.
 *
 * When `typePrefix` is provided (e.g., "epic"), generates IDs like `epic-1`
 * and only scans for IDs matching that prefix. Defaults to "task".
 *
 * @param boardDir - Path to the tasks directory
 * @param logsDir - Optional path to the logs directory (also scanned for used IDs)
 * @param typePrefix - Optional ID prefix (default: "task"). E.g., "epic" produces "epic-1".
 * @returns Next available ID (e.g., `task-42` or `epic-1`)
 */
export function generateNextFileTaskId(boardDir: string, logsDir?: string, typePrefix: string = 'task'): string {
  let maxNum = 0;
  const escaped = typePrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escaped}-(\\d+)$`);

  const scanDir = (dir: string) => {
    const docs = readTasksDir(dir);
    for (const doc of docs) {
      const match = doc.task.id.match(pattern);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }
  };

  scanDir(boardDir);
  if (logsDir) {
    scanDir(logsDir);

    // Also scan ledger.jsonl — tasks completed via the non-legacy path
    // only exist there, not as .md files in logs/.
    try {
      for (const record of readLedger(logsDir)) {
        const match = record.id.match(pattern);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      }
    } catch {
      // Ledger may not exist yet
    }
  }

  return `${typePrefix}-${maxNum + 1}`;
}

/**
 * Add a new task file to the tasks directory.
 *
 * @param boardDir - Absolute path to `.brainfile/board/`
 * @param input - Task creation input
 * @param body - Optional markdown body content
 * @param logsDir - Optional logs directory to scan for used IDs
 * @returns TaskOperationResult with the created task
 */
export function addTaskFile(
  boardDir: string,
  input: TaskFileInput,
  body: string = '',
  logsDir?: string,
): TaskOperationResult {
  if (!input.title || input.title.trim() === '') {
    return { success: false, error: 'Task title is required' };
  }

  if (!input.column || input.column.trim() === '') {
    return { success: false, error: 'Task column is required' };
  }

  const typePrefix = input.type || 'task';
  const maxAttempts = input.id ? 1 : 25;

  // Append to the end of the target column when no explicit position is given.
  const resolvedPosition = input.position !== undefined
    ? input.position
    : readTasksDir(boardDir).filter((doc) => doc.task.column === input.column.trim()).length;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const taskId = input.id || generateNextFileTaskId(boardDir, logsDir, typePrefix);
    const now = new Date().toISOString();

    // Build subtasks if provided
    const subtasks = input.subtasks?.map((title, index) => ({
      id: `${taskId}-${index + 1}`,
      title: title.trim(),
      completed: false,
    }));

    const task: Task = {
      id: taskId,
      title: input.title.trim(),
      ...(input.type && { type: input.type }),
      column: input.column.trim(),
      position: resolvedPosition,
      ...(input.description && { description: input.description.trim() }),
      ...(input.status && { status: input.status }),
      ...(input.priority && { priority: input.priority }),
      ...(input.tags && input.tags.length > 0 && { tags: input.tags }),
      ...(input.assignee && { assignee: input.assignee }),
      ...(input.dueDate && { dueDate: input.dueDate }),
      ...(input.relatedFiles && input.relatedFiles.length > 0 && { relatedFiles: input.relatedFiles }),
      ...(input.template && { template: input.template }),
      ...(input.parentId && input.parentId.trim().length > 0 && { parentId: input.parentId.trim() }),
      ...(normalizeTaskDependencyIds(input.dependsOn) && { dependsOn: normalizeTaskDependencyIds(input.dependsOn)! }),
      ...(subtasks && subtasks.length > 0 && { subtasks }),
      ...(input.contract && { contract: input.contract }),
      createdAt: now,
    };

    let filePath: string;
    try {
      filePath = path.join(boardDir, taskFileName(taskId));
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }

    try {
      writeTaskFileExclusive(filePath, task, body);
      return { success: true, task, filePath };
    } catch (err: any) {
      if (err?.code === 'EEXIST' && !input.id) {
        continue; // retry with next generated ID if we raced
      }

      if (err?.code === 'EEXIST') {
        return { success: false, error: `Task already exists: ${taskId}` };
      }

      return { success: false, error: `Failed to write task file: ${err}` };
    }
  }

  return { success: false, error: 'Failed to allocate unique task ID' };
}

/**
 * Move a task to a different column by updating its frontmatter.
 *
 * @param taskPath - Absolute path to the task file
 * @param newColumn - New column ID
 * @param newPosition - Optional new position within the column
 * @returns TaskOperationResult
 */
export function moveTaskFile(
  taskPath: string,
  newColumn: string,
  newPosition?: number,
): TaskOperationResult {
  const doc = readTaskFile(taskPath);
  if (!doc) {
    return { success: false, error: `Failed to read task file: ${taskPath}` };
  }

  const updatedTask: Task = {
    ...doc.task,
    column: newColumn,
    updatedAt: new Date().toISOString(),
  };

  if (newPosition !== undefined) {
    updatedTask.position = newPosition;
  }

  try {
    writeTaskFile(taskPath, updatedTask, doc.body);
    return { success: true, task: updatedTask, filePath: taskPath };
  } catch (err) {
    return { success: false, error: `Failed to write task file: ${err}` };
  }
}

export interface MoveTaskFileOptions {
  /** Explicit position within the target column. Defaults to the current task count in that column (append to end). */
  position?: number;
  /** Skip auto-complete even if the resolved target column has `completionColumn: true`. */
  skipAutoComplete?: boolean;
}

export interface MoveTaskFileResult extends TaskOperationResult {
  /** Resolved target column (id/title/completionColumn), present on success. */
  column?: { id: string; title: string; completionColumn?: boolean };
  /** True when the move was a no-op because the task was already in the target column. No write occurred. */
  noop?: boolean;
  /** True when the move triggered auto-completion (task archived to logs/, no longer at filePath). */
  autoCompleted?: boolean;
}

/**
 * Move a task to a column resolved against board config, auto-completing when
 * the target column is a completion column and the task's type is completable.
 *
 * Column refs resolve by ID first, then case-insensitively by title. Strict
 * boards reject unknown columns; non-strict boards fall back to the raw ref.
 *
 * @param dirs - V2 directory layout for the workspace
 * @param board - Parsed board config (columns, types, strict flag)
 * @param taskId - Task ID to move
 * @param columnRef - Target column ID or title
 * @param options - Position override / auto-complete opt-out
 */
export function moveTaskFileToColumn(
  dirs: V2Dirs,
  board: BoardConfig,
  taskId: string,
  columnRef: string,
  options: MoveTaskFileOptions = {},
): MoveTaskFileResult {
  let resolved = board.columns.find((c) => c.id === columnRef);
  if (!resolved) {
    resolved = board.columns.find((c) => c.title.toLowerCase() === columnRef.toLowerCase());
  }

  const targetColumnId = resolved?.id ?? columnRef;
  const columnValidation = validateColumn(board, targetColumnId);
  if (!columnValidation.valid) {
    return { success: false, error: columnValidation.error || `Invalid column: ${targetColumnId}` };
  }

  const resolvedColumn = resolved ?? { id: columnRef, title: columnRef };

  const doc = findTask(dirs.boardDir, taskId);
  if (!doc) {
    return { success: false, error: `Task not found: ${taskId}` };
  }

  let filePath = doc.filePath ?? path.join(dirs.boardDir, taskFileName(taskId));

  if (doc.task.column === resolvedColumn.id) {
    return { success: true, task: doc.task, filePath, column: resolvedColumn, noop: true };
  }

  const newPosition = options.position !== undefined
    ? options.position
    : readTasksDir(dirs.boardDir).filter((d) => d.task.column === resolvedColumn.id).length;

  let task: Task = {
    ...doc.task,
    column: resolvedColumn.id,
    position: newPosition,
    updatedAt: new Date().toISOString(),
  };

  try {
    writeTaskFile(filePath, task, doc.body);
  } catch (err) {
    return { success: false, error: `Failed to write task file: ${err}` };
  }

  const shouldAutoComplete =
    !options.skipAutoComplete &&
    resolvedColumn.completionColumn === true &&
    isTypeCompletable(task.type, board.types);

  if (!shouldAutoComplete) {
    return { success: true, task, filePath, column: resolvedColumn };
  }

  const completeResult = completeTaskFile(filePath, dirs.logsDir, { legacyMode: true });
  if (!completeResult.success || !completeResult.task) {
    return {
      success: false,
      error: completeResult.error || `Failed to complete task: ${taskId}`,
      column: resolvedColumn,
      ...(completeResult.incompleteChildren && { incompleteChildren: completeResult.incompleteChildren }),
    };
  }

  task = completeResult.task;
  filePath = completeResult.filePath ?? filePath;

  return { success: true, task, filePath, column: resolvedColumn, autoCompleted: true };
}

/**
 * Apply a field-level patch to an existing task file.
 *
 * Fields absent from `patch` (or set to `undefined`) are left untouched.
 * Fields set to `null` are deleted. `title` is only assigned when truthy —
 * it has no delete semantics.
 *
 * @param taskPath - Absolute path to the task file
 * @param patch - Fields to set or clear
 */
export function patchTaskFile(taskPath: string, patch: TaskFilePatch): TaskOperationResult {
  const doc = readTaskFile(taskPath);
  if (!doc) {
    return { success: false, error: `Failed to read task file: ${taskPath}` };
  }

  const task: Task = { ...doc.task };

  if (patch.title) task.title = patch.title;

  const applyField = <K extends keyof Task>(key: K, value: Task[K] | null | undefined): void => {
    if (value === undefined) return;
    if (value === null) {
      delete task[key];
    } else {
      task[key] = value;
    }
  };

  applyField('description', patch.description);
  applyField('priority', patch.priority);
  applyField('tags', patch.tags);
  applyField('assignee', patch.assignee);
  applyField('dueDate', patch.dueDate);
  applyField('relatedFiles', patch.relatedFiles);
  applyField('parentId', patch.parentId);
  applyField('status', patch.status);

  task.updatedAt = new Date().toISOString();

  try {
    writeTaskFile(taskPath, task, doc.body);
    return { success: true, task, filePath: taskPath };
  } catch (err) {
    return { success: false, error: `Failed to write task file: ${err}` };
  }
}

// ============================================================================
// Subtask file mutators
// ============================================================================

export interface SubtaskMutationResult extends TaskOperationResult {
  /** Full updated subtask array on success. */
  subtasks?: Subtask[];
  /** The subtask(s) actually created/updated/toggled/deleted by this call. */
  affected?: Subtask[];
  /** Requested subtask IDs that did not exist on the task (delete/toggle/update). */
  missing?: string[];
}

function readTaskForSubtaskMutation(
  taskPath: string,
): { doc: TaskDocument; task: Task } | { error: string } {
  const doc = readTaskFile(taskPath);
  if (!doc) {
    return { error: `Failed to read task file: ${taskPath}` };
  }
  return { doc, task: { ...doc.task } };
}

function writeSubtaskMutation(
  taskPath: string,
  doc: TaskDocument,
  task: Task,
): TaskOperationResult {
  task.updatedAt = new Date().toISOString();
  try {
    writeTaskFile(taskPath, task, doc.body);
    return { success: true, task, filePath: taskPath };
  } catch (err) {
    return { success: false, error: `Failed to write task file: ${err}` };
  }
}

/**
 * Append one or more subtasks to a task file.
 *
 * IDs are allocated sequentially through the canonical `generateNextSubtaskId`,
 * feeding each freshly generated ID back into the pool before generating the next.
 */
export function addSubtasksToFile(taskPath: string, titles: string[]): SubtaskMutationResult {
  const read = readTaskForSubtaskMutation(taskPath);
  if ('error' in read) return { success: false, error: read.error };
  const { doc, task } = read;

  const cleanTitles = titles.map((t) => t.trim()).filter(Boolean);
  if (cleanTitles.length === 0) {
    return { success: false, error: 'No subtask titles provided' };
  }

  const subtasks: Subtask[] = [...(task.subtasks ?? [])];
  const existingIds = subtasks.map((st) => st.id);
  const affected: Subtask[] = [];

  for (const title of cleanTitles) {
    const id = generateNextSubtaskId(task.id, existingIds);
    existingIds.push(id);
    const created: Subtask = { id, title, completed: false };
    subtasks.push(created);
    affected.push(created);
  }

  task.subtasks = subtasks;
  const written = writeSubtaskMutation(taskPath, doc, task);
  if (!written.success) return written;

  return { ...written, subtasks, affected };
}

function resolveSubtaskTargets(
  subtasks: Subtask[],
  subtaskIds: string[] | 'all',
): { targetIds: string[]; missing: string[] } {
  if (subtaskIds === 'all') {
    return { targetIds: subtasks.map((st) => st.id), missing: [] };
  }

  const existing = new Set(subtasks.map((st) => st.id));
  return {
    targetIds: subtaskIds.filter((id) => existing.has(id)),
    missing: subtaskIds.filter((id) => !existing.has(id)),
  };
}

/**
 * Delete subtasks from a task file. Pass `'all'` to clear every subtask.
 *
 * Fails only when no requested subtask existed; partial batches succeed and
 * report the unmatched IDs via `missing`.
 */
export function deleteSubtasksFromFile(
  taskPath: string,
  subtaskIds: string[] | 'all',
): SubtaskMutationResult {
  const read = readTaskForSubtaskMutation(taskPath);
  if ('error' in read) return { success: false, error: read.error };
  const { doc, task } = read;

  const current = task.subtasks ?? [];
  if (current.length === 0) {
    return { success: false, error: `Task ${task.id} has no subtasks` };
  }

  const { targetIds, missing } = resolveSubtaskTargets(current, subtaskIds);
  if (targetIds.length === 0) {
    return {
      success: false,
      error: `Subtask not found: ${missing.join(', ')}`,
      missing,
    };
  }

  const deleteSet = new Set(targetIds);
  const affected = current.filter((st) => deleteSet.has(st.id));
  const subtasks = current.filter((st) => !deleteSet.has(st.id));

  task.subtasks = subtasks;
  const written = writeSubtaskMutation(taskPath, doc, task);
  if (!written.success) return written;

  return { ...written, subtasks, affected, missing };
}

/**
 * Toggle subtask completion. Pass `'all'` to target every subtask.
 *
 * When `completed` is provided every target is forced to that value; otherwise
 * each target's own current value is flipped independently.
 */
export function toggleSubtasksInFile(
  taskPath: string,
  subtaskIds: string[] | 'all',
  completed?: boolean,
): SubtaskMutationResult {
  const read = readTaskForSubtaskMutation(taskPath);
  if ('error' in read) return { success: false, error: read.error };
  const { doc, task } = read;

  const current = task.subtasks ?? [];
  if (current.length === 0) {
    return { success: false, error: `Task ${task.id} has no subtasks` };
  }

  const { targetIds, missing } = resolveSubtaskTargets(current, subtaskIds);
  if (targetIds.length === 0) {
    return {
      success: false,
      error: `Subtask not found: ${missing.join(', ')}`,
      missing,
    };
  }

  const targetSet = new Set(targetIds);
  const affected: Subtask[] = [];
  const subtasks = current.map((st) => {
    if (!targetSet.has(st.id)) return st;
    const next: Subtask = { ...st, completed: completed !== undefined ? completed : !st.completed };
    affected.push(next);
    return next;
  });

  task.subtasks = subtasks;
  const written = writeSubtaskMutation(taskPath, doc, task);
  if (!written.success) return written;

  return { ...written, subtasks, affected, missing };
}

/**
 * Rename subtasks by ID. Unmatched IDs are reported via `missing`;
 * the call fails only when no update applied.
 */
export function updateSubtasksInFile(
  taskPath: string,
  updates: Array<{ id: string; title: string }>,
): SubtaskMutationResult {
  const read = readTaskForSubtaskMutation(taskPath);
  if ('error' in read) return { success: false, error: read.error };
  const { doc, task } = read;

  const current = task.subtasks ?? [];
  if (current.length === 0) {
    return { success: false, error: `Task ${task.id} has no subtasks` };
  }

  const titleById = new Map(updates.map((u) => [u.id, u.title]));
  const { targetIds, missing } = resolveSubtaskTargets(current, updates.map((u) => u.id));
  if (targetIds.length === 0) {
    return {
      success: false,
      error: `Subtask not found: ${missing.join(', ')}`,
      missing,
    };
  }

  const affected: Subtask[] = [];
  const subtasks = current.map((st) => {
    const nextTitle = titleById.get(st.id);
    if (nextTitle === undefined) return st;
    const next: Subtask = { ...st, title: nextTitle };
    affected.push(next);
    return next;
  });

  task.subtasks = subtasks;
  const written = writeSubtaskMutation(taskPath, doc, task);
  if (!written.success) return written;

  return { ...written, subtasks, affected, missing };
}

/**
 * Complete a task by appending to `logs/ledger.jsonl` and removing board file.
 * Legacy mode can still move markdown files into logs/.
 *
 * @param taskPath - Absolute path to the task file in board/
 * @param logsDir - Absolute path to the logs directory
 * @param options - Optional completion behavior and ledger details
 * @returns TaskOperationResult with the completed task
 */
export function completeTaskFile(
  taskPath: string,
  logsDir: string,
  options: CompleteTaskFileOptions = {},
): TaskOperationResult {
  const doc = readTaskFile(taskPath);
  if (!doc) {
    return { success: false, error: `Failed to read task file: ${taskPath}` };
  }

  // Epic safety gate: refuse to complete an epic that still has active children,
  // unless the caller explicitly forces it. Non-epic types skip this entirely.
  let childStates: ChildTaskSummary[] | undefined;
  let incompleteChildren: Array<{ id: string; title: string }> | undefined;
  if (doc.task.type === 'epic') {
    const boardDir = path.dirname(taskPath);
    childStates = resolveEpicChildStates(doc.task, boardDir, logsDir);
    const incomplete = childStates
      .filter((child) => child.status === 'active')
      .map((child) => ({ id: child.id, title: child.title }));

    if (incomplete.length > 0) {
      if (!options.force) {
        return {
          success: false,
          error: `Epic ${doc.task.id} has ${incomplete.length} incomplete child task(s). Use force:true to override.`,
          incompleteChildren: incomplete,
        };
      }
      incompleteChildren = incomplete;
    }
  }

  const now = new Date().toISOString();

  // Remove column and position, add completedAt
  const { column: _column, position: _position, ...rest } = doc.task;
  const completedTask: Task = {
    ...rest,
    completedAt: now,
    updatedAt: now,
  };

  if (options.legacyMode) {
    const legacyResult = completeTaskFileLegacy(taskPath, logsDir, doc, completedTask, childStates);
    return incompleteChildren && legacyResult.success
      ? { ...legacyResult, incompleteChildren }
      : legacyResult;
  }

  const record = buildLedgerRecord(completedTask, doc.body, {
    summary: options.summary,
    filesChanged: options.filesChanged,
    completedAt: now,
    columnHistory: options.columnHistory,
    validationAttempts: options.validationAttempts,
  });

  let ledgerPath: string;
  try {
    ledgerPath = appendLedgerRecord(logsDir, record);
  } catch (err) {
    return { success: false, error: `Failed to append ledger record: ${err}` };
  }

  try {
    fs.unlinkSync(taskPath);
    return {
      success: true,
      task: completedTask,
      filePath: ledgerPath,
      ...(incompleteChildren && { incompleteChildren }),
    };
  } catch (err) {
    rollbackLedgerAppend(logsDir, record);
    return { success: false, error: `Failed to finalize completion: ${err}` };
  }
}

/**
 * Delete a task file from disk.
 *
 * @param taskPath - Absolute path to the task file
 * @returns TaskOperationResult
 */
export function deleteTaskFile(taskPath: string): TaskOperationResult {
  const doc = readTaskFile(taskPath);
  if (!doc) {
    return { success: false, error: `Failed to read task file: ${taskPath}` };
  }

  try {
    fs.unlinkSync(taskPath);
    return { success: true, task: doc.task };
  } catch (err) {
    return { success: false, error: `Failed to delete task file: ${err}` };
  }
}

/**
 * Append a timestamped log entry to a task file's ## Log section.
 *
 * If the `## Log` section does not exist, it is created at the end of the body.
 *
 * @param taskPath - Absolute path to the task file
 * @param entry - Log entry text
 * @param agent - Optional agent attribution
 * @returns TaskOperationResult
 */
export function appendLog(
  taskPath: string,
  entry: string,
  agent?: string,
): TaskOperationResult {
  const doc = readTaskFile(taskPath);
  if (!doc) {
    return { success: false, error: `Failed to read task file: ${taskPath}` };
  }

  const now = new Date().toISOString();
  const attribution = agent ? ` [${agent}]` : '';
  const logLine = `- ${now}${attribution}: ${entry}`;

  let body = doc.body;

  // Find the ## Log section
  const logSectionRegex = /^## Log\s*$/m;
  const match = logSectionRegex.exec(body);

  if (match) {
    // Insert the log entry after the ## Log header
    const insertPos = match.index + match[0].length;
    body = body.slice(0, insertPos) + '\n' + logLine + body.slice(insertPos);
  } else {
    // Create the section at the end
    if (body.length > 0 && !body.endsWith('\n')) {
      body += '\n';
    }
    if (body.length > 0) {
      body += '\n';
    }
    body += '## Log\n' + logLine + '\n';
  }

  const updatedTask: Task = {
    ...doc.task,
    updatedAt: now,
  };

  try {
    writeTaskFile(taskPath, updatedTask, body);
    return { success: true, task: updatedTask, filePath: taskPath };
  } catch (err) {
    return { success: false, error: `Failed to append log: ${err}` };
  }
}

/**
 * List tasks from a directory, with optional filters.
 * Results are grouped by column and sorted by position.
 *
 * @param boardDir - Absolute path to the tasks directory
 * @param filters - Optional filters to apply
 * @returns Array of TaskDocument objects, sorted by column and position
 */
export function listTasks(
  boardDir: string,
  filters?: TaskFilters,
): TaskDocument[] {
  let docs = readTasksDir(boardDir);

  if (filters) {
    if (filters.column) {
      docs = docs.filter((d) => d.task.column === filters.column);
    }
    if (filters.tag) {
      docs = docs.filter((d) => d.task.tags?.includes(filters.tag!));
    }
    if (filters.priority) {
      docs = docs.filter((d) => d.task.priority === filters.priority);
    }
    if (filters.assignee) {
      docs = docs.filter((d) => d.task.assignee === filters.assignee);
    }
    if (filters.parentId) {
      docs = docs.filter((d) => d.task.parentId === filters.parentId);
    }
    if (filters.type) {
      docs = docs.filter((d) => (d.task.type || 'task') === filters.type);
    }
  }

  // Sort: by column alphabetically, then by position within column
  docs.sort((a, b) => {
    const colA = a.task.column || '';
    const colB = b.task.column || '';
    if (colA !== colB) return colA.localeCompare(colB);

    const posA = a.task.position ?? Number.MAX_SAFE_INTEGER;
    const posB = b.task.position ?? Number.MAX_SAFE_INTEGER;
    return posA - posB;
  });

  return docs;
}

/**
 * Find a task by ID in a directory.
 *
 * First attempts direct file lookup by convention (`{taskId}.md`),
 * then falls back to scanning all files.
 *
 * @param boardDir - Absolute path to the tasks directory
 * @param taskId - Task ID to find
 * @returns TaskDocument or null if not found
 */
export function findTask(
  boardDir: string,
  taskId: string,
): TaskDocument | null {
  // Fast path: try convention-based filename
  try {
    const directPath = path.join(boardDir, taskFileName(taskId));
    const directDoc = readTaskFile(directPath);
    if (directDoc && directDoc.task.id === taskId) {
      return directDoc;
    }
  } catch {
    // Fall through to full scan for malformed IDs.
  }

  // Slow path: scan all files
  const docs = readTasksDir(boardDir);
  return docs.find((d) => d.task.id === taskId) || null;
}

/**
 * Search tasks by query string across title, description, and body.
 *
 * @param boardDir - Absolute path to the tasks directory
 * @param query - Search query (case-insensitive substring match)
 * @returns Array of matching TaskDocument objects
 */
export function searchTaskFiles(
  boardDir: string,
  query: string,
): TaskDocument[] {
  const normalizedQuery = query.toLowerCase();
  const docs = readTasksDir(boardDir);

  return docs.filter((doc) => {
    const titleMatch = doc.task.title.toLowerCase().includes(normalizedQuery);
    const descMatch = doc.task.description?.toLowerCase().includes(normalizedQuery);
    const bodyMatch = doc.body.toLowerCase().includes(normalizedQuery);
    const tagMatch = doc.task.tags?.some((t) => t.toLowerCase().includes(normalizedQuery));
    return titleMatch || descMatch || bodyMatch || tagMatch;
  });
}

/**
 * Search completed task logs by query string.
 *
 * @param logsDir - Absolute path to the logs directory
 * @param query - Search query (case-insensitive substring match)
 * @returns Array of matching TaskDocument objects
 */
export function searchLogs(
  logsDir: string,
  query: string,
): TaskDocument[] {
  return searchTaskFiles(logsDir, query);
}

// ============================================================================
// Compound contract + column operations
// ============================================================================

/**
 * Default mapping from contract status to column ID.
 * Pass `column` option to override per-call, or `false` to skip column sync.
 */
export const DEFAULT_CONTRACT_COLUMN_MAP: Readonly<Record<string, string>> = {
  in_progress: 'in-progress',
  delivered: 'review',
  blocked: 'blocked',
};

export interface ContractTransitionOptions {
  /** Override target column ID, or `false` to skip column sync entirely. */
  column?: string | false;
}

export interface ContractTransitionWithFeedbackOptions extends ContractTransitionOptions {
  feedback?: string;
}

export interface CompleteContractOptions extends CompleteTaskFileOptions {
  /** Override target column, or `false` to skip column sync (task is archived regardless). */
  column?: string | false;
}

function resolveColumn(
  contractStatus: string,
  options?: ContractTransitionOptions,
): string | undefined {
  if (options?.column === false) return undefined;
  if (typeof options?.column === 'string') return options.column;
  return DEFAULT_CONTRACT_COLUMN_MAP[contractStatus];
}

function applyPickupMetrics(contract: Contract, now: string): void {
  const metrics: ContractMetrics = { ...(contract.metrics ?? {}) };
  metrics.pickedUpAt = now;
  if (typeof metrics.reworkCount === 'number' && Number.isFinite(metrics.reworkCount)) {
    metrics.reworkCount = Math.max(0, Math.round(metrics.reworkCount)) + 1;
  } else {
    metrics.reworkCount = 0;
  }
  contract.metrics = metrics;
}

function applyDeliverMetrics(contract: Contract, now: string): void {
  const metrics: ContractMetrics = { ...(contract.metrics ?? {}) };
  metrics.deliveredAt = now;
  if (typeof metrics.pickedUpAt === 'string') {
    const pickedUpMs = Date.parse(metrics.pickedUpAt);
    const deliveredMs = Date.parse(now);
    if (Number.isFinite(pickedUpMs) && Number.isFinite(deliveredMs)) {
      metrics.duration = Math.max(0, Math.round((deliveredMs - pickedUpMs) / 1000));
    }
  }
  contract.metrics = metrics;
}

/**
 * Pickup a contract: set status to `in_progress`, apply pickup metrics,
 * and move the task column to `in-progress` (default) or a custom column.
 *
 * @param taskPath - Absolute path to the task file
 * @param options - Optional column override or `false` to skip column sync
 */
export function pickupTaskContract(
  taskPath: string,
  options?: ContractTransitionOptions,
): TaskOperationResult {
  const doc = readTaskFile(taskPath);
  if (!doc) {
    return { success: false, error: `Failed to read task file: ${taskPath}` };
  }

  if (!doc.task.contract) {
    return { success: false, error: `Task ${doc.task.id} has no contract` };
  }

  const now = new Date().toISOString();
  const contract: Contract = { ...doc.task.contract, status: 'in_progress' as ContractStatus };
  applyPickupMetrics(contract, now);

  const targetColumn = resolveColumn('in_progress', options);
  const updatedTask: Task = {
    ...doc.task,
    contract,
    ...(targetColumn !== undefined && { column: targetColumn }),
    updatedAt: now,
  };

  try {
    writeTaskFile(taskPath, updatedTask, doc.body);
    return { success: true, task: updatedTask, filePath: taskPath };
  } catch (err) {
    return { success: false, error: `Failed to write task file: ${err}` };
  }
}

/**
 * Deliver a contract: set status to `delivered`, apply deliver metrics,
 * and move the task column to `review` (default) or a custom column.
 *
 * @param taskPath - Absolute path to the task file
 * @param options - Optional column override or `false` to skip column sync
 */
export function deliverTaskContract(
  taskPath: string,
  options?: ContractTransitionOptions,
): TaskOperationResult {
  const doc = readTaskFile(taskPath);
  if (!doc) {
    return { success: false, error: `Failed to read task file: ${taskPath}` };
  }

  if (!doc.task.contract) {
    return { success: false, error: `Task ${doc.task.id} has no contract` };
  }

  const now = new Date().toISOString();
  const contract: Contract = { ...doc.task.contract, status: 'delivered' as ContractStatus };
  applyDeliverMetrics(contract, now);

  const targetColumn = resolveColumn('delivered', options);
  const updatedTask: Task = {
    ...doc.task,
    contract,
    ...(targetColumn !== undefined && { column: targetColumn }),
    updatedAt: now,
  };

  try {
    writeTaskFile(taskPath, updatedTask, doc.body);
    return { success: true, task: updatedTask, filePath: taskPath };
  } catch (err) {
    return { success: false, error: `Failed to write task file: ${err}` };
  }
}

/**
 * Complete a contract: set status to `done`, then archive the task to logs via
 * `completeTaskFile()`. The task is removed from `board/` and recorded in the ledger.
 *
 * @param taskPath - Absolute path to the task file in board/
 * @param logsDir - Absolute path to the logs directory
 * @param options - Optional completion behavior and ledger details
 */
export function completeTaskContract(
  taskPath: string,
  logsDir: string,
  options: CompleteContractOptions = {},
): TaskOperationResult {
  const doc = readTaskFile(taskPath);
  if (!doc) {
    return { success: false, error: `Failed to read task file: ${taskPath}` };
  }

  if (!doc.task.contract) {
    return { success: false, error: `Task ${doc.task.id} has no contract` };
  }

  const now = new Date().toISOString();
  const metrics: ContractMetrics = { ...(doc.task.contract.metrics ?? {}) };
  if (!metrics.deliveredAt) {
    metrics.deliveredAt = now;
  }
  if (typeof metrics.pickedUpAt === 'string') {
    const pickedUpMs = Date.parse(metrics.pickedUpAt);
    const deliveredMs = Date.parse(metrics.deliveredAt);
    if (Number.isFinite(pickedUpMs) && Number.isFinite(deliveredMs)) {
      metrics.duration = Math.max(0, Math.round((deliveredMs - pickedUpMs) / 1000));
    }
  }

  // Write contract.status = 'done' + metrics before completing,
  // so the archived record captures the final contract state.
  const updatedTask: Task = {
    ...doc.task,
    contract: { ...doc.task.contract, status: 'done' as ContractStatus, metrics },
    updatedAt: now,
  };

  try {
    writeTaskFile(taskPath, updatedTask, doc.body);
  } catch (err) {
    return { success: false, error: `Failed to update contract status: ${err}` };
  }

  // Now archive via the standard completion flow (ledger + unlink)
  const { column: _col, ...completeOpts } = options;
  return completeTaskFile(taskPath, logsDir, completeOpts);
}

/**
 * Fail a contract: set status to `failed`, add feedback,
 * and optionally move column to `blocked` or a custom column.
 *
 * @param taskPath - Absolute path to the task file
 * @param feedback - Failure reason / feedback for the agent
 * @param options - Optional column override or `false` to skip column sync
 */
export function failTaskContract(
  taskPath: string,
  feedback: string,
  options?: ContractTransitionOptions,
): TaskOperationResult {
  const doc = readTaskFile(taskPath);
  if (!doc) {
    return { success: false, error: `Failed to read task file: ${taskPath}` };
  }

  if (!doc.task.contract) {
    return { success: false, error: `Task ${doc.task.id} has no contract` };
  }

  const now = new Date().toISOString();
  const contract: Contract = {
    ...doc.task.contract,
    status: 'failed' as ContractStatus,
    feedback: feedback.trim() || undefined,
  };

  const targetColumn = resolveColumn('failed', options);
  const updatedTask: Task = {
    ...doc.task,
    contract,
    ...(targetColumn !== undefined && { column: targetColumn }),
    updatedAt: now,
  };

  try {
    writeTaskFile(taskPath, updatedTask, doc.body);
    return { success: true, task: updatedTask, filePath: taskPath };
  } catch (err) {
    return { success: false, error: `Failed to write task file: ${err}` };
  }
}

export interface AttachContractOptions {
  deliverableSpecs?: string | string[];
  validationCommands?: string | string[];
  constraints?: string | string[];
  /** Build the contract with status=ready instead of the default draft. */
  ready?: boolean;
}

/**
 * Build and attach a contract to an existing task file.
 *
 * Throws (does not return a failure result) when a deliverable spec string is
 * malformed — callers already catch and rewrap that into their own error types.
 *
 * @param taskPath - Absolute path to the task file
 * @param options - Deliverable/validation/constraint specs and ready flag
 */
export function attachTaskContract(
  taskPath: string,
  options: AttachContractOptions,
): TaskOperationResult {
  const doc = readTaskFile(taskPath);
  if (!doc) {
    return { success: false, error: `Failed to read task file: ${taskPath}` };
  }

  const contract = buildContract({
    deliverableSpecs: options.deliverableSpecs,
    validationCommands: options.validationCommands,
    constraints: options.constraints,
    status: options.ready ? 'ready' : 'draft',
  });

  const task: Task = {
    ...doc.task,
    contract,
    updatedAt: new Date().toISOString(),
  };

  try {
    writeTaskFile(taskPath, task, doc.body);
    return { success: true, task, filePath: taskPath };
  } catch (err) {
    return { success: false, error: `Failed to write task file: ${err}` };
  }
}

function applyContractActivation(task: Task, readyAt: string): Task {
  return {
    ...task,
    contract: {
      ...task.contract!,
      status: 'ready' as ContractStatus,
      metrics: { ...(task.contract!.metrics ?? {}), readyAt },
    },
    updatedAt: readyAt,
  };
}

/**
 * Activate a draft contract (draft → ready), stamping `metrics.readyAt`.
 *
 * @param taskPath - Absolute path to the task file
 */
export function activateTaskContract(taskPath: string): TaskOperationResult {
  const doc = readTaskFile(taskPath);
  if (!doc) {
    return { success: false, error: `Failed to read task file: ${taskPath}` };
  }

  if (!doc.task.contract) {
    return { success: false, error: `Task ${doc.task.id} has no contract` };
  }

  if (doc.task.contract.status !== 'draft') {
    return {
      success: false,
      error: `Contract is not in draft status (current: ${doc.task.contract.status})`,
    };
  }

  const task = applyContractActivation(doc.task, new Date().toISOString());

  try {
    writeTaskFile(taskPath, task, doc.body);
    return { success: true, task, filePath: taskPath };
  } catch (err) {
    return { success: false, error: `Failed to write task file: ${err}` };
  }
}

export interface ActivateByParentResult {
  activated: string[];
}

/**
 * Activate every draft contract whose task has the given `parentId`.
 *
 * Zero matches is a valid empty result, not an error.
 *
 * @param boardDir - Absolute path to `.brainfile/board/`
 * @param parentId - Parent task/document ID to match
 */
export function activateTaskContractsByParent(
  boardDir: string,
  parentId: string,
): ActivateByParentResult {
  const activated: string[] = [];

  for (const doc of readTasksDir(boardDir)) {
    if (doc.task.parentId !== parentId) continue;
    if (doc.task.contract?.status !== 'draft') continue;

    const task = applyContractActivation(doc.task, new Date().toISOString());
    const taskPath = doc.filePath ?? path.join(boardDir, taskFileName(task.id));
    writeTaskFile(taskPath, task, doc.body);
    activated.push(task.id);
  }

  return { activated };
}

/**
 * Returns the most relevant user-facing state for a task.
 * When a contract exists, its status takes priority over the column.
 */
export function getEffectiveState(task: Task): string {
  if (task.contract) return task.contract.status;
  if (task.completedAt) return 'completed';
  return task.column ?? 'unknown';
}
