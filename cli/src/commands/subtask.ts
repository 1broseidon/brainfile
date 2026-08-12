import {
  writeTaskFile,
  generateNextSubtaskId,
  type Subtask,
} from '@brainfile/core';
import chalk from 'chalk';
import {
  subtaskNotFoundError,
  missingRequiredError,
  validationError,
  handleError,
} from '../utils/errorHandler';
import { resolveCliBrainfilePath } from '../utils/brainfile-path';
import { assertV2Brainfile } from '../utils/v2-only';
import { getV2Dirs, findV2Task } from '../utils/v2-detect';

interface SubtaskOptions {
  file: string;
  task: string;
  add?: string;
  delete?: string;
  update?: string;
  toggle?: string;
  title?: string;
}

export function subtaskCommand(options: SubtaskOptions) {
  try {
    // Validate required task option
    if (!options.task) {
      missingRequiredError('--task', 'brainfile subtask --task <task-id> <operation>\nOperations:\n  --add <title>              Add a new subtask\n  --delete <subtask-id>      Delete a subtask\n  --update <subtask-id> --title <new-title>  Update subtask title\n  --toggle <subtask-id>      Toggle subtask completion');
    }

    // Check for exactly one operation
    const operations = [options.add, options.delete, options.update, options.toggle].filter(Boolean);
    if (operations.length === 0) {
      validationError('One operation is required (--add, --delete, --update, or --toggle)');
    }
    if (operations.length > 1) {
      validationError('Only one operation can be performed at a time');
    }

    // Resolve file path
    const filePath = resolveCliBrainfilePath(options.file);
    assertV2Brainfile(filePath);

    subtaskCommandV2(options, filePath);

  } catch (error) {
    handleError(error);
  }
}

/**
 * V2 subtask operations - reads/writes task files directly.
 */
function subtaskCommandV2(options: SubtaskOptions, brainfilePath: string) {
  const dirs = getV2Dirs(brainfilePath);
  const found = findV2Task(dirs, options.task, true);

  if (!found) {
    console.error(chalk.red(`Error: Task ${options.task} not found`));
    process.exit(1);
  }

  const { doc, filePath } = found;
  const task = doc.task;

  // Handle add
  if (options.add) {
    const existingIds = (task.subtasks || []).map(st => st.id);
    const newId = generateNextSubtaskId(task.id, existingIds);
    const newSubtask: Subtask = { id: newId, title: options.add, completed: false };
    task.subtasks = [...(task.subtasks || []), newSubtask];
    writeTaskFile(filePath, task, doc.body);
    console.log(chalk.green(`Subtask added: ${newId} - ${options.add}`));
    return;
  }

  // Shared subtask lookup for delete/update/toggle
  if (!task.subtasks || task.subtasks.length === 0) {
    validationError(`Task ${options.task} has no subtasks`);
  }

  // Handle delete
  if (options.delete) {
    const subtask = task.subtasks!.find(st => st.id === options.delete);
    if (!subtask) {
      subtaskNotFoundError(options.delete!, task);
    }
    task.subtasks = task.subtasks!.filter(st => st.id !== options.delete);
    writeTaskFile(filePath, task, doc.body);
    console.log(chalk.green(`Subtask deleted: ${options.delete} - ${subtask!.title}`));
    return;
  }

  // Handle update
  if (options.update) {
    if (!options.title) {
      missingRequiredError('--title', 'brainfile subtask --task <task-id> --update <subtask-id> --title "New title"');
    }
    const subtask = task.subtasks!.find(st => st.id === options.update);
    if (!subtask) {
      subtaskNotFoundError(options.update!, task);
    }
    const oldTitle = subtask!.title;
    task.subtasks = task.subtasks!.map(st =>
      st.id === options.update ? { ...st, title: options.title! } : st
    );
    writeTaskFile(filePath, task, doc.body);
    console.log(chalk.green(`Subtask updated: ${options.update}\n  "${oldTitle}" → "${options.title}"`));
    return;
  }

  // Handle toggle
  if (options.toggle) {
    const subtask = task.subtasks!.find(st => st.id === options.toggle);
    if (!subtask) {
      subtaskNotFoundError(options.toggle!, task);
    }
    const newStatus = !subtask!.completed ? 'completed' : 'incomplete';
    task.subtasks = task.subtasks!.map(st =>
      st.id === options.toggle ? { ...st, completed: !st.completed } : st
    );
    writeTaskFile(filePath, task, doc.body);
    console.log(chalk.green(`Subtask ${options.toggle} marked as ${newStatus}`));
    return;
  }
}
