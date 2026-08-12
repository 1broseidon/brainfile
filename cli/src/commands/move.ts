import * as path from 'path';
import { type BoardConfig, type Column, type Task } from '@brainfile/core';
import { CLIError, missingRequired, operationFailed, taskNotFound } from '../utils/cli-error';
import { defaultLogger, type Logger } from '../utils/logger';
import { getIncompleteSubtasksWarning } from '../utils/errorHandler';
import { resolveCliBrainfilePath } from '../utils/brainfile-path';
import { assertV2Brainfile } from '../utils/v2-only';
import { validateColumn, getBoardTypes, readBoardConfig } from '@brainfile/core';
import {
  readTasksDir,
  writeTaskFile,
  completeTaskFile,
} from '@brainfile/core';
import {
  getV2Dirs,
  findV2Task,
} from '../utils/v2-detect';

interface MoveOptions {
  file: string;
  task: string;
  column: string;
}

function isTaskCompletable(task: Task, board: BoardConfig): boolean {
  const taskType = task.type || 'task';
  if (taskType === 'task') {
    return true;
  }

  const typeConfig = getBoardTypes(board)[taskType];
  return typeConfig?.completable !== false;
}

export interface MoveResult {
  success: boolean;
  movedTask: Task;
  sourceColumn: Column;
  targetColumn: Column;
}

function assertSafeTaskId(taskId: string): void {
  const trimmed = taskId.trim();
  if (!trimmed || trimmed !== taskId) {
    throw operationFailed(`Invalid task ID: ${taskId}`);
  }

  if (taskId === '.' || taskId === '..') {
    throw operationFailed(`Invalid task ID: ${taskId}`);
  }

  if (path.isAbsolute(taskId) || /[\\/]/.test(taskId)) {
    throw operationFailed(`Invalid task ID: ${taskId}`);
  }
}

export function moveCommand(options: MoveOptions, logger: Logger = defaultLogger): MoveResult {
  // Validate required options
  if (!options.task) {
    throw missingRequired('--task', 'brainfile move --task <task-id> --column <column-name>');
  }

  if (!options.column) {
    throw missingRequired('--column', 'brainfile move --task <task-id> --column <column-name>');
  }

  // Resolve file path
  const filePath = resolveCliBrainfilePath(options.file);
  assertV2Brainfile(filePath);

  return moveCommandV2(options, filePath, logger);
}

function moveCommandV2(options: MoveOptions, filePath: string, logger: Logger): MoveResult {
  assertSafeTaskId(options.task);

  const dirs = getV2Dirs(filePath);
  const boardFile = readBoardConfig(filePath);
  if (!boardFile) {
    throw operationFailed(`Failed to parse brainfile: ${filePath}`);
  }
  const board = boardFile.config;
  const found = findV2Task(dirs, options.task, false);
  if (!found || found.isLog) {
    throw taskNotFound(options.task);
  }

  const { doc, filePath: taskPath } = found;
  const task = doc.task;
  const sourceColumnId = task.column || '';

  // Find source and target columns from board config (title aliases still supported)
  const sourceConfigColumn = board.columns.find(c => c.id === sourceColumnId);
  const sourceColumn: Column = sourceConfigColumn
    ? { ...sourceConfigColumn, tasks: [] }
    : { id: sourceColumnId, title: sourceColumnId, tasks: [] };
  let configuredTargetColumn = board.columns.find(c => c.id === options.column);
  if (!configuredTargetColumn) {
    configuredTargetColumn = board.columns.find(c => c.title.toLowerCase() === options.column.toLowerCase());
  }

  // Strict boards must target a configured column; non-strict boards allow any column ID.
  const targetColumnId = configuredTargetColumn?.id || options.column;
  const columnValidation = validateColumn(board, targetColumnId);
  if (!columnValidation.valid) {
    throw new CLIError(columnValidation.error || `Invalid column: ${targetColumnId}`);
  }
  const targetColumn: Column = configuredTargetColumn
    ? { ...configuredTargetColumn, tasks: [] }
    : { id: options.column, title: options.column, tasks: [] };

  if (sourceColumnId === targetColumn.id) {
    logger.warn(`Task ${options.task} is already in column "${targetColumn.title}"`);
    return {
      success: true,
      movedTask: task,
      sourceColumn,
      targetColumn
    };
  }

  // Calculate new position (append to end)
  const targetTasks = readTasksDir(dirs.boardDir)
    .filter(t => t.task.column === targetColumn.id);
  const newPosition = targetTasks.length;

  // Update task
  task.column = targetColumn.id;
  task.position = newPosition;
  writeTaskFile(taskPath, task, doc.body);

  const shouldAutoComplete = targetColumn.completionColumn === true && isTaskCompletable(task, board);
  let movedTask: Task = task;
  if (shouldAutoComplete) {
    const completeResult = completeTaskFile(taskPath, dirs.logsDir);
    if (!completeResult.success || !completeResult.task) {
      throw operationFailed(completeResult.error || `Failed to complete task: ${task.id}`);
    }
    movedTask = completeResult.task;
  }

  logger.log('Task moved successfully!');
  logger.log('');
  logger.log(`  Task:   ${task.id} - ${task.title}`);
  logger.log(`  From:   ${sourceColumn.title}`);
  logger.log(`  To:     ${targetColumn.title}`);
  if (shouldAutoComplete) {
    logger.log('  Status: Completed (moved to logs/)');
  }

  // Soft error: warn about incomplete subtasks when moving to done-like column
  const warning = getIncompleteSubtasksWarning(task, targetColumn);
  if (warning) {
    logger.warn('');
    logger.warn(warning);
  }

  return {
    success: true,
    movedTask,
    sourceColumn,
    targetColumn
  };
}
