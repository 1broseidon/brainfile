---
title: CLI & Terminal UI
description: Command-line interface and interactive terminal UI for Brainfile
---

# CLI & Terminal UI

The Brainfile CLI gives you full control over your task board from the terminal. Use the interactive TUI for a visual experience, or run commands for automation.

## Installation

```bash
npm install -g @brainfile/cli
```

Verify installation:

```bash
brainfile --version
```

## Interactive TUI

Launch an interactive kanban board in your terminal:

```bash
brainfile
```

Or open a specific file:

```bash
brainfile ./path/to/brainfile.md
```

### Keyboard Controls

| Key | Action |
|-----|--------|
| `TAB` / `Shift+TAB` | Navigate between columns |
| `j` / `k` or `↑` / `↓` | Navigate tasks |
| `Enter` | Expand/collapse task details |
| `/` | Search tasks |
| `?` | Show help |
| `r` | Refresh |
| `q` | Quit |

::: info Real-time sync
The TUI watches your file for changes — edits from VSCode or AI assistants appear instantly.
:::

---

## Common Commands

### Initialize a New Board

```bash
brainfile init
```

Creates a `brainfile.md` with default structure: three columns (To Do, In Progress, Done) and agent instructions.

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
brainfile move --task task-1 --column done
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

### Archive & Restore

```bash
# Local archive
brainfile archive --task task-5

# Archive to GitHub Issues (creates closed issue)
brainfile archive --task task-5 --to=github

# Archive to Linear (creates completed issue)
brainfile archive --task task-5 --to=linear

# Restore from archive
brainfile restore --task task-5 --column todo
```

### Authentication

Archive to external services requires authentication:

```bash
# GitHub (auto-detects gh CLI, or uses OAuth device flow)
brainfile auth github

# Linear (requires API key)
brainfile auth linear --token <api-key>

# Check status
brainfile auth status
```

### Configuration

```bash
# Set default archive destination
brainfile config set archive.default github
brainfile config set archive.github.owner myorg
brainfile config set archive.github.repo myrepo
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

## Agent Contracts

The CLI facilitates structured coordination between agents through the contract system.

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

1. **Validate**: `brainfile contract validate -t task-1` (Auto)
2. **Approve**: `brainfile contract approve -t task-1` (Manual)
3. **Reject**: `brainfile contract reject -t task-1 --feedback "..."`

See the [Agent Contracts Guide](/guides/contracts) for more details.

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

- [Full Command Reference](/reference/commands) — All options and flags
- [MCP Server](/tools/mcp) — AI assistant integration
- [CI/CD Examples](/reference/commands#cicd-integration) — Automation workflows
