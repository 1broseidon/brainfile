/**
 * Complete command - move a task from tasks/ to logs/, set completedAt.
 *
 * In v2 per-task file architecture:
 * - Moves .brainfile/tasks/task-X.md to .brainfile/logs/task-X.md
 * - Adds completedAt timestamp to frontmatter
 * - Removes column and position fields
 *
 * In v1 (embedded tasks):
 * - Moves task to the first completion column (done) and adds completedAt
 *
 * @packageDocumentation
 */

import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { Brainfile, findTaskById, moveTask, patchTask, findCompletionColumn } from '@brainfile/core';
import { type Logger, defaultLogger } from '../utils/logger';
import { CLIError, fileNotFound, missingRequired, operationFailed, taskNotFound } from '../utils/cli-error';
import { resolveCliBrainfilePath } from '../utils/brainfile-path';
import { readTaskFile, writeTaskFile, taskFileName } from '@brainfile/core';
import { isV2, getV2Dirs } from '../utils/v2-detect';

export interface CompleteOptions {
  file: string;
  task?: string;
}

export interface CompleteResult {
  success: true;
  taskId: string;
  completedAt: string;
}

/**
 * Complete a task - move to logs with completedAt timestamp.
 * Throws CLIError on failure.
 */
export function completeCommand(options: CompleteOptions, logger: Logger = defaultLogger): CompleteResult {
  if (!options.task) {
    throw missingRequired('--task', 'brainfile complete --task <task-id> [--file <path>]');
  }

  const filePath = resolveCliBrainfilePath(options.file);
  if (!fs.existsSync(filePath)) {
    throw fileNotFound(filePath);
  }

  const completedAt = new Date().toISOString();

  if (isV2(filePath)) {
    return completeV2(filePath, options.task, completedAt, logger);
  }

  return completeV1(filePath, options.task, completedAt, logger);
}

function completeV2(filePath: string, taskId: string, completedAt: string, logger: Logger): CompleteResult {
  const dirs = getV2Dirs(filePath);
  const taskPath = path.join(dirs.tasksDir, taskFileName(taskId));

  const doc = readTaskFile(taskPath);
  if (!doc) {
    throw taskNotFound(taskId);
  }

  const task = doc.task;

  // Create completed task: remove column/position, add completedAt
  const completedTask = { ...task, completedAt };
  delete completedTask.column;
  delete completedTask.position;

  // Ensure logs directory exists
  fs.mkdirSync(dirs.logsDir, { recursive: true });

  // Write to logs directory
  const logPath = path.join(dirs.logsDir, taskFileName(taskId));
  writeTaskFile(logPath, completedTask, doc.body);

  // Remove from tasks directory
  fs.unlinkSync(taskPath);

  logger.log(chalk.green('Task completed!'));
  logger.log('');
  logger.log(chalk.gray(`  Task:        ${taskId} - ${task.title}`));
  logger.log(chalk.gray(`  CompletedAt: ${completedAt}`));
  logger.log(chalk.gray(`  Moved to:    logs/${taskId}.md`));

  return { success: true, taskId, completedAt };
}

function completeV1(filePath: string, taskId: string, completedAt: string, logger: Logger): CompleteResult {
  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = Brainfile.parseWithErrors(content);
  if (!parsed.board) {
    throw operationFailed(parsed.error || 'Failed to parse brainfile');
  }

  let board = parsed.board;
  const taskInfo = findTaskById(board, taskId);
  if (!taskInfo) {
    throw taskNotFound(taskId);
  }

  // Find or determine done column
  const doneColumn = findCompletionColumn(board) || board.columns.find(c =>
    /^(done|completed?|finished|closed)$/i.test(c.id) ||
    /^(done|completed?|finished|closed)$/i.test(c.title)
  );

  if (!doneColumn) {
    throw operationFailed('No completion column found. Add a column with id "done" or set completionColumn: true');
  }

  // Move to done column if not already there
  if (taskInfo.column.id !== doneColumn.id) {
    const moveResult = moveTask(board, taskId, taskInfo.column.id, doneColumn.id, doneColumn.tasks.length);
    if (!moveResult.success) {
      throw operationFailed(moveResult.error!);
    }
    board = moveResult.board!;
  }

  // Write back
  const updatedContent = Brainfile.serialize(board);
  fs.writeFileSync(filePath, updatedContent, 'utf-8');

  logger.log(chalk.green('Task completed!'));
  logger.log('');
  logger.log(chalk.gray(`  Task:        ${taskId} - ${taskInfo.task.title}`));
  logger.log(chalk.gray(`  CompletedAt: ${completedAt}`));
  logger.log(chalk.gray(`  Column:      ${doneColumn.title}`));

  return { success: true, taskId, completedAt };
}
