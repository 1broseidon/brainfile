/**
 * The commander program: every command and subcommand the CLI registers.
 *
 * Built by a function, not at module scope, so tests can enumerate exactly
 * what the CLI offers (the MCP parity test, spec-13) without parsing argv or
 * running anything. `cli.ts` builds it and parses.
 */
import { Command, Option } from 'commander';
import { readFileSync } from 'fs';
import { join } from 'path';
import { listCommand, LIST_COMMAND_HELP } from './commands/list';
import { showCommand } from './commands/show';
import { addCommand, ADD_COMMAND_HELP } from './commands/add';
import { beforeCommand, afterCommand } from './utils/board-commit-hooks';
import { moveCommand } from './commands/move';
import { templateCommand } from './commands/template';
import { lintCommand } from './commands/lint';
import { initCommand } from './commands/init';
import { migrateCommand } from './commands/migrate';
import { syncCommand, SYNC_COMMAND_HELP } from './commands/sync';
import { whereCommand } from './commands/where';
import { issuesCommand, ISSUES_COMMAND_HELP } from './commands/issues';
import { adoptCommand, backupsCommand, mergeBoardsCommand } from './commands/boards';
import { fixCommand } from './commands/fix';
import { mergeDriverCommand } from './commands/merge-driver';
import { patchCommand, PATCH_COMMAND_HELP } from './commands/patch';
import { deleteCommand } from './commands/delete';
import { archiveCommand } from './commands/archive';
import { restoreCommand } from './commands/restore';
import { completeCommand } from './commands/complete';
import { logCommand, logNoteCommand } from './commands/log';
import { briefCommand } from './commands/brief';
import { searchCommand } from './commands/search';
import {
  decideCommand,
  supersedeCommand,
  retireCommand,
  DECIDE_COMMAND_HELP,
  SUPERSEDE_COMMAND_HELP,
  RETIRE_COMMAND_HELP,
} from './commands/decide';
import { indexCommand } from './commands/memory-index';
import { checkCommand, CHECK_COMMAND_HELP } from './commands/check';
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
  contractActivateCommand,
  contractGraphCommand,
  parseContractGraphArgs,
  CONTRACT_COMMAND_HELP,
  CONTRACT_PICKUP_HELP,
  CONTRACT_DELIVER_HELP,
  CONTRACT_VALIDATE_HELP,
  CONTRACT_ATTACH_HELP,
  CONTRACT_ACTIVATE_HELP,
  CONTRACT_GRAPH_HELP,
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
import { adrPromoteCommand, ADR_COMMAND_HELP } from './commands/adr';
import {
  planAddCommand,
  planListCommand,
  planShowCommand,
  planLinkCommand,
  PLAN_COMMAND_HELP,
} from './commands/plan';
import {
  typesListCommand,
  typesAddCommand,
  parseBooleanFlag,
} from './commands/types';
import {
  columnsListCommand,
  columnsAddCommand,
  columnsRenameCommand,
  columnsReorderCommand,
  columnsRemoveCommand,
  COLUMNS_COMMAND_HELP,
} from './commands/columns';

/**
 * The TUI is loaded on demand, never at module scope.
 *
 * `commands/tui` pulls in ink 7 → react → yoga-layout, and yoga instantiates a
 * wasm module in a top-level `await`. Statically importing it would make every
 * non-TUI invocation (`list`, `show`, `mcp`, …) pay for that, since the whole
 * entry graph is a single esbuild bundle. Deferring it keeps that cost on the
 * `tui` path alone; the build already emits split chunks, so the import
 * resolves to a chunk that is only read when this function runs.
 */
export async function runTui(options: { file: string }): Promise<void> {
  const { tuiCommand } = await import('./commands/tui');
  return tuiCommand(options);
}

// Read version from package.json
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '..', 'package.json'), 'utf8')
);

