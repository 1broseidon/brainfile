import * as fs from 'fs';
import * as path from 'path';
import { Brainfile, findTaskById, findColumnById, findColumnByName, moveTask } from '@brainfile/core';
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
      console.log(chalk.gray('Usage: brainfile move --task <task-id> --column <column-name>'));
      process.exit(1);
    }

    if (!options.column) {
      console.error(chalk.red('Error: --column is required'));
      console.log(chalk.gray('Usage: brainfile move --task <task-id> --column <column-name>'));
      process.exit(1);
    }

    // Resolve file path
    const filePath = path.resolve(options.file);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.error(chalk.red(`Error: File not found: ${filePath}`));
      console.log('');
      console.log(chalk.gray('To create a new brainfile, run:'));
      console.log(chalk.cyan('  brainfile init'));
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

    // Find the task using core query function
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

    const { task: foundTask, column: sourceColumn } = taskInfo;

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

    // Check if already in target column
    if (sourceColumn.id === targetColumn.id) {
      console.log(chalk.yellow(`Task ${options.task} is already in column "${targetColumn.title}"`));
      return;
    }

    // Move task using core operation (immutable)
    const moveResult = moveTask(
      board,
      options.task,
      sourceColumn.id,
      targetColumn.id,
      targetColumn.tasks.length // Move to end of target column
    );

    if (!moveResult.success) {
      console.error(chalk.red(`Error: ${moveResult.error}`));
      process.exit(1);
    }

    // Serialize and write back
    const updatedContent = Brainfile.serialize(moveResult.board!);
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
