---
title: MCP Server
description: AI assistant integration via Model Context Protocol
---

# MCP Server

The Brainfile CLI includes a built-in MCP (Model Context Protocol) server. This lets AI assistants like Claude Code, Cursor, and Cline manage your tasks directly — no copy-paste, no manual updates.

## Why MCP?

::: info The Before & After
**Without MCP**, your AI assistant can read your code but doesn't know what you're working on. You have to:
- Explain the current task every conversation
- Copy task descriptions into prompts
- Manually update task status after work is done

**With MCP**, your assistant:
- Sees all your tasks and their status
- Creates new tasks as work is identified
- Moves tasks to "done" when complete
- Updates priorities and metadata automatically

**It's the difference between "update my task board" and just having it happen.**
:::

---

## Setup

::: tip Basic Setup
Add to `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "brainfile": {
      "command": "npx",
      "args": ["brainfile", "mcp"]
    }
  }
}
```
:::

::: tip Custom Path Setup
For a specific brainfile path:

```json
{
  "mcpServers": {
    "brainfile": {
      "command": "npx",
      "args": ["brainfile", "mcp", "-f", "path/to/brainfile.md"]
    }
  }
}
```
:::

::: warning
Restart your AI assistant after adding or changing MCP configuration.
:::

---

## Available Tools

The MCP server registers **11 tools**. Several are action-based or accept arrays, so a single tool covers what would otherwise be many — `task_move` and `task_patch` accept one task ID or an array (bulk), `subtask` and `contract` dispatch on an `action` parameter.

### Task Management

| Tool | Key parameters | Description |
|------|----------------|-------------|
| `list_tasks` | `column?`, `tag?`, `type?`, `file?` | List tasks, optionally filtered by column, tag, or document type |
| `get_task` | `task`, `file?` | Get detailed information about a specific task by ID |
| `search` | `query?`, `column?`, `priority?`, `assignee?`, `recent?`, `task?`, `file?` | Search tasks and logs, list recent completions (`recent: true`), or view one entry (`task`) |
| `task_add` | `column`, `title`, `description?`, `priority?`, `tags?`, `assignee?`, `dueDate?`, `subtasks?`, `relatedFiles?`, `type?`, `parentId?`, `with_contract?`, `ready?`, `deliverables?`, `validation_commands?`, `constraints?` | Create a task; optionally attach a contract in the same call |
| `task_move` | `taskId` (string or array), `column`, `file?` | Move one task or many to a column. Moving to a `completionColumn` auto-completes |
| `task_patch` | `taskId` (string or array), `title?`, `description?`, `priority?`, `tags?`, `assignee?`, `dueDate?`, `relatedFiles?`, `parentId?` | Update fields on one or many tasks. Pass `null` to remove a field |
| `task_delete` | `task`, `file?` | Permanently delete a task |
| `task_complete` | `task`, `destination?` (`local`/`github`/`linear`), `file?` | Complete a task (append to `ledger.jsonl` and archive), or archive to GitHub/Linear |

::: tip Bulk operations
There are no separate `bulk_*` tools. Pass an array of IDs to `task_move` or `task_patch` to act on multiple tasks at once — the response reports `successCount`/`failureCount` and per-task results.
:::

### Subtasks — `subtask`

A single action-based tool. Set `action` to `add`, `toggle`, `delete`, or `update`.

| Parameter | Applies to | Description |
|-----------|------------|-------------|
| `action` | all | `add` \| `toggle` \| `delete` \| `update` |
| `task` | all | Parent task ID |
| `subtask` / `subtasks` | all | One ID/title or an array, depending on action |
| `title` / `titles` | `update` | New title(s) |
| `completed` | `toggle` | Set explicit state instead of flipping |
| `all` | `toggle`, `delete` | Target every subtask in the task |

### Agent Briefs — `brief`

Per-agent attention primitive: "what changed that I should care about?" State is
per agent, stored locally in `.brainfile/state/<agent>.json` (gitignored).

| Tool | Key parameters | Description |
|------|----------------|-------------|
| `brief` | `agent`, `peek?`, `file?` | Get what changed for one agent since its last brief |

The first call for an agent returns a **full** orientation (board rules and agent
instructions, assigned tasks, latest notes, recent completions). Every later call
returns a **delta**: new notes, task changes, completions, and whether the board
config changed. Pass `peek: true` to read without marking the brief as seen.

Notes are detected independently of `updatedAt`, because adding a note does not
bump it. Contract states are reported as current truth — Brainfile records no
prior status, so a brief never claims a transition it cannot know.

### Agent Contracts — `contract`

A single action-based tool. Set `action` to `attach`, `pickup`, `deliver`, `validate`, `graph`, or `activate`.

| Action | Parameters | Description |
|--------|------------|-------------|
| `attach` | `task`, `deliverables?`, `validation_commands?`, `constraints?`, `ready?` | Attach a contract (default status `draft`; `ready: true` for immediate dispatch) |
| `pickup` | `task` | Claim a contract (status → `in_progress`); returns agent context markdown |
| `deliver` | `task` | Mark contract delivered (status → `delivered`) |
| `validate` | `task` | Check deliverables and run validation commands (status → `done`/`failed`) |
| `graph` | `tasks` (array with `dependsOn`), `activate?` | Attach contracts to multiple tasks atomically with DAG edges |
| `activate` | `task` or `parentId` | Flip `draft` → `ready` for one task or all children of a parent |

**Contract workflow:**
1. PM creates a task with a contract using `task_add` (with `with_contract`, `deliverables`, `validation_commands`, `constraints`), or attaches one later with `contract` `action: attach`.
2. Worker calls `contract` `action: pickup` to claim the work.
3. Worker implements the deliverables.
4. Worker calls `contract` `action: deliver` when done.
5. PM calls `contract` `action: validate` to check the work.

::: info Ledger queries are library API, not MCP tools
Completion history (`ledger.jsonl`) is queried through the `@brainfile/core` library (`queryLedger`, `getFileHistory`, `getTaskContext`, `readLedger`), not through dedicated MCP tools. From an assistant, use the `search` tool with `recent: true` to list recent completions. See [Ledger Query API](/reference/mcp-tools).
:::

---

## Example Interactions

**You:** "What tasks do I have in progress?"

**Assistant:** *calls `list_tasks` with column filter* "You have 2 tasks in progress: task-3 'Fix auth bug' and task-7 'Update documentation'."

---

**You:** "I finished the auth bug fix"

**Assistant:** *calls `task_move`* "I've moved task-3 to Done."

---

**You:** "Create a task for the performance issue we discussed"

**Assistant:** *calls `task_add`* "Created task-12 'Investigate slow dashboard load' with high priority in To Do."

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

1. Check that `brainfile` is installed: `npx brainfile --version`
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
"args": ["brainfile", "mcp", "-f", "./my-project/brainfile.md"]
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

- [CLI Commands](/tools/cli) — Full command reference for manual task management
- [Board Format Reference](/reference/protocol) — Complete file format and YAML structure
- [Core Library](/tools/core) — Build custom integrations with `@brainfile/core`
- [Contract Guide](/guides/contracts) — Deep dive into the contract lifecycle and best practices
