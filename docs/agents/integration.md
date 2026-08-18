---
title: AI Agent Integration
description: Guide for integrating AI agents with Brainfile task management
---

## Overview

Brainfile is designed for AI agent compatibility. There are two integration paths:

1. **MCP Server** — Tool access for Claude/Cursor and other MCP clients
2. **Agent Hooks** — Automatic reminders during development

## MCP Server (Recommended)

The CLI includes a built-in MCP (Model Context Protocol) server that exposes all Brainfile operations as tools.

### Setup

Add to `.mcp.json` in your project:

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

The MCP server auto-detects the brainfile location (`.brainfile/brainfile.md` or root `brainfile.md`).

### Available Tools

The server registers **11 tools**. `task_move`/`task_patch` accept a single ID or an array (bulk), and `subtask`/`contract` dispatch on an `action` parameter.

| Tool | Description |
|------|-------------|
| `list_tasks` | List tasks with column/tag/type filtering |
| `get_task` | Get detailed task information by ID |
| `search` | Search tasks and logs, list recent completions, or view one entry |
| `task_add` | Create a task; optionally attach a contract |
| `task_move` | Move one task or an array of tasks between columns |
| `task_patch` | Update fields on one or many tasks (`null` removes a field) |
| `task_delete` | Permanently delete a task |
| `task_complete` | Complete a task (append to `ledger.jsonl` and archive), or archive to GitHub/Linear |
| `subtask` | Action-based: `add` \| `toggle` \| `delete` \| `update` |
| `contract` | Action-based: `attach` \| `pickup` \| `deliver` \| `validate` \| `graph` \| `activate` |
| `brief` | Per-agent digest of what changed since that agent's last brief (`peek` to not mark as seen) |

