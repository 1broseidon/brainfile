import * as fs from 'fs';
import * as path from 'path';
import { Brainfile, findTaskById, deleteTask } from '@brainfile/core';
import chalk from 'chalk';

interface DeleteOptions {
  file: string;
  task: string;
  force?: boolean;
}

export function deleteCommand(options: DeleteOptions) {
  try {
    // Validate required options
    if (!options.task) {
      console.error(chalk.red('Error: --task is required'));
      console.log(chalk.gray('Usage: brainfile delete --task <task-id> [--force]'));
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

    const { task, column } = taskInfo;

    // Warn if not using --force
    if (!options.force) {
      console.log(chalk.yellow('Warning: This will permanently delete the task.'));
      console.log(chalk.gray(`  Task: ${task.id} - ${task.title}`));
      console.log(chalk.gray(`  Column: ${column.title}`));
      console.log('');
      console.log(chalk.gray('Use --force to confirm deletion, or use "brainfile archive" to archive instead.'));
      process.exit(0);
    }

    // Delete task using core operation
    const deleteResult = deleteTask(board, column.id, options.task);

    if (!deleteResult.success) {
      console.error(chalk.red(`Error: ${deleteResult.error}`));
      process.exit(1);
    }

    // Serialize and write back
    const updatedContent = Brainfile.serialize(deleteResult.board!);
    fs.writeFileSync(filePath, updatedContent, 'utf-8');

    // Success message
    console.log(chalk.green('✓ Task deleted successfully!'));
    console.log('');
    console.log(chalk.gray(`  Task:   ${task.id} - ${task.title}`));
    console.log(chalk.gray(`  Column: ${column.title}`));

  } catch (error) {
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
