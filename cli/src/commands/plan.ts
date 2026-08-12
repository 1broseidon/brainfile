/**
 * Plan command group — first-class plan documents.
 *
 * Plans are ordinary board documents with `type: plan`, so they inherit every
 * core V2 operation (add/move/patch/search/list) for free. These commands are
 * thin conveniences over those core functions.
 *
 * @packageDocumentation
 */

import chalk from 'chalk';
import {
  addTaskFile,
  findTask,
  listTasks,
  patchTaskFile,
  readBoardConfig,
  validateType,
  type Task,
  type TaskOperationResult,
} from '@brainfile/core';
import { type Logger, defaultLogger } from '../utils/logger';
import { CLIError, missingRequired, operationFailed, taskNotFound } from '../utils/cli-error';
import { resolveCliBrainfilePath } from '../utils/brainfile-path';
import { assertV2Brainfile } from '../utils/v2-only';
import { ensureV2Dirs, getV2Dirs, findV2Task, composeBody, extractDescription } from '../utils/v2-detect';

export const PLAN_COMMAND_HELP = `
Plans are board documents with type: plan. They participate in the board like
any other document — they get IDs, columns, search, and parent/child linkage.

Examples:
  brainfile plan add -t "Thin-frontend refactor" --status draft
  brainfile plan list
  brainfile plan list --status active
  brainfile plan show plan-1
  brainfile plan link plan-1 --task task-42

Link direction:
  A task's parentId points at the plan it implements (task.parentId = plan-1).
  Find a plan's tasks with: brainfile list --parent plan-1

Note:
  On a strict board, add a 'plan' entry under types: in your brainfile
  before creating plan documents.
`.trimEnd();

const PLAN_TYPE = 'plan';
const DEFAULT_PLAN_COLUMN = 'todo';

export interface PlanAddOptions {
  file: string;
  title?: string;
  column?: string;
  description?: string;
  tags?: string;
  parent?: string;
  status?: string;
}

export interface PlanAddResult {
  success: true;
  taskId: string;
  columnId: string;
}

export interface PlanListOptions {
  file: string;
  status?: string;
}

export interface PlanListResult {
  success: true;
  totalPlans: number;
}

export interface PlanShowOptions {
  file: string;
  plan?: string;
  json?: boolean;
}

export interface PlanLinkOptions {
  file: string;
  plan?: string;
  task?: string;
}

/**
 * Create a new plan document.
 */
export function planAddCommand(options: PlanAddOptions, logger: Logger = defaultLogger): PlanAddResult {
  if (!options.title) {
    throw missingRequired('--title', 'brainfile plan add --title "Plan title" [options]');
  }

  const filePath = resolveCliBrainfilePath(options.file);
  assertV2Brainfile(filePath);

  const dirs = ensureV2Dirs(filePath);
  const boardFile = readBoardConfig(filePath);
  if (!boardFile) {
    throw operationFailed(`Failed to parse brainfile: ${filePath}`);
  }
  const board = boardFile.config;

  const typeValidation = validateType(board, PLAN_TYPE);
  if (!typeValidation.valid) {
    throw new CLIError(typeValidation.error || `Invalid type: ${PLAN_TYPE}`);
  }

  const columnRef = options.column || DEFAULT_PLAN_COLUMN;
  let targetColumn = board.columns.find((c) => c.id === columnRef);
  if (!targetColumn) {
    targetColumn = board.columns.find((c) => c.title.toLowerCase() === columnRef.toLowerCase());
  }
  if (!targetColumn) {
    const available = board.columns.map((c) => `${c.id} (${c.title})`).join(', ');
    throw new CLIError(`Column not found: ${columnRef}. Available: ${available}`);
  }

  const result = addTaskFile(
    dirs.boardDir,
    {
      title: options.title,
      type: PLAN_TYPE,
      column: targetColumn.id,
      tags: options.tags ? options.tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
      parentId: options.parent,
      status: options.status,
    },
    composeBody(options.description),
    dirs.logsDir,
  );

  if (!result.success || !result.task) {
    throw operationFailed(result.error || `Failed to create plan: ${options.title}`);
  }

  logger.log(chalk.green('Plan created!'));
  logger.log('');
  logger.log(chalk.gray(`  ID:      ${result.task.id}`));
  logger.log(chalk.gray(`  Title:   ${options.title}`));
  logger.log(chalk.gray(`  Column:  ${targetColumn.title}`));
  if (options.status) {
    logger.log(chalk.gray(`  Status:  ${options.status}`));
  }
  if (options.parent) {
    logger.log(chalk.gray(`  Parent:  ${options.parent}`));
  }

  return { success: true, taskId: result.task.id, columnId: targetColumn.id };
}

