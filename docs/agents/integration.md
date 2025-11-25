---
title: AI Agent Integration
description: Guide for integrating AI agents with Brainfile task management
---

## Overview

Brainfile is designed for AI agent compatibility. There are three ways to integrate:

1. **MCP Server** - Direct tool access for AI assistants (recommended)
2. **Agent Hooks** - Automatic reminders during AI-assisted development
3. **Manual Instructions** - Simple rules in agent config files

## MCP Server (Recommended)

The CLI includes a built-in MCP (Model Context Protocol) server that exposes all Brainfile operations as tools. This is the most powerful integration method.

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

Or for a specific file:

```json
{
  "mcpServers": {
    "brainfile": {
      "command": "npx",
      "args": ["@brainfile/cli", "mcp", "-f", "path/to/brainfile.md"]
    }
  }
}
```

### Available Tools

| Tool | Description |
|------|-------------|
| `list_tasks` | List tasks with column/tag filtering |
| `add_task` | Create tasks with all fields |
| `move_task` | Move between columns |
| `patch_task` | Update specific fields |
| `delete_task` | Permanently delete |
| `archive_task` | Move to archive |
| `restore_task` | Restore from archive |
| `add_subtask` | Add subtask |
| `delete_subtask` | Delete subtask |
| `toggle_subtask` | Toggle completion |
| `update_subtask` | Update subtask title |

### Benefits

- AI assistants can manage tasks directly without file editing
- Type-safe operations with error handling
- No risk of YAML corruption
- Works with Claude Code, Cursor, and other MCP-compatible tools

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
   - Shows: "Consider updating @brainfile.md"
   - Non-blocking, shown once per edit

2. **Before new prompts** (20% of interactions)
   - Checks if brainfile is stale (>5 minutes old)
   - Only warns if there are uncommitted changes
   - Shows: "Files modified but @brainfile.md hasn't been updated"

3. **Session start**
   - Detects brainfile in project
   - Shows: "Brainfile detected. Remember to update task status."

### Managing Hooks

```bash
# List installed hooks
brainfile hooks list

# Uninstall
brainfile hooks uninstall claude-code --scope all
```

---

## Manual Instructions

For simple integration without MCP or hooks, add to your agent config file (`CLAUDE.md`, `.cursorrules`, etc.):

```markdown
# Task Management Rules

- review and follow rules in @brainfile.md
- update task status in @brainfile.md as you work (todo → in-progress → done)
- reference `schema` in the file for how to create tasks
- your existing tools do not modify this file, you need to edit it directly
```

---

## Agent Instructions Block

The `agent` block in `brainfile.md` provides explicit instructions:

```yaml
agent:
  instructions:
    - Modify only the YAML frontmatter
    - Preserve all IDs
    - Keep ordering
    - Make minimal changes
    - Preserve unknown fields
  llmNotes: "Prefer functional patterns and comprehensive tests"
```

### Why These Instructions Matter

| Instruction | Reason |
|-------------|--------|
| Modify only YAML frontmatter | Content after `---` is user documentation |
| Preserve all IDs | Changing IDs breaks references and history |
| Keep ordering | Maintains visual consistency in UIs |
| Make minimal changes | Reduces merge conflicts |
| Preserve unknown fields | Future-proofs against schema extensions |

---

## Best Practices

### DO:
- Use MCP server when available for reliable operations
- Preserve all IDs and unknown fields
- Validate changes before saving
- Report changes clearly to users
- Move entire task objects (with all fields)

### DON'T:
- Modify content outside YAML frontmatter
- Change or regenerate task IDs
- Remove fields you don't understand
- Create hidden files (use `brainfile.md`, not `.brainfile.md`)

---

## File Discovery

AI agents should check for board files in this order:

1. `brainfile.md` (preferred)
2. `.brainfile.md` (backward compatibility)

Or look for the load tag in README files:

```html
<!-- load:brainfile.md -->
```

---

## Common Operations

### Moving a Task

```yaml
# BEFORE
columns:
  - id: todo
    tasks:
      - id: task-1
        title: Fix login bug
  - id: in-progress
    tasks: []

# AFTER
columns:
  - id: todo
    tasks: []
  - id: in-progress
    tasks:
      - id: task-1  # ID preserved
        title: Fix login bug
```

### Adding a Task

```yaml
columns:
  - id: todo
    tasks:
      - id: task-5  # Existing
        title: Existing task
      - id: task-6  # New - sequential ID
        title: New task
```

### Updating Subtasks

```yaml
tasks:
  - id: task-1
    title: Implement feature
    subtasks:
      - id: task-1-1
        title: Write tests
        completed: true  # Mark complete
      - id: task-1-2
        title: Update docs
        completed: false
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

The extension watches for file changes. AI agents should:
- Write atomic changes (complete all modifications before saving)
- Preserve YAML indentation (2 spaces)
- Validate before saving

### CLI

Use the CLI for validation:

```bash
brainfile lint --check
```

---

## See Also

- [CLI Commands](/cli/commands) - Full command reference including MCP
- [Protocol Specification](/protocol/specification) - File format details
- [Core Library](/core/overview) - Programmatic operations