/** The CLI's commander program, with every command registered and nothing parsed. */
export function createProgram(): Command {
  const program = new Command();

  program
    .name('brainfile')
    .description('Command-line interface for Brainfile task management')
    .version(packageJson.version)
    .option('-g, --global', 'Use the home board at ~/.brainfile instead of discovering one');

  // Board-on-a-branch (spec-9): hand edits are committed on their own before a
  // command runs; whatever the command changed is committed after it, authored
  // by the git user and tagged with the acting agent (see utils/actor). No-ops
  // on plain boards.
  program.hook('preAction', (_program, actionCommand) => { beforeCommand(actionCommand); });
  program.hook('postAction', (_program, actionCommand) => { afterCommand(actionCommand); });

  program.addHelpText('after', `
Common workflows:
  # Create a board
  brainfile init

  # Migrate legacy layouts to v2 (.brainfile + board/logs)
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
  1) .brainfile/brainfile.md, walking up to the repository root
  2) inside a git repo: the worktree on the board branch ('brainfile'),
     created from the branch when it exists but is not checked out
  3) legacy: brainfile.md, .brainfile.md, .bb.md
  -g / --global: the home board at ~/.brainfile
`.trimEnd());

  // Register commands
  program
    .command('init')
    .description('Initialize a new .brainfile/brainfile.md in the current directory')
    .option('-f, --file <path>', 'Path to brainfile file', '.brainfile/brainfile.md')
    .option('--force', 'Overwrite existing file')
    .option('--tracked', 'Store the board as its own git branch (default inside a git repo) or repository')
    .option('--plain', 'Plain directory, no git tracking, even inside a git repo')
    .option('--here', 'Inside a git repo: create the board in this directory instead of the repo root')
    .action(initCommand);

  program
    .command('migrate')
    .description('Migrate legacy brainfile layouts to v2 (.brainfile/brainfile.md + board/ + logs/)')
    .option('--dir <path>', 'Directory containing legacy brainfile files (default: cwd)')
    .option('--force', 'Overwrite existing migration outputs (task files/backups)')
    .option('--v2', 'Deprecated alias; migration now targets v2 by default')
    .option('--logs-to-ledger', 'Backfill logs/*.md into ledger.jsonl, keeping the markdown archives (resolves ID conflicts with board)')
    .option('--to-branch', 'Move the board onto its own git branch (or repository outside a repo); history is kept, and a code branch that tracked it drops it in one commit')
    .option('--to-plain', 'Turn a tracked board back into a plain directory (the branch is left intact)')
    .addOption(new Option('--commit', 'Accepted for compatibility: --to-branch now always commits the board\'s removal from the code branch').hideHelp())
    .action(migrateCommand);

  const listCmd = program
    .command('list')
    .description('List tasks')
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .option('-c, --column <name>', 'Filter by column')
    .option('-t, --tag <name>', 'Filter by tag')
    .option('--parent <id>', 'Filter by parent task ID (parentId); with --tree, everything under it')
    .option('--type <type>', 'Filter by document type (aliases work: issue, adr); decision lists decisions')
    .option('--tree', 'Print the outline: documents nested under their parents')
    .option('--contract <status>', 'Filter by contract status (ready|in_progress|delivered|done|failed)')
    .option('--related [all]', "Open tasks on related boards this board depends on; 'all' for every open task there")
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
    .option('--type <type>', 'Document type: epic, spec, plan, task (alias issue), decision (alias adr) or one of the board\'s. Determines ID prefix. Default: task')
    .option('--parent <id>', 'Parent ID (parentId); must fit the type (an epic holds specs, plans and tasks)')
    .option('--depends-on <ids>', 'Comma-separated IDs of tasks that come first')
    .option('--decisions <ids>', 'Comma-separated IDs of the decisions this work rests on')
    .option('--source <url>', 'The URL of the issue the task is made from; refused when a task already carries it')
    .option(
      '--child <title>',
      'Create a child task under the newly created parent (repeatable; children default to type: task)',
      (value, previous: string[]) => (previous ? [...previous, value] : [value]),
      []
    )
    .option('--with-contract', 'Attach a draft contract (use --ready to make it immediately dispatchable)')
    .option('--ready', 'When used with --with-contract: set contract status=ready instead of draft')
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

  const patchCmd = program
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
    .option('--parent <id>', 'New parent ID (parentId); must fit the type')
    .option('--clear-parent', 'Remove the parent link')
    .option('--depends-on <ids>', 'Comma-separated task IDs this task depends on (replaces the list)')
    .option('--clear-depends-on', 'Remove all dependencies')
    .option('--decisions <ids>', 'Comma-separated IDs of the decisions this work rests on (replaces the list)')
    .option('--clear-decisions', 'Remove the decisions list')
    .option('--lands-on <branch>', 'The branch its hand-off forks from and lands on (landsOn), inherited by its children')
    .option('--clear-lands-on', 'Remove landsOn: it inherits its parent\'s again, else the trunk')
    .option('--epic-branch', 'On an epic: its children fork from and land on its own branch, dispatch/<id>')
    .option('--clear-epic-branch', 'Turn the epic\'s own branch off')
    .action((options) => { patchCommand(options); });
  patchCmd.addHelpText('after', `\n${PATCH_COMMAND_HELP}`);

  program
    .command('delete')
    .description('Delete a task permanently')
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .option('-t, --task <id>', 'Task ID to delete (required)')
    .option('--force', 'Confirm deletion (required)')
    .action(deleteCommand);

  program
    .command('archive')
    .description('Complete a task locally, or export a completed task to GitHub/Linear')
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .option('-t, --task <id>', 'Task ID to archive')
    .option('--to <destination>', 'Archive destination: local, github, or linear')
    .option('--all', 'Archive all tasks from local archive to external service')
    .option('--dry-run', 'Preview what would be created without making changes')
    .action(archiveCommand);

  program
    .command('restore')
    .description('Reopen a completed task: from logs/ back to a column, out of the ledger (a v1 board: from its archive)')
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .option('-t, --task <id>', 'Task ID to restore (required)')
    .option('-c, --column <name>', 'Target column name or ID (required)')
    .option('-r, --reason <why>', 'Why it is open again, for its log')
    .action(restoreCommand);

  program
    .command('complete')
    .description('Complete a task (moves it to logs/)')
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .option('-t, --task <id>', 'Task ID to complete (required)')
    .option('--force', 'Complete a parent even if its children are still open')
    .action((options) => { completeCommand(options); });

  program
    .command('log')
    .description('View, search, and manage completed task logs (v2 only)')
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .option('-t, --task <id>', 'View a specific task log')
    .option('-s, --search <query>', 'Search across all logs')
    .option('--recent', 'List recently completed tasks')
    .action((options) => { logCommand(options); });

  program
    .command('note')
    .description('Append a timestamped note to a task log')
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .option('-t, --task <id>', 'Task ID to add note to (required)')
    .option('--agent <name>', 'Who wrote it (default: the detected agent, else your git user.name)')
    .argument('[message]', 'Log message to append')
    .action((message, options) => { logNoteCommand({ ...options, message }); });

  program
    .command('brief')
    .description('Per-agent brief: current decisions, your tasks, what changed since you last checked in, the docs that bear on them')
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .option('--agent <name>', 'Agent identifier (required — brief state is per-agent)')
    .option('--max-chars <n>', 'Character budget for the block (default 1600; 0 for no limit)')
    .option('--peek', 'Read the brief without marking it as seen')
    .option('--offline', 'Skip syncing a shared board before the brief')
    .option('--json', 'Output as JSON')
    .action((options) => { briefCommand(options); });

  const syncCmd = program
    .command('sync')
    .description('Share a tracked board through a git remote: fetch, merge, push')
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .option('--pull', 'Fetch and merge only')
    .option('--push', 'Push only')
    .option('--set-remote <name|url>', 'Remote to sync with: an existing remote name, or a URL registered as remote "board"')
    .option('--board-name <name>', 'Name on the remote, stored as refs/brainfile/<name> (default: "board"; folder name for a standalone board; "home" for -g)')
    .addOption(new Option('--remote-branch <name>', '0.21.0 spelling of --board-name').hideHelp())
    .option('--autosync <mode>', 'off | push (after writes, default once a remote is set) | full (also fetch before reads)')
    .option('--json', 'Output as JSON')
    .addOption(new Option('--wait <ms>', 'Sleep before syncing (autosync child)').hideHelp())
    .action((options) => { syncCommand(options); });
  syncCmd.addHelpText('after', `\n${SYNC_COMMAND_HELP}`);

  program
    .command('where')
    .description('Where the board lives, how it is stored, who else has it, and any other copy of it here (offline unless --fetch)')
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .option('--fetch', 'Ask the remote for its copy of the board first')
    .option('--json', 'Output as JSON')
    .action((options) => { whereCommand(options); });

  const issuesCmd = program
    .command('issues')
    .description("The open issues of the project's GitHub repository, each marked with its task when it is on the board; --import makes tasks from them")
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .option('--import <numbers...>', 'Make a task from each of these issues (one already on the board is found, not made again)')
    .option('-c, --column <id>', 'Column the new tasks land in (default: the first that is not done)')
    .option('--json', 'Output as JSON')
    .action(async (options) => { await issuesCommand(options); });
  issuesCmd.addHelpText('after', `\n${ISSUES_COMMAND_HELP}`);

  program
    .command('adopt')
    .description('Make the board at <ref|path> the one board, as it is; the boards it replaces are backed up first')
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .option('--json', 'Output as JSON')
    .argument('<ref|path>', 'A board folder, or a git ref such as refs/heads/brainfile or refs/brainfile/remotes/origin/board')
    .action((ref, options) => { adoptCommand({ ...options, ref }); });

  program
    .command('merge-boards')
    .description('Combine this board with the one at <ref|path> by document ID; adopts outright when one already has everything')
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .option('--json', 'Output as JSON')
    .argument('<ref|path>', 'A board folder, or a git ref such as refs/brainfile/remotes/origin/board')
    .action((ref, options) => { mergeBoardsCommand({ ...options, ref }); });

  program
    .command('backups [action] [name]')
    .description('Boards saved before adopt, merge-boards or a restore replaced them; restore <name> puts one back')
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .option('--json', 'Output as JSON')
    .action((action, name, options) => { backupsCommand({ ...options, action, name }); });

  program
    .command('fix')
    .description("Fix where the board lives when nothing would be lost, as the desktop's Fix does: every copy backed up first; --undo within 20 seconds")
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .option('--dry-run', 'Say what is wrong and what Fix would do; change nothing')
    .option('--undo', 'Put back what the last fix changed (from here, an agent or the desktop), within 20 seconds of it')
    .option('--expected <words>', 'Run only if the plan is still these words, as --dry-run said them')
    .option('--json', 'Output as JSON')
    .action((options) => { fixCommand(options); });

  program
    .command('merge-driver', { hidden: true })
    .description('git merge driver for board files (registered as merge.brainfile.driver)')
    .argument('<base>', 'Common ancestor (%O)')
    .argument('<ours>', 'Current version; receives the result (%A)')
    .argument('<theirs>', 'Other version (%B)')
    .action((base: string, ours: string, theirs: string) => {
      process.exitCode = mergeDriverCommand({ base, ours, theirs });
    });

  program
    .command('search')
    .description('Search the board, its history and the project\'s docs (the local index when Node has node:sqlite)')
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .option('-c, --column <name>', 'Filter by column')
    .option('--type <type>', 'Filter by document type (aliases work: adr finds decisions)')
    .option('--limit <n>', 'Most results per lane (default 20)')
    .option('--no-history', 'Only current results: no completed work or superseded decisions')
    .option('--json', 'Output as JSON')
    .argument('<query>', 'Search query (filter tokens work: p:high #tag @user type:spec due:week contract:ready)')
    .action((query, options) => { searchCommand({ ...options, query }); });

  const checkCmd = program
    .command('check')
    .description('Is a decision still safe to act on? use · review · use_replacement · no_decision (exit 0, 2, 3, 0)')
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .option('-k, --claim-key <key>', 'Check one claim family exactly')
    .option('--claim-key-prefix <prefix>', 'Check every family under a prefix; the verdict is the worst')
    .option('--json', 'Output as JSON')
    .argument('[action...]', 'The action in words, or a decision ID')
    .action((action: string[], options) => { checkCommand({ ...options, query: action.join(' ') }); });
  checkCmd.addHelpText('after', `\n${CHECK_COMMAND_HELP}`);

  program
    .command('index')
    .description('The local search index (.brainfile/state/index.db): refresh, rebuild or show it')
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .option('--rebuild', 'Drop it and index from scratch')
    .option('--status', 'Show what is in it without refreshing')
    .option('--json', 'Output as JSON')
    .action((options) => { indexCommand(options); });

  const decideCmd = program
    .command('decide')
    .description('Record a decision in its claim family; the family\'s current decision is superseded')
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .option('-k, --claim-key <key>', 'Dotted claim family, e.g. dependency.http-client (required)')
    .option('--title <text>', 'Title (default: the first line of the text)')
    .option('--kind <kind>', 'decision (default), preference, constraint or rule')
    .option('--stance <stance>', 'prefers, rejects, requires or forbids (with --subject)')
    .option('--subject <subject>', 'What the stance is about: a package, a pattern, a tool')
    .option('--holds-while <text>', 'The condition under which the decision holds')
    .option('--recheck <text>', 'When or why to look at it again')
    .option('--valid-until <date>', 'Date after which it needs a look (YYYY-MM-DD)')
    .option('--source <path>', 'A file it rests on; its sha256 is recorded and check notices a change')
    .option('--package <spec>', 'A package version it rests on: name<op>version, e.g. zod>=4.3 or engines.node>=20')
    .option('--for <ids>', 'Comma-separated work that rests on it (adds it to their decisions:)')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--no-supersede', 'Keep the family\'s current decision current too (check will say review)')
    .option('--agent <name>', 'Who is deciding (default: the detected agent, else your git user.name)')
    .option('--json', 'Output as JSON')
    .argument('[text...]', 'The decision and why ("-" reads stdin)')
    .action((text: string[], options) => { decideCommand({ ...options, text: text.join(' ') }); });
  decideCmd.addHelpText('after', `\n${DECIDE_COMMAND_HELP}`);

  const supersedeCmd = program
    .command('supersede')
    .description('Replace a decision by hand: a new one in the same family, the old one superseded')
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .option('-k, --claim-key <key>', 'Claim family (default: the old decision\'s)')
    .option('--title <text>', 'Title (default: the first line of the text)')
    .option('--kind <kind>', 'decision, preference, constraint or rule (default: the old decision\'s)')
    .option('--stance <stance>', 'prefers, rejects, requires or forbids (with --subject)')
    .option('--subject <subject>', 'What the stance is about')
    .option('--holds-while <text>', 'The condition under which the decision holds')
    .option('--recheck <text>', 'When or why to look at it again')
    .option('--valid-until <date>', 'Date after which it needs a look (YYYY-MM-DD)')
    .option('--source <path>', 'A file it rests on (sha256 recorded)')
    .option('--package <spec>', 'A package version it rests on: name<op>version')
    .option('--for <ids>', 'Comma-separated work that rests on it')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--agent <name>', 'Who is deciding')
    .option('--json', 'Output as JSON')
    .argument('<id>', 'The decision to supersede')
    .argument('[text...]', 'The new decision and why ("-" reads stdin)')
    .action((id: string, text: string[], options) => { supersedeCommand(id, { ...options, text: text.join(' ') }); });
  supersedeCmd.addHelpText('after', `\n${SUPERSEDE_COMMAND_HELP}`);

  const retireCmd = program
    .command('retire')
    .description('Mark a decision rejected or stale; it moves to logs/')
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .option('--as <status>', 'rejected or stale (required)')
    .option('--note <text>', 'Why, written on the decision\'s log')
    .option('--agent <name>', 'Who is retiring it')
    .option('--json', 'Output as JSON')
    .argument('<id>', 'The decision to retire')
    .action((id: string, options) => { retireCommand(id, options); });
  retireCmd.addHelpText('after', `\n${RETIRE_COMMAND_HELP}`);

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
    .action((options) => {
      if (!templateCommand(options).success) process.exitCode = 1;
    });

  program
    .command('lint')
    .description('Validate and auto-fix brainfile.md syntax')
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .option('--fix', 'Automatically fix issues when possible')
    .option('--check', 'Exit with error code if issues found (for CI/CD)')
    .action((options) => { lintCommand(options); });

  program
    .command('tui')
    .description('Launch the interactive board')
    .option('-f, --file <path>', 'Path to the board file (auto-detected by default)', 'brainfile.md')
    .action((options) => {
      // `program.parse()` is synchronous, so the action's promise is floating —
      // handle rejection here, the same way the auto-launch branch above does.
      void runTui(options).catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      });
    });

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
    .action((options) => {
      if (!contractValidateCommand(options).success) process.exitCode = 1;
    });
  contractValidateCmd.addHelpText('after', `\n${CONTRACT_VALIDATE_HELP}`);

  const contractAttachCmd = contractCmd
    .command('attach')
    .description('Attach a new contract to an existing task (default status=draft)')
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .option('-t, --task <id>', 'Task ID to attach contract to (required)')
    .option('--ready', 'Set contract status=ready instead of draft (immediately dispatchable)')
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

  const contractGraphCmd = contractCmd
    .command('graph')
    .description('Attach contracts to multiple tasks as a dependency graph')
    .allowUnknownOption(true)
    // The graph flags are parsed from argv by parseContractGraphArgs; their
    // values must not count as positional arguments (commander 14 rejects them).
    .allowExcessArguments(true)
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .option('--ready', 'Set attached contracts to status=ready instead of draft')
    .option('--show', 'Print the current task dependency graph')
    .action(() => {
      const rawArgs = process.argv.slice(2);
      const graphIndex = rawArgs.findIndex((arg, index) => arg === 'graph' && rawArgs[index - 1] === 'contract');
      const graphArgs = graphIndex >= 0 ? rawArgs.slice(graphIndex + 1) : [];
      contractGraphCommand(parseContractGraphArgs(graphArgs));
    });
  contractGraphCmd.addHelpText('after', `\n${CONTRACT_GRAPH_HELP}`);

  const contractActivateCmd = contractCmd
    .command('activate')
    .description('Activate one or more draft contracts (draft → ready)')
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .option('-t, --task <id>', 'Task ID to activate (single contract)')
    .option('--parent <id>', 'Activate all draft contracts whose parentId matches this value')
    .action((options) => { contractActivateCommand(options); });
  contractActivateCmd.addHelpText('after', `\n${CONTRACT_ACTIVATE_HELP}`);

  // Add plan command group (first-class plan documents)
  const planCmd = program
    .command('plan')
    .description('Manage first-class plan documents');
  planCmd.addHelpText('after', `\n${PLAN_COMMAND_HELP}`);

  planCmd
    .command('add')
    .description('Create a new plan document')
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .option('-t, --title <title>', 'Plan title (required)')
    .option('-c, --column <id>', 'Column to place the plan in (default: todo)')
    .option('--description <text>', 'Plan description (written to the markdown body)')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--parent <id>', 'Parent epic or spec ID')
    .option('--status <status>', 'Free-form status (e.g. draft, active, superseded)')
    .action((options) => { planAddCommand(options); });

  planCmd
    .command('list')
    .description('List plan documents')
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .option('--status <status>', 'Filter by free-form status')
    .action((options) => { planListCommand(options); });

  planCmd
    .command('show')
    .description('Show a plan document')
    .argument('<plan-id>', 'Plan ID to show')
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .option('--json', 'Output in JSON format')
    .action((planId, options) => { planShowCommand({ ...options, plan: planId }); });

  planCmd
    .command('link')
    .description('Link a task to a plan (sets the task\'s parentId)')
    .argument('<plan-id>', 'Plan ID to link to')
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .option('-t, --task <id>', 'Task ID to link (required)')
    .action((planId, options) => { planLinkCommand({ ...options, plan: planId }); });

  // Add schema command
  const schemaCmd = program
    .command('schema [name]')
    .description('View and manage brainfile schemas')
    .option('--json', 'Output in JSON format')
    .action((name, options) => { schemaCommand({ name, json: options.json }); });
  schemaCmd.addHelpText('after', `\n${SCHEMA_COMMAND_HELP}`);

  // Add ADR command group
  const adrCmd = program
    .command('adr')
    .description('Manage Architectural Decision Records (ADR) lifecycle');
  adrCmd.addHelpText('after', `\n${ADR_COMMAND_HELP}`);

  adrCmd
    .command('promote')
    .description('Mark an ADR accepted and move it to logs/')
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .option('-t, --task <id>', 'ADR task ID to promote (required)')
    .action((options) => { adrPromoteCommand(options); });

  // Add types command
  const typesCmd = program
    .command('types [action]')
    .description('Every document type and its place in the graph; add your own')
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .option('--json', 'Output in JSON format (list action)')
    .option('--like <type>', 'Take a built-in type\'s place: epic, spec, plan, task or decision (add action)')
    .option('--id-prefix <prefix>', 'ID prefix to use for the type (add action; default: type name)')
    .option('--completable <bool>', 'Whether this type can be completed (add action; default: true, or its like: type\'s rule)')
    .option('--schema <url>', 'Optional schema URL/path for this type (add action)')
    .argument('[name]', 'Type name (required for add action)')
    .action((action, name, options) => {
      const normalizedAction = (action || 'list').toLowerCase();

      if (normalizedAction === 'list') {
        typesListCommand({
          file: options.file,
          json: options.json,
        });
        return;
      }

      if (normalizedAction === 'add') {
        const completable =
          options.completable !== undefined
            ? parseBooleanFlag(String(options.completable))
            : undefined;

        typesAddCommand({
          file: options.file,
          name,
          idPrefix: options.idPrefix,
          completable,
          schema: options.schema,
          like: options.like,
        });
        return;
      }

      throw new Error(`Unknown types action: ${action}`);
    });
  typesCmd.addHelpText('after', `
Built in, no config needed:
  ▸ epic      holds specs, plans and tasks; done when everything under it is
  ◆ spec      what to build and why; goes under an epic, holds plans and tasks
  ⎘ plan      how, and in what order; goes under an epic or spec, holds tasks
    task      one piece of work (alias issue); goes under any of these, holds tasks
  ● decision  a standing choice (alias adr); no column, never completed, never in the tree

Examples:
  brainfile types
  brainfile types --json
  brainfile types add bug --like task
  brainfile types add rfc --like spec --id-prefix rfc`);

  // Columns (spec-13): the same core operations as the MCP columns tool.
  const columnsCmd = program
    .command('columns')
    .description('List, add, rename, reorder and remove the board\'s columns');
  columnsCmd.addHelpText('after', `\n${COLUMNS_COMMAND_HELP}`);

  columnsCmd
    .command('list', { isDefault: true })
    .description('List the columns in order, with how many tasks each holds (the default)')
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .option('--json', 'Output as JSON')
    .action((options) => { columnsListCommand(options); });

  columnsCmd
    .command('add')
    .description('Add a column (last, unless --after or --before)')
    .argument('<title>', 'Column title')
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .option('--id <id>', 'Column ID (default: from the title, "In Review" → in-review)')
    .option('--after <column>', 'Place it after this column (ID or title)')
    .option('--before <column>', 'Place it before this column (ID or title)')
    .option('--completion', 'Tasks moved into it are completed (completionColumn: true)')
    .option('--json', 'Output as JSON')
    .action((title: string, options) => { columnsAddCommand(title, options); });

  columnsCmd
    .command('rename')
    .description('Give a column a new title; its ID, and so its tasks, stay')
    .argument('<column>', 'Column ID or title')
    .argument('<title>', 'New title')
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .option('--json', 'Output as JSON')
    .action((column: string, title: string, options) => { columnsRenameCommand(column, title, options); });

  columnsCmd
    .command('reorder')
    .description('Reorder the columns: the ones named first, in that order, the rest after')
    .argument('<columns...>', 'Column IDs or titles in their new order')
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .option('--json', 'Output as JSON')
    .action((columns: string[], options) => { columnsReorderCommand(columns, options); });

  columnsCmd
    .command('remove')
    .description('Remove a column; one that holds tasks needs --move-to')
    .argument('<column>', 'Column ID or title')
    .option('-f, --file <path>', 'Path to brainfile file (auto-detect by default)', 'brainfile.md')
    .option('--move-to <column>', 'Move its tasks to this column first (they are not completed)')
    .option('--json', 'Output as JSON')
    .action((column: string, options) => { columnsRemoveCommand(column, options); });

  return program;
}
