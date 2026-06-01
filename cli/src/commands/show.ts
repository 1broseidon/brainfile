import * as fs from 'fs';
import * as path from 'path';
import { Brainfile, findTaskById, readTasksDir, type Task } from '@brainfile/core';
import chalk from 'chalk';
import { defaultLogger, type Logger } from '../utils/logger';
import {
  fileNotFound,
  missingRequired,
  operationFailed,
  parseFailure,
  taskNotFound,
} from '../utils/cli-error';
import { loadArchivedTasks } from '../utils/archive';
import { resolveCliBrainfilePath } from '../utils/brainfile-path';
import { isV2, getV2Dirs, findV2Task, extractDescription, extractLog, shouldSuggestV2Migration, markV2MigrationHintShown } from '../utils/v2-detect';

export interface ShowOptions {
  file: string;
  task?: string;
  json?: boolean;
}

export interface ShowResult {
  success: true;
  taskId: string;
  archived: boolean;
  task?: Task;
  column?: string;
}

/**
 * Show full details of a single task.
 * Throws CLIError on failure instead of calling process.exit.
 */
export function showCommand(options: ShowOptions, logger: Logger = defaultLogger): ShowResult {
  if (!options.task) {
    throw missingRequired('--task', 'brainfile show --task <task-id> [--file <path>]');
  }

  const filePath = resolveCliBrainfilePath(options.file);
  if (!fs.existsSync(filePath)) {
    throw fileNotFound(filePath);
  }

  // V2 per-task file architecture
  if (isV2(filePath)) {
    return showCommandV2(options, filePath, logger);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = Brainfile.parseWithErrors(content);
  if (!parsed.board) {
    throw parseFailure(parsed.error);
  }

  const board = parsed.board;
  const taskInfo = findTaskById(board, options.task);
  if (taskInfo) {
    const childIds = board.columns
      .flatMap((column) => column.tasks)
      .filter((task) => (task as any).parentId === taskInfo.task.id)
      .map((task) => task.id);

    if (options.json) {
      const jsonOutput = {
        ...taskInfo.task,
        column: taskInfo.column.title,
        archived: false,
        ...(childIds.length > 0 ? { children: childIds } : {}),
      };
      logger.log(JSON.stringify(jsonOutput, null, 2));
    } else {
      renderTask({
        task: taskInfo.task,
        columnTitle: taskInfo.column.title,
        archived: false,
        childIds,
      }, logger);
      showV2MigrationHint(filePath, logger);
    }
    return { success: true, taskId: taskInfo.task.id, archived: false, task: taskInfo.task, column: taskInfo.column.title };
  }

  // Fallback: search the separate archive file (brainfile-archive.md)
  const { tasks: archivedTasks, archivePath, error } = loadArchivedTasks(filePath);
  if (error) {
    throw operationFailed(error);
  }

  const archivedTask = archivedTasks.find((t) => t.id === options.task);
  if (archivedTask) {
    if (options.json) {
      const jsonOutput = {
        ...archivedTask,
        column: 'Archive',
        archived: true,
      };
      logger.log(JSON.stringify(jsonOutput, null, 2));
    } else {
      renderTask({
        task: archivedTask,
        columnTitle: 'Archive',
        archived: true,
        archivePath,
      }, logger);
      showV2MigrationHint(filePath, logger);
    }
    return { success: true, taskId: archivedTask.id, archived: true, task: archivedTask, column: 'Archive' };
  }

  // Not found anywhere → throw a helpful error with available IDs
  const available: string[] = [];
  for (const col of board.columns) {
    for (const t of col.tasks) {
      available.push(`${t.id}: ${t.title}`);
    }
  }
  for (const t of archivedTasks) {
    available.push(`${t.id}: ${t.title} (archived)`);
  }
  throw taskNotFound(options.task, available);
}

function showCommandV2(options: ShowOptions, filePath: string, logger: Logger): ShowResult {
  const dirs = getV2Dirs(filePath);
  const found = findV2Task(dirs, options.task!, true);

  if (!found) {
    throw taskNotFound(options.task!);
  }

  const { doc, isLog } = found;
  const task = { ...doc.task };
  // Restore description from markdown body if not in frontmatter
  if (!task.description) {
    const desc = extractDescription(doc.body);
    if (desc) task.description = desc;
  }

  const childIds = readTasksDir(dirs.boardDir)
    .filter((childDoc) => (childDoc.task as any).parentId === task.id)
    .map((childDoc) => childDoc.task.id);

  const columnTitle = isLog ? 'Completed' : (task.column || 'unknown');
  const archived = isLog;
  const logContent = extractLog(doc.body);

  if (options.json) {
    const jsonOutput = {
      ...task,
      column: columnTitle,
      archived,
      ...(childIds.length > 0 ? { children: childIds } : {}),
      ...(task.completedAt && { completedAt: task.completedAt }),
      ...(logContent && { log: logContent }),
    };
    logger.log(JSON.stringify(jsonOutput, null, 2));
  } else {
    renderTask({ task, columnTitle, archived, childIds }, logger);
    if (task.completedAt) {
      logger.log(`${chalk.bold('Completed:')} ${chalk.white(task.completedAt)}`);
    }
    if (logContent) {
      logger.log('');
      logger.log(chalk.bold('Log:'));
      logger.log(logContent);
    }
    logger.log('');
  }

  return { success: true, taskId: task.id, archived, task, column: columnTitle };
}

function renderTask(
  input: { task: Task; columnTitle: string; archived: boolean; archivePath?: string; childIds?: string[] },
  logger: Logger
) {
  const { task, columnTitle, archived, archivePath, childIds = [] } = input;

  logger.log('');
  logger.log(`${chalk.bold('Task:')} ${chalk.cyan(task.id)}`);
  logger.log(`${chalk.bold('Title:')} ${chalk.white(task.title)}`);
  logger.log(`${chalk.bold('Column:')} ${chalk.white(columnTitle)}${archived ? chalk.gray(' (archived)') : ''}`);

  if (archived) {
    logger.log(`${chalk.bold('Archived:')} ${chalk.yellow('yes')}${archivePath ? chalk.gray(` (${path.basename(archivePath)})`) : ''}`);
  }

  if (task.priority) {
    logger.log(`${chalk.bold('Priority:')} ${formatPriority(task.priority)}`);
  }

  if (task.tags && task.tags.length > 0) {
    const tagStr = task.tags.map((t) => chalk.cyan(`#${t}`)).join(' ');
    logger.log(`${chalk.bold('Tags:')} ${tagStr}`);
  }

  if (task.assignee) {
    const assignee = task.assignee.startsWith('@') ? task.assignee : `@${task.assignee}`;
    logger.log(`${chalk.bold('Assignee:')} ${chalk.magenta(assignee)}`);
  }

  if ((task as any).dueDate) {
    logger.log(`${chalk.bold('Due:')} ${chalk.white(String((task as any).dueDate))}`);
  }

  if (task.template) {
    logger.log(`${chalk.bold('Template:')} ${chalk.magenta(task.template)}`);
  }

  if (task.description && task.description.trim().length > 0) {
    logger.log('');
    logger.log(chalk.bold('Description:'));
    logger.log(task.description.trimEnd());
  }

  if (task.subtasks && task.subtasks.length > 0) {
    const completed = task.subtasks.filter((st) => st.completed).length;
    const total = task.subtasks.length;
    const progressColor = completed === total ? chalk.green : chalk.yellow;
    logger.log('');
    logger.log(`${chalk.bold('Subtasks:')} (${progressColor(`${completed}/${total}`)} completed)`);
    for (const st of task.subtasks) {
      const mark = st.completed ? chalk.green('✓') : chalk.gray('○');
      logger.log(`  ${mark} ${st.title}`);
    }
  }

  if (task.relatedFiles && task.relatedFiles.length > 0) {
    logger.log('');
    logger.log(chalk.bold('Related Files:'));
    for (const f of task.relatedFiles) {
      logger.log(`  - ${chalk.gray(f)}`);
    }
  }

  if (childIds.length > 0) {
    logger.log('');
    logger.log(`${chalk.bold('Children:')} ${chalk.white(childIds.join(', '))}`);
  }

  const contract = (task as any).contract as any | undefined;
  if (contract) {
    logger.log('');
    logger.log(chalk.bold('Contract:'));
    if (contract.status) {
      logger.log(`  ${chalk.gray('Status:')} ${chalk.white(String(contract.status))}`);
    }
    if (Array.isArray(contract.deliverables) && contract.deliverables.length > 0) {
      logger.log(`  ${chalk.gray('Deliverables:')} ${chalk.white(String(contract.deliverables.length))}`);
      for (const d of contract.deliverables) {
        const type = d?.type ? String(d.type) : 'deliverable';
        const p = d?.path ? String(d.path) : '';
        const desc = d?.description ? String(d.description) : '';
        logger.log(`    - ${chalk.cyan(type)} ${chalk.gray(p)}${desc ? chalk.gray(` — ${desc}`) : ''}`);
      }
    }
  }

  logger.log('');
}

function formatPriority(priority: string): string {
  const p = priority.toLowerCase();
  const color =
    p === 'critical' ? chalk.redBright.bold :
      p === 'high' ? chalk.red :
        p === 'medium' ? chalk.yellow :
          chalk.blue;
  return color(priority);
}

/**
 * Show one-time migration hint after legacy command output.
 */
function showV2MigrationHint(filePath: string, logger: Logger): void {
  if (shouldSuggestV2Migration(filePath)) {
    logger.log(
      chalk.yellow('⚠ Legacy brainfile layout detected. ') +
      chalk.gray('Run ') +
      chalk.cyan('brainfile migrate') +
      chalk.gray(' to upgrade to the v2 board/logs structure.')
    );
    markV2MigrationHintShown(filePath);
  }
}
