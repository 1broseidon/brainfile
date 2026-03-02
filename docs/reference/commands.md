---
title: CLI Command Reference
description: Complete reference of all Brainfile CLI commands
---

# CLI Command Reference

Complete documentation for all `@brainfile/cli` commands.

::: tip Most Used Commands
| Command | Jump to |
|---------|---------|
| `brainfile add` | [Create tasks](#add) with contracts, subtasks, and metadata |
| `brainfile list` | [Filter and display](#list) tasks by column, tag, or contract status |
| `brainfile move` | [Move tasks](#move) between columns |
| `brainfile complete` | [Complete tasks](#complete) — append to `ledger.jsonl` and archive to `logs/` |
| `brainfile contract` | [Manage contracts](#contract) — pickup, deliver, validate |
| `brainfile patch` | [Update fields](#patch) on existing tasks |
:::

## Command Overview

```bash
brainfile [file]        # Open TUI (auto-detects .brainfile/brainfile.md)
brainfile <command>     # Run CLI command
brainfile mcp           # Start MCP server for AI assistants
```

## Commands

| Command | Description |
|---------|-------------|
| [`init`](#init) | Create a new brainfile |
| [`list`](#list) | Display tasks |
| [`show`](#show) | Display single task details |
| [`add`](#add) | Create a new task |
| [`move`](#move) | Move task between columns |
| [`patch`](#patch) | Update task fields |
| [`delete`](#delete) | Permanently delete a task |
| [`archive`](#archive) | Archive a task |
| [`restore`](#restore) | Restore from archive |
| [`subtask`](#subtask) | Manage subtasks |
| [`lint`](#lint) | Validate and fix syntax |
| [`template`](#template) | Create from templates |
| [`tui`](#tui) | Interactive terminal UI |
| [`hooks`](#hooks) | AI agent hook integration |
| [`complete`](#complete) | Complete a task (append to `ledger.jsonl` and archive to `logs/`) |
| [`contract`](#contract) | Manage agent-to-agent contracts |
| [`adr`](#adr) | ADR lifecycle management |
| [`rules`](#rules) | Manage project rules |
| [`types`](#types) | Document type management |
| [`search`](#search) | Search tasks and logs |
| [`log`](#log) | View completed task logs |
| [`migrate`](#migrate) | Move brainfile to .brainfile/ directory |
| [`config`](#config) | Manage user configuration |
| [`auth`](#auth) | Authenticate with external services |
| [`mcp`](#mcp) | MCP server for AI assistants |

---

## init

Create a new `.brainfile/` project directory with board config, `board/`, and `logs/`.

```bash
brainfile init
brainfile init --force  # Overwrite existing
```

**Options:**
| Option | Description |
|--------|-------------|
| `-f, --file <path>` | Output path (default: `.brainfile/brainfile.md`) |
| `--force` | Overwrite if file exists |

---

## list

Display all tasks with optional filtering.

::: tip Essential Command
`list` is the go-to command for finding tasks. Combine filters like `--column` and `--tag` to narrow results. Use `--contract ready` to find work waiting for agents.
:::

```bash
brainfile list
brainfile list --column "In Progress"
brainfile list --tag bug
brainfile list --contract ready
```

**Options:**
| Option | Description |
|--------|-------------|
| `-f, --file <path>` | Path to brainfile (auto-detects `.brainfile/brainfile.md`) |
| `-c, --column <name>` | Filter by column |
| `-t, --tag <name>` | Filter by tag |
| `--parent <id>` | Filter by parent task ID (`parentId`) |
| `--contract <status>` | Filter by contract status (`ready`, `in_progress`, `delivered`, `done`, `failed`, `blocked`) |

---

## show

Display full details of a single task.

```bash
brainfile show --task task-1
brainfile show -t task-42
```

**Options:**
| Option | Description |
|--------|-------------|
| `-t, --task <id>` | Task ID (required) |
| `-f, --file <path>` | Path to brainfile (auto-detects `.brainfile/brainfile.md`) |
| `--json` | Output task data as JSON |

**Output includes:**
- Task ID, title, column, priority, tags, assignee
- Full description
- Subtasks with completion status
- Related files
- Contract details (if present)

---

## add

Create a new task with all available fields.

::: tip Power Command
`add` supports one-shot creation of tasks with contracts, subtasks, and full metadata. Use `--with-contract` along with `--deliverable` and `--validation` to create ready-to-assign work items.
:::

```bash
brainfile add --title "Implement auth"
brainfile add --title "Fix bug" --priority high --tags "bug,urgent"
brainfile add --title "Auth overhaul" --child "OAuth flow" --child "Session handling"
brainfile add --title "Design doc" --type adr --column todo
```

**Options:**
| Option | Description |
|--------|-------------|
| `-t, --title <text>` | Task title (required) |
| `-c, --column <name>` | Target column (default: `todo`) |
| `-d, --description <text>` | Task description |
| `-p, --priority <level>` | `low`, `medium`, `high`, or `critical` |
| `--type <type>` | Document type (e.g., `epic`, `adr`; default: `task`) |
| `--parent <id>` | Parent task/epic ID |
| `--child <title>` | Create child task(s) under the new parent (repeatable) |
| `--tags <list>` | Comma-separated tags |
| `--assignee <name>` | Assignee name |
| `--due-date <date>` | Due date (YYYY-MM-DD) |
| `--subtasks <list>` | Comma-separated subtask titles |
| `--files <list>` | Comma-separated related file paths |
| `--with-contract` | Attach a contract (status=ready) |
| `--deliverable <spec>` | Contract deliverable: `type:path:description` (repeatable) |
| `--validation <command>` | Contract validation command (repeatable) |
| `--constraint <text>` | Contract constraint (repeatable) |

---

## move

Move a task to a different column.

::: tip Workflow Progression
Use `move` to progress tasks through your workflow. Moving to a completion column (if configured) can auto-complete the task.
:::

```bash
brainfile move --task task-1 --column "In Progress"
brainfile move --task task-5 --column done
```

**Options:**
| Option | Description |
|--------|-------------|
| `-t, --task <id>` | Task ID (required) |
| `-c, --column <name>` | Target column (required) |

---

## patch

Update specific fields of a task. Use `--clear-*` options to remove fields.

```bash
brainfile patch --task task-1 --priority critical
brainfile patch --task task-1 --title "Updated" --tags "new,tags"
brainfile patch --task task-1 --clear-assignee
```

**Options:**
| Option | Description |
|--------|-------------|
| `-t, --task <id>` | Task ID (required) |
| `--title <text>` | New title |
| `--description <text>` | New description |
| `--priority <level>` | New priority |
| `--tags <list>` | New tags (comma-separated) |
| `--assignee <name>` | New assignee |
| `--due-date <date>` | New due date |
| `--clear-description` | Remove description |
| `--clear-priority` | Remove priority |
| `--clear-tags` | Remove tags |
| `--clear-assignee` | Remove assignee |
| `--clear-due-date` | Remove due date |

---

## delete

Permanently delete a task. Requires confirmation.

```bash
brainfile delete --task task-1 --force
```

**Options:**
| Option | Description |
|--------|-------------|
| `-t, --task <id>` | Task ID (required) |
| `--force` | Confirm deletion (required) |

---

## archive

Archive a task locally or to an external service (GitHub Issues, Linear).

```bash
brainfile archive --task task-1
brainfile archive --task task-1 --to github
brainfile archive --all --to linear --dry-run
```

**Options:**
| Option | Description |
|--------|-------------|
| `-t, --task <id>` | Task ID to archive |
| `--to <destination>` | Archive destination: `local`, `github`, or `linear` |
| `--all` | Archive all tasks from local archive to external service |
| `--dry-run` | Preview what would be created without making changes |

---

## restore

Restore an archived task to a column.

```bash
brainfile restore --task task-1 --column todo
```

**Options:**
| Option | Description |
|--------|-------------|
| `-t, --task <id>` | Task ID (required) |
| `-c, --column <name>` | Target column (required) |

---

## subtask

Manage subtasks within a task.

```bash
brainfile subtask --task task-1 --add "New subtask"
brainfile subtask --task task-1 --toggle task-1-1
brainfile subtask --task task-1 --update task-1-1 --title "Updated"
brainfile subtask --task task-1 --delete task-1-2
```

**Options:**
| Option | Description |
|--------|-------------|
| `-t, --task <id>` | Parent task ID (required) |
| `--add <title>` | Add a new subtask |
| `--toggle <id>` | Toggle subtask completion |
| `--update <id>` | Update subtask (use with `--title`) |
| `--delete <id>` | Delete a subtask |
| `--title <text>` | New title (for `--update`) |

---

## lint

Validate brainfile syntax and auto-fix issues.

```bash
brainfile lint              # Check for issues
brainfile lint --fix        # Auto-fix issues
brainfile lint --check      # Exit with error (for CI)
```

**Options:**
| Option | Description |
|--------|-------------|
| `-f, --file <path>` | Path to brainfile (auto-detects `.brainfile/brainfile.md`) |
| `--fix` | Automatically fix issues |
| `--check` | Exit with error code if issues found |

**What it checks:**
- YAML syntax errors
- Unquoted strings with colons (auto-fixable)
- Duplicate column IDs
- Missing required fields

---

## template

Create tasks from built-in templates.

```bash
brainfile template --list
brainfile template --use bug-report --title "Login fails"
brainfile template --use feature-request --title "Dark mode"
```

**Options:**
| Option | Description |
|--------|-------------|
| `-l, --list` | List available templates |
| `-u, --use <id>` | Create from template |
| `--title <text>` | Task title (required with `--use`) |
| `--description <text>` | Task description |
| `-c, --column <name>` | Target column (default: `todo`) |

**Built-in Templates:**
- `bug-report` — Bug tracking with triage steps
- `feature-request` — Feature proposals
- `refactor` — Code refactoring tasks

---

## tui

Launch interactive terminal UI. This is the default when running `brainfile` without arguments.

```bash
brainfile              # Opens TUI (auto-detects .brainfile/brainfile.md)
brainfile ./tasks.md   # Opens TUI with specific file
brainfile tui          # Explicit TUI command
```

**Keyboard Controls:**

| Key | Action |
|-----|--------|
| `TAB` / `Shift+TAB` | Navigate columns |
| `j`/`k` or `↑`/`↓` | Navigate tasks |
| `Enter` | Expand/collapse task |
| `/` | Search tasks |
| `?` | Show help |
| `r` | Refresh |
| `q` | Quit |

---

## hooks

Install integration hooks for AI coding assistants.

```bash
brainfile hooks install claude-code
brainfile hooks install cursor --scope project
brainfile hooks install cline
brainfile hooks list
brainfile hooks uninstall claude-code --scope all
```

**Supported Assistants:**
- Claude Code
- Cursor
- Cline

**Options:**
| Option | Description |
|--------|-------------|
| `--scope <scope>` | `user` (default), `project`, or `all` |

---

## complete

Complete a task — appends a record to `ledger.jsonl` and moves it from `board/` to `logs/`.

::: tip Board Hygiene
`complete` archives finished work to `logs/`, keeping your active board clean. Use `--force` for epics with remaining child tasks.
:::

```bash
brainfile complete --task task-1
brainfile complete -t epic-1 --force
```

**Options:**
| Option | Description |
|--------|-------------|
| `-t, --task <id>` | Task ID (required) |
| `--force` | Force epic completion even if child tasks are still active |

---

## contract

Manage the lifecycle of agent-to-agent contracts.

::: tip Agent Coordination
The `contract` command drives the full agent-to-agent workflow: `pickup` → `deliver` → `validate`. See the [Contracts Guide](/guides/contracts) for lifecycle details.
:::

```bash
brainfile contract pickup --task task-1
brainfile contract deliver --task task-1
brainfile contract validate --task task-1
brainfile contract attach --task task-1 --deliverable "file:src/feature.ts:Implementation"
```

**Subcommands:**
| Command | Description |
|---------|-------------|
| `pickup` | Claim a contract and set status to in_progress |
| `deliver` | Mark contract as delivered (ready for validation) |
| `validate` | Check deliverables and run validation commands |
| `attach` | Add contract to existing task |

**Common Options:**
| Option | Description |
|--------|-------------|
| `-t, --task <id>` | Task ID (required) |
| `-f, --file <path>` | Path to brainfile (auto-detects `.brainfile/brainfile.md`) |

**Attach Options:**
| Option | Description |
|--------|-------------|
| `--deliverable <spec>` | Add deliverable (format: `type:path:description`) |
| `--validation <command>` | Add validation command (repeatable) |
| `--constraint <text>` | Add constraint (repeatable) |

See the [Contract Commands Reference](/cli/contract-commands) for detailed documentation.

---

## adr

Manage Architecture Decision Records.

```bash
brainfile adr promote -t adr-1 --category always
```

**Options:**
| Option | Description |
|--------|-------------|
| `-t, --task <id>` | ADR task ID (required) |
| `--category <cat>` | Rule category: `prefer`, `always`, `never`, `context` |

---

## rules

Manage project rules.

```bash
brainfile rules                          # List all rules
brainfile rules list --category always   # Filter by category
brainfile rules add always "Write tests" # Add a rule
brainfile rules delete always 1          # Delete rule by ID
```

---

## types

Inspect and manage board document types.

```bash
brainfile types list
brainfile types add epic --completable true --id-prefix epic
```

---

## search

Search across active tasks and completed logs.

```bash
brainfile search "auth"
brainfile search "bug" --column todo
```

---

## log

View and search completed task logs.

```bash
brainfile log                      # List recent completions
brainfile log -t task-10           # View specific log
brainfile log --search "auth"      # Search logs
```

---

## note

Append a timestamped note to a task's log section.

```bash
brainfile note -t task-1 "Started implementation"
brainfile note -t task-1 "Fixed failing test" --agent codex
```

**Options:**
| Option | Description |
|--------|-------------|
| `-t, --task <id>` | Task ID (required) |
| `--agent <name>` | Agent name for attribution |
| `[message]` | Log message to append (positional argument) |

---

## migrate

Move root brainfile.md to .brainfile/ directory structure.

```bash
brainfile migrate
brainfile migrate --dir ./project
brainfile migrate --force
```

**Options:**
| Option | Description |
|--------|-------------|
| `--dir <path>` | Project directory (default: current directory) |
| `--force` | Overwrite existing .brainfile/brainfile.md |

**What it does:**
- Creates `.brainfile/` directory
- Moves `brainfile.md` → `.brainfile/brainfile.md`
- Creates `.brainfile/.gitignore` (ignores state.json)
- Preserves all content exactly

---

## config

Manage user configuration stored in `~/.config/brainfile/config.json`.

```bash
brainfile config list
brainfile config get archive.default
brainfile config set archive.default github
brainfile config path
```

**Subcommands:**
| Command | Description |
|---------|-------------|
| `list` | Show all configuration values |
| `get <key>` | Get specific config value |
| `set <key> <value>` | Set config value |
| `path` | Show config file path |

**Common Config Keys:**
- `archive.default` — Default archive destination (`local`, `github`, `linear`)
- `archive.github.owner` — GitHub repository owner
- `archive.github.repo` — GitHub repository name
- `archive.linear.teamId` — Linear team ID

---

## auth

Authenticate with external services for archive functionality.

```bash
brainfile auth github
brainfile auth linear --token <api-key>
brainfile auth status
brainfile auth logout github
```

**Subcommands:**
| Command | Description |
|---------|-------------|
| `github [--token <token>]` | Authenticate with GitHub (auto-detects gh CLI or uses OAuth) |
| `linear --token <token>` | Authenticate with Linear API |
| `status` | Show authentication status for all services |
| `logout [provider] [--all]` | Log out from service(s) |

**Options:**
| Option | Description |
|--------|-------------|
| `--token <token>` | API token (required for Linear, optional for GitHub) |
| `--all` | Log out from all services |

---

## mcp

Start an MCP (Model Context Protocol) server for AI assistant integration.

```bash
brainfile mcp
brainfile mcp --file ./project/brainfile.md
```

**Options:**
| Option | Description |
|--------|-------------|
| `-f, --file <path>` | Path to brainfile (auto-detects `.brainfile/brainfile.md`) |

**Available MCP Tools (30):**

*Task Management:*

| Tool | Description |
|------|-------------|
| `list_tasks` | List tasks with optional filtering (column, tag, type, contract status) |
| `get_task` | Get detailed information about a specific task |
| `search_tasks` | Search tasks by query, column, priority, assignee |
| `add_task` | Create a task with title, priority, tags, type, relatedFiles, contracts |
| `move_task` | Move task between columns |
| `patch_task` | Update task fields |
| `delete_task` | Permanently delete a task |
| `complete_task` | Complete a task (append to `ledger.jsonl` and archive) |

*Bulk Operations:*

| Tool | Description |
|------|-------------|
| `bulk_move_tasks` | Move multiple tasks to a column |
| `bulk_patch_tasks` | Apply same patch to multiple tasks |
| `bulk_delete_tasks` | Delete multiple tasks |
| `bulk_archive_tasks` | Archive multiple tasks |

*Archiving:*

| Tool | Description |
|------|-------------|
| `archive_task` | Archive a task (local, GitHub, or Linear) |
| `restore_task` | Restore from archive |

*Subtasks:*

| Tool | Description |
|------|-------------|
| `add_subtask` | Add a subtask |
| `toggle_subtask` | Toggle subtask completion |
| `update_subtask` | Update subtask title |
| `delete_subtask` | Delete a subtask |
| `bulk_set_subtasks` | Set multiple subtasks to completed or incomplete |
| `complete_all_subtasks` | Mark all subtasks as completed or incomplete |

*Agent Contracts:*

| Tool | Description |
|------|-------------|
| `contract_pickup` | Claim a contract (status → in_progress) |
| `contract_deliver` | Mark contract as delivered |
| `contract_validate` | Check deliverables and run validation commands |
| `attach_contract` | Add contract to existing task |

*Logs, Types, and Rules:*

| Tool | Description |
|------|-------------|
| `search_logs` | Search completed task logs |
| `append_log` | Append a timestamped log entry to a task |
| `list_types` | List board type configuration |
| `list_rules` | List project rules |
| `add_rule` | Add a project rule |
| `delete_rule` | Delete a project rule |

---

## Global Options

| Option | Description |
|--------|-------------|
| `--help` | Display help for command |
| `--version` | Display CLI version |

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Error (invalid arguments, file not found) |
| `2` | Validation error (with `lint --check`) |

---

## CI/CD Integration

### GitHub Actions

```yaml
name: Validate Brainfile
on: [push, pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Validate
        run: npx @brainfile/cli lint --check
```

### Pre-commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit

if [ -f "brainfile.md" ]; then
  npx @brainfile/cli lint --check
  if [ $? -ne 0 ]; then
    echo "brainfile.md has validation errors"
    exit 1
  fi
fi
```

### npm Scripts

```json
{
  "scripts": {
    "tasks": "brainfile list",
    "tasks:lint": "brainfile lint --fix",
    "precommit": "brainfile lint --check"
  }
}
```

---

## Next Steps

- [CLI & TUI Guide](/tools/cli) — Getting started with the CLI
- [MCP Server](/tools/mcp) — AI assistant integration
- [Protocol Specification](/reference/protocol) — File format details
