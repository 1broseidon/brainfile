# brainfile

Markdown task boards for you and your AI agents. Manage tasks, epics, contracts, and ADRs from your terminal — with a TUI board view and an MCP server so your coding agents work the same board. Everything is plain Markdown in your repo.

## Install

```bash
npm i -g brainfile
```

## Quick Start

Initialize a new brainfile in your project root:

```bash
brainfile init
```

This creates the standard v2 structure:
- `.brainfile/brainfile.md` (Configuration: columns, types, agent instructions)
- `.brainfile/board/` (Active tasks)
- `.brainfile/logs/` (Completed task files and `ledger.jsonl`)

The board comes pre-configured with `To Do` and `In Progress` columns.

### Migrating older layouts

If your repo still has a legacy `brainfile.md` layout, normal runtime commands will ask you to migrate before continuing. Run `brainfile migrate` from the directory that contains the old file, or pass `--dir` to point at that directory:

```bash
brainfile migrate --dir .
```

This upgrades your workspace to v2 (`.brainfile/brainfile.md` + `board/` + `logs/`). Use `--logs-to-ledger` when you also want legacy `logs/*.md` files migrated into `ledger.jsonl`.

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
brainfile delete -t task-10 --force
```

### Complete
When a task is done, complete it from the active board.

```bash
brainfile complete -t task-10
```
This writes `.brainfile/logs/task-10.md` with a completion timestamp and removes the active task file from `.brainfile/board/`. Use `brainfile log` to view completed task history.

## Types

Brainfile supports different document types.

```bash
brainfile types list           # See configured types
brainfile types list --json    # Output configured types as JSON
brainfile types add epic       # Add a type (use --id-prefix, --completable, or --schema to customize it)
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
Run the validation commands and check deliverables.

```bash
brainfile contract validate -t task-45
```
- **Pass**: Contract status becomes `done`.
- **Fail**: Contract status becomes `failed` and records feedback for rework.

## ADR Promotion

Architecture Decision Records (ADRs) are first-class task files. Promote an ADR to mark it accepted and archive it to `logs/`. Accepted ADRs show up in `brainfile brief`.

```bash
# 1. Create an ADR
brainfile add -t "Use Postgres for all user data" --type adr -c todo

# 2. Promote it
brainfile adr promote -t adr-1
```

The ADR file moves to `.brainfile/logs/` with `status: promoted`. Project guidance belongs in `agent.instructions` (or `brainfile lint --fix` will fold a legacy `rules:` block there).

## TUI (Terminal UI)

Launch the interactive board:

```bash
brainfile          # No arguments launches the TUI
brainfile tui      # Explicit subcommand also works
```

Completed work is the `L` done view, not a column and not a stop on `t`. `e` opens the document in `$EDITOR`.

### Keyboard Shortcuts
| Key | Action |
|-----|--------|
| `j` / `k` | Move selection |
| `h` / `l` / `tab` | Cycle column |
| `enter` | Open detail |
| `t` | Cycle type |
| `L` | Toggle done view |
| `space` | Collapse parent / toggle subtask in detail |
| `a` | Add |
| `c` | Complete |
| `e` | Edit in `$EDITOR` |
| `/` | Filter |
| `?` | Help |
| `q` | Quit |

## AI Integration

The CLI includes an MCP (Model Context Protocol) server.

Add to your `claude_desktop_config.json`:

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

This registers MCP tools to list, read, search, create, update, move, complete, and delete tasks; manage subtasks; and run contract workflows.
