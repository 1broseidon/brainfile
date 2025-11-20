#!/usr/bin/env node

import { Command } from 'commander';
import { listCommand } from './commands/list';
import { addCommand } from './commands/add';
import { moveCommand } from './commands/move';
import { templateCommand } from './commands/template';

const program = new Command();

program
  .name('brainfile')
  .description('Command-line interface for Brainfile task management')
  .version('0.1.0');

// Register commands
program
  .command('list')
  .description('List all tasks from brainfile.md')
  .option('-f, --file <path>', 'Path to brainfile.md file', 'brainfile.md')
  .option('-c, --column <name>', 'Filter by column')
  .option('-t, --tag <name>', 'Filter by tag')
  .action(listCommand);

program
  .command('add')
  .description('Add a new task')
  .option('-f, --file <path>', 'Path to brainfile.md file', 'brainfile.md')
  .option('-c, --column <name>', 'Column to add task to', 'todo')
  .option('-t, --title <text>', 'Task title (required)')
  .option('-d, --description <text>', 'Task description')
  .option('-p, --priority <level>', 'Priority level (low, medium, high)')
  .option('--tags <tags>', 'Comma-separated tags')
  .action(addCommand);

program
  .command('move')
  .description('Move a task to a different column')
  .option('-f, --file <path>', 'Path to brainfile.md file', 'brainfile.md')
  .option('-t, --task <id>', 'Task ID to move (required)')
  .option('-c, --column <name>', 'Target column name or ID (required)')
  .action(moveCommand);

program
  .command('template')
  .description('Manage and use task templates')
  .option('-f, --file <path>', 'Path to brainfile.md file', 'brainfile.md')
  .option('-l, --list', 'List all available templates')
  .option('-u, --use <template-id>', 'Create task from template')
  .option('--title <text>', 'Task title (for template usage)')
  .option('--description <text>', 'Task description (for template usage)')
  .option('-c, --column <name>', 'Column to add task to', 'todo')
  .action(templateCommand);

program.parse();
