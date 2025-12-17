---
title: CLI Commands
description: Complete reference of all Brainfile CLI commands
---

## Command Overview

```bash
brainfile [file]        # Open TUI (default: brainfile.md)
brainfile <command>     # Run CLI command
brainfile mcp           # Start MCP server for AI assistants
```

## Commands

| Command | Description |
|---------|-------------|
| [`init`](#init) | Create a new brainfile |
| [`list`](#list) | Display tasks |
| [`add`](#add) | Create a new task |
| [`move`](#move) | Move task between columns |
| [`patch`](#patch) | Update task fields |
| [`delete`](#delete) | Permanently delete a task |
| [`archive`](#archive) | Archive a task (local, GitHub, or Linear) |
| [`restore`](#restore) | Restore from archive |
| [`subtask`](#subtask) | Manage subtasks |
| [`lint`](#lint) | Validate and fix syntax |
| [`template`](#template) | Create from templates |
| [`tui`](#tui) | Interactive terminal UI |
| [`hooks`](#hooks) | AI agent hook integration |
| [`auth`](#auth) | Authenticate with GitHub/Linear |
| [`config`](#config) | Manage CLI configuration |
| [`contract`](#contract) | Manage agent-to-agent contracts |
| [`mcp`](#mcp) | MCP server for AI assistants |

---

## init

Create a new brainfile in your project.

```bash
brainfile init
brainfile init --file ./tasks.md
brainfile init --force  # Overwrite existing
```

**Options:**
- `-f, --file <path>` - Output path (default: `brainfile.md`)
- `--force` - Overwrite if file exists

---

## list

Display all tasks with optional filtering.

```bash
brainfile list
brainfile list --column "In Progress"
brainfile list --tag bug
```

**Options:**
- `-f, --file <path>` - Path to brainfile (default: `brainfile.md`)
- `-c, --column <name>` - Filter by column
- `-t, --tag <name>` - Filter by tag

---

## add

Create a new task with all available fields.

```bash
brainfile add --title "Implement auth"
brainfile add --title "Fix bug" --priority high --tags "bug,urgent"
brainfile add --title "Review PR" --assignee john --due-date 2025-02-01
brainfile add --title "Fix auth bug" --files "src/auth.ts,src/login.tsx"
brainfile add --title "Implement API" --with-contract --deliverable "src/api.ts"
```

**Options:**
- `-t, --title <text>` - Task title (required)
- `-c, --column <name>` - Target column (default: `todo`)
- `-d, --description <text>` - Task description
- `-p, --priority <level>` - `low`, `medium`, `high`, or `critical`
- `--tags <list>` - Comma-separated tags
- `--assignee <name>` - Assignee name
- `--due-date <date>` - Due date (YYYY-MM-DD)
- `--subtasks <list>` - Comma-separated subtask titles
- `--files <list>` - Comma-separated related file paths
- `--with-contract` - Initialize with an empty contract
- `--deliverable <path:desc>` - Add deliverable (repeatable)
- `--validation <command>` - Add validation command (repeatable)
- `--constraint <text>` - Add constraint (repeatable)

---

## move

Move a task to a different column.

```bash
brainfile move --task task-1 --column "In Progress"
brainfile move --task task-5 --column done
```

**Options:**
- `-t, --task <id>` - Task ID (required)
- `-c, --column <name>` - Target column (required)

---

## patch

Update specific fields of a task. Use `--clear-*` options to remove fields.

```bash
brainfile patch --task task-1 --priority critical
brainfile patch --task task-1 --title "Updated" --tags "new,tags"
brainfile patch --task task-1 --clear-assignee
```

**Options:**
- `-t, --task <id>` - Task ID (required)
- `--title <text>` - New title
- `--description <text>` - New description
- `--priority <level>` - New priority
- `--tags <list>` - New tags (comma-separated)
- `--assignee <name>` - New assignee
- `--due-date <date>` - New due date
- `--clear-description` - Remove description
- `--clear-priority` - Remove priority
- `--clear-tags` - Remove tags
- `--clear-assignee` - Remove assignee
- `--clear-due-date` - Remove due date

---

## delete

Permanently delete a task. Requires confirmation.

```bash
brainfile delete --task task-1 --force
```

**Options:**
- `-t, --task <id>` - Task ID (required)
- `--force` - Confirm deletion (required)

---

## archive

Archive a task locally or export to an external service (GitHub Issues, Linear).

```bash
# Local archive (default)
brainfile archive --task task-1

# Archive to GitHub as closed issue
brainfile archive --task task-1 --to=github

# Archive to Linear as completed issue
brainfile archive --task task-1 --to=linear

# Batch archive all locally archived tasks to GitHub
brainfile archive --all --to=github

# Preview what would be created
brainfile archive --task task-1 --to=github --dry-run
```

**Options:**
- `-t, --task <id>` - Task ID to archive
- `--to <destination>` - Archive destination: `local`, `github`, or `linear`
- `--all` - Archive all tasks from local archive to external service
- `--dry-run` - Preview without creating external issues

**Configuration:**

Set defaults in `~/.config/brainfile/config.json`:

```bash
brainfile config set archive.default github
brainfile config set archive.github.owner myorg
brainfile config set archive.github.repo myrepo
brainfile config set archive.linear.teamId <team-id>
```

Or set project-level default in your brainfile.md frontmatter:

```yaml
archive:
  destination: github
```

::: tip Authentication Required
External archive destinations require authentication. Run `brainfile auth github` or `brainfile auth linear` first.
:::

---

## restore

Restore an archived task to a column.

```bash
brainfile restore --task task-1 --column todo
```

**Options:**
- `-t, --task <id>` - Task ID (required)
- `-c, --column <name>` - Target column (required)

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
- `-t, --task <id>` - Parent task ID (required)
- `--add <title>` - Add a new subtask
- `--toggle <id>` - Toggle subtask completion
- `--update <id>` - Update subtask (use with `--title`)
- `--delete <id>` - Delete a subtask
- `--title <text>` - New title (for `--update`)

---

## lint

Validate brainfile syntax and auto-fix issues.

```bash
brainfile lint              # Check for issues
brainfile lint --fix        # Auto-fix issues
brainfile lint --check      # Exit with error (for CI)
```

**Options:**
- `-f, --file <path>` - Path to brainfile (default: `brainfile.md`)
- `--fix` - Automatically fix issues
- `--check` - Exit with error code if issues found

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
- `-l, --list` - List available templates
- `-u, --use <id>` - Create from template
- `--title <text>` - Task title (required with `--use`)
- `--description <text>` - Task description
- `-c, --column <name>` - Target column (default: `todo`)

**Built-in Templates:**
- `bug-report` - Bug tracking with triage steps
- `feature-request` - Feature proposals
- `refactor` - Code refactoring tasks

---

## tui

Launch interactive terminal UI. This is the default when running `brainfile` without arguments.

```bash
brainfile              # Opens TUI with brainfile.md
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

**Features:**
- Real-time file watching with auto-refresh
- Progress bar showing completion percentage
- Subtask progress indicators
- True black dark mode color scheme

---

## hooks

Install integration hooks for AI coding assistants. Hooks provide automatic reminders to update task status during AI-assisted development.

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
- `--scope <scope>` - `user` (default), `project`, or `all`

**How Hooks Work:**

1. **After edits** - Gentle reminder: "Consider updating brainfile.md"
2. **Before prompts** - Smart check: Warns if brainfile is stale (>5 minutes)
3. **Session start** - Detects brainfile and reminds about task tracking

See [AI Agent Integration](/agents/integration) for detailed configuration.

---

## auth

Authenticate with external services for archiving tasks to GitHub Issues or Linear.

```bash
# GitHub - OAuth device flow (opens browser)
brainfile auth github

# GitHub - Manual token
brainfile auth github --token ghp_xxxxxxxxxxxx

# Linear - API key (required)
brainfile auth linear --token lin_api_xxxxxxxxxxxx

# Check authentication status
brainfile auth status

# Log out from a specific provider
brainfile auth logout github

# Log out from all providers
brainfile auth logout --all
```

**Subcommands:**
- `github` - Authenticate with GitHub
- `linear` - Authenticate with Linear
- `status` - Show authentication status
- `logout [provider]` - Clear stored credentials

**Options:**
- `--token <token>` - Provide token directly (skips interactive flow)
- `--all` - Log out from all providers (with `logout`)

**Authentication Methods:**

| Provider | Methods |
|----------|---------|
| GitHub | 1. Detects existing `gh` CLI auth<br>2. OAuth device flow (browser)<br>3. Personal Access Token |
| Linear | API key from [linear.app/settings/api](https://linear.app/settings/api) |

Credentials are stored securely in `~/.config/brainfile/auth.json`.

---

## config

Manage CLI configuration stored in `~/.config/brainfile/config.json`.

```bash
# Show all config values
brainfile config list

# Get a specific value
brainfile config get archive.default

# Set a value
brainfile config set archive.default github
brainfile config set archive.github.owner myorg
brainfile config set archive.github.repo myrepo

# Show config file path
brainfile config path
```

**Subcommands:**
- `list` - Show all configuration values
- `get <key>` - Get a specific value
- `set <key> <value>` - Set a value
- `path` - Show config file location

**Available Keys:**

| Key | Description |
|-----|-------------|
| `archive.default` | Default archive destination: `local`, `github`, or `linear` |
| `archive.github.owner` | GitHub repository owner (username or org) |
| `archive.github.repo` | GitHub repository name |
| `archive.github.labels` | Comma-separated labels for GitHub issues |
| `archive.linear.teamId` | Linear team ID |
| `archive.linear.projectId` | Linear project ID |

---

## contract

Manage the lifecycle of agent-to-agent contracts.

```bash
brainfile contract pickup --task task-1
brainfile contract deliver --task task-1
brainfile contract validate --task task-1
```

See the [Contract Commands Reference](./contract-commands) for detailed documentation of all contract subcommands.

---

## mcp

Start an MCP (Model Context Protocol) server for direct AI assistant integration.

```bash
brainfile mcp
brainfile mcp --file ./project/brainfile.md
```

**Options:**
- `-f, --file <path>` - Path to brainfile (default: `brainfile.md`)

**Available MCP Tools:**

| Tool | Description |
|------|-------------|
| `list_tasks` | List tasks with optional filtering |
| `add_task` | Create a new task |
| `move_task` | Move task between columns |
| `patch_task` | Update task fields |
| `delete_task` | Permanently delete a task |
| `archive_task` | Archive a task |
| `restore_task` | Restore from archive |
| `add_subtask` | Add a subtask |
| `delete_subtask` | Delete a subtask |
| `toggle_subtask` | Toggle subtask completion |
| `update_subtask` | Update subtask title |
| `bulk_set_subtasks` | Set multiple subtasks to completed/incomplete (atomic) |
| `complete_all_subtasks` | Mark all subtasks in a task as completed/incomplete |

**Configuration for Claude Code:**

Add to `.mcp.json` in your project:

```json
{
  "mcpServers": {
    "brainfile": {
      "command": "npx",
      "args": ["@brainfile/cli", "mcp"]
    }
  }
}
```

---

## Global Options

Available with all commands:

- `--help` - Display help
- `--version` - Display version

```bash
brainfile add --help
brainfile --version
```

## Exit Codes

- `0` - Success
- `1` - Error (invalid arguments, file not found)
- `2` - Validation error (with `lint --check`)

## See Also

- [Installation](/cli/installation)
- [Examples](/cli/examples)
- [AI Agent Integration](/agents/integration)