See [MCP Server → Available Tools](/tools/mcp#available-tools) for full parameter tables.

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

For simple integration without MCP or hooks, add to your agent config file (`CLAUDE.md`, `.cursorrules`, `AGENTS.md`, etc.):

```markdown
# Task Management Rules

- Use brainfile CLI or MCP tools for task operations
- Update task status as you work (todo → in-progress → done)
- Check .brainfile/brainfile.md for agent instructions and board config
- Task files live in `.brainfile/board/` (active) and `.brainfile/logs/` (completion history with `ledger.jsonl`)
```

### `AGENTS.md` and coding preferences

[`AGENTS.md`](https://agents.md/) (and similar files like `CLAUDE.md` / `.cursorrules`) are **repo-level coding style and behavior guides**. Brainfile does not replace them and does not generate them.

| Concern | Where it lives |
|---------|----------------|
| How to write code (style, security, docs norms) | `AGENTS.md` / tool-specific agent files |
| What work is in flight (tasks, contracts, validation) | `.brainfile/` board + MCP/CLI |
| Short board-scoped reminders agents should read before working | `agent.instructions` / `agent.llmNotes` in `.brainfile/brainfile.md`, or per-agent bodies under `.brainfile/agents/` |

Keep style prefs in `AGENTS.md` (or your tool's equivalent). Optionally mirror a few project-specific lines into `agent.instructions` or an agent file body so workers that brief from the board see them. Brainfile stays the coordination layer — not a generic software-practices template.

---

## Agent Instructions Block

The `agent` block in `.brainfile/brainfile.md` provides explicit instructions:

```yaml
agent:
  identity: "Senior Software Engineer"  # Optional
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
| `identity` | System prompt identity — who this agent is and how it should behave |
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
2. `brainfile.md` (root, legacy compat)
3. `.brainfile.md` (hidden, backward compat)

### Directory Structure

```
.brainfile/
├── brainfile.md      # Board config (columns, types)
├── agents/           # Agent configuration files (optional)
│   ├── _defaults.md  # Default settings for all agents
│   ├── codex.md      # Codex agent config + instructions
│   └── research.md   # Research agent config
├── board/            # Active task files
│   ├── task-1.md
│   ├── task-2.md
│   ├── epic-1.md
│   └── adr-1.md
└── logs/             # Completed history
    ├── ledger.jsonl  # Primary completion record
    └── task-3.md     # (legacy) Archived task
```

---

## Composable Agent Files

Brainfile supports per-agent configuration files in `.brainfile/agents/` directory. This allows customizing agent behavior, commands, and providing agent-specific instructions.

### Directory Structure

```
.brainfile/
├── brainfile.md          # Board config
├── agents/               # Per-agent configs (preferred)
│   ├── _defaults.md      # Default settings for all agents
│   ├── codex.md          # Codex agent config + instructions
│   ├── cursor.md         # Cursor agent config
│   └── research.md       # Research agent config
└── agents.yaml           # Legacy monolithic config (fallback)
```

### Agent File Format

Agent files use YAML frontmatter for configuration + markdown body for agent instructions:

```markdown
---
command: claude
args:
  - --model
  - claude-opus-4-6
transport: acp-stdio
capabilities:
  - code
  - test
  - refactor
permissionMode: orchestrator
timeoutSeconds: 900
model: claude-opus-4-6
sessionMode: auto
---

# Agent Instructions

You are a backend implementation specialist. Follow these guidelines:

- Use functional patterns over OOP
- Include comprehensive error handling
- Write unit tests for all public functions
- Document complex logic with inline comments
- Follow the existing code style in the project
```

### Frontmatter Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `command` | `string` | Yes | Executable command to run (e.g., `claude`, `cursor`, `acp`) |
| `args` | `string[]` | No | Command-line arguments |
| `transport` | `"acp-stdio"` | No | Communication protocol (default: `acp-stdio`) |
| `capabilities` | `string[]` | No | Agent capabilities (e.g., `code`, `test`, `docs`) |
| `sessionMode` | `string` | No | Session management mode (e.g., `auto`, `manual`) |
| `model` | `string` | No | AI model to use (e.g., `claude-opus-4-6`) |
| `permissionMode` | `"orchestrator" \| "enforcer"` | No | Permission level (default: `orchestrator`) |
| `timeoutSeconds` | `number` | No | Maximum execution time in seconds (default: 600) |

### Instructions Body

The markdown body after the frontmatter becomes the agent's instructions. These are injected into the dispatch prompt when the agent is invoked.

**Guidelines for writing agent instructions:**
- Be specific about the agent's role and responsibilities
- Include coding standards and patterns to follow
- Reference project-specific conventions
- Keep instructions concise but actionable
- Use markdown formatting for readability

### Defaults File

`_defaults.md` provides default values that apply to all agents unless overridden:

```markdown
---
transport: acp-stdio
permissionMode: orchestrator
timeoutSeconds: 600
model: claude-sonnet-4-5
---
```

**Available default fields:**
- `transport`
- `permissionMode`
- `timeoutSeconds`
- `model`

The markdown body of `_defaults.md` is ignored (only frontmatter is used).

### Resolution Priority

When resolving agent configuration, the system checks in this order:

1. **Agent-specific file** in `.brainfile/agents/{agent-name}.md`
2. **Defaults from** `.brainfile/agents/_defaults.md`
3. **Legacy config** in `.brainfile/agents.yaml`
4. **Builtin defaults** (hardcoded fallback)

**Example resolution:**

```
.brainfile/agents/
├── _defaults.md       # timeoutSeconds: 600, transport: acp-stdio
└── codex.md           # command: codex, model: gpt-4

Resolved for "codex":
  command: codex              (from codex.md)
  model: gpt-4                (from codex.md)
  timeoutSeconds: 600         (from _defaults.md)
  transport: acp-stdio        (from _defaults.md)
  permissionMode: orchestrator (builtin default)
```

### Creating Agent Files

**Manually:**

Create `.brainfile/agents/my-agent.md`:

```markdown
---
command: acp
args:
  - --provider
  - anthropic
model: claude-sonnet-4-5
timeoutSeconds: 1200
---

# Implementation Agent

You specialize in implementing features from contracts.
Always write tests and update documentation.
```

### Migrating from agents.yaml

If you have an existing `.brainfile/agents.yaml`, convert it to the new format:

**Old format (`agents.yaml`):**

```yaml
defaults:
  transport: acp-stdio
  permissionMode: orchestrator
agents:
  codex:
    command: codex
    model: gpt-4
  research:
    command: claude
    model: claude-opus-4-6
```

**New format:**

Create `.brainfile/agents/_defaults.md`:

```markdown
---
transport: acp-stdio
permissionMode: orchestrator
---
```

Create `.brainfile/agents/codex.md`:

```markdown
---
command: codex
model: gpt-4
---
```

Create `.brainfile/agents/research.md`:

```markdown
---
command: claude
model: claude-opus-4-6
---

# Research Agent

You specialize in gathering documentation and best practices.
Focus on actionable findings, not exhaustive summaries.
```

The system will prefer the `.brainfile/agents/` directory and fall back to `agents.yaml` if no agent-specific file exists.

### Benefits of Agent Files

- **Separation of concerns**: Each agent has its own configuration file
- **Agent-specific instructions**: Customize behavior per agent role
- **Version control friendly**: Easier to track changes to individual agents
- **Scalable**: Add new agents without editing monolithic config
- **Composable**: Mix and match agents with different capabilities
- **Default inheritance**: Share common settings via `_defaults.md`



## Common Operations

### Moving a Task

Use the CLI or MCP `task_move` tool:

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

### CLI

Use the CLI for validation:

```bash
brainfile lint --check
```

---

## See Also

- [CLI Commands](/reference/commands) — Full command reference
- [Board Format Reference](/reference/protocol) — File format details
- [Core Library](/tools/core) — Programmatic operations
- [MCP Server](/tools/mcp) — MCP tool reference
- [Contract System](/guides/contracts) — Contract workflow guide
