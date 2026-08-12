import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { taskFileName, writeTaskFile, type Task } from '@brainfile/core';
import { type Logger, defaultLogger } from '../utils/logger';
import { fileNotFound, missingRequired, operationFailed, taskNotFound } from '../utils/cli-error';
import { resolveCliBrainfilePath } from '../utils/brainfile-path';
import { getV2Dirs, isV2, findV2Task } from '../utils/v2-detect';

export interface AdrPromoteOptions {
  file: string;
  task?: string;
}

export interface AdrPromoteResult {
  success: true;
  taskId: string;
  title: string;
  completedAt: string;
}

export const ADR_COMMAND_HELP = `
Examples:
  brainfile adr promote -t adr-1
  brainfile adr promote -t adr-12 -f .brainfile/brainfile.md
`.trimEnd();

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

export function adrPromoteCommand(
  options: AdrPromoteOptions,
  logger: Logger = defaultLogger
): AdrPromoteResult {
  if (!options.task) {
    throw missingRequired(
      '--task',
      'brainfile adr promote --task <adr-id> [--file <path>]'
    );
  }

  const resolvedPath = resolveCliBrainfilePath(options.file);
  if (!fs.existsSync(resolvedPath)) {
    throw fileNotFound(resolvedPath);
  }

  if (!isV2(resolvedPath)) {
    throw operationFailed('adr promote requires v2 per-task file architecture. Run: brainfile migrate');
  }

  assertSafeTaskId(options.task);

  const dirs = getV2Dirs(resolvedPath);
  const found = findV2Task(dirs, options.task, false);
  if (!found || found.isLog) {
    throw taskNotFound(options.task);
  }

  const { doc, filePath: taskPath } = found;
  const task = doc.task;
  if ((task.type || '').toLowerCase() !== 'adr') {
    throw operationFailed(
      `Only ADRs can be promoted. ${task.id} has type "${task.type || 'unknown'}".`
    );
  }

  // adr-2 removed the `rules` block: promotion now only marks the decision
  // accepted and archives it. `brief` reads accepted ADRs straight out of
  // logs/, so nothing is extracted into board config any more.
  const completedAt = new Date().toISOString();
  const promotedTask = {
    ...task,
    status: 'promoted',
    completedAt,
  } as Task & { status?: string };
  delete promotedTask.column;
  delete promotedTask.position;

  fs.mkdirSync(dirs.logsDir, { recursive: true });
  const logPath = path.join(dirs.logsDir, taskFileName(task.id));
  if (fs.existsSync(logPath)) {
    throw operationFailed(`Log already exists for ADR: ${task.id}`);
  }

  writeTaskFile(logPath, promotedTask as Task, doc.body);
  fs.unlinkSync(taskPath);

  logger.log(chalk.green('ADR promoted!'));
  logger.log('');
  logger.log(chalk.gray(`  ADR:         ${task.id} - ${task.title}`));
  logger.log(chalk.gray(`  Status:      accepted`));
  logger.log(chalk.gray(`  Moved to:    logs/${task.id}.md`));

  return {
    success: true,
    taskId: task.id,
    title: task.title,
    completedAt,
  };
}
