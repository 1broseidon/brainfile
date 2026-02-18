/**
 * V2 workspace detection, path resolution, and body helpers.
 *
 * These helpers provide the directory/layout layer for v2 brainfiles
 * where config lives in `.brainfile/brainfile.md` and tasks live in
 * `.brainfile/board/` and `.brainfile/logs/`.
 *
 * @packageDocumentation
 */

import * as fs from 'fs';
import * as path from 'path';
import { BrainfileParser } from './parser';
import { readTaskFile, readTasksDir, taskFileName } from './taskFile';
import type { Board, TaskDocument } from './types';

export interface V2Dirs {
  dotDir: string;
  boardDir: string;
  logsDir: string;
  brainfilePath: string;
}

/**
 * Get the v2 directory structure paths from a brainfile path.
 */
export function getV2Dirs(brainfilePath: string): V2Dirs {
  const resolvedPath = path.resolve(brainfilePath);
  const dotDir = path.dirname(resolvedPath);

  return {
    dotDir,
    boardDir: path.join(dotDir, 'board'),
    logsDir: path.join(dotDir, 'logs'),
    brainfilePath: resolvedPath,
  };
}

/**
 * Check if a brainfile is using v2 per-task file architecture.
 * V2 is detected by the presence of a board/ directory in .brainfile/.
 */
export function isV2(brainfilePath: string): boolean {
  const { boardDir } = getV2Dirs(brainfilePath);
  return fs.existsSync(boardDir);
}

/**
 * Ensure the v2 directory structure exists.
 */
export function ensureV2Dirs(brainfilePath: string): V2Dirs {
  const dirs = getV2Dirs(brainfilePath);
  fs.mkdirSync(dirs.boardDir, { recursive: true });
  fs.mkdirSync(dirs.logsDir, { recursive: true });
  return dirs;
}

/**
 * Get the file path for a task in the board/ directory.
 */
export function getTaskFilePath(boardDir: string, taskId: string): string {
  return path.join(boardDir, taskFileName(taskId));
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
  searchLogs: boolean = false,
): { doc: TaskDocument; filePath: string; isLog: boolean } | null {
  // Fast path: convention-based filename in board/
  const taskPath = getTaskFilePath(dirs.boardDir, taskId);
  const taskDoc = readTaskFile(taskPath);
  if (taskDoc && taskDoc.task.id === taskId) {
    return { doc: taskDoc, filePath: taskPath, isLog: false };
  }

  // Fast path: convention-based filename in logs/
  if (searchLogs) {
    const logPath = getLogFilePath(dirs.logsDir, taskId);
    const logDoc = readTaskFile(logPath);
    if (logDoc && logDoc.task.id === taskId) {
      return { doc: logDoc, filePath: logPath, isLog: true };
    }
  }

  // Slow path: scan board/ directory for non-standard file names
  const boardDocs = readTasksDir(dirs.boardDir);
  const boardMatch = boardDocs.find((d) => d.task.id === taskId);
  if (boardMatch) {
    return {
      doc: boardMatch,
      filePath: boardMatch.filePath || taskPath,
      isLog: false,
    };
  }

  if (searchLogs) {
    const logDocs = readTasksDir(dirs.logsDir);
    const logMatch = logDocs.find((d) => d.task.id === taskId);
    if (logMatch) {
      return {
        doc: logMatch,
        filePath: logMatch.filePath || getLogFilePath(dirs.logsDir, taskId),
        isLog: true,
      };
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
  return `${sections.join('\n\n')}\n`;
}

/**
 * Read the v2 board config (config-only brainfile without embedded tasks).
 */
export function readV2BoardConfig(brainfilePath: string): Board {
  const content = fs.readFileSync(brainfilePath, 'utf-8');
  const result = BrainfileParser.parseWithErrors(content);
  if (!result.board) {
    throw new Error(`Failed to parse brainfile: ${result.error}`);
  }

  const board = result.board;
  for (const col of board.columns) {
    if (!col.tasks) col.tasks = [];
  }

  return board;
}

/**
 * Build a full v1-compatible Board from v2 per-task files.
 * Reads the board config and populates column tasks from the board/ directory.
 */
export function buildBoardFromV2(brainfilePath: string): Board {
  const dirs = getV2Dirs(brainfilePath);
  const board = readV2BoardConfig(brainfilePath);
  const taskDocs = readTasksDir(dirs.boardDir);

  const tasksByColumn = new Map<string, TaskDocument[]>();
  for (const doc of taskDocs) {
    const colId = doc.task.column || 'todo';
    if (!tasksByColumn.has(colId)) {
      tasksByColumn.set(colId, []);
    }
    tasksByColumn.get(colId)!.push(doc);
  }

  for (const col of board.columns) {
    const colTasks = tasksByColumn.get(col.id) || [];
    colTasks.sort((a, b) => {
      const posA = a.task.position ?? Number.MAX_SAFE_INTEGER;
      const posB = b.task.position ?? Number.MAX_SAFE_INTEGER;
      if (posA !== posB) return posA - posB;
      return a.task.id.localeCompare(b.task.id);
    });

    col.tasks = colTasks.map((doc) => {
      const task = { ...doc.task };
      if (!task.description) {
        const description = extractDescription(doc.body);
        if (description) task.description = description;
      }
      return task;
    });
  }

  return board;
}
