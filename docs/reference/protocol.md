---
title: Protocol Specification
description: Complete specification of the Brainfile file format
---

# Protocol Specification

The Brainfile protocol defines a structured format for project tasks stored in markdown files with YAML frontmatter.

## v2 Architecture

Brainfile v2 uses a directory-based structure:

<ArchitectureDiagram />

```
.brainfile/
├── brainfile.md        # Board Configuration
├── board/              # Active task files
│   ├── task-1.md
│   └── epic-1.md
└── logs/               # Completed task files
    └── task-2.md
```

### File Discovery

| Path | Priority | Notes |
|------|----------|-------|
| `.brainfile/brainfile.md` | 1 (preferred, v2) | Directory-based architecture |
| `brainfile.md` | 2 | Root file (legacy compat) |
| `.brainfile.md` | 3 | Hidden, backward compat |

### Completion

::: info Completion Model
Completed tasks are moved from `board/` to `logs/` via `brainfile complete`. There is no "done" column by default — completion is a file-level operation that archives the task.
:::

<svg viewBox="0 0 420 60" xmlns="http://www.w3.org/2000/svg" style="max-width: 400px; width: 100%; display: block; margin: 1.5em auto;">
  <defs><marker id="comp-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#5cc8ff" /></marker></defs>
  <rect x="10" y="10" width="140" height="40" rx="6" fill="#0a0a0e" stroke="#5cc8ff" stroke-width="2" />
  <text x="80" y="34" fill="#5cc8ff" font-family="JetBrains Mono, monospace" font-size="13" text-anchor="middle" dominant-baseline="middle">board/</text>
  <line x1="150" y1="30" x2="260" y2="30" stroke="rgba(92,200,255,0.4)" stroke-width="2" marker-end="url(#comp-arrow)" />
  <text x="205" y="22" fill="#585868" font-family="JetBrains Mono, monospace" font-size="9" text-anchor="middle">brainfile complete</text>
  <rect x="265" y="10" width="140" height="40" rx="6" fill="#0a0a0e" stroke="#2a2a38" stroke-width="2" />
  <text x="335" y="34" fill="#a0a0b0" font-family="JetBrains Mono, monospace" font-size="13" text-anchor="middle" dominant-baseline="middle">logs/</text>
</svg>

---

## YAML Structure

### Board Config (`brainfile.md`)

```yaml
---
title: string              # Required
columns:                   # Required
  - id: string             # Required — unique kebab-case identifier
    title: string          # Required — display title
    completionColumn: boolean  # Optional — auto-complete on move

# All below are optional
type: board
schema: string
protocolVersion: string
strict: boolean            # Enforce type validation
types:                     # Custom document types
  epic:
    idPrefix: epic
    completable: true
  adr:
    idPrefix: adr
    completable: false
agent:
  instructions: []
  llmNotes: string
rules:
  always: []
  never: []
  prefer: []
  context: []
---
```

::: tip Minimal Example
The smallest valid board config:
```yaml
---
title: My Project
columns:
  - id: todo
    title: To Do
---
```
:::

### Task File (`board/task-1.md`)

```yaml
---
id: task-1                 # Required — unique ID
type: task                 # Optional — defaults to "task"
title: Implement feature   # Required
column: todo               # Required (active tasks)
priority: high             # Optional
assignee: codex            # Optional
tags: [backend]            # Optional
relatedFiles: [src/main.ts]  # Optional
parentId: epic-1           # Optional
dueDate: "2026-03-01"     # Optional
subtasks:                  # Optional
  - id: task-1-1
    title: Write tests
    completed: false
contract:                  # Optional
  status: ready
  deliverables:
    - path: src/feature.ts
---

## Description
Task details here.

## Log
- 2026-02-18T10:00:00Z: Created
```

::: tip Minimal Example
The smallest valid task file:
```yaml
---
id: task-1
title: My task
column: todo
---
```
:::

---

## Field Reference

### Board Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | Yes | Project or board title |
| `type` | string | No | Document type (default: `board`) |
| `schema` | string | No | JSON schema URL for validation |
| `protocolVersion` | string | No | Protocol version |
| `strict` | boolean | No | Enforce type validation |
| `types` | object | No | Custom document types |
| `agent` | object | No | AI agent instructions |
| `rules` | object | No | Project rules |
| `columns` | array | Yes | Workflow columns |
| `statsConfig` | object | No | Statistics configuration |

### Column Fields

Columns are config-only in v2 (no embedded tasks):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique identifier (kebab-case) |
| `title` | string | Yes | Display title |
| `completionColumn` | boolean | No | Auto-complete on move |

### Task Fields

Each task is a standalone `.md` file in `.brainfile/board/`:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique ID (pattern: `{type}-N`, e.g., `task-1`, `epic-2`) |
| `type` | string | No | Document type (default: `task`) |
| `title` | string | Yes | Task title |
| `column` | string | Yes* | Column ID (*required for active tasks, omitted in logs/) |
| `description` | string | No | Detailed description (markdown) |
| `priority` | string | No | `low`, `medium`, `high`, `critical` |
| `effort` | string | No | `trivial`, `small`, `medium`, `large`, `xlarge` |
| `assignee` | string | No | Person/agent responsible |
| `dueDate` | string | No | ISO 8601 date |
| `tags` | array | No | String tags for filtering |
| `relatedFiles` | array | No | File paths |
| `blockedBy` | array | No | Task IDs that block this task |
| `subtasks` | array | No | Subtask objects |
| `contract` | object | No | Agent contract |
| `createdAt` | string | No | ISO 8601 timestamp |
| `updatedAt` | string | No | ISO 8601 timestamp, set on mutations |
| `completedAt` | string | No | Set when moved to logs/ |
| `parentId` | string | No | Parent document ID |
| `position` | number | No | Sort position within the column |

