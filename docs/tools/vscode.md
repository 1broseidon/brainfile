---
title: VSCode Extension
description: Visual kanban board in your editor
---

# VSCode Extension

The Brainfile extension brings a visual kanban board directly into VSCode. See your tasks in the sidebar, drag and drop between columns, and stay in your editor.

## Installation

1. Open VSCode
2. Go to Extensions (`Cmd+Shift+X` / `Ctrl+Shift+X`)
3. Search for "Brainfile"
4. Click Install

Or install from the command line:

```bash
code --install-extension brainfile.brainfile
```

## Features

### Kanban Board View

The extension adds a Brainfile panel to your sidebar. Open any project with a `brainfile.md` file and the board appears automatically.

- **Columns** — Your workflow stages (To Do, In Progress, Done)
- **Tasks** — Cards showing title, priority, tags
- **Drag & Drop** — Move tasks between columns visually

### Real-time Sync

::: info All tools stay in sync
The extension watches your `brainfile.md` for changes. Edits from the CLI, AI assistants, or direct file changes appear instantly. No refresh needed.
:::

### Task Details

Click a task to see:
- Full description
- Subtasks with completion status
- Assignee and due date
- Related files
- Tags and priority

### Quick Actions

- **Add Task** — Click + in any column
- **Edit Task** — Click the edit icon
- **Delete Task** — Right-click menu
- **Move Task** — Drag between columns

---

## File Discovery

The extension looks for brainfile in this order:

1. `brainfile.md` (preferred)
2. `.brainfile.md` (hidden, backward compat)

If found, the kanban view activates automatically.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+Shift+B` | Toggle Brainfile panel |
| `Cmd+Shift+N` | New task in current column |

---

## Settings

Configure via VSCode settings (`Cmd+,`):

```json
{
  "brainfile.defaultFile": "brainfile.md",
  "brainfile.showInActivityBar": true
}
```

---

## Troubleshooting

### Board not showing

1. Ensure `brainfile.md` exists in your workspace root
2. Check the file is valid YAML (run `brainfile lint`)
3. Reload the window (`Cmd+Shift+P` → "Reload Window")

### Changes not syncing

The extension uses file watching. If changes aren't appearing:
1. Save the file explicitly
2. Check VSCode's file watcher isn't rate-limited
3. Reload the window

### Invalid YAML errors

::: tip Quick fix
Run `brainfile lint --fix` to auto-fix common issues like unquoted strings with colons.
:::

---

## Works With

The VSCode extension complements other Brainfile tools:

- **CLI** — Use both interchangeably
- **MCP Server** — AI updates appear in real-time
- **TUI** — Terminal users see the same data

All tools read the same `brainfile.md` file.

---

## Source Code

The extension is open source:

- [GitHub Repository](https://github.com/brainfile/vscode)
- [Issue Tracker](https://github.com/brainfile/vscode/issues)

---

## Next Steps

- [CLI & TUI](/tools/cli) — Command-line interface
- [MCP Server](/tools/mcp) — AI integration
- [Quick Start](/quick-start) — Getting started guide
