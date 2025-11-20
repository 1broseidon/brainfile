import * as fs from 'fs';
import * as path from 'path';
import { Brainfile, Task } from '@brainfile/core';
import chalk from 'chalk';

interface ListOptions {
  file: string;
  column?: string;
  tag?: string;
}

export function listCommand(options: ListOptions) {
  try {
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

    // Filter columns if specified
    const columns = options.column
      ? board.columns.filter(col => col.id === options.column || col.title === options.column)
      : board.columns;

    if (columns.length === 0) {
      console.log(chalk.yellow(`No columns found matching: ${options.column}`));
      return;
    }

    // Display board title
    console.log(chalk.bold.white(`\n${board.title || 'Brainfile Board'}\n`));

    // Display each column
    for (const column of columns) {
      // Filter tasks by tag if specified
      const tasks = options.tag
        ? column.tasks.filter(task => task.tags?.includes(options.tag!))
        : column.tasks;

      if (tasks.length === 0 && options.tag) {
        continue;
      }

      // Column header
      console.log(chalk.bold.cyan(`${column.title} (${tasks.length})`));
      console.log(chalk.gray('─'.repeat(50)));

      if (tasks.length === 0) {
        console.log(chalk.gray('  (no tasks)\n'));
        continue;
      }

      // Display tasks
      for (const task of tasks) {
        displayTask(task);
      }
      console.log('');
    }

    // Display summary
    const totalTasks = board.columns.reduce((sum, col) => sum + col.tasks.length, 0);
    console.log(chalk.gray(`Total tasks: ${totalTasks}`));

  } catch (error) {
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

function displayTask(task: Task) {
  // Task ID and title
  const idStr = chalk.gray(`[${task.id}]`);
  const titleStr = chalk.white(task.title);
  console.log(`  ${idStr} ${titleStr}`);

  // Priority
  if (task.priority) {
    const priorityColor =
      task.priority === 'high' ? chalk.red :
      task.priority === 'medium' ? chalk.yellow :
      chalk.blue;
    console.log(`    ${chalk.gray('Priority:')} ${priorityColor(task.priority)}`);
  }

  // Tags
  if (task.tags && task.tags.length > 0) {
    const tagStr = task.tags.map(t => chalk.cyan(`#${t}`)).join(' ');
    console.log(`    ${chalk.gray('Tags:')} ${tagStr}`);
  }

  // Template
  if (task.template) {
    console.log(`    ${chalk.gray('Template:')} ${chalk.magenta(task.template)}`);
  }

  // Subtasks summary
  if (task.subtasks && task.subtasks.length > 0) {
    const completed = task.subtasks.filter(st => st.completed).length;
    const total = task.subtasks.length;
    const progressStr = `${completed}/${total}`;
    const progressColor = completed === total ? chalk.green : chalk.yellow;
    console.log(`    ${chalk.gray('Subtasks:')} ${progressColor(progressStr)}`);
  }

  console.log('');
}