### Subtask Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique ID (e.g., `task-1-1`) |
| `title` | string | Yes | Subtask title |
| `completed` | boolean | Yes | Completion status |

---

## Standard Column IDs

These IDs are conventional but not required. The default `brainfile init` creates `todo` and `in-progress`:

| ID | Purpose |
|----|---------|
| `backlog` | Tasks not yet scheduled |
| `todo` | Tasks to be started |
| `in-progress` | Tasks being worked on |
| `review` | Tasks pending review |

::: info No default "done" column
In v2, task completion is handled by moving files from `board/` to `logs/` via `brainfile complete`. A "done" column is not created by default. You can optionally add one with `completionColumn: true` if you want auto-completion behavior.
:::

---

## Agent Instructions

The `agent` block guides AI assistant behavior:

```yaml
agent:
  instructions:
    - Modify only the YAML frontmatter
    - Preserve all IDs
    - Keep ordering
    - Make minimal changes
    - Preserve unknown fields
  llmNotes: "Prefer functional patterns and comprehensive tests"
```

| Instruction | Reason |
|-------------|--------|
| Modify only YAML frontmatter | Content after `---` is user documentation |
| Preserve all IDs | Changing IDs breaks references |
| Keep ordering | Maintains visual consistency |
| Make minimal changes | Reduces merge conflicts |
| Preserve unknown fields | Future-proofs against extensions |

---

## Rules Block

Project rules for AI and human reference:

```yaml
rules:
  always:
    - id: 1
      rule: write tests for new features
    - id: 2
      rule: update task status as you work
  never:
    - id: 1
      rule: commit directly to main
  prefer:
    - id: 1
      rule: functional patterns over classes
  context:
    - id: 1
      rule: TypeScript monorepo with Jest
```

---

## Schema Reference

### Official Schemas

| Type | URL |
|------|-----|
| Base | `https://brainfile.md/v2/base.json` |
| Board | `https://brainfile.md/v2/board.json` |
| Task | `https://brainfile.md/v2/task.json` |
| Contract | `https://brainfile.md/v2/contract.json` |
| Epic | `https://brainfile.md/v2/epic.json` |
| ADR | `https://brainfile.md/v2/adr.json` |

Browse all: [brainfile.md/v2/](https://brainfile.md/v2/)

### Type Inference

When `type` is omitted, tools detect by:
1. Schema URL pattern (`/v2/board.json` → board)
2. Structural analysis (`columns[]` → board)
3. Default: `board`

---

## ID Patterns

::: info ID Assignment
IDs are auto-generated by the CLI and must never be changed manually. Changing an ID breaks all references — `parentId`, `blockedBy`, and subtask IDs all depend on stable document IDs.
:::

### Document IDs

Pattern: `{type}-N` where N is a sequential number.

```yaml
- id: task-1    # Standard task
- id: task-15
- id: epic-1    # Epic
- id: adr-3     # Architecture Decision Record
```

### Subtask IDs

Pattern: `{taskId}-N` where N is a sequential number within the parent task.

```yaml
# For a task with id: task-1
subtasks:
  - id: task-1-1
  - id: task-1-2
```

---

## Version History

### v2.0.0 (Current)

- Per-task file architecture (`board/`, `logs/`)
- Custom document types with strict mode
- Epic and ADR as first-class types
- Contract system with lifecycle
- `parentId` linking model

### 1.0.0 (Legacy)

- Single-file embedded tasks
- Board-only task management
- Full MCP tool support

### v0.5.0

- Added base schema with inheritance
- Added `agent.tools` for CLI tool configuration

### v0.4.0

- Added `protocolVersion` field
- Added `effort` and `blockedBy` task fields
- Added `llmNotes` to agent block

### v0.3.0

- Changed default to non-hidden files (`brainfile.md`)
- Added `agent` instruction block
- Added subtasks support

---

## Best Practices

1. **Use non-hidden files** — Better visibility, AI-friendly
2. **Include agent instructions** — Consistent AI behavior
3. **Preserve IDs** — Never regenerate or change task IDs
4. **Use semantic IDs** — Sequential `task-1`, `task-2`
5. **Keep descriptions concise** — But informative
6. **Archive completed tasks** — Keep board clean

---

## Example

### Board Config (`.brainfile/brainfile.md`)

```yaml
---
title: My Project
type: board
schema: https://brainfile.md/v2/board.json
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
agent:
  instructions:
    - Update task status as you work
    - Preserve all IDs
rules:
  always:
    - id: 1
      rule: write tests for new features
---

# My Project

Project documentation can go here.
```

### Task File (`.brainfile/board/task-1.md`)

```yaml
---
id: task-1
type: task
title: Implement user authentication
column: todo
priority: high
tags: [backend, security]
subtasks:
  - id: task-1-1
    title: Setup OAuth provider
    completed: false
  - id: task-1-2
    title: Create login UI
    completed: false
---

## Description
Add OAuth2 support for Google and GitHub.
```

---

## Next Steps

- [Schema Types](/reference/types) — JSON schema definitions for all document types
- [API Reference](/reference/api) — Programmatic access via @brainfile/core
- [CLI Commands](/reference/commands) — Command-line interface reference
- [Contract Schema](/reference/contract-schema) — Contract object specification
