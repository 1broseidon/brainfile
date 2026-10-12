import { Task } from '@brainfile/core';
import { describeRelatedBoard, relatedBoards, type RelatedBoards } from '@brainfile/core/repo';
import chalk from 'chalk';
import { type Logger, defaultLogger } from '../utils/logger';
import { validationError } from '../utils/cli-error';
import { resolveCliBrainfilePath } from '../utils/brainfile-path';
import { assertV2Brainfile } from '../utils/v2-only';
import { buildBoardFromV2, shouldSuggestV2Migration, markV2MigrationHintShown } from '../utils/v2-detect';

export interface ListOptions {
  file: string;
  column?: string;
  tag?: string;
  parent?: string;
  contract?: string;
  /** `--related` (true): open tasks on related boards this board depends on. `--related all`: every one. */
  related?: boolean | string;
}

export interface ListResult {
  success: true;
  totalTasks: number;
  columnsDisplayed: number;
}

interface TaskExtras {
  /** Shown in place of the ID: `alias:id` for a task on a related board. */
  ref?: string;
  column?: string;
  neededBy?: string[];
  blockedBy?: string[];
}

export const LIST_COMMAND_HELP = `
Examples:
  brainfile list
  brainfile list --column todo
  brainfile list --tag urgent
  brainfile list --parent epic-1
  brainfile list --contract ready
  brainfile list --related          # open tasks on related boards that this board depends on
  brainfile list --related all      # every open task on every related board

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
  assertV2Brainfile(filePath);

  if (options.related !== undefined && options.related !== false) {
    return listRelated(filePath, options.related, logger);
  }

  const board = buildBoardFromV2(filePath);
  const rel = relatedBoards(filePath);

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
    if (options.parent) {
      tasks = tasks.filter(task => (task as any).parentId === options.parent);
    }
    if (options.contract) {
      const status = options.contract.trim().toLowerCase();
      tasks = tasks.filter(task => task.contract?.status?.toLowerCase() === status);
    }

    if (tasks.length === 0 && (options.tag || options.parent || options.contract)) {
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
      displayTask(task, logger, { blockedBy: blockedBy(rel, task) });
    }
    logger.log('');
  }

  // Display summary
  const totalTasks = board.columns.reduce((sum, col) => sum + col.tasks.length, 0);
  logger.log(chalk.gray(`Total tasks: ${totalTasks}`));

  // Show one-time migration hint for legacy/mixed layouts
  if (shouldSuggestV2Migration(filePath)) {
    logger.log('');
    logger.log(
      chalk.yellow('⚠ Legacy brainfile layout detected. ') +
      chalk.gray('Run ') +
      chalk.cyan('brainfile migrate') +
      chalk.gray(' to upgrade to the v2 board/logs structure.')
    );
    markV2MigrationHintShown(filePath);
  }

  return { success: true, totalTasks, columnsDisplayed: columns.length };
}

/** Cross-repo dependencies of `task` that are not completed (spec-10). */
function blockedBy(rel: RelatedBoards, task: Task): string[] | undefined {
  if (!Array.isArray(task.dependsOn) || task.dependsOn.length === 0) return undefined;
  const refs = rel.blockers(task).map((b) => b.ref);
  return refs.length > 0 ? refs : undefined;
}

/**
 * `list --related [all]`: open tasks on the boards named under `related:`.
 * Never checks a related board out, fetches it or writes to it.
 */
function listRelated(filePath: string, scope: boolean | string, logger: Logger): ListResult {
  if (scope !== true && scope !== 'all') {
    throw validationError(`--related takes no value or 'all' (got '${scope}')`);
  }
  const mode = scope === 'all' ? 'all' : 'depends';
  const rel = relatedBoards(filePath);
  const title = buildBoardFromV2(filePath).title || 'Brainfile Board';

  logger.log(chalk.bold.white(`\n${title} — related boards\n`));

  if (rel.aliases.length === 0) {
    logger.log(chalk.gray('No related boards. Name them under related: in brainfile.md.\n'));
    return { success: true, totalTasks: 0, columnsDisplayed: 0 };
  }

  const listings = rel.openTasks(mode);
  if (listings.length === 0) {
    logger.log(chalk.gray('No task on this board depends on a related board.'));
    logger.log(chalk.gray('Run brainfile list --related all for every open task on them.\n'));
    return { success: true, totalTasks: 0, columnsDisplayed: 0 };
  }

  let total = 0;
  for (const { board, tasks, notFound, neededBy } of listings) {
    const count = board.status === 'found' ? ` (${tasks.length})` : '';
    const name = board.status === 'found' && board.title ? `${describeRelatedBoard(board)} · ${board.title}` : describeRelatedBoard(board);
    logger.log(board.status === 'found' ? chalk.bold.cyan(`${name}${count}`) : chalk.bold.yellow(name));
    logger.log(chalk.gray('─'.repeat(50)));

    if (board.status !== 'found') {
      for (const [id, by] of Object.entries(neededBy)) {
        logger.log(`  ${chalk.gray(`[${board.alias}:${id}]`)} ${chalk.gray(`needed by ${by.join(', ')}`)}`);
      }
      logger.log('');
      continue;
    }

    if (tasks.length === 0 && notFound.length === 0) {
      logger.log(chalk.gray(mode === 'all' ? '  (no open tasks)\n' : '  (nothing open that this board depends on)\n'));
      continue;
    }

    const columnTitles = new Map(board.columns.map((c) => [c.id, c.title]));
    for (const task of tasks) {
      displayTask(task, logger, {
        ref: `${board.alias}:${task.id}`,
        column: columnTitles.get(task.column ?? '') ?? task.column,
        neededBy: neededBy[task.id],
      });
    }
    for (const id of notFound) {
      logger.log(`  ${chalk.gray(`[${board.alias}:${id}]`)} ${chalk.yellow('not on that board')}`);
      logger.log('');
    }
    total += tasks.length;
  }

  logger.log(chalk.gray(`Open on related boards: ${total}`));
  return { success: true, totalTasks: total, columnsDisplayed: listings.length };
}

function displayTask(task: Task, logger: Logger, extras: TaskExtras = {}) {
  // Task ID and title, with optional type badge for non-task types
  const idStr = chalk.gray(`[${extras.ref ?? task.id}]`);
  const typeBadge = task.type && task.type !== 'task' ? chalk.magenta(`[${task.type}]`) + ' ' : '';
  const titleStr = chalk.white(task.title);
  logger.log(`  ${idStr} ${typeBadge}${titleStr}`);

  if (extras.column) {
    logger.log(`    ${chalk.gray('Column:')} ${chalk.white(extras.column)}`);
  }

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

  const parentId = (task as any).parentId as string | undefined;
  if (parentId) {
    logger.log(`    ${chalk.gray('Parent:')} ${chalk.white(parentId)}`);
  }

  // Subtasks summary
  if (task.subtasks && task.subtasks.length > 0) {
    const completed = task.subtasks.filter(st => st.completed).length;
    const total = task.subtasks.length;
    const progressStr = `${completed}/${total}`;
    const progressColor = completed === total ? chalk.green : chalk.yellow;
    logger.log(`    ${chalk.gray('Subtasks:')} ${progressColor(progressStr)}`);
  }

  if (extras.neededBy && extras.neededBy.length > 0) {
    logger.log(`    ${chalk.gray('Needed by:')} ${chalk.white(extras.neededBy.join(', '))}`);
  }

  if (extras.blockedBy) {
    logger.log(`    ${chalk.gray('Blocked by:')} ${chalk.yellow(extras.blockedBy.join(', '))}`);
  }

  logger.log('');
}
