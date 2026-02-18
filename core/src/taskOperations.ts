/**
 * File-based task operations for per-task file architecture (v2).
 *
 * These functions operate on individual task files in `.brainfile/tasks/`
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
}

/**
 * Filters for listing tasks
 */
export interface TaskFilters {
  column?: string;
  tag?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  assignee?: string;
}

/**
 * Generate the next task ID by scanning an existing tasks directory.
 *
 * @param tasksDir - Path to the tasks directory
 * @param logsDir - Optional path to the logs directory (also scanned for used IDs)
 * @returns Next available task ID (e.g., `task-42`)
 */
export function generateNextFileTaskId(tasksDir: string, logsDir?: string): string {
  let maxNum = 0;

  const scanDir = (dir: string) => {
    const docs = readTasksDir(dir);
    for (const doc of docs) {
      const match = doc.task.id.match(/task-(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }
  };

  scanDir(tasksDir);
  if (logsDir) {
    scanDir(logsDir);
  }

  return `task-${maxNum + 1}`;
}

/**
 * Add a new task file to the tasks directory.
 *
 * @param tasksDir - Absolute path to `.brainfile/tasks/`
 * @param input - Task creation input
 * @param body - Optional markdown body content
 * @param logsDir - Optional logs directory to scan for used IDs
 * @returns TaskOperationResult with the created task
 */
export function addTaskFile(
  tasksDir: string,
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

  const taskId = input.id || generateNextFileTaskId(tasksDir, logsDir);
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
    column: input.column.trim(),
    ...(input.position !== undefined && { position: input.position }),
    ...(input.description && { description: input.description.trim() }),
    ...(input.priority && { priority: input.priority }),
    ...(input.tags && input.tags.length > 0 && { tags: input.tags }),
    ...(input.assignee && { assignee: input.assignee }),
    ...(input.dueDate && { dueDate: input.dueDate }),
    ...(input.relatedFiles && input.relatedFiles.length > 0 && { relatedFiles: input.relatedFiles }),
    ...(input.template && { template: input.template }),
    ...(subtasks && subtasks.length > 0 && { subtasks }),
    createdAt: now,
  };

  const filePath = path.join(tasksDir, taskFileName(taskId));

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
 * Complete a task by moving its file from tasks/ to logs/ and adding completedAt.
 *
 * @param taskPath - Absolute path to the task file in tasks/
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

  try {
    fs.mkdirSync(logsDir, { recursive: true });
    writeTaskFile(destPath, completedTask, doc.body);
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
 * @param tasksDir - Absolute path to the tasks directory
 * @param filters - Optional filters to apply
 * @returns Array of TaskDocument objects, sorted by column and position
 */
export function listTasks(
  tasksDir: string,
  filters?: TaskFilters,
): TaskDocument[] {
  let docs = readTasksDir(tasksDir);

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
 * @param tasksDir - Absolute path to the tasks directory
 * @param taskId - Task ID to find
 * @returns TaskDocument or null if not found
 */
export function findTask(
  tasksDir: string,
  taskId: string,
): TaskDocument | null {
  // Fast path: try convention-based filename
  const directPath = path.join(tasksDir, taskFileName(taskId));
  const directDoc = readTaskFile(directPath);
  if (directDoc && directDoc.task.id === taskId) {
    return directDoc;
  }

  // Slow path: scan all files
  const docs = readTasksDir(tasksDir);
  return docs.find((d) => d.task.id === taskId) || null;
}

/**
 * Search tasks by query string across title, description, and body.
 *
 * @param tasksDir - Absolute path to the tasks directory
 * @param query - Search query (case-insensitive substring match)
 * @returns Array of matching TaskDocument objects
 */
export function searchTaskFiles(
  tasksDir: string,
  query: string,
): TaskDocument[] {
  const normalizedQuery = query.toLowerCase();
  const docs = readTasksDir(tasksDir);

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
