import * as fs from 'fs';
import * as path from 'path';
import { Brainfile } from '@brainfile/core';
import chalk from 'chalk';

interface MoveOptions {
  file: string;
  task: string;
  column: string;
}

export function moveCommand(options: MoveOptions) {
  try {
    // Validate required options
    if (!options.task) {
      console.error(chalk.red('Error: --task is required'));
      console.log(chalk.gray('Usage: bangbang move --task <task-id> --column <column-name>'));
      process.exit(1);
    }

    if (!options.column) {
      console.error(chalk.red('Error: --column is required'));
      console.log(chalk.gray('Usage: bangbang move --task <task-id> --column <column-name>'));
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
      console.error(chalk.red('Error: Failed to parse bangbang.md'));
      if (result.error) {
        console.error(chalk.red(result.error));
      }
      process.exit(1);
    }

    const board = result.board;

    // Find the task
    let foundTask: any = null;
    let sourceColumn: any = null;
    let sourceColumnIndex = -1;

    for (let i = 0; i < board.columns.length; i++) {
      const column = board.columns[i];
      const taskIndex = column.tasks.findIndex((t: any) => t.id === options.task);
      if (taskIndex !== -1) {
        foundTask = column.tasks[taskIndex];
        sourceColumn = column;
        sourceColumnIndex = i;
        // Remove task from source column
        board.columns[i].tasks = column.tasks.filter((t: any) => t.id !== options.task);
        break;
      }
    }

    if (!foundTask) {
      console.error(chalk.red(`Error: Task not found: ${options.task}`));
      console.log(chalk.gray('\nAvailable tasks:'));
      board.columns.forEach((col: any) => {
        col.tasks.forEach((task: any) => {
          console.log(chalk.gray(`  - ${task.id}: ${task.title}`));
        });
      });
      process.exit(1);
    }

    // Find the target column
    const targetColumn = board.columns.find(
      (col: any) => col.id === options.column || col.title.toLowerCase() === options.column.toLowerCase()
    );

    if (!targetColumn) {
      console.error(chalk.red(`Error: Column not found: ${options.column}`));
      console.log(chalk.gray('Available columns:'));
      board.columns.forEach((col: any) => {
        console.log(chalk.gray(`  - ${col.id} (${col.title})`));
      });
      process.exit(1);
    }

    // Check if already in target column
    if (sourceColumn.id === targetColumn.id) {
      console.log(chalk.yellow(`Task ${options.task} is already in column "${targetColumn.title}"`));
      return;
    }

    // Add task to target column
    targetColumn.tasks.push(foundTask);

    // Serialize and write back
    const updatedContent = Brainfile.serialize(board);
    fs.writeFileSync(filePath, updatedContent, 'utf-8');

    // Success message
    console.log(chalk.green('✓ Task moved successfully!'));
    console.log('');
    console.log(chalk.gray(`  Task:   ${foundTask.id} - ${foundTask.title}`));
    console.log(chalk.gray(`  From:   ${sourceColumn.title}`));
    console.log(chalk.gray(`  To:     ${targetColumn.title}`));

  } catch (error) {
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
