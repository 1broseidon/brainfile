import * as fs from 'fs';
import { Brainfile, findTaskById, findColumnById, findColumnByName, moveTask, type Board, type Column, type Task } from '@brainfile/core';
import { CLIError, fileNotFound, parseFailure, missingRequired, operationFailed, columnNotFound, taskNotFound } from '../utils/cli-error';
import { defaultLogger, type Logger } from '../utils/logger';
import { getIncompleteSubtasksWarning } from '../utils/errorHandler';
import { resolveCliBrainfilePath } from '../utils/brainfile-path';

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
