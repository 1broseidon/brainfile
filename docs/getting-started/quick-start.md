---
title: Quick Start
description: Get started with Brainfile in 5 minutes
---

## Installation

```bash
npm install -g @brainfile/cli
```

## Create Your First Brainfile

```bash
brainfile init
```

This creates the `.brainfile/` directory with:
- `.brainfile/brainfile.md` — Board configuration (columns, types, rules)
- `.brainfile/board/` — Active task files
- `.brainfile/logs/` — Completed task archive

Default columns: `To Do` and `In Progress`.

## Interactive TUI

Launch the interactive terminal UI:

```bash
brainfile          # No arguments launches the TUI
brainfile tui      # Explicit subcommand also works
```

**Keyboard Controls:**
- `TAB` - Navigate columns
- `j`/`k` or `↑`/`↓` - Navigate tasks
- `Enter` - Expand task details
- `/` - Search
- `q` - Quit

## CLI Commands

```bash
# List all tasks
brainfile list

# Add a task
brainfile add --title "Implement auth" --priority high

# Add a parent with children
brainfile add --title "Auth overhaul" --child "OAuth flow" --child "Session handling"

# Move a task
brainfile move --task task-1 --column in-progress

# Update a task
brainfile patch --task task-1 --priority critical

# Complete a task (moves from board/ to logs/)
brainfile complete --task task-1

# Create from template
brainfile template --use bug-report --title "Login fails"
```

See [CLI Commands](/cli/commands) for all available commands.

---

## AI Assistant Integration

### MCP Server (Recommended)

Add to `.mcp.json` for Claude Code, Cursor, or other MCP-compatible tools:

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

### Agent Hooks

Install automatic reminders:

```bash
brainfile hooks install claude-code
```

### Manual Instructions

Add to your agent config (`CLAUDE.md`, `.cursorrules`):

```markdown
# Task Management

- review and follow rules in @brainfile.md
- update task status as you work
- use brainfile CLI to manage tasks
```

See [AI Agent Integration](/agents/integration) for details.

---

## Pi Extension (Recommended)

For multi-agent orchestration, use the Brainfile extension in [Pi](https://pi.dev/):

1.  Run `/reload` to activate the extension
2.  PM session: `/listen role pm` → `/listen on`
3.  Worker sessions: `/listen role worker` → `/listen on`
4.  Run `/listen status` to see active workers and run state

See [Pi Extension](/tools/pi) for the full command reference and setup guide.

---

## File Format

### Board Config (`.brainfile/brainfile.md`)

```yaml
---
title: My Project
columns:
  - id: todo
    title: To Do
  - id: in-progress
    title: In Progress
strict: true
types:
  epic:
    idPrefix: epic
    completable: true
  adr:
    idPrefix: adr
    completable: false
agent:
  instructions:
    - Update task status as you work
    - Preserve all IDs
rules:
  always:
    - id: 1
      rule: write tests for new features
---

# My Project

Project documentation goes here.
```

### Task Files (`.brainfile/board/task-1.md`)

```yaml
---
id: task-1
type: task
title: Setup project
column: todo
priority: high
tags: [setup]
---

## Description
Project setup details here.
```

---

## Using the Core Library

```typescript
import {
  readTaskFile,
  readTasksDir,
  addTaskFile,
  moveTaskFile,
  completeTaskFile,
  readV2BoardConfig
} from '@brainfile/core';

// Read board config
const board = readV2BoardConfig('.brainfile/brainfile.md');

// Read all active tasks
const tasks = readTasksDir('.brainfile/board/');

// Add a new task
addTaskFile('.brainfile/board/', {
  title: 'New task',
  column: 'todo',
  priority: 'medium',
  tags: ['feature']
});

// Complete a task (moves to logs/)
completeTaskFile('.brainfile/board/task-1.md', '.brainfile/logs/');
```

---

## Project Rules

Define rules in `.brainfile/brainfile.md`:

```yaml
rules:
  always:
    - id: 1
      rule: write tests for new features
  never:
    - id: 1
      rule: commit directly to main
  prefer:
    - id: 1
      rule: functional patterns
  context:
    - id: 1
      rule: TypeScript monorepo with Jest
```

---

## Document Types

Brainfile supports typed documents via the `types` config:

```yaml
strict: true
types:
  epic:
    idPrefix: epic
    completable: true
  adr:
    idPrefix: adr
    completable: false
```

```bash
brainfile types list         # See available types
brainfile add --type epic --title "Auth overhaul"
brainfile add --type adr --title "Use Postgres for user data"
```

---

## Subtasks

Break down complex tasks:

```yaml
---
id: task-1
title: Implement auth
column: in-progress
subtasks:
  - id: sub-1
    title: Setup OAuth
    completed: true
  - id: sub-2
    title: Create login UI
    completed: false
---
```

Manage via CLI:

```bash
brainfile subtask --task task-1 --add "Add tests"
brainfile subtask --task task-1 --toggle sub-1
```

---

## ADR Promotion

Architecture Decision Records can be promoted to project rules:

```bash
# Create an ADR
brainfile add --type adr --title "Use Postgres for user data" -c todo

# Promote to a permanent rule
brainfile adr promote -t adr-1 --category always
```

---

## CI/CD Integration

```yaml
# .github/workflows/validate.yml
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

---

## Next Steps

- [CLI Commands](/cli/commands) - Full command reference
- [AI Agent Integration](/agents/integration) - MCP, hooks, and manual setup
- [Protocol Specification](/protocol/specification) - Complete file format
- [Core API Reference](/core/api-reference) - Library documentation

## Examples

- [Example v2 Workspace](https://github.com/brainfile/protocol/tree/main/example/.brainfile) - Board config + per-task files + logs

## Help

- [GitHub Discussions](https://github.com/brainfile/protocol/discussions)
- [Issue Tracker](https://github.com/brainfile/protocol/issues)
