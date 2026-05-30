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

---|## Commands

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
---

## init

Create a new `.brainfile/` project directory with board config, `board/`, and `logs/`.

```bash
brainfile init
brainfile init --force  # Overwrite existing
```

**Options:**
| Option | Description |
|--------|## Commands

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
|--------|## Commands

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
---

## show

Display full details of a single task.

```bash
brainfile show --task task-1
brainfile show -t task-42
```

**Options:**
| Option | Description |
|--------|## Commands

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
|--------|## Commands

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
|--------|## Commands

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
|--------|## Commands

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
---

## delete

Permanently delete a task. Requires confirmation.

```bash
brainfile delete --task task-1 --force
```

**Options:**
| Option | Description |
|--------|## Commands

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
|--------|## Commands

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
---

## restore

Restore an archived task to a column.

```bash
brainfile restore --task task-1 --column todo
```

**Options:**
| Option | Description |
|--------|## Commands

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
|--------|## Commands

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

## lint

Validate brainfile syntax and auto-fix issues.

```bash
brainfile lint              # Check for issues
brainfile lint --fix        # Auto-fix issues
brainfile lint --check      # Exit with error (for CI)
```

**Options:**
| Option | Description |
|--------|## Commands

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
|--------|## Commands

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
|--------|## Commands

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
---

## complete

Complete a task — appends a record to `ledger.jsonl` and moves it from `board/` to `logs/`.

::: tip Board Hygiene
`complete` archives finished work to `logs/`, keeping your active board clean. Use `--force` for epics with remaining child tasks.
:::

```bash
brainfile complete --task task-1
brainfile complete -t epic-1 --force
brainfile complete -t task-2 --summary "Implemented rate limiter" --auto-files
```

**Options:**
| Option | Description |
|--------|-------------|
| `-t, --task <id>` | Task ID (required) |
| `--force` | Force epic completion even if child tasks are still active |
| `--summary <text>` | Completion summary (added to ledger record) |
| `--files-changed <paths>` | Comma-separated list of changed files |
| `--auto-files` | Auto-detect changed files from git status |

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
brainfile contract validate --task task-1 --retry
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

**Validate Options:**
| Option | Description |
|--------|-------------|
| `--retry` | Force retry even if validation fails and maxRetries is exceeded |

**Attach Options:**
| Option | Description |
|--------|-------------|
| `--deliverable <spec>` | Add deliverable (format: `type:path:description`) |
| `--validation <command>` | Add validation command (repeatable) |
| `--constraint <text>` | Add constraint (repeatable) |

::: info Auto-Retry on Validation Failure
If `contract.maxRetries` is set and validation fails, the system automatically:
1. Captures validation output as feedback in `contract.feedback`
2. Resets contract status to `ready`
3. Re-dispatches the task to the agent for rework

Use `--retry` to manually force a retry attempt even if maxRetries is exceeded.
:::

See the [Contract Commands Reference](/cli/contract-commands) for detailed documentation.

---

## adr

Manage Architecture Decision Records.

```bash
brainfile adr promote -t adr-1 --category always
```

**Options:**
| Option | Description |
|--------|## Commands

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
|--------|## Commands

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
|--------|## Commands

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
|---------|## Commands

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
|---------|## Commands

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
---

## mcp

Start an MCP (Model Context Protocol) server for AI assistant integration.

```bash
brainfile mcp
brainfile mcp --file ./project/brainfile.md
```

**Options:**
| Option | Description |
|--------|## Commands

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
---

## Global Options

| Option | Description |
|--------|## Commands

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
