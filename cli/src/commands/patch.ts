import * as path from 'path';
import { patchTaskFile, type TaskFilePatch } from '@brainfile/core';
import chalk from 'chalk';
import { type Logger, defaultLogger } from '../utils/logger';
import { missingRequired, operationFailed, taskNotFound, validationError } from '../utils/cli-error';
import { resolveCliBrainfilePath } from '../utils/brainfile-path';
import { assertV2Brainfile } from '../utils/v2-only';
import { getV2Dirs, findV2Task } from '../utils/v2-detect';
import { checkLinks, readBoardGraph, splitIds } from '../utils/graph';

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
  /** Comma-separated decision IDs this work rests on; replaces the list. */
  decisions?: string;
  clearTags?: boolean;
  clearAssignee?: boolean;
  clearDueDate?: boolean;
  clearPriority?: boolean;
  clearParent?: boolean;
  clearDependsOn?: boolean;
  clearDecisions?: boolean;
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
  brainfile patch -t task-7 --decisions decision-2   # the decisions it rests on
  brainfile patch -t task-7 --clear-parent --clear-depends-on

An off-pattern parent (an epic under a task, anything under a decision) is a
warning, and refused on a strict board. A loop is always refused.
`.trimEnd();

const FIELD_HELP = [
  'At least one field to update is required.',
  'Options: --title, --description, --priority, --tags, --assignee, --due-date, --parent, --depends-on, --decisions',
  'Clear:   --clear-tags, --clear-assignee, --clear-due-date, --clear-priority, --clear-parent, --clear-depends-on, --clear-decisions',
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
    options.parent || options.dependsOn !== undefined || options.decisions !== undefined ||
    options.clearTags || options.clearAssignee || options.clearDueDate || options.clearPriority ||
    options.clearParent || options.clearDependsOn || options.clearDecisions,
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
  if (options.decisions !== undefined && options.clearDecisions) {
    throw validationError('Pass --decisions or --clear-decisions, not both.');
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
    patch.tags = splitIds(options.tags);
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

  if (options.parent) {
    const parentId = options.parent.trim();
    patch.parentId = parentId;
    changes.push(`parentId → ${parentId}`);
  }
  if (options.clearParent) {
    patch.parentId = null;
    changes.push('parentId → removed');
  }

  if (options.dependsOn !== undefined) {
    const deps = splitIds(options.dependsOn);
    patch.dependsOn = deps.length > 0 ? deps : null;
    changes.push(deps.length > 0 ? `dependsOn → [${deps.join(', ')}]` : 'dependsOn → removed');
  }
  if (options.clearDependsOn) {
    patch.dependsOn = null;
    changes.push('dependsOn → removed');
  }

  if (options.decisions !== undefined) {
    const decisions = splitIds(options.decisions);
    patch.decisions = decisions.length > 0 ? decisions : null;
    changes.push(decisions.length > 0 ? `decisions → [${decisions.join(', ')}]` : 'decisions → removed');
  }
  if (options.clearDecisions) {
    patch.decisions = null;
    changes.push('decisions → removed');
  }

  // Links are checked against the board as it stands (spec-12): loops and
  // self links are refused; off-pattern links warn, and a strict board refuses
  // them; an ID that is not on the board is set anyway, with a warning.
  if (typeof patch.parentId === 'string' || Array.isArray(patch.dependsOn) || Array.isArray(patch.decisions)) {
    checkLinks(readBoardGraph(filePath), {
      id: taskId,
      ...(typeof patch.parentId === 'string' && { parentId: patch.parentId }),
      ...(Array.isArray(patch.dependsOn) && { dependsOn: patch.dependsOn }),
      ...(Array.isArray(patch.decisions) && { decisions: patch.decisions }),
    }, logger);
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
