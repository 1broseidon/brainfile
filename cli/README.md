# @brainfile/cli

**The official CLI for Brainfile.** Manage tasks, contracts, and ADRs directly from your terminal.

Designed for developers who want a local-first, file-based task management system that plays nicely with AI agents.

## Install

```bash
npm i -g @brainfile/cli
```

## Quick Start

Initialize a new brainfile in your project root:

```bash
brainfile init
```

This creates the standard v2 structure:
- `.brainfile/brainfile.md` (Configuration, rules, definitions)
- `.brainfile/board/` (Active tasks)
- `.brainfile/logs/` (Completed tasks)

The board comes pre-configured with `To Do` and `In Progress` columns.

### Migrating older layouts

If your repo still has a legacy `brainfile.md` layout, run:

```bash
brainfile migrate
```

This upgrades your workspace to v2 (`.brainfile/brainfile.md` + `board/` + `logs/`).

## Core Workflow

### Add Tasks
Create new tasks with rich metadata.

```bash
# Basic task
brainfile add --title "Implement login" --column todo

# Full featured task
brainfile add \
  --title "Refactor database layer" \
  --type task \
  --column todo \
  --priority high \
  --assignee @josh \
  --tags "refactor,db" \
  --parent epic-123

# Create a parent with children in one shot
brainfile add -c todo -t "Auth overhaul" \
  --child "OAuth flow" --child "Session hardening"
```

**Key Flags:**
- `--title, -t`: Task summary
- `--type`: `task`, `epic`, or `adr` (default: `task`)
- `--column, -c`: Target column ID
- `--parent`: Parent task/epic ID
- `--child`: Create child task(s) under the new parent (repeatable)
- `--priority, -p`: `low`, `medium`, `high`, `critical`
- `--tags`: Comma-separated list

### List Tasks
View your board from the command line.

```bash
brainfile list                        # View all active tasks
brainfile list --column todo          # Filter by column
brainfile list --tag bug              # Filter by tag
brainfile list --parent epic-123      # See all children of an epic
brainfile list --contract ready       # See tasks with contracts waiting for pickup
```

### Manage Tasks
Manipulate tasks as you work.

```bash
# View details
brainfile show -t task-10

# Move to another column
brainfile move -t task-10 -c in-progress

# Update fields
brainfile patch -t task-10 --priority critical --tags "frontend,urgent"

# Clear fields
brainfile patch -t task-10 --clear-tags --clear-assignee

# Delete (permanently)
brainfile delete -t task-10
```

### Complete
When a task is done, move it to the archive.

```bash
brainfile complete -t task-10
```
This moves the file from `.brainfile/board/` to `.brainfile/logs/`, preserving its history forever.

## Types

Brainfile supports different document types.

```bash
brainfile types list       # See available types (task, epic, adr)
brainfile types add        # (Coming soon: define custom types)
```

## Contracts: Working with AI Agents

Contracts allow you to define explicit deliverables and validation rules for AI agents.

### 1. Create a Contract
Add a task with a contract definition.

```bash
brainfile add -c todo -t "Optimize image loader" \
  --with-contract \
  --deliverable "file:src/utils/loader.ts:Optimized implementation" \
  --validation "npm test -- loader" \
  --constraint "Must use lazy loading"
```

### 2. Pickup (Agent)
The agent claims the task.

```bash
brainfile contract pickup -t task-45
```
Status changes to `in_progress`. Metrics tracking begins.

### 3. Deliver (Agent)
The agent marks work as ready for review.

```bash
brainfile contract deliver -t task-45
```
Status changes to `delivered`.

### 4. Validate (User)
Run the validation commands automatically.

```bash
brainfile contract validate -t task-45
```
- **Pass**: Task is marked `done`.
- **Fail**: Task status reverts to `ready` (or `failed`) for rework.

## ADR Promotion

Architecture Decision Records (ADRs) are first-class citizens. You can promote an accepted ADR to a global rule that agents must follow.

```bash
# 1. Create an ADR
brainfile add -t "Use Postgres for all user data" --type adr -c proposed

# 2. Accept it (move to accepted column)
brainfile move -t adr-1 -c accepted

# 3. Promote to a rule
brainfile adr promote -t adr-1 --category always
```

**Categories:**
- `always`: Strict rules (e.g., "Always use TypeScript")
- `never`: Prohibitions (e.g., "Never commit secrets")
- `prefer`: Guidelines (e.g., "Prefer functional components")
- `context`: informational context

Promoted rules are added to `.brainfile/brainfile.md` and injected into agent prompts.

## TUI (Terminal UI)

Launch the interactive board:

```bash
brainfile          # No arguments launches the TUI
brainfile tui      # Explicit subcommand also works
```

### Panels
- **Board (`1`)**: Kanban view of active tasks.
- **Logs (`2`)**: List of completed tasks.
- **Rules (`3`)**: Active rules and configuration.

### Keyboard Shortcuts
| Key | Action |
|-----|--------|
| `tab` | Next column |
| `j` / `k` | Down / Up |
| `enter` | View task details |
| `n` | New task |
| `m` | Move task |
| `e` | Edit task (in $EDITOR) |
| `/` | Search |
| `q` | Quit |

## AI Integration

The CLI includes an MCP (Model Context Protocol) server.

Add to your `claude_desktop_config.json`:

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

This gives Claude (and other MCP clients) full access to read your board, create tasks, and manage contracts.
