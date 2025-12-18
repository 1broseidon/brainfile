---
title: MCP Server
description: AI assistant integration via Model Context Protocol
---

# MCP Server

The Brainfile CLI includes a built-in MCP (Model Context Protocol) server. This lets AI assistants like Claude Code, Cursor, and Cline manage your tasks directly — no copy-paste, no manual updates.

## Why MCP?

Without MCP, your AI assistant can read your code but doesn't know what you're working on. You have to:
- Explain the current task every conversation
- Copy task descriptions into prompts
- Manually update task status after work is done

With MCP, your assistant:
- Sees all your tasks and their status
- Creates new tasks as work is identified
- Moves tasks to "done" when complete
- Updates priorities and metadata automatically

**It's the difference between "update my task board" and just having it happen.**

---

## Setup

Add to `.mcp.json` in your project root:

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

For a specific brainfile path:

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

::: warning
Restart your AI assistant after adding or changing MCP configuration.
:::

---

## Available Tools

Your AI assistant gets access to these operations:

### Task Management

| Tool | Description |
|------|-------------|
| `list_tasks` | List all tasks, filter by column, tag, or contract status |
| `get_task` | Get detailed information about a specific task |
| `search_tasks` | Search tasks by query, column, priority, assignee |
| `add_task` | Create a task with title, priority, tags, etc. |
| `move_task` | Move a task between columns |
| `patch_task` | Update specific fields on a task |
| `delete_task` | Permanently delete a task |

### Bulk Operations

| Tool | Description |
|------|-------------|
| `bulk_move_tasks` | Move multiple tasks to a column in one operation |
| `bulk_patch_tasks` | Apply same patch to multiple tasks |
| `bulk_delete_tasks` | Delete multiple tasks |
| `bulk_archive_tasks` | Archive multiple tasks to local file |

### Archiving

| Tool | Description |
|------|-------------|
| `archive_task` | Archive a task locally or to GitHub/Linear |
| `restore_task` | Restore an archived task to a column |

The `archive_task` tool supports an optional `destination` parameter:
- `"local"` — Move to local archive section (default)
- `"github"` — Create a closed GitHub Issue
- `"linear"` — Create a completed Linear issue

If not specified, uses your project default (`archive.destination` in brainfile.md) or user default (`~/.config/brainfile/config.json`).

::: tip External Archive Setup
To archive to GitHub or Linear, first authenticate:
```bash
npx @brainfile/cli auth github
npx @brainfile/cli auth linear --token <api-key>
```
Then configure your repository:
```bash
npx @brainfile/cli config set archive.github.owner myorg
npx @brainfile/cli config set archive.github.repo myrepo
```
:::

### Subtasks

| Tool | Description |
|------|-------------|
| `add_subtask` | Add a subtask to a task |
| `toggle_subtask` | Mark a subtask complete/incomplete |
| `update_subtask` | Change a subtask's title |
| `delete_subtask` | Remove a subtask |
| `bulk_set_subtasks` | Set multiple subtasks to completed or incomplete at once |
| `complete_all_subtasks` | Mark all subtasks in a task as completed or incomplete |

### Agent Contracts

| Tool | Description |
|------|-------------|
| `contract_pickup` | Claim a contract and set status to in_progress |
| `contract_deliver` | Mark contract as delivered (ready for validation) |
| `contract_validate` | Check deliverables exist and run validation commands |
| `attach_contract` | Add contract to existing task with deliverables and validation |

**Contract workflow:**
1. PM creates task with contract using `add_task` (with `with_contract`, `deliverables`, `validation_commands`, `constraints` parameters)
2. Worker agent calls `contract_pickup` to claim the work
3. Worker implements the deliverables
4. Worker calls `contract_deliver` when done
5. PM calls `contract_validate` to check work

---

## Example Interactions

**You:** "What tasks do I have in progress?"

**Assistant:** *calls `list_tasks` with column filter* "You have 2 tasks in progress: task-3 'Fix auth bug' and task-7 'Update documentation'."

---

**You:** "I finished the auth bug fix"

**Assistant:** *calls `move_task`* "I've moved task-3 to Done."

---

**You:** "Create a task for the performance issue we discussed"

**Assistant:** *calls `add_task`* "Created task-12 'Investigate slow dashboard load' with high priority in To Do."

---

## Benefits Over Manual Updates

| Aspect | Manual | MCP |
|--------|--------|-----|
| Context switching | Open board, find task, update | Zero |
| Error risk | YAML typos possible | Type-safe operations |
| Consistency | Varies by attention | Always correct format |
| Speed | 30+ seconds | Instant |

---

## Supported Assistants

The MCP server works with any tool that supports the Model Context Protocol:

- **Claude Code** — Full support
- **Cursor** — Full support
- **Cline** — Full support
- **Other MCP clients** — Should work, untested

---

## Troubleshooting

### Server not loading

1. Check that `@brainfile/cli` is installed: `npx @brainfile/cli --version`
2. Verify `.mcp.json` is valid JSON
3. Restart your AI assistant completely
4. Check assistant logs for MCP errors

### Tools not appearing

Some assistants cache tool lists. Try:
1. Restart the assistant
2. Start a new conversation
3. Explicitly ask "what brainfile tools do you have?"

### Wrong file being used

Specify the file explicitly:
```json
"args": ["@brainfile/cli", "mcp", "-f", "./my-project/brainfile.md"]
```

---

## Manual Testing

Run the MCP server directly to test:

```bash
brainfile mcp
brainfile mcp --file ./project/brainfile.md
```

The server communicates via stdio — you'll see JSON-RPC messages if tools are called.

---

## Alternative: Agent Hooks

::: tip No MCP support?
If your assistant doesn't support MCP, you can install hooks that remind you to update tasks:
:::

```bash
brainfile hooks install claude-code
brainfile hooks install cursor --scope project
brainfile hooks install cline
```

Hooks provide gentle reminders but don't give the assistant direct control.

---

## Next Steps

- [CLI Commands](/tools/cli) — Manual task management
- [Protocol Specification](/reference/protocol) — File format details
- [Core Library](/tools/core) — Programmatic access
