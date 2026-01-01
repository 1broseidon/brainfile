import * as fs from 'fs';
import * as path from 'path';
import { Brainfile, findTaskById, type Task } from '@brainfile/core';
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

  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = Brainfile.parseWithErrors(content);
  if (!parsed.board) {
    throw parseFailure(parsed.error);
  }

  const board = parsed.board;
  const taskInfo = findTaskById(board, options.task);
  if (taskInfo) {
    if (options.json) {
      const jsonOutput = {
        ...taskInfo.task,
        column: taskInfo.column.title,
        archived: false,
      };
      logger.log(JSON.stringify(jsonOutput, null, 2));
    } else {
      renderTask({
        task: taskInfo.task,
        columnTitle: taskInfo.column.title,
        archived: false,
      }, logger);
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

function renderTask(
  input: { task: Task; columnTitle: string; archived: boolean; archivePath?: string },
  logger: Logger
) {
  const { task, columnTitle, archived, archivePath } = input;

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
