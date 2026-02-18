import * as fs from 'fs';
import { Brainfile, Task } from '@brainfile/core';
import chalk from 'chalk';
import { type Logger, defaultLogger } from '../utils/logger';
import { CLIError, fileNotFound, parseFailure } from '../utils/cli-error';
import { resolveCliBrainfilePath } from '../utils/brainfile-path';
import { isV2, buildBoardFromV2 } from '../utils/v2-detect';

export interface ListOptions {
  file: string;
  column?: string;
  tag?: string;
  contract?: string;
}

export interface ListResult {
  success: true;
  totalTasks: number;
  columnsDisplayed: number;
}

export const LIST_COMMAND_HELP = `
Examples:
  brainfile list
  brainfile list --column todo
  brainfile list --tag urgent
  brainfile list --contract ready

Notes:
  - When you don't pass --file, Brainfile auto-detects (prefers .brainfile/brainfile.md)
  - Contract statuses: ready | in_progress | delivered | done | failed
`.trimEnd();

/**
 * List tasks from a brainfile.
 * Throws CLIError on failure instead of calling process.exit.
 */
export function listCommand(options: ListOptions, logger: Logger = defaultLogger): ListResult {
  // Resolve file path
  const filePath = resolveCliBrainfilePath(options.file);

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    throw fileNotFound(filePath);
  }

  // Detect v2 per-task file architecture
  let board;
  if (isV2(filePath)) {
    board = buildBoardFromV2(filePath);
  } else {
    // Read and parse the file (v1)
    const content = fs.readFileSync(filePath, 'utf-8');
    const result = Brainfile.parseWithErrors(content);

    if (!result.board) {
      throw parseFailure(result.error);
    }

    board = result.board;
  }

  // Filter columns if specified
  const columns = options.column
    ? board.columns.filter(col => col.id === options.column || col.title === options.column)
    : board.columns;

  if (columns.length === 0) {
    logger.log(chalk.yellow(`No columns found matching: ${options.column}`));
    return { success: true, totalTasks: 0, columnsDisplayed: 0 };
  }

  // Display board title
  logger.log(chalk.bold.white(`\n${board.title || 'Brainfile Board'}\n`));

  // Display each column
  for (const column of columns) {
    // Filter tasks by tag if specified
    let tasks = column.tasks;
    if (options.tag) {
      tasks = tasks.filter(task => task.tags?.includes(options.tag!));
    }
    if (options.contract) {
      const status = options.contract.trim().toLowerCase();
      tasks = tasks.filter(task => task.contract?.status?.toLowerCase() === status);
    }

    if (tasks.length === 0 && options.tag) {
      continue;
    }
    if (tasks.length === 0 && options.contract) {
      continue;
    }

    // Column header
    logger.log(chalk.bold.cyan(`${column.title} (${tasks.length})`));
    logger.log(chalk.gray('─'.repeat(50)));

    if (tasks.length === 0) {
      logger.log(chalk.gray('  (no tasks)\n'));
      continue;
    }

    // Display tasks
    for (const task of tasks) {
      displayTask(task, logger);
    }
    logger.log('');
  }

  // Display summary
  const totalTasks = board.columns.reduce((sum, col) => sum + col.tasks.length, 0);
  logger.log(chalk.gray(`Total tasks: ${totalTasks}`));

  return { success: true, totalTasks, columnsDisplayed: columns.length };
}

function displayTask(task: Task, logger: Logger) {
  // Task ID and title
  const idStr = chalk.gray(`[${task.id}]`);
  const titleStr = chalk.white(task.title);
  logger.log(`  ${idStr} ${titleStr}`);

  // Priority
  if (task.priority) {
    const priorityColor =
      task.priority === 'high' ? chalk.red :
        task.priority === 'medium' ? chalk.yellow :
          chalk.blue;
    logger.log(`    ${chalk.gray('Priority:')} ${priorityColor(task.priority)}`);
  }

  // Tags
  if (task.tags && task.tags.length > 0) {
    const tagStr = task.tags.map(t => chalk.cyan(`#${t}`)).join(' ');
    logger.log(`    ${chalk.gray('Tags:')} ${tagStr}`);
  }

  // Template
  if (task.template) {
    logger.log(`    ${chalk.gray('Template:')} ${chalk.magenta(task.template)}`);
  }

  // Subtasks summary
  if (task.subtasks && task.subtasks.length > 0) {
    const completed = task.subtasks.filter(st => st.completed).length;
    const total = task.subtasks.length;
    const progressStr = `${completed}/${total}`;
    const progressColor = completed === total ? chalk.green : chalk.yellow;
    logger.log(`    ${chalk.gray('Subtasks:')} ${progressColor(progressStr)}`);
  }

  logger.log('');
}
