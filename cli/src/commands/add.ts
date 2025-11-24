import * as fs from 'fs';
import * as path from 'path';
import { Brainfile, findColumnById, findColumnByName, addTask } from '@brainfile/core';
import chalk from 'chalk';

interface AddOptions {
  file: string;
  column: string;
  title?: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high';
  tags?: string;
}

export function addCommand(options: AddOptions) {
  try {
    // Validate required options
    if (!options.title) {
      console.error(chalk.red('Error: --title is required'));
      console.log(chalk.gray('Usage: brainfile add --title "Task title" [options]'));
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

    // Find the target column by ID or name
    let targetColumn = findColumnById(board, options.column);
    if (!targetColumn) {
      targetColumn = findColumnByName(board, options.column);
    }

    if (!targetColumn) {
      console.error(chalk.red(`Error: Column not found: ${options.column}`));
      console.log(chalk.gray('Available columns:'));
      board.columns.forEach(col => {
        console.log(chalk.gray(`  - ${col.id} (${col.title})`));
      });
      process.exit(1);
    }

    // Add task using core operation (immutable)
    const addResult = addTask(
      board,
      targetColumn.id,
      options.title,
      options.description || ''
    );

    if (!addResult.success) {
      console.error(chalk.red(`Error: ${addResult.error}`));
      process.exit(1);
    }

    board = addResult.board!;

    // Update optional fields if provided (need to modify the new task)
    if (options.priority || options.tags) {
      const newTaskId = board.columns
        .find(col => col.id === targetColumn!.id)!
        .tasks[board.columns.find(col => col.id === targetColumn!.id)!.tasks.length - 1]
        .id;

      // Find and update the new task with optional fields
      board = {
        ...board,
        columns: board.columns.map(col => {
          if (col.id !== targetColumn!.id) return col;
          return {
            ...col,
            tasks: col.tasks.map(task => {
              if (task.id !== newTaskId) return task;
              return {
                ...task,
                ...(options.priority && { priority: options.priority }),
                ...(options.tags && { tags: options.tags.split(',').map(t => t.trim()) })
              };
            })
          };
        })
      };
    }

    // Get the new task for display
    const newTask = board.columns
      .find(col => col.id === targetColumn!.id)!
      .tasks[board.columns.find(col => col.id === targetColumn!.id)!.tasks.length - 1];

    // Serialize and write back
    const updatedContent = Brainfile.serialize(board);
    fs.writeFileSync(filePath, updatedContent, 'utf-8');

    // Success message
    console.log(chalk.green('✓ Task added successfully!'));
    console.log('');
    console.log(chalk.gray(`  ID:      ${newTask.id}`));
    console.log(chalk.gray(`  Title:   ${options.title}`));
    console.log(chalk.gray(`  Column:  ${targetColumn.title}`));
    if (options.priority) {
      console.log(chalk.gray(`  Priority: ${options.priority}`));
    }
    if (options.tags) {
      console.log(chalk.gray(`  Tags:    ${options.tags}`));
    }

  } catch (error) {
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
