import * as path from 'path';
import { type Column, type Task } from '@brainfile/core';
import { CLIError, missingRequired, operationFailed, taskNotFound } from '../utils/cli-error';
import { defaultLogger, type Logger } from '../utils/logger';
import { getIncompleteSubtasksWarning } from '../utils/errorHandler';
import { resolveCliBrainfilePath } from '../utils/brainfile-path';
import { assertV2Brainfile } from '../utils/v2-only';
import { readBoardConfig, moveTaskFileToColumn } from '@brainfile/core';
import {
  getV2Dirs,
  findV2Task,
} from '../utils/v2-detect';

interface MoveOptions {
  file: string;
  task: string;
  column: string;
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

  const { doc } = found;
  const task = doc.task;
  const sourceColumnId = task.column || '';

  // Source column is presentation-only (title aliases still supported)
  const sourceConfigColumn = board.columns.find(c => c.id === sourceColumnId);
  const sourceColumn: Column = sourceConfigColumn
    ? { ...sourceConfigColumn, tasks: [] }
    : { id: sourceColumnId, title: sourceColumnId, tasks: [] };

  const result = moveTaskFileToColumn(dirs, board, options.task, options.column);
  if (!result.success || !result.column) {
    // Column resolution failures are validation errors; everything else is an operation failure.
    if (result.error && result.error.startsWith('Column ')) {
      throw new CLIError(result.error);
    }
    throw operationFailed(result.error || `Failed to move task: ${options.task}`);
  }

  const targetColumn: Column = { ...result.column, tasks: [] };
  const movedTask: Task = result.task ?? task;

  if (result.noop) {
    logger.warn(`Task ${options.task} is already in column "${targetColumn.title}"`);
    return {
      success: true,
      movedTask,
      sourceColumn,
      targetColumn
    };
  }

  logger.log('Task moved successfully!');
  logger.log('');
  logger.log(`  Task:   ${task.id} - ${task.title}`);
  logger.log(`  From:   ${sourceColumn.title}`);
  logger.log(`  To:     ${targetColumn.title}`);
  if (result.autoCompleted) {
    logger.log('  Status: Completed (moved to logs/)');
  }

  // Soft error: warn about incomplete subtasks when moving to done-like column
  const warning = getIncompleteSubtasksWarning(movedTask, targetColumn);
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
