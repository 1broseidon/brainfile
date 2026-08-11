---
title: CLI Command Reference
description: Complete reference of all Brainfile CLI commands
---

# CLI Command Reference

Complete documentation for all `brainfile` CLI commands.

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
| [`note`](#note) | Append a timestamped note to a task log |
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
| `-f, --file <path>` | Path to brainfile file (default: `.brainfile/brainfile.md`) |
| `--force` | Overwrite existing file |

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
| `-f, --file <path>` | Path to brainfile file (auto-detect by default) |
| `-c, --column <name>` | Filter by column |
| `-t, --tag <name>` | Filter by tag |
| `--parent <id>` | Filter by parent task ID (`parentId`) |
| `--contract <status>` | Filter by contract status (`ready` \| `in_progress` \| `delivered` \| `done` \| `failed`) |

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
| `-f, --file <path>` | Path to brainfile file (auto-detect by default) |
| `-t, --task <id>` | Task ID to show (required) |
| `--json` | Output task data as JSON |

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
| `-f, --file <path>` | Path to brainfile file (auto-detect by default) |
| `-c, --column <name>` | Column to add task to (default: `todo`) |
| `-t, --title <text>` | Task title (required) |
| `-d, --description <text>` | Task description |
| `-p, --priority <level>` | Priority level (`low`, `medium`, `high`, `critical`) |
| `--tags <tags>` | Comma-separated tags |
| `--assignee <name>` | Assignee name |
| `--due-date <date>` | Due date (YYYY-MM-DD) |
| `--subtasks <titles>` | Comma-separated subtask titles |
| `--files <paths>` | Comma-separated related file paths |
| `--type <type>` | Document type (e.g., `epic`, `adr`); determines ID prefix |
| `--parent <id>` | Parent task ID (sets `parentId` on the new task file) |
| `--child <title>` | Create a child task under the new parent (repeatable) |
| `--with-contract` | Attach a draft contract |
| `--ready` | With `--with-contract`: set contract `status: ready` instead of `draft` |
| `--deliverable <spec>` | Contract deliverable `type:path:description` (repeatable) |
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
| `-f, --file <path>` | Path to brainfile file (auto-detect by default) |
| `-t, --task <id>` | Task ID to move (required) |
| `-c, --column <name>` | Target column name or ID (required) |

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
| `-f, --file <path>` | Path to brainfile file (auto-detect by default) |
| `-t, --task <id>` | Task ID to update (required) |
| `--title <text>` | New task title |
| `-d, --description <text>` | New task description |
| `-p, --priority <level>` | Priority (`low`, `medium`, `high`, `critical`, or `none` to remove) |
| `--tags <tags>` | Comma-separated tags (replaces existing) |
| `--assignee <name>` | Assignee name |
| `--due-date <date>` | Due date (YYYY-MM-DD) |
| `--clear-tags` | Remove all tags |
| `--clear-assignee` | Remove assignee |
| `--clear-due-date` | Remove due date |
| `--clear-priority` | Remove priority |

---

## delete

Permanently delete a task. Requires confirmation.

```bash
brainfile delete --task task-1 --force
```

**Options:**
| Option | Description |
|--------|-------------|
| `-f, --file <path>` | Path to brainfile file (auto-detect by default) |
| `-t, --task <id>` | Task ID to delete (required) |
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
| `-f, --file <path>` | Path to brainfile file (auto-detect by default) |
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
| `-f, --file <path>` | Path to brainfile file (auto-detect by default) |
| `-t, --task <id>` | Task ID to restore (required) |
| `-c, --column <name>` | Target column name or ID (required) |

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
| `-f, --file <path>` | Path to brainfile file (auto-detect by default) |
| `-t, --task <id>` | Parent task ID (required) |
| `--add <title>` | Add a new subtask |
| `--delete <subtask-id>` | Delete a subtask |
| `--update <subtask-id>` | Update a subtask (requires `--title`) |
| `--toggle <subtask-id>` | Toggle subtask completion |
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
| `-f, --file <path>` | Path to brainfile file (auto-detect by default) |
| `--fix` | Automatically fix issues when possible |
| `--check` | Exit with error code if issues found (for CI/CD) |

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
| `-f, --file <path>` | Path to brainfile file (auto-detect by default) |
| `-l, --list` | List all available templates |
| `-u, --use <template-id>` | Create task from template |
| `--title <text>` | Task title (for template usage) |
| `--description <text>` | Task description (for template usage) |
| `-c, --column <name>` | Column to add task to (default: `todo`) |

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
| `--scope <scope>` | Installation scope: `user` or `project` (uninstall also accepts `all`) |

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
| `-f, --file <path>` | Path to brainfile file (auto-detect by default) |
| `-t, --task <id>` | Task ID (required) |
| `--force` | Force epic completion even if child tasks are still active |

::: info Auto-Completion Cascade
When a task is completed:
1. **Parent auto-completion**: If this task is a child and all sibling tasks are also complete, the parent task auto-completes
2. **Dependency unblocking**: Tasks blocked by this task (via `blockedBy`) become unblocked
3. **Auto-dispatch**: Newly unblocked tasks with contracts are automatically dispatched to their assigned agents

This creates a cascading execution flow where completing one task can trigger the next phase of work automatically.
:::

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
| `attach` | Add contract to existing task (default status `draft`) |
| `graph` | Attach contracts to multiple tasks as a dependency graph |
| `activate` | Activate one or more draft contracts (draft → ready) |

**Common Options:**
| Option | Description |
|--------|-------------|
| `-t, --task <id>` | Task ID (required) |
| `-f, --file <path>` | Path to brainfile (auto-detects `.brainfile/brainfile.md`) |

**Attach Options:**
| Option | Description |
|--------|-------------|
| `--ready` | Set contract `status: ready` instead of `draft` |
| `--deliverable <spec>` | Add deliverable (format: `type:path:description`) |
| `--validation <command>` | Add validation command (repeatable) |
| `--constraint <text>` | Add constraint (repeatable) |

::: info Auto-Retry on Validation Failure
If `contract.maxRetries` is set and validation fails, the system automatically:
1. Captures validation output as feedback in `contract.feedback`
2. Resets contract status to `ready`
3. Re-dispatches the task to the agent for rework
:::

See the [Contract Commands Reference](/cli/contract-commands) for detailed documentation.

---

## adr

Manage Architecture Decision Records.

```bash
brainfile adr promote -t adr-1 --category always
```

**Options (promote):**
| Option | Description |
|--------|-------------|
| `-f, --file <path>` | Path to brainfile file (auto-detect by default) |
| `-t, --task <id>` | ADR task ID to promote (required) |
| `--category <category>` | Rule category (`prefer` \| `always` \| `never` \| `context`) |

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
| `-f, --file <path>` | Path to brainfile file (auto-detect by default) |
| `-t, --task <id>` | Task ID to add note to (required) |
| `--agent <name>` | Agent name for attribution |

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
| `--dir <path>` | Directory containing legacy brainfile files (default: cwd) |
| `--force` | Overwrite existing migration outputs (task files/backups) |
| `--logs-to-ledger` | Migrate `logs/*.md` files into `ledger.jsonl` |

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
| `list` | Show all config values |
| `get <key>` | Get a specific config value |
| `set <key> <value>` | Set a config value |
| `path` | Show config file path |

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
| `github` | Authenticate with GitHub (`--token` or OAuth device flow) |
| `linear` | Authenticate with Linear (`--token` required) |
| `status` | Show authentication status for all providers |
| `logout [provider]` | Log out from a provider (`github`, `linear`, or `--all`) |

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
| `-f, --file <path>` | Path to brainfile file (auto-detect by default) |

---

## Global Options

| Option | Description |
|--------|-------------|
| `-V, --version` | Output the version number |
| `-h, --help` | Display help for a command |
| `-f, --file <path>` | Most commands accept a brainfile path (auto-detects `.brainfile/brainfile.md` by default) |

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
        run: npx brainfile lint --check
```

### Pre-commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit

if [ -f "brainfile.md" ]; then
  npx brainfile lint --check
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
- [Board Format Reference](/reference/protocol) — File format details
