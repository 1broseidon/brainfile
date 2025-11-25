import * as fs from 'fs';
import * as path from 'path';
import { Brainfile, findTaskById, addSubtask, deleteSubtask, updateSubtask, toggleSubtask } from '@brainfile/core';
import chalk from 'chalk';

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
      console.error(chalk.red('Error: --task is required'));
      console.log(chalk.gray('Usage: brainfile subtask --task <task-id> <operation>'));
      console.log(chalk.gray('Operations:'));
      console.log(chalk.gray('  --add <title>              Add a new subtask'));
      console.log(chalk.gray('  --delete <subtask-id>      Delete a subtask'));
      console.log(chalk.gray('  --update <subtask-id> --title <new-title>  Update subtask title'));
      console.log(chalk.gray('  --toggle <subtask-id>      Toggle subtask completion'));
      process.exit(1);
    }

    // Check for exactly one operation
    const operations = [options.add, options.delete, options.update, options.toggle].filter(Boolean);
    if (operations.length === 0) {
      console.error(chalk.red('Error: One operation is required (--add, --delete, --update, or --toggle)'));
      process.exit(1);
    }
    if (operations.length > 1) {
      console.error(chalk.red('Error: Only one operation can be performed at a time'));
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

    const board = result.board;

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
        console.error(chalk.red(`Error: Task ${options.task} has no subtasks`));
        process.exit(1);
      }
      const subtask = taskInfo.task.subtasks.find(st => st.id === options.delete);
      if (!subtask) {
        console.error(chalk.red(`Error: Subtask not found: ${options.delete}`));
        console.log(chalk.gray('\nAvailable subtasks:'));
        taskInfo.task.subtasks.forEach((st) => {
          const status = st.completed ? chalk.green('[x]') : chalk.gray('[ ]');
          console.log(chalk.gray(`  ${status} ${st.id}: ${st.title}`));
        });
        process.exit(1);
      }

      operationResult = deleteSubtask(board, options.task, options.delete);
      successMessage = `Subtask deleted: ${options.delete} - ${subtask.title}`;
    }

    // Handle update operation
    if (options.update) {
      if (!options.title) {
        console.error(chalk.red('Error: --title is required for update operation'));
        console.log(chalk.gray('Usage: brainfile subtask --task <task-id> --update <subtask-id> --title "New title"'));
        process.exit(1);
      }

      // Verify subtask exists
      if (!taskInfo.task.subtasks || taskInfo.task.subtasks.length === 0) {
        console.error(chalk.red(`Error: Task ${options.task} has no subtasks`));
        process.exit(1);
      }
      const subtask = taskInfo.task.subtasks.find(st => st.id === options.update);
      if (!subtask) {
        console.error(chalk.red(`Error: Subtask not found: ${options.update}`));
        console.log(chalk.gray('\nAvailable subtasks:'));
        taskInfo.task.subtasks.forEach((st) => {
          const status = st.completed ? chalk.green('[x]') : chalk.gray('[ ]');
          console.log(chalk.gray(`  ${status} ${st.id}: ${st.title}`));
        });
        process.exit(1);
      }

      operationResult = updateSubtask(board, options.task, options.update, options.title);
      successMessage = `Subtask updated: ${options.update}\n  "${subtask.title}" → "${options.title}"`;
    }

    // Handle toggle operation
    if (options.toggle) {
      // Verify subtask exists
      if (!taskInfo.task.subtasks || taskInfo.task.subtasks.length === 0) {
        console.error(chalk.red(`Error: Task ${options.task} has no subtasks`));
        process.exit(1);
      }
      const subtask = taskInfo.task.subtasks.find(st => st.id === options.toggle);
      if (!subtask) {
        console.error(chalk.red(`Error: Subtask not found: ${options.toggle}`));
        console.log(chalk.gray('\nAvailable subtasks:'));
        taskInfo.task.subtasks.forEach((st) => {
          const status = st.completed ? chalk.green('[x]') : chalk.gray('[ ]');
          console.log(chalk.gray(`  ${status} ${st.id}: ${st.title}`));
        });
        process.exit(1);
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
    console.log(chalk.green('✓ ' + successMessage));

  } catch (error) {
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
