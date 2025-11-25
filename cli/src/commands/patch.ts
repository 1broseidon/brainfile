import * as fs from 'fs';
import * as path from 'path';
import { Brainfile, findTaskById, patchTask, type TaskPatch } from '@brainfile/core';
import chalk from 'chalk';

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

export function patchCommand(options: PatchOptions) {
  try {
    // Validate required options
    if (!options.task) {
      console.error(chalk.red('Error: --task is required'));
      console.log(chalk.gray('Usage: brainfile patch --task <task-id> [field options]'));
      process.exit(1);
    }

    // Check if any fields are being updated
    const hasUpdates = options.title || options.description || options.priority ||
      options.tags || options.assignee || options.dueDate ||
      options.clearTags || options.clearAssignee || options.clearDueDate || options.clearPriority;

    if (!hasUpdates) {
      console.error(chalk.red('Error: At least one field to update is required'));
      console.log(chalk.gray('Options: --title, --description, --priority, --tags, --assignee, --due-date'));
      console.log(chalk.gray('Clear:   --clear-tags, --clear-assignee, --clear-due-date, --clear-priority'));
      process.exit(1);
    }

    // Resolve file path
    const filePath = path.resolve(options.file);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.error(chalk.red(`Error: File not found: ${filePath}`));
      process.exit(1);
    }

    // Read and parse the file
    const content = fs.readFileSync(filePath, 'utf-8');
    const result = Brainfile.parseWithErrors(content);

    if (!result.board) {
      console.error(chalk.red('Error: Failed to parse brainfile'));
      if (result.error) {
        console.error(chalk.red(result.error));
      }
      process.exit(1);
    }

    let board = result.board;

    // Find the task
    const taskInfo = findTaskById(board, options.task);
    if (!taskInfo) {
      console.error(chalk.red(`Error: Task not found: ${options.task}`));
      console.log(chalk.gray('\nAvailable tasks:'));
      board.columns.forEach((col) => {
        col.tasks.forEach((task) => {
          console.log(chalk.gray(`  - ${task.id}: ${task.title}`));
        });
      });
      process.exit(1);
    }

    // Build TaskPatch with all provided fields
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

    // Patch task using core operation
    const patchResult = patchTask(board, options.task, patch);

    if (!patchResult.success) {
      console.error(chalk.red(`Error: ${patchResult.error}`));
      process.exit(1);
    }

    // Serialize and write back
    const updatedContent = Brainfile.serialize(patchResult.board!);
    fs.writeFileSync(filePath, updatedContent, 'utf-8');

    // Success message
    console.log(chalk.green('✓ Task updated successfully!'));
    console.log('');
    console.log(chalk.gray(`  Task: ${options.task}`));
    changes.forEach(change => {
      console.log(chalk.gray(`  ${change}`));
    });

  } catch (error) {
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
