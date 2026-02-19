---
title: AI Agent Integration
description: Guide for integrating AI agents with Brainfile task management
---

## Overview

Brainfile is designed for AI agent compatibility. There are three ways to integrate:

1. **MCP Server** — Direct tool access for AI assistants (recommended)
2. **Agent Hooks** — Automatic reminders during AI-assisted development
3. **Manual Instructions** — Simple rules in agent config files

## MCP Server (Recommended)

The CLI includes a built-in MCP (Model Context Protocol) server that exposes all Brainfile operations as tools.

### Setup

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

The MCP server auto-detects the brainfile location (`.brainfile/brainfile.md` or root `brainfile.md`).

### Available Tools

| Tool | Description |
|------|-------------|
| `list_tasks` | List tasks with column/tag filtering |
| `get_task` | Get detailed task information by ID |
| `add_task` | Create tasks with all fields |
| `move_task` | Move between columns |
| `patch_task` | Update specific fields |
| `delete_task` | Permanently delete |
| `archive_task` | Archive a task |
| `restore_task` | Restore from archive |
| `add_subtask` | Add subtask |
| `delete_subtask` | Delete subtask |
| `toggle_subtask` | Toggle completion |
| `update_subtask` | Update subtask title |
| `search_tasks` | Search by title, description, tags |
| `list_rules` | List project rules |
| `add_rule` | Add a project rule |
| `contract_pickup` | Claim a contract |
| `contract_deliver` | Mark contract as delivered |
| `contract_validate` | Validate contract deliverables |

### Benefits

- AI assistants manage tasks through structured tool calls
- Type-safe operations with error handling
- No risk of YAML corruption
- Works with Claude, Cursor, and other MCP-compatible tools

---

## Agent Hooks

Hooks provide automatic reminders to update task status during AI-assisted development.

### Installation

```bash
# Claude Code
brainfile hooks install claude-code

# Cursor
brainfile hooks install cursor --scope project

# Cline
brainfile hooks install cline
```

### How Hooks Work

1. **After file edits** (80% of interactions)
   - Shows: "Consider updating tasks"
   - Non-blocking, shown once per edit

2. **Before new prompts** (20% of interactions)
   - Checks if brainfile is stale (>5 minutes old)
   - Only warns if there are uncommitted changes

3. **Session start**
   - Detects brainfile in project
   - Shows: "Brainfile detected. Remember to update task status."

### Managing Hooks

```bash
brainfile hooks list
brainfile hooks uninstall claude-code --scope all
```

---

## Manual Instructions

For simple integration without MCP or hooks, add to your agent config file (`CLAUDE.md`, `.cursorrules`, etc.):

```markdown
# Task Management Rules

- Use brainfile CLI or MCP tools for task operations
- Update task status as you work (todo → in-progress → done)
- Check .brainfile/brainfile.md for project rules and board config
- Task files live in .brainfile/board/ (active) and .brainfile/logs/ (completed)
```

---

## Agent Instructions Block

The `agent` block in `.brainfile/brainfile.md` provides explicit instructions:

```yaml
agent:
  instructions:
    - Use CLI or MCP tools for all task operations
    - Preserve all IDs
    - Keep ordering
    - Make minimal changes
    - Preserve unknown fields
  llmNotes: "Prefer functional patterns and comprehensive tests"
```

| Instruction | Reason |
|-------------|--------|
| Use CLI or MCP tools | Structured operations prevent YAML corruption |
| Preserve all IDs | Changing IDs breaks references and history |
| Keep ordering | Maintains visual consistency in UIs |
| Make minimal changes | Reduces merge conflicts |
| Preserve unknown fields | Future-proofs against schema extensions |

---

## Best Practices

### DO:
- Use MCP server or CLI for task operations
- Preserve all IDs and unknown fields
- Validate changes before saving
- Report changes clearly to users
- Check for contract assignments before starting work

### DON'T:
- Edit task YAML files directly when CLI/MCP is available
- Change or regenerate task IDs
- Remove fields you don't understand
- Ignore contract constraints when working on contracted tasks

---

## File Discovery

AI agents should check for the board config in this order:

1. `.brainfile/brainfile.md` (v2, preferred)
2. `brainfile.md` (root, v1 compat)
3. `.brainfile.md` (hidden, backward compat)

### Directory Structure

```
.brainfile/
├── brainfile.md      # Board config (columns, types, rules)
├── board/            # Active task files
│   ├── task-1.md
│   ├── task-2.md
│   ├── epic-1.md
│   └── adr-1.md
└── logs/             # Completed task files
    └── task-3.md
```

---

## Common Operations

### Moving a Task

Use the CLI or MCP `move_task` tool:

```bash
brainfile move -t task-1 -c in-progress
```

This updates the `column` field in `.brainfile/board/task-1.md`:

```yaml
---
id: task-1
title: Fix login bug
column: in-progress   # changed from "todo"
priority: high
---
```

### Adding a Task

```bash
brainfile add -c todo -t "New task" -p medium --tags backend,api
```

Creates `.brainfile/board/task-6.md`:

```yaml
---
id: task-6
title: New task
column: todo
priority: medium
tags: [backend, api]
createdAt: "2026-02-18T10:00:00Z"
---
```

### Updating Subtasks

```bash
brainfile subtask --toggle sub-1 -t task-1
```

Updates the subtask in `.brainfile/board/task-1.md`:

```yaml
---
id: task-1
title: Implement feature
column: in-progress
subtasks:
  - id: sub-1
    title: Write tests
    completed: true   # toggled
  - id: sub-2
    title: Update docs
    completed: false
---
```

### Working with Contracts

```bash
# Pick up a contract
brainfile contract pickup -t task-5

# Deliver when done
brainfile contract deliver -t task-5
```

---

## Error Handling

### Invalid YAML
- Validate before writing
- Preserve original on error
- Report specific line numbers

### ID Conflicts
- Check existing IDs before adding
- Use sequential numbering
- Never reuse deleted IDs

### Schema Violations
- Validate against schema
- Report unknown fields as warnings, not errors

---

## Integration with Tools

### VSCode Extension

The extension watches `.brainfile/` for changes. AI agents should:
- Use CLI or MCP tools for modifications (atomic operations)
- Preserve YAML indentation (2 spaces)
- Validate before saving

### CLI

Use the CLI for validation:

```bash
brainfile lint --check
```

---

## See Also

- [CLI Commands](/reference/commands) — Full command reference
- [Protocol Specification](/reference/protocol) — File format details
- [Core Library](/core/overview) — Programmatic operations
- [MCP Server](/tools/mcp) — MCP tool reference
- [Contract System](/guides/contracts) — Contract workflow guide
