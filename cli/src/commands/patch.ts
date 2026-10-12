import * as path from 'path';
import { patchTaskFile, readTasksDir, type TaskFilePatch } from '@brainfile/core';
import chalk from 'chalk';
import { type Logger, defaultLogger } from '../utils/logger';
import { missingRequired, operationFailed, taskNotFound, validationError } from '../utils/cli-error';
import { resolveCliBrainfilePath } from '../utils/brainfile-path';
import { assertV2Brainfile } from '../utils/v2-only';
import { getV2Dirs, findV2Task } from '../utils/v2-detect';

export interface PatchOptions {
  file: string;
  task?: string;
  title?: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical' | 'none';
  tags?: string;
  assignee?: string;
  dueDate?: string;
  /** New parent ID (parentId). */
  parent?: string;
  /** Comma-separated task IDs this task depends on; replaces the list. */
  dependsOn?: string;
  clearTags?: boolean;
  clearAssignee?: boolean;
  clearDueDate?: boolean;
  clearPriority?: boolean;
  clearParent?: boolean;
  clearDependsOn?: boolean;
}

export interface PatchResult {
  success: true;
  taskId: string;
  changes: string[];
}

export const PATCH_COMMAND_HELP = `
Examples:
  brainfile patch -t task-1 -p critical --assignee codex
  brainfile patch -t task-1 --tags perf,cache        # replaces the tag list
  brainfile patch -t spec-3 --parent epic-2          # move it under an epic
  brainfile patch -t task-7 --depends-on task-5,task-6
  brainfile patch -t task-7 --clear-parent --clear-depends-on
`.trimEnd();

const FIELD_HELP = [
  'At least one field to update is required.',
  'Options: --title, --description, --priority, --tags, --assignee, --due-date, --parent, --depends-on',
  'Clear:   --clear-tags, --clear-assignee, --clear-due-date, --clear-priority, --clear-parent, --clear-depends-on',
].join('\n');

function isUnsafeTaskId(taskId: string): boolean {
  const trimmed = taskId.trim();
  if (!trimmed || trimmed !== taskId) {
    return true;
  }

  if (taskId === '.' || taskId === '..') {
    return true;
  }

  if (path.isAbsolute(taskId)) {
    return true;
  }

  return /[\\/]/.test(taskId);
}

function splitList(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

/**
 * Partial update of a task's fields.
 * Throws CLIError on failure instead of calling process.exit.
 */
export function patchCommand(options: PatchOptions, logger: Logger = defaultLogger): PatchResult {
  if (!options.task) {
    throw missingRequired('--task', 'brainfile patch --task <task-id> [field options]');
  }

  const hasUpdates = Boolean(
    options.title || options.description || options.priority ||
    options.tags || options.assignee || options.dueDate ||
    options.parent || options.dependsOn !== undefined ||
    options.clearTags || options.clearAssignee || options.clearDueDate || options.clearPriority ||
    options.clearParent || options.clearDependsOn,
  );

  if (!hasUpdates) {
    throw validationError(FIELD_HELP);
  }

  if (options.parent && options.clearParent) {
    throw validationError('Pass --parent or --clear-parent, not both.');
  }
  if (options.dependsOn !== undefined && options.clearDependsOn) {
    throw validationError('Pass --depends-on or --clear-depends-on, not both.');
  }

  const filePath = resolveCliBrainfilePath(options.file);
  assertV2Brainfile(filePath);

  if (isUnsafeTaskId(options.task)) {
    throw operationFailed(`Invalid task ID: ${options.task}`);
  }

  const dirs = getV2Dirs(filePath);
  const found = findV2Task(dirs, options.task, false);
  if (!found || found.isLog) {
    throw taskNotFound(options.task);
  }

  const patch: TaskFilePatch = {};
  const changes: string[] = [];

  if (options.title) {
    patch.title = options.title;
    changes.push(`title → "${options.title}"`);
  }
  if (options.description) {
    patch.description = options.description;
    changes.push(`description → "${options.description.substring(0, 30)}${options.description.length > 30 ? '...' : ''}"`);
  }
  if (options.priority) {
    if (options.priority === 'none' || options.clearPriority) {
      patch.priority = null;
      changes.push('priority → removed');
    } else {
      patch.priority = options.priority;
      changes.push(`priority → ${options.priority}`);
    }
  }
  if (options.clearPriority && !options.priority) {
    patch.priority = null;
    changes.push('priority → removed');
  }
  if (options.tags) {
    patch.tags = splitList(options.tags);
    changes.push(`tags → [${patch.tags.join(', ')}]`);
  }
  if (options.clearTags) {
    patch.tags = null;
    changes.push('tags → removed');
  }
  if (options.assignee) {
    patch.assignee = options.assignee;
    changes.push(`assignee → ${options.assignee}`);
  }
  if (options.clearAssignee) {
    patch.assignee = null;
    changes.push('assignee → removed');
  }
  if (options.dueDate) {
    patch.dueDate = options.dueDate;
    changes.push(`dueDate → ${options.dueDate}`);
  }
  if (options.clearDueDate) {
    patch.dueDate = null;
    changes.push('dueDate → removed');
  }

  const taskId = options.task;
  const knownIds = new Set<string>([
    ...readTasksDir(dirs.boardDir).map((doc) => doc.task.id),
    ...readTasksDir(dirs.logsDir).map((doc) => doc.task.id),
  ]);

  if (options.parent) {
    const parentId = options.parent.trim();
    if (parentId === taskId) {
      throw validationError(`${taskId} cannot be its own parent.`);
    }
    if (!knownIds.has(parentId)) {
      logger.warn(chalk.yellow(`Warning: parent ${parentId} not found on this board. Setting it anyway.`));
    }
    patch.parentId = parentId;
    changes.push(`parentId → ${parentId}`);
  }
  if (options.clearParent) {
    patch.parentId = null;
    changes.push('parentId → removed');
  }

  if (options.dependsOn !== undefined) {
    const deps = splitList(options.dependsOn);
    if (deps.includes(taskId)) {
      throw validationError(`${taskId} cannot depend on itself.`);
    }
    // A related board's task (alias:id, spec-10) is not checked here.
    const missing = deps.filter((id) => !id.includes(':') && !knownIds.has(id));
    if (missing.length > 0) {
      logger.warn(chalk.yellow(`Warning: not found on this board: ${missing.join(', ')}. Setting dependsOn anyway.`));
    }
    patch.dependsOn = deps.length > 0 ? deps : null;
    changes.push(deps.length > 0 ? `dependsOn → [${deps.join(', ')}]` : 'dependsOn → removed');
  }
  if (options.clearDependsOn) {
    patch.dependsOn = null;
    changes.push('dependsOn → removed');
  }

  const result = patchTaskFile(found.filePath, patch);
  if (!result.success) {
    throw operationFailed(result.error || `Failed to update task: ${taskId}`);
  }

  logger.log(chalk.green('Task updated successfully!'));
  logger.log('');
  logger.log(chalk.gray(`  Task: ${taskId}`));
  for (const change of changes) {
    logger.log(chalk.gray(`  ${change}`));
  }

  return { success: true, taskId, changes };
}
