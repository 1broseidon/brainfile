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
import type { Task, TaskDocument } from './types';
import { readTaskFile, writeTaskFile, readTasksDir, taskFileName, parseTaskContent, serializeTaskContent } from './taskFile';

/**
 * Result of a file-based task operation
 */
export interface TaskOperationResult {
  success: boolean;
  task?: Task;
  filePath?: string;
  error?: string;
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
  /** Document type (e.g., 'epic', 'adr'). When set, IDs use this as prefix (epic-1, adr-1). */
  type?: string;
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
}

interface ChildTaskSummary {
  id: string;
  title: string;
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

function resolveChildTasks(
  epicId: string,
  childIds: string[],
  boardDir: string,
  logsDir: string,
): ChildTaskSummary[] {
  const docs = [...readTasksDir(boardDir), ...readTasksDir(logsDir)];

  // Prefer first-class parentId links when present.
  const linked = docs.filter((doc) => doc.task.parentId === epicId);
  if (linked.length > 0) {
    return linked.map((doc) => ({ id: doc.task.id, title: doc.task.title }));
  }

  if (childIds.length === 0) {
    return [];
  }

  const titleById = new Map<string, string>();
  for (const doc of docs) {
    if (!titleById.has(doc.task.id)) {
      titleById.set(doc.task.id, doc.task.title);
    }
  }

  const childTasks: ChildTaskSummary[] = [];
  for (const childId of childIds) {
    const title = titleById.get(childId);
    if (title) {
      childTasks.push({ id: childId, title });
    }
  }

  return childTasks;
}

function buildChildTasksSection(childTasks: ChildTaskSummary[]): string {
  if (childTasks.length === 0) {
    return '## Child Tasks\nNo child tasks recorded.';
  }

  const lines = childTasks.map((child) => `- ${child.id}: ${child.title}`);
  return `## Child Tasks\n${lines.join('\n')}`;
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

  // Determine ID prefix from type (e.g., type="epic" -> prefix "epic" -> "epic-1")
  const typePrefix = input.type || 'task';
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
    ...(input.position !== undefined && { position: input.position }),
    ...(input.description && { description: input.description.trim() }),
    ...(input.priority && { priority: input.priority }),
    ...(input.tags && input.tags.length > 0 && { tags: input.tags }),
    ...(input.assignee && { assignee: input.assignee }),
    ...(input.dueDate && { dueDate: input.dueDate }),
    ...(input.relatedFiles && input.relatedFiles.length > 0 && { relatedFiles: input.relatedFiles }),
    ...(input.template && { template: input.template }),
    ...(input.parentId && input.parentId.trim().length > 0 && { parentId: input.parentId.trim() }),
    ...(subtasks && subtasks.length > 0 && { subtasks }),
    createdAt: now,
  };

  const filePath = path.join(boardDir, taskFileName(taskId));

  try {
    writeTaskFile(filePath, task, body);
    return { success: true, task, filePath };
  } catch (err) {
    return { success: false, error: `Failed to write task file: ${err}` };
  }
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

/**
 * Complete a task by moving its file from board/ to logs/ and adding completedAt.
 *
 * @param taskPath - Absolute path to the task file in board/
 * @param logsDir - Absolute path to the logs directory
 * @returns TaskOperationResult with the completed task
 */
export function completeTaskFile(
  taskPath: string,
  logsDir: string,
): TaskOperationResult {
  const doc = readTaskFile(taskPath);
  if (!doc) {
    return { success: false, error: `Failed to read task file: ${taskPath}` };
  }

  const now = new Date().toISOString();

  // Remove column and position, add completedAt
  const { column: _column, position: _position, ...rest } = doc.task;
  const completedTask: Task = {
    ...rest,
    completedAt: now,
    updatedAt: now,
  };

  const destPath = path.join(logsDir, path.basename(taskPath));
  let completedBody = doc.body;

  if (doc.task.type === 'epic') {
    const boardDir = path.dirname(taskPath);
    const childIds = extractEpicChildTaskIds(doc.task);
    const childTasks = resolveChildTasks(doc.task.id, childIds, boardDir, logsDir);
    const childTasksSection = buildChildTasksSection(childTasks);
    completedBody = appendBodySection(doc.body, childTasksSection);
  }

  try {
    fs.mkdirSync(logsDir, { recursive: true });
    writeTaskFile(destPath, completedTask, completedBody);
    fs.unlinkSync(taskPath);
    return { success: true, task: completedTask, filePath: destPath };
  } catch (err) {
    return { success: false, error: `Failed to complete task: ${err}` };
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
  const directPath = path.join(boardDir, taskFileName(taskId));
  const directDoc = readTaskFile(directPath);
  if (directDoc && directDoc.task.id === taskId) {
    return directDoc;
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
