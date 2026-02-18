/**
 * V2 per-task file architecture detection, path resolution, and body helpers.
 *
 * This is CLI-specific logic for detecting whether a brainfile uses v2
 * and resolving the directory paths. All actual task I/O and parsing
 * is handled by @brainfile/core.
 *
 * @packageDocumentation
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  readTaskFile,
  readTasksDir,
  taskFileName,
  type Task,
  type TaskDocument,
  type Board,
  Brainfile,
} from '@brainfile/core';

export interface V2Dirs {
  dotDir: string;
  tasksDir: string;
  logsDir: string;
  brainfilePath: string;
}

/**
 * Get the v2 directory structure paths from a brainfile path.
 */
export function getV2Dirs(brainfilePath: string): V2Dirs {
  const dotDir = path.dirname(path.resolve(brainfilePath));
  return {
    dotDir,
    tasksDir: path.join(dotDir, 'tasks'),
    logsDir: path.join(dotDir, 'logs'),
    brainfilePath: path.resolve(brainfilePath),
  };
}

/**
 * Check if a brainfile is using v2 per-task file architecture.
 * V2 is detected by the presence of a tasks/ directory in .brainfile/.
 */
export function isV2(brainfilePath: string): boolean {
  const { tasksDir } = getV2Dirs(brainfilePath);
  return fs.existsSync(tasksDir);
}

/**
 * Ensure the v2 directory structure exists.
 */
export function ensureV2Dirs(brainfilePath: string): V2Dirs {
  const dirs = getV2Dirs(brainfilePath);
  fs.mkdirSync(dirs.tasksDir, { recursive: true });
  fs.mkdirSync(dirs.logsDir, { recursive: true });
  return dirs;
}

/**
 * Get the file path for a task in the tasks/ directory.
 */
export function getTaskFilePath(tasksDir: string, taskId: string): string {
  return path.join(tasksDir, taskFileName(taskId));
}

/**
 * Get the file path for a completed task in the logs/ directory.
 */
export function getLogFilePath(logsDir: string, taskId: string): string {
  return path.join(logsDir, taskFileName(taskId));
}

/**
 * Find a task by ID across active tasks and optionally logs.
 * Returns the TaskDocument, its file path, and whether it's in logs.
 */
export function findV2Task(
  dirs: V2Dirs,
  taskId: string,
  searchLogs: boolean = false
): { doc: TaskDocument; filePath: string; isLog: boolean } | null {
  // Check tasks/ first
  const taskPath = getTaskFilePath(dirs.tasksDir, taskId);
  const taskDoc = readTaskFile(taskPath);
  if (taskDoc && taskDoc.task.id === taskId) {
    return { doc: taskDoc, filePath: taskPath, isLog: false };
  }

  if (searchLogs) {
    const logPath = getLogFilePath(dirs.logsDir, taskId);
    const logDoc = readTaskFile(logPath);
    if (logDoc && logDoc.task.id === taskId) {
      return { doc: logDoc, filePath: logPath, isLog: true };
    }
  }

  return null;
}

/**
 * Extract the description section from a task document body.
 */
export function extractDescription(body: string): string | undefined {
  const match = body.match(/## Description\n([\s\S]*?)(?=\n## |\n*$)/);
  return match ? match[1].trim() || undefined : undefined;
}

/**
 * Extract the log section from a task document body.
 */
export function extractLog(body: string): string | undefined {
  const match = body.match(/## Log\n([\s\S]*?)(?=\n## |\n*$)/);
  return match ? match[1].trim() || undefined : undefined;
}

/**
 * Compose a markdown body from separate description and log sections.
 */
export function composeBody(description?: string, log?: string): string {
  const sections: string[] = [];

  if (description && description.trim()) {
    sections.push(`## Description\n${description.trim()}`);
  }

  if (log && log.trim()) {
    sections.push(`## Log\n${log.trim()}`);
  }

  if (sections.length === 0) return '';
  return sections.join('\n\n') + '\n';
}

/**
 * Read the v2 board config (config-only brainfile without embedded tasks).
 */
export function readV2BoardConfig(brainfilePath: string): Board {
  const content = fs.readFileSync(brainfilePath, 'utf-8');
  const result = Brainfile.parseWithErrors(content);
  if (!result.board) {
    throw new Error(`Failed to parse brainfile: ${result.error}`);
  }
  const board = result.board;
  // Ensure columns have empty task arrays
  for (const col of board.columns) {
    if (!col.tasks) col.tasks = [];
  }
  return board;
}

/**
 * Build a full v1-compatible Board from v2 per-task files.
 * Reads the board config and populates column tasks from the tasks/ directory.
 */
export function buildBoardFromV2(brainfilePath: string): Board {
  const dirs = getV2Dirs(brainfilePath);
  const board = readV2BoardConfig(brainfilePath);
  const taskDocs = readTasksDir(dirs.tasksDir);

  // Group tasks by column
  const tasksByColumn = new Map<string, TaskDocument[]>();
  for (const doc of taskDocs) {
    const col = doc.task.column || 'todo';
    if (!tasksByColumn.has(col)) {
      tasksByColumn.set(col, []);
    }
    tasksByColumn.get(col)!.push(doc);
  }

  // Populate board columns with tasks sorted by position
  for (const col of board.columns) {
    const colTasks = tasksByColumn.get(col.id) || [];
    colTasks.sort((a, b) => (a.task.position ?? 0) - (b.task.position ?? 0));
    col.tasks = colTasks.map(doc => {
      const task = { ...doc.task };
      // Restore description from markdown body if not in frontmatter
      if (!task.description) {
        const desc = extractDescription(doc.body);
        if (desc) task.description = desc;
      }
      return task;
    });
  }

  return board;
}
