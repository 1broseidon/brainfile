---
title: Protocol Specification
description: Complete specification of the Brainfile file format
---

# Protocol Specification

The Brainfile protocol defines a structured format for project tasks stored in markdown files with YAML frontmatter.

## v2 Architecture

Brainfile v2 uses a directory-based structure:

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
| `brainfile.md` | 2 | Root file (v1 compat) |
| `.brainfile.md` | 3 | Hidden, backward compat |
| `.bb.md` | 4 | Shorthand, deprecated |

### Completion

Completed tasks are moved from `board/` to `logs/` via `brainfile complete`.

---

## YAML Structure

### Board Config (`brainfile.md`)

```yaml
---
title: string              # Required: Project title
columns:                   # Required: Column definitions
  - id: string             # Unique kebab-case identifier
    title: string          # Display title
    completionColumn: boolean  # Optional: auto-complete on move

# Optional fields
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

### Task File (`board/task-1.md`)

```yaml
---
id: task-1
type: task
title: Implement feature
column: todo
priority: high
assignee: codex
tags: [backend]
relatedFiles: [src/main.ts]
parentId: epic-1
dueDate: "2026-03-01"
subtasks:
  - id: task-1-1
    title: Write tests
    completed: false
contract:
  status: ready
  deliverables:
    - path: src/feature.ts
---

## Description
Task details here.

## Log
- 2026-02-18T10:00:00Z: Created
```

---

## Field Reference

### Board Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | Yes | Project or board title |
| `type` | string | No | Document type (default: `board`) |
| `schema` | string | No | JSON schema URL for validation |
| `protocolVersion` | string | No | Protocol version |
| `agent` | object | No | AI agent instructions |
| `rules` | object | No | Project rules |
| `columns` | array | Yes | Workflow columns |
| `archive` | array | No | Archived tasks |

### Column Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique identifier (kebab-case) |
| `title` | string | Yes | Display title |
| `tasks` | array | Yes | Tasks in this column |

### Task Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique ID (pattern: `task-N`) |
| `title` | string | Yes | Task title |
| `description` | string | No | Detailed description (markdown) |
| `priority` | string | No | `low`, `medium`, `high`, `critical` |
| `effort` | string | No | `trivial`, `small`, `medium`, `large`, `xlarge` |
| `assignee` | string | No | Person responsible |
| `dueDate` | string | No | ISO 8601 date |
| `tags` | array | No | String tags for filtering |
| `relatedFiles` | array | No | File paths |
| `blockedBy` | array | No | Task IDs that block this task |
| `subtasks` | array | No | Subtask objects |
| `template` | string | No | `bug`, `feature`, `refactor` |

### Subtask Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique ID (pattern: `task-N-M`) |
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
| Base | `https://brainfile.md/v1/base.json` |
| Board | `https://brainfile.md/v1/board.json` |

Browse all: [brainfile.md/v1/](https://brainfile.md/v1/)

### Type Inference

When `type` is omitted, tools detect by:
1. Schema URL pattern (`/v1/board.json` → board)
2. Structural analysis (`columns[]` → board)
3. Default: `board`

---

## ID Patterns

### Task IDs

Pattern: `task-N` where N is a sequential number.

```yaml
- id: task-1
- id: task-2
- id: task-15
```

### Subtask IDs

Pattern: `task-N-M` where N is parent task number, M is subtask number.

```yaml
subtasks:
  - id: task-1-1
  - id: task-1-2
```

---

## Version History

### v1.0.0 (Current)

- Stable release: board-only task management
- Simplified protocol focus
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
schema: https://brainfile.md/v1/board.json
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

- [API Reference](/reference/api) — Library method documentation
- [CLI Commands](/reference/commands) — Full command reference
- [Schema Types](/reference/types) — Document type schemas
