/**
 * Archive utilities for Brainfile CLI
 *
 * Per protocol spec, archived tasks go to a separate brainfile-archive.md file,
 * NOT to an inline archive array in the main brainfile.
 *
 * @packageDocumentation
 */

import * as fs from 'fs';
import * as path from 'path';
import { Brainfile, deleteTask, type Board, type Task } from '@brainfile/core';

// ============================================================================
// Types
// ============================================================================

export interface ArchiveResult {
  success: boolean;
  error?: string;
  board?: Board;
  archiveBoard?: Board;
}

export interface LoadArchiveResult {
  tasks: Task[];
  archivePath: string;
  error?: string;
}

// ============================================================================
// Path Helpers
// ============================================================================

/**
 * Get the archive file path for a given brainfile
 * brainfile.md -> brainfile-archive.md
 */
export function getArchivePath(filePath: string): string {
  const dir = path.dirname(filePath);
  const filename = path.basename(filePath);
  const archiveFilename = filename.replace(/\.md$/, '-archive.md');
  return path.join(dir, archiveFilename);
}

/**
 * Create an empty archive board structure
 */
export function createEmptyArchiveBoard(): Board {
  return {
    title: 'Archive',
    columns: [],
    archive: [],
  };
}

// ============================================================================
// Read Operations
// ============================================================================

/**
 * Load archived tasks from the separate archive file
 */
