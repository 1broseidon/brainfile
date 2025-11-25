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

## Next Steps

<div class="next-steps">

**Learn more:**
- [Why Brainfile?](/why) — The full story
- [CLI Commands](/tools/cli) — All available commands
- [AI Integration](/tools/mcp) — Deep dive on MCP

**Reference:**
- [Protocol Specification](/reference/protocol) — File format details
- [API Reference](/reference/api) — Core library docs

</div>
