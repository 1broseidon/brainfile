---
title: Quick Start
description: Get running with Brainfile in 60 seconds
---

# Quick Start

Get a task board in your project in under a minute.

## 1. Install

```bash
npm install -g @brainfile/cli
```

## 2. Initialize

```bash
brainfile init
```

This creates a `brainfile.md` file with a basic board structure.

## 3. Use It

**Option A: Interactive TUI**
```bash
brainfile
```
Navigate with keyboard: `TAB` for columns, `j`/`k` for tasks, `Enter` to expand, `q` to quit.

**Option B: CLI Commands**
```bash
brainfile list                              # See all tasks
brainfile add --title "My first task"       # Add a task
brainfile move --task task-1 --column done  # Move to done
```

**Option C: VSCode Extension**
1. Install "Brainfile" from the marketplace
2. Open your project — the kanban board appears in the sidebar

---

## Add AI Integration

Want your AI assistant to manage tasks directly? Add this to `.mcp.json` in your project:

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

Works with Claude Code, Cursor, Cline, and any MCP-compatible tool.

::: tip What can AI do with this?
Your assistant can now list tasks, create new ones, move them between columns, update priorities, and manage subtasks — all without you copy-pasting anything.
:::

---

## Agent Coordination (Optional)

Brainfile allows you to create **Contracts** for your AI assistants. A contract defines exactly what an agent needs to deliver.

### 1. Create a task with a contract
```bash
brainfile add --title "Create API docs" \
  --with-contract \
  --deliverable "docs/api.md" \
  --validation "npm run docs:build"
```

### 2. How agents use it
When an AI agent (like Claude or Cursor) picks up this task, it will see the structured `deliverables` and `validation` commands. This ensures the agent produces exactly what you need.

---

## Next Steps

- [Why Brainfile?](/why) — The full story
- [Getting Started with Contracts](/guides/getting-started-with-contracts) — 2-minute intro
- [CLI Commands](/tools/cli) — All available commands
- [MCP Integration](/tools/mcp) — AI assistant setup
- [Protocol Specification](/reference/protocol) — File format details
