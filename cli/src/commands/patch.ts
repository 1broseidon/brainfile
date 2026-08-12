import * as path from 'path';
import { type TaskPatch, type TaskFilePatch } from '@brainfile/core';
import chalk from 'chalk';
import {
  missingRequiredError,
  validationError,
  operationError,
  handleError,
} from '../utils/errorHandler';
import { resolveCliBrainfilePath } from '../utils/brainfile-path';
import { assertV2Brainfile } from '../utils/v2-only';
import { patchTaskFile } from '@brainfile/core';
import { getV2Dirs, findV2Task } from '../utils/v2-detect';

interface PatchOptions {
  file: string;
  task: string;
  title?: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical' | 'none';
  tags?: string;
  assignee?: string;
  dueDate?: string;
  clearTags?: boolean;
  clearAssignee?: boolean;
  clearDueDate?: boolean;
  clearPriority?: boolean;
}

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

export function patchCommand(options: PatchOptions) {
  try {
    // Validate required options
    if (!options.task) {
      missingRequiredError('--task', 'brainfile patch --task <task-id> [field options]');
    }

    // Check if any fields are being updated
    const hasUpdates = options.title || options.description || options.priority ||
      options.tags || options.assignee || options.dueDate ||
      options.clearTags || options.clearAssignee || options.clearDueDate || options.clearPriority;

    if (!hasUpdates) {
      validationError('At least one field to update is required.\nOptions: --title, --description, --priority, --tags, --assignee, --due-date\nClear:   --clear-tags, --clear-assignee, --clear-due-date, --clear-priority');
    }

    // Resolve file path
    const filePath = resolveCliBrainfilePath(options.file);
    assertV2Brainfile(filePath);

    // Build patch and changes for display
    const patch: TaskPatch = {};
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
      patch.tags = options.tags.split(',').map(t => t.trim());
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

    if (isUnsafeTaskId(options.task)) {
      operationError(`Invalid task ID: ${options.task}`);
    }

    const dirs = getV2Dirs(filePath);
    const found = findV2Task(dirs, options.task, false);
    if (!found || found.isLog) {
      operationError(`Task not found: ${options.task}`);
    }

    const { filePath: taskPath } = found;

    const result = patchTaskFile(taskPath, {
      title: patch.title,
      description: patch.description,
      priority: patch.priority as TaskFilePatch['priority'],
      tags: patch.tags,
      assignee: patch.assignee,
      dueDate: patch.dueDate,
    });
    if (!result.success) {
      operationError(result.error || `Failed to update task: ${options.task}`);
    }

    console.log(chalk.green('Task updated successfully!'));
    console.log('');
    console.log(chalk.gray(`  Task: ${options.task}`));
    changes.forEach(change => {
      console.log(chalk.gray(`  ${change}`));
    });

  } catch (error) {
    handleError(error);
  }
}
