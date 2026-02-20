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

The interactive board displays your columns side by side, with tasks flowing through your workflow:

<div style="text-align: center; margin: 1.5em 0;">
<svg viewBox="0 0 560 90" xmlns="http://www.w3.org/2000/svg" style="max-width: 540px; width: 100%;">
  <defs><marker id="tui-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(92,200,255,0.4)" /></marker></defs>
  <rect x="10" y="10" width="150" height="70" rx="6" fill="#0a0a0e" stroke="#2a2a38" stroke-width="2" />
  <text x="85" y="35" fill="#a0a0b0" font-family="JetBrains Mono, monospace" font-size="12" font-weight="600" text-anchor="middle" dominant-baseline="middle">To Do</text>
  <text x="85" y="56" fill="#585868" font-family="JetBrains Mono, monospace" font-size="10" text-anchor="middle" dominant-baseline="middle">task-1, task-2</text>
  <line x1="160" y1="45" x2="195" y2="45" stroke="rgba(92,200,255,0.4)" stroke-width="2" marker-end="url(#tui-arrow)" />
  <rect x="200" y="10" width="150" height="70" rx="6" fill="#0a0a0e" stroke="#5cc8ff" stroke-width="2" />
  <text x="275" y="35" fill="#5cc8ff" font-family="JetBrains Mono, monospace" font-size="12" font-weight="600" text-anchor="middle" dominant-baseline="middle">In Progress</text>
  <text x="275" y="56" fill="#585868" font-family="JetBrains Mono, monospace" font-size="10" text-anchor="middle" dominant-baseline="middle">task-3</text>
  <line x1="350" y1="45" x2="385" y2="45" stroke="rgba(92,200,255,0.4)" stroke-width="2" marker-end="url(#tui-arrow)" />
  <rect x="390" y="10" width="150" height="70" rx="6" fill="#0a0a0e" stroke="#2a2a38" stroke-width="2" />
  <text x="465" y="35" fill="#a0a0b0" font-family="JetBrains Mono, monospace" font-size="12" font-weight="600" text-anchor="middle" dominant-baseline="middle">Done</text>
  <text x="465" y="56" fill="#585868" font-family="JetBrains Mono, monospace" font-size="10" text-anchor="middle" dominant-baseline="middle">task-4</text>
</svg>
</div>

### Keyboard Controls

::: tip Keyboard Quick Reference
| Key | Action |
|-----|--------|
| `TAB` / `Shift+TAB` | Navigate between columns |
| `j` / `k` or `↑` / `↓` | Navigate tasks |
| `Enter` | Expand/collapse task details |
| `/` | Search tasks |
| `?` | Show help |
| `r` | Refresh |
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

Creates `.brainfile/` directory with `brainfile.md` config, `board/`, and `logs/`. Default columns: `To Do` and `In Progress`.

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
brainfile complete --task task-1   # Moves from board/ to logs/
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

1. **Validate**: `brainfile contract validate -t task-1` (auto-checks deliverables and runs commands)
2. **Complete**: `brainfile complete -t task-1` (after validation passes)

See the [Agent Contracts Guide](/guides/contracts) for the full lifecycle and best practices.
:::

---

## Archive & Restore

```bash
# Archive a task
brainfile archive --task task-5

# Restore from archive
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