export function loadArchivedTasks(filePath: string): LoadArchiveResult {
  const archivePath = getArchivePath(filePath);

  if (!fs.existsSync(archivePath)) {
    return { tasks: [], archivePath };
  }

  try {
    const archiveContent = fs.readFileSync(archivePath, 'utf-8');
    const parseResult = Brainfile.parseWithErrors(archiveContent);

    if (parseResult.board && Array.isArray(parseResult.board.archive)) {
      return { tasks: parseResult.board.archive, archivePath };
    }

    return { tasks: [], archivePath };
  } catch (err) {
    return {
      tasks: [],
      archivePath,
      error: `Failed to read archive: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Read the archive board (full structure)
 */
export function readArchiveBoard(filePath: string): { board: Board | null; archivePath: string; error?: string } {
  const archivePath = getArchivePath(filePath);

  if (!fs.existsSync(archivePath)) {
    return { board: null, archivePath };
  }

  try {
    const archiveContent = fs.readFileSync(archivePath, 'utf-8');
    const parseResult = Brainfile.parseWithErrors(archiveContent);

    if (parseResult.board) {
      return { board: parseResult.board, archivePath };
    }

    return { board: null, archivePath, error: parseResult.error };
  } catch (err) {
    return {
      board: null,
      archivePath,
      error: `Failed to read archive: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ============================================================================
// Write Operations
// ============================================================================

/**
 * Archive a task to the separate archive file
 *
 * 1. Removes task from main board
 * 2. Adds task to brainfile-archive.md
 */
export function archiveTaskToFile(
  filePath: string,
  board: Board,
  columnId: string,
  taskId: string
): ArchiveResult {
  const taskInfo = board.columns.find((c) => c.id === columnId)?.tasks.find((t) => t.id === taskId);
  if (!taskInfo) {
    return { success: false, error: `Task ${taskId} not found in column ${columnId}` };
  }

  const task = taskInfo;

  // Remove task from the main board
  const result = deleteTask(board, columnId, taskId);
  if (!result.success) {
    return { success: false, error: result.error };
  }

  // Save the main board without the task
  try {
    const mainContent = Brainfile.serialize(result.board!);
    fs.writeFileSync(filePath, mainContent, 'utf-8');
  } catch (err) {
    return {
      success: false,
      error: `Failed to write main file: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Add task to separate archive file
  const archivePath = getArchivePath(filePath);
  let archiveBoard: Board;

  if (fs.existsSync(archivePath)) {
    try {
      const archiveContent = fs.readFileSync(archivePath, 'utf-8');
      const parseResult = Brainfile.parseWithErrors(archiveContent);
      archiveBoard = parseResult.board || createEmptyArchiveBoard();
    } catch {
      archiveBoard = createEmptyArchiveBoard();
    }
  } else {
    archiveBoard = createEmptyArchiveBoard();
  }

  // Add task to archive (at beginning)
  if (!archiveBoard.archive) {
    archiveBoard.archive = [];
  }
  archiveBoard.archive.unshift(task);

  // Save archive file
  try {
    const archiveContent = Brainfile.serialize(archiveBoard);
    fs.writeFileSync(archivePath, archiveContent, 'utf-8');
  } catch (err) {
    return {
      success: false,
      error: `Task removed from board but failed to write archive: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  return { success: true, board: result.board!, archiveBoard };
}

/**
 * Remove a task from the archive file (after exporting to external service)
 */
export function removeFromArchive(filePath: string, taskId: string): ArchiveResult {
  const archivePath = getArchivePath(filePath);

  if (!fs.existsSync(archivePath)) {
    return { success: false, error: 'Archive file not found' };
  }

  let archiveBoard: Board;
  try {
    const archiveContent = fs.readFileSync(archivePath, 'utf-8');
    const parseResult = Brainfile.parseWithErrors(archiveContent);
    if (!parseResult.board) {
      return { success: false, error: 'Failed to parse archive file' };
    }
    archiveBoard = parseResult.board;
  } catch (err) {
    return {
      success: false,
      error: `Failed to read archive: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Remove task from archive
  const originalLength = archiveBoard.archive?.length || 0;
  archiveBoard.archive = (archiveBoard.archive || []).filter((t) => t.id !== taskId);

  if (archiveBoard.archive.length === originalLength) {
    return { success: false, error: `Task ${taskId} not found in archive` };
  }

  // Save updated archive
  try {
    const archiveContent = Brainfile.serialize(archiveBoard);
    fs.writeFileSync(archivePath, archiveContent, 'utf-8');
  } catch (err) {
    return {
      success: false,
      error: `Failed to write archive: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  return { success: true, archiveBoard };
}

/**
 * Restore a task from archive to a column in the main brainfile
 */
export function restoreFromArchive(
  filePath: string,
  taskId: string,
  toColumnId: string
): ArchiveResult {
  const archivePath = getArchivePath(filePath);

  // Read archive
  if (!fs.existsSync(archivePath)) {
    return { success: false, error: 'Archive file not found' };
  }

  let archiveBoard: Board;
  try {
    const archiveContent = fs.readFileSync(archivePath, 'utf-8');
    const parseResult = Brainfile.parseWithErrors(archiveContent);
    if (!parseResult.board) {
      return { success: false, error: 'Failed to parse archive file' };
    }
    archiveBoard = parseResult.board;
  } catch (err) {
    return {
      success: false,
      error: `Failed to read archive: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Find task in archive
  const task = archiveBoard.archive?.find((t) => t.id === taskId);
  if (!task) {
    return { success: false, error: `Task ${taskId} not found in archive` };
  }

  // Read main brainfile
  let board: Board;
  try {
    const mainContent = fs.readFileSync(filePath, 'utf-8');
    const parseResult = Brainfile.parseWithErrors(mainContent);
    if (!parseResult.board) {
      return { success: false, error: 'Failed to parse main brainfile' };
    }
    board = parseResult.board;
  } catch (err) {
    return {
      success: false,
      error: `Failed to read main file: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Find target column
  const targetColumn = board.columns.find((c) => c.id === toColumnId);
  if (!targetColumn) {
    return { success: false, error: `Column ${toColumnId} not found` };
  }

  // Add task to column
  targetColumn.tasks.push(task);

  // Remove from archive
  archiveBoard.archive = archiveBoard.archive!.filter((t) => t.id !== taskId);

  // Save both files
  try {
    const mainContent = Brainfile.serialize(board);
    fs.writeFileSync(filePath, mainContent, 'utf-8');

    const archiveContent = Brainfile.serialize(archiveBoard);
    fs.writeFileSync(archivePath, archiveContent, 'utf-8');
  } catch (err) {
    return {
      success: false,
      error: `Failed to save files: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  return { success: true, board, archiveBoard };
}