/**
 * List plan documents, optionally filtered by their free-form status.
 */
export function planListCommand(options: PlanListOptions, logger: Logger = defaultLogger): PlanListResult {
  const filePath = resolveCliBrainfilePath(options.file);
  assertV2Brainfile(filePath);

  const dirs = getV2Dirs(filePath);
  let docs = listTasks(dirs.boardDir, { type: PLAN_TYPE });

  // `status` is a free-form convention, not a core-enforced field — filter here.
  if (options.status) {
    docs = docs.filter((doc) => doc.task.status === options.status);
  }

  logger.log('');
  logger.log(chalk.bold(`Plans (${docs.length})`));
  logger.log(chalk.gray('─'.repeat(50)));

  if (docs.length === 0) {
    logger.log(chalk.gray('  No plans found.'));
  } else {
    for (const doc of docs) {
      const status = typeof doc.task.status === 'string' ? doc.task.status : undefined;
      const statusLabel = status ? chalk.yellow(`(${status})`) : '';
      logger.log(`  ${chalk.gray(`[${doc.task.id}]`)} ${chalk.white(doc.task.title)} ${chalk.cyan(doc.task.column || '')} ${statusLabel}`);
    }
  }
  logger.log('');

  return { success: true, totalPlans: docs.length };
}

/**
 * Show a single plan document's metadata and body.
 */
export function planShowCommand(options: PlanShowOptions, logger: Logger = defaultLogger): void {
  if (!options.plan) {
    throw missingRequired('<plan-id>', 'brainfile plan show <plan-id> [--file <path>]');
  }

  const filePath = resolveCliBrainfilePath(options.file);
  assertV2Brainfile(filePath);

  const dirs = getV2Dirs(filePath);
  const doc = findTask(dirs.boardDir, options.plan);
  if (!doc) {
    throw taskNotFound(options.plan);
  }

  const task: Task = { ...doc.task };
  if (!task.description) {
    const desc = extractDescription(doc.body);
    if (desc) task.description = desc;
  }

  const implementedBy = listTasks(dirs.boardDir, { parentId: task.id }).map((d) => d.task.id);

  if (options.json) {
    logger.log(JSON.stringify({ ...task, ...(implementedBy.length > 0 && { implementedBy }) }, null, 2));
    return;
  }

  logger.log('');
  logger.log(`${chalk.bold(task.id)} ${chalk.white(task.title)}`);
  logger.log(chalk.gray('─'.repeat(50)));
  logger.log(`${chalk.bold('Type:')}    ${task.type || 'task'}`);
  logger.log(`${chalk.bold('Column:')}  ${task.column || 'unknown'}`);
  if (typeof task.status === 'string') {
    logger.log(`${chalk.bold('Status:')}  ${task.status}`);
  }
  if (task.parentId) {
    logger.log(`${chalk.bold('Parent:')}  ${task.parentId}`);
  }
  if (task.tags?.length) {
    logger.log(`${chalk.bold('Tags:')}    ${task.tags.join(', ')}`);
  }
  if (implementedBy.length > 0) {
    logger.log(`${chalk.bold('Tasks:')}   ${implementedBy.join(', ')}`);
  }
  if (task.description) {
    logger.log('');
    logger.log(chalk.bold('Description:'));
    logger.log(task.description);
  }
  logger.log('');
}

/**
 * Link a task to a plan by pointing the task's parentId at the plan.
 */
export function planLinkCommand(options: PlanLinkOptions, logger: Logger = defaultLogger): TaskOperationResult {
  if (!options.plan) {
    throw missingRequired('<plan-id>', 'brainfile plan link <plan-id> --task <task-id>');
  }
  if (!options.task) {
    throw missingRequired('--task', 'brainfile plan link <plan-id> --task <task-id>');
  }

  const filePath = resolveCliBrainfilePath(options.file);
  assertV2Brainfile(filePath);

  const dirs = getV2Dirs(filePath);

  const plan = findTask(dirs.boardDir, options.plan);
  if (!plan) {
    throw taskNotFound(options.plan);
  }

  const found = findV2Task(dirs, options.task, false);
  if (!found || found.isLog) {
    throw taskNotFound(options.task);
  }

  const result = patchTaskFile(found.filePath, { parentId: options.plan });
  if (!result.success) {
    throw operationFailed(result.error || `Failed to link ${options.task} to ${options.plan}`);
  }

  logger.log(chalk.green(`Linked ${options.task} → ${options.plan}`));
  return result;
}
