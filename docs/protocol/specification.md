---
title: Protocol Specification
description: Complete specification of the Brainfile task management protocol
---

## Overview

Brainfile is a protocol for task management designed specifically for AI-assisted software development. It defines a structured format for project tasks that both humans and AI agents can understand and modify.

## v2 Architecture

Brainfile v2 uses a directory-based structure where each task is its own file:

```
.brainfile/
├── brainfile.md        # Board Configuration (columns, types, rules)
├── board/              # Active Documents
│   ├── task-1.md
│   └── epic-1.md
└── logs/               # Completed Documents
    ├── task-2.md
    └── adr-1.md
```

- **`brainfile.md`** — Configuration only: columns, types, rules, agent instructions. No tasks stored here.
- **`board/`** — Active task files (todo, in-progress, etc.)
- **`logs/`** — Completed task files (permanent history)

## File Discovery

Tools should check for the board config in this order:

1. `.brainfile/brainfile.md` (preferred, v2)
2. `brainfile.md` (root, legacy compat)
3. `.brainfile.md` (hidden, legacy)
4. `.bb.md` (shorthand, deprecated)

## Board Configuration (`brainfile.md`)

### Required Fields

```yaml
---
title: string       # Project or board title
columns: []         # Array of column definitions
---
```

### Optional Fields

```yaml
---
type: board                 # Document type (default: board)
schema: string              # JSON schema URL
protocolVersion: string     # e.g., "2.0.0"
strict: boolean             # Enable strict type validation
types:                      # Custom document types
  epic:
    idPrefix: epic
    completable: true
  adr:
    idPrefix: adr
    completable: false
agent:
  instructions: []          # AI agent instructions
  llmNotes: string          # Free-form notes
rules:
  always: []
  never: []
  prefer: []
  context: []
---
```

### Complete Example

```yaml
---
title: My Project
columns:
  - id: todo
    title: To Do
  - id: in-progress
    title: In Progress
strict: true
types:
  epic:
    idPrefix: epic
    completable: true
  adr:
    idPrefix: adr
    completable: false
agent:
  instructions:
    - "Update task status in real-time"
rules:
  always:
    - id: 1
      rule: "Use TypeScript for all new code"
      source: "adr-1"
---

# Project Description
High-level context for the project...
```

## Task Files (`board/*.md`)

Each document is a standalone Markdown file with YAML frontmatter:

```yaml
---
id: task-1
type: task
title: Implement feature X
column: in-progress
parentId: epic-1
assignee: codex
priority: high
tags: [backend, security]
relatedFiles:
  - src/auth/jwt.ts
contract:
  status: ready
  deliverables:
    - path: src/feature.ts
---

## Description
Detailed requirements...

## Log
- 2026-02-18T10:00:00Z: Started work
```

## Document Types

The protocol supports custom document types via the `types` configuration:

| Field | Description |
|-------|-------------|
| `idPrefix` | Prefix for IDs (e.g., `epic` → `epic-1`) |
| `completable` | If `true`, items can be completed (moved to `logs/`). If `false`, they stay on the board |
| `schema` | Optional JSON Schema URL for validation |

**Built-in type**: `task` (always available, idPrefix: `task`, completable: `true`).

**Strict Mode**: If `strict: true` is set, only explicitly defined types (plus the default `task`) are allowed.

## Column Structure

Columns are config-only in v2 (no embedded tasks):

```yaml
columns:
  - id: string             # Unique identifier (kebab-case)
    title: string          # Display title
    completionColumn: boolean  # Optional: auto-complete on move
```

### Default Columns

`brainfile init` creates two columns: `todo` and `in-progress`. There is no default "done" column — completion is handled by moving files to `logs/`.

### completionColumn

When `completionColumn: true`, moving a task to that column triggers auto-completion (file moves from `board/` to `logs/`). This is optional and not set by default.

## Lifecycle & Behavior

### Task Lifecycle
1.  **Created**: Added to `board/` in a column (e.g., `todo`).
2.  **Active**: Moves between columns in `board/`.
3.  **Completed**: `brainfile complete` moves the file from `board/` to `logs/` and sets `completedAt`. Optionally, if a column has `completionColumn: true`, moving there triggers auto-completion.

### Epic Lifecycle
Epics are container documents.
- **Linking**: Tasks link to Epics via `parentId: epic-N`.
- **Progress**: Calculated based on the completion status of child tasks.
- **Completion**: Can be completed like tasks when all children are done.

