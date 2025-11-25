import * as fs from 'fs';
import * as path from 'path';
import { Brainfile, findTaskById, archiveTask } from '@brainfile/core';
import chalk from 'chalk';

interface ArchiveOptions {
  file: string;
  task: string;
}

export function archiveCommand(options: ArchiveOptions) {
  try {
    // Validate required options
    if (!options.task) {
      console.error(chalk.red('Error: --task is required'));
      console.log(chalk.gray('Usage: brainfile archive --task <task-id>'));
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

    // Archive task using core operation
    const archiveResult = archiveTask(board, column.id, options.task);

    if (!archiveResult.success) {
      console.error(chalk.red(`Error: ${archiveResult.error}`));
      process.exit(1);
    }

    // Serialize and write back
    const updatedContent = Brainfile.serialize(archiveResult.board!);
    fs.writeFileSync(filePath, updatedContent, 'utf-8');

    // Success message
    console.log(chalk.green('✓ Task archived successfully!'));
    console.log('');
    console.log(chalk.gray(`  Task:   ${task.id} - ${task.title}`));
    console.log(chalk.gray(`  From:   ${column.title}`));
    console.log(chalk.gray(`  To:     Archive`));
    console.log('');
    console.log(chalk.gray('Use "brainfile restore" to restore this task.'));

  } catch (error) {
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
