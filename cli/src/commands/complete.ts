/**
 * Complete command - move a task from board/ to logs/, set completedAt.
 *
 * In v2 per-task file architecture:
 * - Moves .brainfile/board/task-X.md to .brainfile/logs/task-X.md
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
import { Brainfile, findTaskById, moveTask, findCompletionColumn } from '@brainfile/core';
import { type Logger, defaultLogger } from '../utils/logger';
import { fileNotFound, missingRequired, operationFailed, taskNotFound } from '../utils/cli-error';
import { resolveCliBrainfilePath } from '../utils/brainfile-path';
import { writeTaskFile, readTasksDir, taskFileName, type Task } from '@brainfile/core';
import { isV2, getV2Dirs, findV2Task } from '../utils/v2-detect';

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

type ChildTaskStateStatus = 'active' | 'completed' | 'missing';

interface ChildTaskState {
  id: string;
  title: string;
  status: ChildTaskStateStatus;
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

function appendBodySection(body: string, section: string): string {
  const trimmed = body.trimEnd();
  if (!trimmed) {
    return `${section}\n`;
  }
  return `${trimmed}\n\n${section}\n`;
}

function extractEpicChildTaskIds(task: Task): string[] {
  const rawSubtasks = (task as { subtasks?: unknown }).subtasks;
  if (!Array.isArray(rawSubtasks)) {
    return [];
  }

  const childIds: string[] = [];
  for (const subtask of rawSubtasks) {
    if (typeof subtask === 'string' && subtask.trim() !== '') {
      childIds.push(subtask.trim());
      continue;
    }
    if (subtask && typeof subtask === 'object') {
      const candidateId = (subtask as { id?: unknown }).id;
      if (typeof candidateId === 'string' && candidateId.trim() !== '') {
        childIds.push(candidateId.trim());
      }
    }
  }

  return [...new Set(childIds)];
}

function resolveChildTaskStates(
  childIds: string[],
  boardDir: string,
  logsDir: string,
): ChildTaskState[] {
  if (childIds.length === 0) {
    return [];
  }

  const activeDocs = readTasksDir(boardDir);
  const completedDocs = readTasksDir(logsDir);

  const activeById = new Map<string, string>();
  for (const doc of activeDocs) {
    if (!activeById.has(doc.task.id)) {
      activeById.set(doc.task.id, doc.task.title);
    }
  }

  const completedById = new Map<string, string>();
  for (const doc of completedDocs) {
    if (!completedById.has(doc.task.id)) {
      completedById.set(doc.task.id, doc.task.title);
    }
  }

  return childIds.map((childId) => {
    const activeTitle = activeById.get(childId);
    if (activeTitle) {
      return { id: childId, title: activeTitle, status: 'active' as const };
    }

    const completedTitle = completedById.get(childId);
    if (completedTitle) {
      return { id: childId, title: completedTitle, status: 'completed' as const };
    }

    return { id: childId, title: 'Unknown task reference', status: 'missing' as const };
  });
}

function resolveParentLinkedChildStates(epicId: string, boardDir: string, logsDir: string): ChildTaskState[] {
  const activeChildren = readTasksDir(boardDir)
    .filter((doc) => (doc.task as any).parentId === epicId)
    .map((doc) => ({ id: doc.task.id, title: doc.task.title, status: 'active' as const }));

  const completedChildren = readTasksDir(logsDir)
    .filter((doc) => (doc.task as any).parentId === epicId)
    .map((doc) => ({ id: doc.task.id, title: doc.task.title, status: 'completed' as const }));

  return [...activeChildren, ...completedChildren];
}

function resolveEpicChildStates(task: Task, boardDir: string, logsDir: string): ChildTaskState[] {
  const linkedByParentId = resolveParentLinkedChildStates(task.id, boardDir, logsDir);
  if (linkedByParentId.length > 0) {
    return linkedByParentId;
  }

  const childIds = extractEpicChildTaskIds(task);
  return resolveChildTaskStates(childIds, boardDir, logsDir);
}

function buildChildTasksSection(childTasks: ChildTaskState[]): string {
  if (childTasks.length === 0) {
    return '## Child Tasks\nNo child tasks recorded.';
  }

  const totalChildren = childTasks.length;
  const completedChildren = childTasks.filter((child) => child.status === 'completed').length;

  const lines: string[] = [
    '## Child Tasks',
    `Summary: ${completedChildren}/${totalChildren} children completed.`,
  ];

  for (const child of childTasks) {
    const statusLabel =
      child.status === 'completed'
        ? 'completed'
        : child.status === 'active'
          ? 'incomplete'
          : 'missing';

    lines.push(`- ${child.id}: ${child.title} (${statusLabel})`);
  }

  return lines.join('\n');
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
  if (!fs.existsSync(filePath)) {
    throw fileNotFound(filePath);
  }

  if (isV2(filePath)) {
    return completeV2(filePath, options.task, options.force === true, logger);
  }

  const completedAt = new Date().toISOString();
  return completeV1(filePath, options.task, completedAt, logger);
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
  const completedAt = new Date().toISOString();

  let completedBody = doc.body;
  if (task.type === 'epic') {
    const childStates = resolveEpicChildStates(task, dirs.boardDir, dirs.logsDir);
    const incompleteChildren = childStates.filter((child) => child.status === 'active');

    if (incompleteChildren.length > 0 && !force) {
      logger.warn(chalk.yellow(`Epic ${taskId} has incomplete child tasks:`));
      for (const child of incompleteChildren) {
        logger.warn(chalk.yellow(`  - ${child.id}: ${child.title}`));
      }
      logger.warn(chalk.yellow('Aborting completion. Re-run with --force to override.'));
      throw operationFailed(`Epic ${taskId} has ${incompleteChildren.length} incomplete child task(s). Use --force to override.`);
    }

    if (incompleteChildren.length > 0 && force) {
      logger.warn(
        chalk.yellow(
          `Completing epic ${taskId} with --force despite ${incompleteChildren.length} incomplete child task(s).`
        )
      );
    }

    const childTasksSection = buildChildTasksSection(childStates);
    completedBody = appendBodySection(doc.body, childTasksSection);
  }

  // Create completed task: remove column/position, add completedAt
  const completedTask = { ...task, completedAt, updatedAt: completedAt };
  delete completedTask.column;
  delete completedTask.position;

  // Ensure logs directory exists
  fs.mkdirSync(dirs.logsDir, { recursive: true });

  // Write to logs directory
  const logPath = path.join(dirs.logsDir, taskFileName(taskId));
  writeTaskFile(logPath, completedTask, completedBody);

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
