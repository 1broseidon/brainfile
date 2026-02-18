#!/usr/bin/env node

import { Command } from 'commander';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { listCommand, LIST_COMMAND_HELP } from './commands/list';
import { showCommand } from './commands/show';
import { addCommand, ADD_COMMAND_HELP } from './commands/add';
import { moveCommand } from './commands/move';
import { templateCommand } from './commands/template';
import { lintCommand } from './commands/lint';
import { initCommand } from './commands/init';
import { migrateCommand } from './commands/migrate';
import { tuiCommand } from './commands/tui';
import { patchCommand } from './commands/patch';
import { deleteCommand } from './commands/delete';
import { archiveCommand } from './commands/archive';
import { restoreCommand } from './commands/restore';
import { completeCommand } from './commands/complete';
import { logCommand, logNoteCommand } from './commands/log';
import { searchCommand } from './commands/search';
import {
  githubAuthCommand,
  linearAuthCommand,
  authStatusCommand,
  authLogoutCommand,
} from './commands/auth';
import { subtaskCommand } from './commands/subtask';
import { mcpCommand } from './commands/mcp';
import {
  contractPickupCommand,
  contractDeliverCommand,
  contractValidateCommand,
  contractAttachCommand,
  CONTRACT_COMMAND_HELP,
  CONTRACT_PICKUP_HELP,
  CONTRACT_DELIVER_HELP,
  CONTRACT_VALIDATE_HELP,
  CONTRACT_ATTACH_HELP,
} from './commands/contract';
import {
  afterEditCommand,
  beforePromptCommand,
  sessionStartCommand,
  installCommand,
  uninstallCommand,
  listCommand as hooksListCommand
} from './commands/hooks';
import { configCommand } from './commands/config';
import { schemaCommand, SCHEMA_COMMAND_HELP } from './commands/schema';
import { rulesCommand, RULES_COMMAND_HELP } from './commands/rules';

// Read version from package.json
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '..', 'package.json'), 'utf8')
);

// Known subcommands to distinguish from file paths
const SUBCOMMANDS = ['init', 'migrate', 'list', 'show', 'add', 'move', 'patch', 'delete', 'archive', 'restore', 'complete', 'log', 'search', 'subtask', 'template', 'lint', 'tui', 'hooks', 'mcp', 'auth', 'config', 'contract', 'schema', 'rules', 'help'];

// Check if first arg looks like a file path (not a subcommand or flag)
function shouldLaunchTUI(): { launch: boolean; file: string } {
  const args = process.argv.slice(2);

  // No args → TUI with default file
  if (args.length === 0) {
    return { launch: true, file: 'brainfile.md' };
  }

  const firstArg = args[0];

  // If first arg is a flag, let commander handle it
  if (firstArg.startsWith('-')) {
    // Handle -f/--file flag for TUI
    if (args.length >= 2 && (firstArg === '-f' || firstArg === '--file')) {
      return { launch: true, file: args[1] };
    }
    return { launch: false, file: '' };
  }

  // If first arg is a known subcommand, don't launch TUI
  if (SUBCOMMANDS.includes(firstArg)) {
    return { launch: false, file: '' };
  }

  // If first arg looks like a file path (contains . or / or exists), launch TUI with it
  if (firstArg.includes('.') || firstArg.includes('/') || existsSync(firstArg)) {
    return { launch: true, file: firstArg };
  }

  // Otherwise let commander handle it (will show help for unknown command)
  return { launch: false, file: '' };
}

