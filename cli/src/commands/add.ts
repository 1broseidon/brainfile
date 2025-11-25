import * as fs from 'fs';
import * as path from 'path';
import { Brainfile, findColumnById, findColumnByName, addTask, type TaskInput } from '@brainfile/core';
import chalk from 'chalk';

interface AddOptions {
  file: string;
  column: string;
  title?: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  tags?: string;
  assignee?: string;
  dueDate?: string;
  subtasks?: string;
  files?: string;
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

    // Build TaskInput with all provided fields
    const taskInput: TaskInput = {
      title: options.title,
      ...(options.description && { description: options.description }),
      ...(options.priority && { priority: options.priority }),
      ...(options.tags && { tags: options.tags.split(',').map(t => t.trim()) }),
      ...(options.assignee && { assignee: options.assignee }),
      ...(options.dueDate && { dueDate: options.dueDate }),
      ...(options.subtasks && { subtasks: options.subtasks.split(',').map(t => t.trim()) }),
      ...(options.files && { relatedFiles: options.files.split(',').map(f => f.trim()) }),
    };

    // Add task using core operation (immutable)
    const addResult = addTask(board, targetColumn.id, taskInput);

    if (!addResult.success) {
      console.error(chalk.red(`Error: ${addResult.error}`));
      process.exit(1);
    }

    board = addResult.board!;

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
    console.log(chalk.gray(`  ID:       ${newTask.id}`));
    console.log(chalk.gray(`  Title:    ${options.title}`));
    console.log(chalk.gray(`  Column:   ${targetColumn.title}`));
    if (options.description) {
      console.log(chalk.gray(`  Desc:     ${options.description.substring(0, 50)}${options.description.length > 50 ? '...' : ''}`));
    }
    if (options.priority) {
      console.log(chalk.gray(`  Priority: ${options.priority}`));
    }
    if (options.tags) {
      console.log(chalk.gray(`  Tags:     ${options.tags}`));
    }
    if (options.assignee) {
      console.log(chalk.gray(`  Assignee: ${options.assignee}`));
    }
    if (options.dueDate) {
      console.log(chalk.gray(`  Due:      ${options.dueDate}`));
    }
    if (options.subtasks) {
      console.log(chalk.gray(`  Subtasks: ${options.subtasks.split(',').length} added`));
    }
    if (options.files) {
      console.log(chalk.gray(`  Files:    ${options.files.split(',').length} linked`));
    }

  } catch (error) {
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