### ADR Lifecycle (Architecture Decision Records)
ADRs track decisions.
1.  **Draft**: Created in `board/`.
2.  **Accepted**: Moved to accepted column or marked.
3.  **Promoted**: Using `brainfile adr promote`, the ADR is moved to `logs/` (status: `promoted`) and its title is extracted as a permanent rule in `brainfile.md`.

## Linking Model (`parentId`)

- **Any-to-Any**: Any document can parent any other document.
- **One Parent**: A document has at most one parent.
- **Reference**: `parentId` stores the ID string (e.g., `epic-1`).

The `--child` flag on `brainfile add` creates child tasks automatically:

```bash
brainfile add --title "Auth overhaul" --child "OAuth flow" --child "Session handling"
```

## Contract System

Contracts define formal agreements between a PM and an Agent. They are embedded in the `contract` field of a task file.

### Structure

```yaml
contract:
  status: ready
  version: 1
  deliverables:
    - path: src/main.ts
      description: Core implementation
  validation:
    commands: ["npm test"]
  constraints:
    - "No external dependencies"
```

### Lifecycle

1.  **Ready**: PM defines requirements.
2.  **In Progress**: Agent picks up (`brainfile contract pickup`).
3.  **Delivered**: Agent submits (`brainfile contract deliver`).
4.  **Done**: PM validates and approves (`brainfile contract validate`).
5.  **Failed**: Validation fails, requires rework.

### Contract CLI Commands

| Command | Description |
|---------|-------------|
| `contract pickup` | Claim task, set status to `in_progress` |
| `contract deliver` | Submit work, set status to `delivered` |
| `contract validate` | Check deliverables and run validation commands |
| `contract attach` | Add contract to existing task |

## Rules System

Project rules are centralized in `brainfile.md`:

```yaml
rules:
  always:
    - id: 1
      rule: "Rule text"
      source: "adr-1"     # Optional backlink to ADR
  never: []
  prefer: []
  context: []
```

**Format**: Each rule has a numeric `id`, a `rule` string, and an optional `source` backlink.

## Task Fields Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique ID (pattern: `{type}-N`) |
| `type` | string | No | Document type (default: `task`) |
| `title` | string | Yes | Task title |
| `column` | string | Yes | Column ID |
| `description` | string | No | Detailed description |
| `parentId` | string | No | Parent document ID |
| `priority` | string | No | `low`, `medium`, `high`, `critical` |
| `assignee` | string | No | Person/agent responsible |
| `tags` | array | No | String tags |
| `relatedFiles` | array | No | File paths |
| `dueDate` | string | No | ISO 8601 date |
| `subtasks` | array | No | Subtask objects |
| `contract` | object | No | Agent contract |
| `createdAt` | string | No | ISO 8601 timestamp |
| `completedAt` | string | No | Set when moved to logs/ |

## Schema Reference

- **Board**: [`https://brainfile.md/v2/board.json`](https://brainfile.md/v2/board.json)
- **Task**: [`https://brainfile.md/v2/task.json`](https://brainfile.md/v2/task.json)
- **Contract**: [`https://brainfile.md/v2/contract.json`](https://brainfile.md/v2/contract.json)
- **Epic**: [`https://brainfile.md/v2/epic.json`](https://brainfile.md/v2/epic.json)
- **ADR**: [`https://brainfile.md/v2/adr.json`](https://brainfile.md/v2/adr.json)


## Version History

### v2.0 (Current)

- Per-task file architecture (`board/`, `logs/`)
- Custom document types with strict mode
- ADR promotion to rules
- Contract system with lifecycle
- `parentId` linking model

### 1.0 (Legacy)

- Single-file embedded tasks
- Board-only task management

---

## Best Practices

1. **Use `.brainfile/` directory** for v2 projects
2. **Include agent instructions** for consistent AI behavior
3. **Use strict mode** to enforce document types
4. **Preserve IDs** — never regenerate or change task IDs
5. **Complete tasks via CLI** — `brainfile complete` handles the board/ → logs/ move
6. **Archive history** — logs/ preserves completed work permanently

---

## Next Steps

- [API Reference](/reference/api) — Library method documentation
- [CLI Commands](/reference/commands) — Full command reference
- [Schema Types](/reference/types) — Document type schemas
