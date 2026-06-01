import * as fs from 'fs';
import * as path from 'path';
import { Brainfile, findTaskById, findColumnById, findColumnByName, moveTask, type Board, type Column, type Task } from '@brainfile/core';
import { CLIError, fileNotFound, parseFailure, missingRequired, operationFailed, columnNotFound, taskNotFound } from '../utils/cli-error';
import { defaultLogger, type Logger } from '../utils/logger';
import { getIncompleteSubtasksWarning } from '../utils/errorHandler';
import { resolveCliBrainfilePath } from '../utils/brainfile-path';
import { validateColumn } from '../utils/strict-validation';
import {
  readTasksDir,
  writeTaskFile,
  completeTaskFile,
} from '@brainfile/core';
import {
  isV2,
  getV2Dirs,
  readV2BoardConfig,
  findV2Task,
} from '../utils/v2-detect';

interface MoveOptions {
  file: string;
  task: string;
  column: string;
}

interface TypeEntry {
  completable?: boolean;
}

type TypesConfig = Record<string, TypeEntry>;

function getBoardTypes(board: Board): TypesConfig {
  const rawTypes = (board as Board & { types?: TypesConfig }).types;
  return rawTypes && typeof rawTypes === 'object' ? rawTypes : {};
}

function isTaskCompletable(task: Task, board: Board): boolean {
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

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    throw fileNotFound(filePath);
  }

  // V2 per-task file architecture
  if (isV2(filePath)) {
    return moveCommandV2(options, filePath, logger);
  }

  // Read and parse the file
  const content = fs.readFileSync(filePath, 'utf-8');
  const result = Brainfile.parseWithErrors(content);

  if (!result.board) {
    throw parseFailure(result.error);
  }

  let board = result.board;

  // Find the task using core query function
  const taskInfo = findTaskById(board, options.task);
  if (!taskInfo) {
    // Collect available tasks for error details
    const availableTasks: string[] = [];
    board.columns.forEach(col => {
      col.tasks.forEach(t => availableTasks.push(`${t.id}: ${t.title}`));
    });
    throw taskNotFound(options.task, availableTasks);
  }

  const { task: foundTask, column: sourceColumn } = taskInfo;

  // Find the target column by ID or name
  let targetColumn = findColumnById(board, options.column);
  if (!targetColumn) {
    targetColumn = findColumnByName(board, options.column);
  }

  if (!targetColumn) {
    const availableColumns = board.columns.map(c => `${c.id} (${c.title})`);
    throw columnNotFound(options.column, availableColumns);
  }

  // Check if already in target column
  if (sourceColumn.id === targetColumn.id) {
    logger.warn(`Task ${options.task} is already in column "${targetColumn.title}"`);
    return {
      success: true,
      movedTask: foundTask,
      sourceColumn,
      targetColumn
    };
  }

  // Move task using core operation (immutable)
  const moveResult = moveTask(
    board,
    options.task,
    sourceColumn.id,
    targetColumn.id,
    targetColumn.tasks.length // Move to end of target column
  );

  if (!moveResult.success) {
    throw operationFailed(moveResult.error!);
  }

  // Serialize and write back
  const updatedContent = Brainfile.serialize(moveResult.board!);
  fs.writeFileSync(filePath, updatedContent, 'utf-8');

  // Success message
  logger.log('Task moved successfully!');
  logger.log('');
  logger.log(`  Task:   ${foundTask.id} - ${foundTask.title}`);
  logger.log(`  From:   ${sourceColumn.title}`);
  logger.log(`  To:     ${targetColumn.title}`);

  // Soft error: warn about incomplete subtasks when moving to done-like column
  const warning = getIncompleteSubtasksWarning(foundTask, targetColumn);
  if (warning) {
    logger.warn('');
    logger.warn(warning);
  }

  return {
    success: true,
    movedTask: foundTask,
    sourceColumn,
    targetColumn
  };
}

function moveCommandV2(options: MoveOptions, filePath: string, logger: Logger): MoveResult {
  assertSafeTaskId(options.task);

  const dirs = getV2Dirs(filePath);
  const board = readV2BoardConfig(filePath);
  const found = findV2Task(dirs, options.task, false);
  if (!found || found.isLog) {
    throw taskNotFound(options.task);
  }

  const { doc, filePath: taskPath } = found;
  const task = doc.task;
  const sourceColumnId = task.column || '';

  // Find source and target columns from board config (title aliases still supported)
  const sourceColumn = board.columns.find(c => c.id === sourceColumnId);
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
  const targetColumn = configuredTargetColumn || { id: options.column, title: options.column, tasks: [] };

  if (sourceColumnId === targetColumn.id) {
    logger.warn(`Task ${options.task} is already in column "${targetColumn.title}"`);
    return {
      success: true,
      movedTask: task,
      sourceColumn: sourceColumn || { id: sourceColumnId, title: sourceColumnId, tasks: [] },
      targetColumn
    };
  }

  // Calculate new position (append to end)
  const targetTasks = readTasksDir(dirs.boardDir)
    .filter(t => t.task.column === targetColumn!.id);
  const newPosition = targetTasks.length;

  // Update task
  task.column = targetColumn.id;
  task.position = newPosition;
  writeTaskFile(taskPath, task, doc.body);

  const shouldAutoComplete = (targetColumn as { completionColumn?: boolean }).completionColumn === true && isTaskCompletable(task, board);
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
  logger.log(`  From:   ${sourceColumn?.title || sourceColumnId}`);
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
    sourceColumn: sourceColumn || { id: sourceColumnId, title: sourceColumnId, tasks: [] },
    targetColumn
  };
}
