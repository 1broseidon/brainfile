#!/usr/bin/env node

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { join } from 'path';
import { listCommand } from './commands/list';
import { addCommand } from './commands/add';
import { moveCommand } from './commands/move';
import { templateCommand } from './commands/template';
import { lintCommand } from './commands/lint';
import { initCommand } from './commands/init';
import {
  afterEditCommand,
  beforePromptCommand,
  sessionStartCommand,
  installCommand,
  uninstallCommand,
  listCommand as hooksListCommand
} from './commands/hooks';

// Read version from package.json
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '..', 'package.json'), 'utf8')
);

const program = new Command();

program
  .name('brainfile')
  .description('Command-line interface for Brainfile task management')
  .version(packageJson.version);

// Register commands
program
  .command('init')
  .description('Initialize a new brainfile.md in the current directory')
  .option('-f, --file <path>', 'Path to brainfile.md file', 'brainfile.md')
  .option('--force', 'Overwrite existing file')
  .action(initCommand);

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

program
  .command('lint')
  .description('Validate and auto-fix brainfile.md syntax')
  .option('-f, --file <path>', 'Path to brainfile.md file', 'brainfile.md')
  .option('--fix', 'Automatically fix issues when possible')
  .option('--check', 'Exit with error code if issues found (for CI/CD)')
  .action(lintCommand);

// Add hooks command group
const hooksCommand = program
  .command('hooks')
  .description('Manage AI agent hooks integration');

hooksCommand
  .command('after-edit')
  .description('Handle post-edit hook event (internal use by AI assistants)')
  .action(afterEditCommand);

hooksCommand
  .command('before-prompt')
  .description('Handle pre-prompt hook event (internal use by AI assistants)')
  .action(beforePromptCommand);

hooksCommand
  .command('session-start')
  .description('Handle session-start hook event (internal use by AI assistants)')
  .action(sessionStartCommand);

hooksCommand
  .command('install <tool>')
  .description('Install brainfile hooks for an AI coding assistant')
  .option('--scope <scope>', 'Installation scope: user or project', 'user')
  .action((tool, options) => installCommand({ tool, scope: options.scope }));

hooksCommand
  .command('uninstall <tool>')
  .description('Uninstall brainfile hooks for an AI coding assistant')
  .option('--scope <scope>', 'Scope to uninstall from: user, project, or all', 'user')
  .action((tool, options) => uninstallCommand({ tool, scope: options.scope }));

hooksCommand
  .command('list [tool]')
  .description('List installed brainfile hooks')
  .action((tool) => hooksListCommand({ tool }));

program.parse();
