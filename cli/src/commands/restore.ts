import * as fs from 'fs';
import * as path from 'path';
import { Brainfile, findColumnById, findColumnByName, restoreTask } from '@brainfile/core';
import chalk from 'chalk';

interface RestoreOptions {
  file: string;
  task: string;
  column: string;
}

export function restoreCommand(options: RestoreOptions) {
  try {
    // Validate required options
    if (!options.task) {
      console.error(chalk.red('Error: --task is required'));
      console.log(chalk.gray('Usage: brainfile restore --task <task-id> --column <column-name>'));
      process.exit(1);
    }

    if (!options.column) {
      console.error(chalk.red('Error: --column is required'));
      console.log(chalk.gray('Usage: brainfile restore --task <task-id> --column <column-name>'));
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

    // Check if archive exists and has tasks
    if (!board.archive || board.archive.length === 0) {
      console.error(chalk.red('Error: Archive is empty'));
      process.exit(1);
    }

    // Find the task in archive
    const archivedTask = board.archive.find(t => t.id === options.task);
    if (!archivedTask) {
      console.error(chalk.red(`Error: Task not found in archive: ${options.task}`));
      console.log(chalk.gray('\nArchived tasks:'));
      board.archive.forEach((task) => {
        console.log(chalk.gray(`  - ${task.id}: ${task.title}`));
      });
      process.exit(1);
    }

    // Find the target column by ID or name
    let targetColumn = findColumnById(board, options.column);
    if (!targetColumn) {
      targetColumn = findColumnByName(board, options.column);
    }

    if (!targetColumn) {
      console.error(chalk.red(`Error: Column not found: ${options.column}`));
      console.log(chalk.gray('Available columns:'));
      board.columns.forEach((col) => {
        console.log(chalk.gray(`  - ${col.id} (${col.title})`));
      });
      process.exit(1);
    }

    // Restore task using core operation
    const restoreResult = restoreTask(board, options.task, targetColumn.id);

    if (!restoreResult.success) {
      console.error(chalk.red(`Error: ${restoreResult.error}`));
      process.exit(1);
    }

    // Serialize and write back
    const updatedContent = Brainfile.serialize(restoreResult.board!);
    fs.writeFileSync(filePath, updatedContent, 'utf-8');

    // Success message
    console.log(chalk.green('✓ Task restored successfully!'));
    console.log('');
    console.log(chalk.gray(`  Task:   ${archivedTask.id} - ${archivedTask.title}`));
    console.log(chalk.gray(`  From:   Archive`));
    console.log(chalk.gray(`  To:     ${targetColumn.title}`));

  } catch (error) {
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
