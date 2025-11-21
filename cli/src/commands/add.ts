import * as fs from 'fs';
import * as path from 'path';
import { Brainfile, Task, generateTaskId } from '@brainfile/core';
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
      console.log(chalk.gray('Usage: bangbang add --title "Task title" [options]'));
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
      console.error(chalk.red('Error: Failed to parse bangbang.md'));
      if (result.error) {
        console.error(chalk.red(result.error));
      }
      process.exit(1);
    }

    const board = result.board;

    // Find the target column
    const targetColumn = board.columns.find(
      col => col.id === options.column || col.title.toLowerCase() === options.column.toLowerCase()
    );

    if (!targetColumn) {
      console.error(chalk.red(`Error: Column not found: ${options.column}`));
      console.log(chalk.gray('Available columns:'));
      board.columns.forEach(col => {
        console.log(chalk.gray(`  - ${col.id} (${col.title})`));
      });
      process.exit(1);
    }

    // Generate new task ID
    const newTaskId = generateTaskId();

    // Create new task
    const newTask: Task = {
      id: newTaskId,
      title: options.title,
    };

    // Add optional fields
    if (options.description) {
      newTask.description = options.description;
    }

    if (options.priority) {
      newTask.priority = options.priority;
    }

    if (options.tags) {
      newTask.tags = options.tags.split(',').map(t => t.trim());
    }

    // Add task to column
    targetColumn.tasks.push(newTask);

    // Serialize and write back
    const updatedContent = Brainfile.serialize(board);
    fs.writeFileSync(filePath, updatedContent, 'utf-8');

    // Success message
    console.log(chalk.green('✓ Task added successfully!'));
    console.log('');
    console.log(chalk.gray(`  ID:      ${newTaskId}`));
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
