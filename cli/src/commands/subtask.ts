import * as fs from 'fs';
import * as path from 'path';
import { Brainfile, findTaskById, addSubtask, deleteSubtask, updateSubtask, toggleSubtask } from '@brainfile/core';
import chalk from 'chalk';
import {
  fileNotFoundError,
  parseError,
  taskNotFoundError,
  subtaskNotFoundError,
  missingRequiredError,
  validationError,
  handleError,
} from '../utils/errorHandler';

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
    const filePath = path.resolve(options.file);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      fileNotFoundError(filePath);
    }

    // Read and parse the file
    const content = fs.readFileSync(filePath, 'utf-8');
    const result = Brainfile.parseWithErrors(content);

    if (!result.board) {
      parseError(result.error);
    }

    const board = result.board;

    // Find the task
    const taskInfo = findTaskById(board, options.task);
    if (!taskInfo) {
      taskNotFoundError(options.task, board);
    }

    let operationResult;
    let successMessage = '';

    // Handle add operation
    if (options.add) {
      operationResult = addSubtask(board, options.task, options.add);
      if (operationResult.success) {
        const newTask = findTaskById(operationResult.board!, options.task)!.task;
        const newSubtask = newTask.subtasks![newTask.subtasks!.length - 1];
        successMessage = `Subtask added: ${newSubtask.id} - ${options.add}`;
      }
    }

    // Handle delete operation
    if (options.delete) {
      // Verify subtask exists
      if (!taskInfo.task.subtasks || taskInfo.task.subtasks.length === 0) {
        validationError(`Task ${options.task} has no subtasks`);
      }
      const subtask = taskInfo.task.subtasks.find(st => st.id === options.delete);
      if (!subtask) {
        subtaskNotFoundError(options.delete, taskInfo.task);
      }

      operationResult = deleteSubtask(board, options.task, options.delete);
      successMessage = `Subtask deleted: ${options.delete} - ${subtask.title}`;
    }

    // Handle update operation
    if (options.update) {
      if (!options.title) {
        missingRequiredError('--title', 'brainfile subtask --task <task-id> --update <subtask-id> --title "New title"');
      }

      // Verify subtask exists
      if (!taskInfo.task.subtasks || taskInfo.task.subtasks.length === 0) {
        validationError(`Task ${options.task} has no subtasks`);
      }
      const subtask = taskInfo.task.subtasks.find(st => st.id === options.update);
      if (!subtask) {
        subtaskNotFoundError(options.update, taskInfo.task);
      }

      operationResult = updateSubtask(board, options.task, options.update, options.title);
      successMessage = `Subtask updated: ${options.update}\n  "${subtask.title}" → "${options.title}"`;
    }

    // Handle toggle operation
    if (options.toggle) {
      // Verify subtask exists
      if (!taskInfo.task.subtasks || taskInfo.task.subtasks.length === 0) {
        validationError(`Task ${options.task} has no subtasks`);
      }
      const subtask = taskInfo.task.subtasks.find(st => st.id === options.toggle);
      if (!subtask) {
        subtaskNotFoundError(options.toggle, taskInfo.task);
      }

      operationResult = toggleSubtask(board, options.task, options.toggle);
      const newStatus = !subtask.completed ? 'completed' : 'incomplete';
      successMessage = `Subtask ${options.toggle} marked as ${newStatus}`;
    }

    if (!operationResult?.success) {
      console.error(chalk.red(`Error: ${operationResult?.error}`));
      process.exit(1);
    }

    // Serialize and write back
    const updatedContent = Brainfile.serialize(operationResult.board!);
    fs.writeFileSync(filePath, updatedContent, 'utf-8');

    // Success message
    console.log(chalk.green(successMessage));

  } catch (error) {
    handleError(error);
  }
}
