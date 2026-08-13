---
title: CLI & Terminal UI
description: Command-line interface and interactive terminal UI for Brainfile
---

# CLI & Terminal UI

The Brainfile CLI gives you full control over your task board from the terminal. Use the interactive TUI for a visual experience, or run commands for automation.

## Installation

```bash
npm install -g brainfile
```

Verify installation:

```bash
brainfile --version
```

## Core Features

- **Interactive TUI**: A full-featured terminal kanban board.
- **Agent Coordination**: Built-in support for [Agent Contracts](#agent-contracts) to coordinate work between AI assistants.
- **Rich Task Metadata**: Support for priorities, tags, assignees, due dates, and subtasks.
- **Task Archival**: Complete and archive tasks to searchable logs.

---

## Interactive TUI

Launch an interactive kanban board in your terminal:

```bash
brainfile
```

Or open a specific file:

```bash
brainfile ./path/to/brainfile.md
```

### TUI Layout

One list at a time, one column at a time. The header shows every column with a live count; `*` marks the column you are in. On a wide terminal, Enter opens a detail pane beside the list. On a narrow terminal, detail replaces the list until you press Esc.

Completed work is not a column. Press `L` to toggle the done view (`logs/`).

### Keyboard Controls

::: tip Keyboard Quick Reference
| Key | Action |
|-----|--------|
| `j` / `k` or `↑` / `↓` | Move selection |
| `h` / `l` or `Tab` | Cycle column |
| `Enter` | Open detail (Enter on a child drills in) |
| `esc` | Back / clear filter |
| `t` | Cycle document type (`task`, `epic`, `spec`, `plan`, `adr`) |
| `L` | Toggle done view (completed `logs/`) |
| `space` | Collapse a parent, or toggle a subtask in detail |
| `a` / `n` | Add a document (title only) |
| `N` | Add, then open in `$EDITOR` |
| `m` | Move to a column |
| `c` | Complete |
| `e` | Edit the document in `$EDITOR` |
| `p` | Cycle priority (list) or jump to parent (detail) |
| `d` | Delete (list) or scroll the body (detail) |
| `/` | Filter (`p:`, `#`, `@`, `type:`, `contract:`, `due:`) |
| `?` | Help |
| `q` | Quit |
:::

::: info Real-time sync
The TUI watches your file for changes — edits from your editor or AI assistants appear instantly.
:::

---

## Common Commands

### Initialize a New Board

```bash
brainfile init
```

Creates `.brainfile/` directory with `brainfile.md` config, `board/`, and `logs/` (completion history). Default columns: `To Do` and `In Progress`.

### List Tasks

```bash
brainfile list                    # All tasks
brainfile list --column todo      # Filter by column
brainfile list --tag bug          # Filter by tag
```

### Add Tasks

```bash
brainfile add --title "Implement auth"
brainfile add --title "Fix bug" --priority high --tags "bug,urgent"
brainfile add --title "Review PR" --assignee john --due-date 2025-02-01
```

### Move Tasks

```bash
brainfile move --task task-1 --column in-progress
```

### Complete Tasks

```bash
brainfile complete --task task-1   # Appends to ledger.jsonl and archives
```

### Update Tasks

```bash
brainfile patch --task task-1 --priority critical
brainfile patch --task task-1 --title "New title" --tags "new,tags"
brainfile patch --task task-1 --clear-assignee  # Remove assignee
```

### Manage Subtasks

```bash
brainfile subtask --task task-1 --add "Write tests"
brainfile subtask --task task-1 --toggle task-1-1
brainfile subtask --task task-1 --delete task-1-2
```

---

## Agent Contracts

::: info Agent-to-Agent Coordination
The CLI facilitates structured coordination between agents through the contract system. Contracts define deliverables, validation commands, and constraints — enabling autonomous agent work with automated verification.

### Create Task with Contract

```bash
brainfile add --title "Implement API" \
  --with-contract \
  --deliverable "src/api.ts" \
  --validation "npm test"
```

### Worker Agent Lifecycle

1. **Pickup**: `brainfile contract pickup -t task-1`
2. **Deliver**: `brainfile contract deliver -t task-1`

### PM Agent Lifecycle

1. **Validate**: `brainfile contract validate -t task-1` (checks deliverables, runs commands, and on success archives to `logs/` + `ledger.jsonl`)

See the [Agent Contracts Guide](/guides/contracts) for the full lifecycle and best practices.
:::

---

## Archive & Restore

```bash
# Complete locally (ledger + logs/<id>.md) — same as brainfile complete
brainfile archive --task task-5

# Export an already-completed task to GitHub or Linear
brainfile archive --task task-5 --to github

# Restore from a v1 archive file (not logs/)
brainfile restore --task task-5 --column todo
```

### Validate

```bash
brainfile lint              # Check for issues
brainfile lint --fix        # Auto-fix issues
brainfile lint --check      # Exit with error code (for CI)
```

---

### Templates

Create tasks from built-in templates:

```bash
brainfile template --list
brainfile template --use bug-report --title "Login fails on mobile"
brainfile template --use feature-request --title "Add dark mode"
```

Available templates:
- `bug-report` — Bug tracking with triage subtasks
- `feature-request` — Feature proposals
- `refactor` — Code refactoring tasks

---

## Shell Aliases

::: tip Speed up your workflow
Add these to your `.bashrc` or `.zshrc`:
:::

```bash
alias bf="brainfile"
alias bfl="brainfile list"
alias bfa="brainfile add"
alias bfm="brainfile move"
```

---

## Next Steps

- [Full Command Reference](/reference/commands) — Complete documentation for every command, option, and flag
- [MCP Server](/tools/mcp) — Expose Brainfile as an MCP server for AI assistant integration
- [Agent Contracts Guide](/guides/contracts) — Deep dive into the contract lifecycle and PM/worker coordination
- [CI/CD Examples](/reference/commands#cicd-integration) — GitHub Actions, pre-commit hooks, and npm script automation
- [Core Library](/tools/core) — Use `@brainfile/core` programmatically in your own tools
