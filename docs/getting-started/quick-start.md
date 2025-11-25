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

This creates a `brainfile.md` file with basic structure.

## Interactive TUI

Launch the interactive terminal UI:

```bash
brainfile
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

# Move a task
brainfile move --task task-1 --column in-progress

# Update a task
brainfile patch --task task-1 --priority critical

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
- update task status as you work (todo → in-progress → done)
```

See [AI Agent Integration](/agents/integration) for details.

---

## VSCode Extension

1. Install "Brainfile" from VSCode marketplace
2. Open a project with `brainfile.md`
3. View the kanban board in the sidebar
4. Drag and drop tasks between columns

---

## File Format

```yaml
---
schema: https://brainfile.md/v1
title: My Project
agent:
  instructions:
    - Modify only the YAML frontmatter
    - Preserve all IDs
columns:
  - id: todo
    title: To Do
    tasks:
      - id: task-1
        title: Setup project
        priority: high
        tags: [setup]
  - id: in-progress
    title: In Progress
    tasks: []
  - id: done
    title: Done
    tasks: []
---

# My Project

Project documentation goes here.
```

---

## Using the Core Library

```typescript
import { Brainfile, addTask, moveTask } from '@brainfile/core';
import fs from 'fs';

// Parse
const markdown = fs.readFileSync('brainfile.md', 'utf-8');
let board = Brainfile.parse(markdown);

// Add a task (immutable operation)
const result = addTask(board, 'todo', {
  title: 'New task',
  priority: 'medium',
  tags: ['feature']
});

if (result.success) {
  board = result.board!;
}

// Move a task
const moveResult = moveTask(board, 'task-1', 'todo', 'in-progress', 0);
if (moveResult.success) {
  board = moveResult.board!;
}

// Serialize and save
const output = Brainfile.serialize(board);
fs.writeFileSync('brainfile.md', output);
```

---

## Project Rules

Define rules for your project:

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

## Subtasks

Break down complex tasks:

```yaml
tasks:
  - id: task-1
    title: Implement auth
    subtasks:
      - id: task-1-1
        title: Setup OAuth
        completed: true
      - id: task-1-2
        title: Create login UI
        completed: false
```

Manage via CLI:

```bash
brainfile subtask --task task-1 --add "Add tests"
brainfile subtask --task task-1 --toggle task-1-1
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
      - uses: actions/checkout@v3
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

- [Example Board](https://github.com/brainfile/protocol/blob/main/example/brainfile.md) - Full-featured example

## Help

- [GitHub Discussions](https://github.com/brainfile/protocol/discussions)
- [Issue Tracker](https://github.com/brainfile/protocol/issues)