const tuiCheck = shouldLaunchTUI();
if (tuiCheck.launch) {
  tuiCommand({ file: tuiCheck.file });
} else {

  const program = new Command();

  program
    .name('brainfile')
    .description('Command-line interface for Brainfile task management')
    .version(packageJson.version);

  program.addHelpText('after', `
Common workflows:
  # Create a board
  brainfile init

  # Move an existing root brainfile.md into .brainfile/
  brainfile migrate

  # Daily usage
  brainfile list
  brainfile add -c todo -t "My task"
  brainfile move -t task-1 -c done

Contract workflow (PM ↔ Agent):
  # PM creates a task with a contract
  brainfile add -c todo -t "Feature" --assignee codex --with-contract --deliverable "file:src/feature.ts:Impl"

  # Agent picks up / delivers
  brainfile contract pickup -t task-123
  brainfile contract deliver -t task-123

  # PM validates
  brainfile contract validate -t task-123

Brainfile file resolution (when you don't pass --file):
  1) .brainfile/brainfile.md
  2) brainfile.md
  3) .brainfile.md
  4) .bb.md
`.trimEnd());

  // Register commands
  program
    .command('init')
    .description('Initialize a new .brainfile/brainfile.md in the current directory')
    .option('-f, --file <path>', 'Path to brainfile file', '.brainfile/brainfile.md')
    .option('--force', 'Overwrite existing file')
    .action(initCommand);

  program
    .command('migrate')
    .description('Migrate root brainfile.md to .brainfile/brainfile.md, or convert to v2 per-task files')
    .option('--dir <path>', 'Directory containing brainfile.md (default: cwd)')
    .option('--force', 'Overwrite existing .brainfile/brainfile.md')
    .option('--v2', 'Convert v1 embedded tasks to v2 per-task file architecture')
    .action(migrateCommand);

  const listCmd = program
    .command('list')
    .description('List tasks')
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .option('-c, --column <name>', 'Filter by column')
    .option('-t, --tag <name>', 'Filter by tag')
    .option('--contract <status>', 'Filter by contract status (ready|in_progress|delivered|done|failed)')
    .action((options) => { listCommand(options); });
  listCmd.addHelpText('after', `\n${LIST_COMMAND_HELP}`);

  program
    .command('show')
    .description('Show full details of a single task')
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .option('-t, --task <id>', 'Task ID to show (required)')
    .option('--json', 'Output task data as JSON')
    .action((options) => { showCommand(options); });

  const addCmd = program
    .command('add')
    .description('Add a new task')
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .option('-c, --column <name>', 'Column to add task to', 'todo')
    .option('-t, --title <text>', 'Task title (required)')
    .option('-d, --description <text>', 'Task description')
    .option('-p, --priority <level>', 'Priority level (low, medium, high, critical)')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--assignee <name>', 'Assignee name')
    .option('--due-date <date>', 'Due date (YYYY-MM-DD)')
    .option('--subtasks <titles>', 'Comma-separated subtask titles')
    .option('--files <paths>', 'Comma-separated related file paths')
    .option('--with-contract', 'Attach a contract (status=ready)')
    .option(
      '--deliverable <spec>',
      'Contract deliverable: type:path:description (description optional). Type: file|test|docs|design|research',
      (value, previous: string[]) => (previous ? [...previous, value] : [value]),
      []
    )
    .option(
      '--validation <command>',
      'Contract validation command (repeatable)',
      (value, previous: string[]) => (previous ? [...previous, value] : [value]),
      []
    )
    .option(
      '--constraint <text>',
      'Contract constraint (repeatable)',
      (value, previous: string[]) => (previous ? [...previous, value] : [value]),
      []
    )
    .action((options) => { addCommand(options); });
  addCmd.addHelpText('after', `\n${ADD_COMMAND_HELP}`);

  program
    .command('patch')
    .description('Update task fields (partial update)')
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .option('-t, --task <id>', 'Task ID to update (required)')
    .option('--title <text>', 'New task title')
    .option('-d, --description <text>', 'New task description')
    .option('-p, --priority <level>', 'Priority (low, medium, high, critical, or "none" to remove)')
    .option('--tags <tags>', 'Comma-separated tags (replaces existing)')
    .option('--assignee <name>', 'Assignee name')
    .option('--due-date <date>', 'Due date (YYYY-MM-DD)')
    .option('--clear-tags', 'Remove all tags')
    .option('--clear-assignee', 'Remove assignee')
    .option('--clear-due-date', 'Remove due date')
    .option('--clear-priority', 'Remove priority')
    .action(patchCommand);

  program
    .command('delete')
    .description('Delete a task permanently')
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .option('-t, --task <id>', 'Task ID to delete (required)')
    .option('--force', 'Confirm deletion (required)')
    .action(deleteCommand);

  program
    .command('archive')
    .description('Archive a task (locally or to GitHub/Linear)')
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .option('-t, --task <id>', 'Task ID to archive')
    .option('--to <destination>', 'Archive destination: local, github, or linear')
    .option('--all', 'Archive all tasks from local archive to external service')
    .option('--dry-run', 'Preview what would be created without making changes')
    .action(archiveCommand);

  program
    .command('restore')
    .description('Restore a task from the archive')
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .option('-t, --task <id>', 'Task ID to restore (required)')
    .option('-c, --column <name>', 'Target column name or ID (required)')
    .action(restoreCommand);

  program
    .command('complete')
    .description('Complete a task (move to logs in v2, or move to done column in v1)')
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .option('-t, --task <id>', 'Task ID to complete (required)')
    .action((options) => { completeCommand(options); });

  const logCmd = program
    .command('log')
    .description('View, search, and manage completed task logs (v2 only)')
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .option('-t, --task <id>', 'View a specific task log')
    .option('-s, --search <query>', 'Search across all logs')
    .option('--recent', 'List recently completed tasks')
    .action((options) => { logCommand(options); });

  logCmd
    .command('note')
    .description('Append a timestamped note to a task log')
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .option('-t, --task <id>', 'Task ID to add note to (required)')
    .option('--agent <name>', 'Agent name for attribution')
    .argument('[message]', 'Log message to append')
    .action((message, options) => { logNoteCommand({ ...options, message }); });

  program
    .command('search')
    .description('Search across active tasks and completed logs')
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .option('-c, --column <name>', 'Filter by column')
    .argument('<query>', 'Search query')
    .action((query, options) => { searchCommand({ ...options, query }); });

  program
    .command('subtask')
    .description('Manage subtasks (add, delete, update, toggle)')
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .option('-t, --task <id>', 'Parent task ID (required)')
    .option('--add <title>', 'Add a new subtask')
    .option('--delete <subtask-id>', 'Delete a subtask')
    .option('--update <subtask-id>', 'Update a subtask (requires --title)')
    .option('--toggle <subtask-id>', 'Toggle subtask completion')
    .option('--title <text>', 'New title (for --update)')
    .action(subtaskCommand);

  program
    .command('move')
    .description('Move a task to a different column')
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .option('-t, --task <id>', 'Task ID to move (required)')
    .option('-c, --column <name>', 'Target column name or ID (required)')
    .action((options) => { moveCommand(options); });

  program
    .command('template')
    .description('Manage and use task templates')
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .option('-l, --list', 'List all available templates')
    .option('-u, --use <template-id>', 'Create task from template')
    .option('--title <text>', 'Task title (for template usage)')
    .option('--description <text>', 'Task description (for template usage)')
    .option('-c, --column <name>', 'Column to add task to', 'todo')
    .action((options) => { templateCommand(options); });

  program
    .command('lint')
    .description('Validate and auto-fix brainfile.md syntax')
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .option('--fix', 'Automatically fix issues when possible')
    .option('--check', 'Exit with error code if issues found (for CI/CD)')
    .action((options) => { lintCommand(options); });

  program
    .command('tui')
    .description('Launch interactive Terminal UI for task management')
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .action(tuiCommand);

  // Add hooks command group
  const hooksCommand = program
    .command('hooks')
    .description('Manage AI agent hooks integration');

  hooksCommand
    .command('after-edit')
    .description('Handle post-edit hook event (internal use by AI assistants)')
    .action(() => { afterEditCommand(); });

  hooksCommand
    .command('before-prompt')
    .description('Handle pre-prompt hook event (internal use by AI assistants)')
    .action(() => { beforePromptCommand(); });

  hooksCommand
    .command('session-start')
    .description('Handle session-start hook event (internal use by AI assistants)')
    .action(() => { sessionStartCommand(); });

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

  // Add auth command group
  const authCommand = program
    .command('auth')
    .description('Manage authentication for external services (GitHub, Linear)');

  authCommand
    .command('github')
    .description('Authenticate with GitHub')
    .option('--token <token>', 'Personal Access Token (or use OAuth device flow)')
    .action(githubAuthCommand);

  authCommand
    .command('linear')
    .description('Authenticate with Linear')
    .option('--token <token>', 'Linear API key (required)')
    .action(linearAuthCommand);

  authCommand
    .command('status')
    .description('Show authentication status for all providers')
    .action(authStatusCommand);

  authCommand
    .command('logout [provider]')
    .description('Log out from a provider (github, linear, or --all)')
    .option('--all', 'Log out from all providers')
    .action(authLogoutCommand);

  // Add config command group
  const configCmd = program
    .command('config')
    .description('Manage user configuration (~/.config/brainfile/config.json)');

  configCmd
    .command('list')
    .description('Show all config values')
    .action(() => configCommand('list', {}));

  configCmd
    .command('get <key>')
    .description('Get a specific config value')
    .action((key) => configCommand('get', { key }));

  configCmd
    .command('set <key> <value>')
    .description('Set a config value')
    .action((key, value) => configCommand('set', { key, value }));

  configCmd
    .command('path')
    .description('Show config file path')
    .action(() => configCommand('path', {}));

  program
    .command('mcp')
    .description('Start MCP server for AI assistant integration')
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .action(mcpCommand);

  // Add contract command group
  const contractCmd = program
    .command('contract')
    .description('Manage task contracts (pickup, deliver, validate)');
  contractCmd.addHelpText('after', `\n${CONTRACT_COMMAND_HELP}`);

  const contractPickupCmd = contractCmd
    .command('pickup')
    .description('Claim a contract and output context for an agent')
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .option('-t, --task <id>', 'Task ID to pick up (required)')
    .action((options) => { contractPickupCommand(options); });
  contractPickupCmd.addHelpText('after', `\n${CONTRACT_PICKUP_HELP}`);

  const contractDeliverCmd = contractCmd
    .command('deliver')
    .description('Mark a contract as delivered')
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .option('-t, --task <id>', 'Task ID to deliver (required)')
    .action((options) => { contractDeliverCommand(options); });
  contractDeliverCmd.addHelpText('after', `\n${CONTRACT_DELIVER_HELP}`);

  const contractValidateCmd = contractCmd
    .command('validate')
    .description('Validate contract deliverables and commands; set status done/failed')
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .option('-t, --task <id>', 'Task ID to validate (required)')
    .action((options) => { contractValidateCommand(options); });
  contractValidateCmd.addHelpText('after', `\n${CONTRACT_VALIDATE_HELP}`);

  const contractAttachCmd = contractCmd
    .command('attach')
    .description('Attach a new contract to an existing task (status=ready)')
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .option('-t, --task <id>', 'Task ID to attach contract to (required)')
    .option(
      '--deliverable <spec>',
      'Contract deliverable: type:path:description (description optional). Type: file|test|docs|design|research',
      (value, previous: string[]) => (previous ? [...previous, value] : [value]),
      []
    )
    .option(
      '--validation <command>',
      'Contract validation command (repeatable)',
      (value, previous: string[]) => (previous ? [...previous, value] : [value]),
      []
    )
    .option(
      '--constraint <text>',
      'Contract constraint (repeatable)',
      (value, previous: string[]) => (previous ? [...previous, value] : [value]),
      []
    )
    .action((options) => { contractAttachCommand(options); });
  contractAttachCmd.addHelpText('after', `\n${CONTRACT_ATTACH_HELP}`);

  // Add schema command
  const schemaCmd = program
    .command('schema [name]')
    .description('View and manage brainfile schemas')
    .option('--json', 'Output in JSON format')
    .action((name, options) => { schemaCommand({ name, json: options.json }); });
  schemaCmd.addHelpText('after', `\n${SCHEMA_COMMAND_HELP}`);

  // Add rules command group
  const rulesCmd = program
    .command('rules [action]')
    .description('Manage project rules (always, never, prefer, context)')
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .option('--json', 'Output in JSON format')
    .option('--category <category>', 'Filter by category (for list)')
    .argument('[args...]', 'Arguments for the action (category, text/id)')
    .action((action, args, options) => {
      rulesCommand(action, args, {
        file: options.file,
        json: options.json,
        category: options.category,
      });
    });
  rulesCmd.addHelpText('after', `\n${RULES_COMMAND_HELP}`);

  program.parse();

} // end else block for CLI commands
