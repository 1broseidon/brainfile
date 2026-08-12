/**
 * Complete command - move a task from board/ to logs/, set completedAt.
 *
 * - Moves .brainfile/board/task-X.md to .brainfile/logs/task-X.md
 * - Adds completedAt timestamp to frontmatter
 * - Removes column and position fields
 *
 * @packageDocumentation
 */

import * as path from 'path';
import chalk from 'chalk';
import { type Logger, defaultLogger } from '../utils/logger';
import { missingRequired, operationFailed, taskNotFound } from '../utils/cli-error';
import { resolveCliBrainfilePath } from '../utils/brainfile-path';
import { assertV2Brainfile } from '../utils/v2-only';
import { completeTaskFile } from '@brainfile/core';
import { getV2Dirs, findV2Task } from '../utils/v2-detect';

export interface CompleteOptions {
  file: string;
  task?: string;
  force?: boolean;
}

export interface CompleteResult {
  success: true;
  taskId: string;
  completedAt: string;
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

/**
 * Complete a task - move to logs with completedAt timestamp.
 * Throws CLIError on failure.
 */
export function completeCommand(options: CompleteOptions, logger: Logger = defaultLogger): CompleteResult {
  if (!options.task) {
    throw missingRequired('--task', 'brainfile complete --task <task-id> [--file <path>] [--force]');
  }

  const filePath = resolveCliBrainfilePath(options.file);
  assertV2Brainfile(filePath);

  return completeV2(filePath, options.task, options.force === true, logger);
}

function completeV2(filePath: string, taskId: string, force: boolean, logger: Logger): CompleteResult {
  assertSafeTaskId(taskId);

  const dirs = getV2Dirs(filePath);
  const found = findV2Task(dirs, taskId, false);
  if (!found || found.isLog) {
    throw taskNotFound(taskId);
  }

  const { doc, filePath: taskPath } = found;
  const task = doc.task;

  const result = completeTaskFile(taskPath, dirs.logsDir, { legacyMode: true, force });

  if (!result.success) {
    if (result.incompleteChildren?.length) {
      logger.warn(chalk.yellow(`Epic ${taskId} has incomplete child tasks:`));
      for (const child of result.incompleteChildren) {
        logger.warn(chalk.yellow(`  - ${child.id}: ${child.title}`));
      }
      logger.warn(chalk.yellow('Aborting completion. Re-run with --force to override.'));
      throw operationFailed(
        `Epic ${taskId} has ${result.incompleteChildren.length} incomplete child task(s). Use --force to override.`
      );
    }
    throw operationFailed(result.error || `Failed to complete task: ${taskId}`);
  }

  if (result.incompleteChildren?.length) {
    logger.warn(
      chalk.yellow(
        `Completing epic ${taskId} with --force despite ${result.incompleteChildren.length} incomplete child task(s).`
      )
    );
  }

  const completedAt = result.task?.completedAt ?? new Date().toISOString();

  logger.log(chalk.green('Task completed!'));
  logger.log('');
  logger.log(chalk.gray(`  Task:        ${taskId} - ${task.title}`));
  logger.log(chalk.gray(`  CompletedAt: ${completedAt}`));
  logger.log(chalk.gray(`  Moved to:    logs/${taskId}.md`));

  return { success: true, taskId, completedAt };
}

