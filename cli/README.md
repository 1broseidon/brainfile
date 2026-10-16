# brainfile

Markdown task boards for you and your AI agents. Manage tasks, epics, specs, plans, decisions and contracts from your terminal, hand tasks to coding agents and land their work — with a TUI board view and an MCP server so your coding agents work the same board. Everything is plain Markdown in your repo.

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
- `--type`: `task` (default), `epic`, `spec`, `plan`, `decision`, or a type of the board's own; `issue` and `adr` are aliases
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
brainfile types add bug --like task   # Add a type of your own (--id-prefix, --completable, --schema); epic, spec, plan, task and decision are built in
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

## Decisions

A decision is a standing choice, recorded under a dotted claim key; a new one in the same family supersedes the old. `brainfile check` says whether a decision still speaks to an action before an agent acts, and every `brainfile brief` lists the decisions that stand. `adr` is an alias: `--type adr` writes a decision, and `brainfile adr promote` accepts a legacy `type: adr` file and moves it to `logs/`.

```bash
brainfile decide -k dependency.http-client "Use undici for HTTP. It ships with Node."
brainfile check "add axios"          # use | review | use_replacement | no_decision
brainfile list --type decision
```

Project guidance belongs in `agent.instructions` (`brainfile lint --fix` folds a legacy `rules:` block there).

## Hand-offs: a task to a coding agent

A task can be handed to a coding agent (Claude Code, Codex, Cursor, Antigravity, Grok, or any ACP server), which works in its own git worktree on `dispatch/<task-id>`, forked from where the task lands. `dispatch` writes the request on the task; a runner on this machine starts it: `brainfile run` in a terminal, or the Brainfile desktop app. Neither needs the other.

```bash
brainfile dispatch task-12 --agent codex    # queue it; a runner starts it
brainfile dispatch epic-3 --agent claude    # an epic gets a lead, which hands its children off in order
brainfile run                               # work the queue here; asks come to this prompt, Ctrl-C lets go
brainfile dispatch status                   # runners, live runs, the queue, the claims
brainfile review task-12                    # its branch, commits, files and conflicts; --ready lists what can land
brainfile land task-12                      # check with the contract's validation, then land on its target
brainfile pr task-12                        # or open it as a GitHub pull request; --status follows it
brainfile discard task-12                   # throw the work away
brainfile discuss task-12                   # talk a task over with an agent first; it writes no code
brainfile agents                            # the agents installed here, and their models
```

The commands that start an agent themselves (`run`, `dispatch --now`, `discuss`) need Node 20.19 or newer. An agent Brainfile starts carries its role in `BRAINFILE_AGENT_ROLE`, and the CLI keeps to it: a hand-off cannot dispatch, land, discard or open a pull request, and a lead reaches only its own tree.

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

This registers an MCP tool for everything the CLI does to a board: list, read, search, create, update, move, complete, restore and delete tasks; notes and logs; subtasks and contracts; decisions; columns, the board's settings, types and templates; lint, sync, and where (with the board's fix and undo); the project's GitHub issues, imported as tasks; hand-offs (`dispatch`, `dispatch_status`, `dispatch_stop`, `dispatch_lead`), their review, landing and discard (`review`), a hand-off opened as a GitHub pull request (`pull_request`), the agents installed here (`agents`), and a task to talk over (`discuss`, also a prompt). Thirty-five in all. The server tells the agent to use them for every board change and never to edit `.brainfile/` by hand, and keeps to the agent's role (`BRAINFILE_AGENT_ROLE`): a worker's or a discussion's server lists no dispatch, and a lead's reaches only its epic.
