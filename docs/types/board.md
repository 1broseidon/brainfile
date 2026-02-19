# Board Schema

The board schema defines the project configuration file (`.brainfile/brainfile.md`). It declares columns, document types, rules, and metadata. Tasks are standalone `.md` files in `.brainfile/board/`, each validated against [task.json](/reference/types).

## Schema URL

```
https://brainfile.md/v2/board.json
```

## Overview

The board file is **config-only** — it does not contain tasks. Tasks are individual files in `.brainfile/board/` (active) and `.brainfile/logs/` (completed). The board defines:

- Workflow columns (stages tasks move through)
- Document types (task, epic, adr, custom)
- Project rules for agents
- Statistics configuration

## Extends

[Base Schema](./base.md) — Inherits all base fields

## Type Identifier

```yaml
type: board
```

## Required Fields

### `columns`

**Type**: `array` of `column` objects
**Min Items**: 1
**Description**: Workflow columns. Task membership is declared via the `column` field in each task file's frontmatter.

```yaml
columns:
  - id: todo
    title: To Do
    order: 1
  - id: in-progress
    title: In Progress
    order: 2
  - id: done
    title: Done
    order: 3
    completionColumn: true
```

## Optional Fields

### `types`

**Type**: `object` (map of type definitions)
**Description**: Document type definitions. Keys are type identifiers that match the `type` field in task files. The built-in `task` type is always valid.

```yaml
types:
  epic:
    idPrefix: epic
    completable: false
    schema: https://brainfile.md/v2/epic.json
  adr:
    idPrefix: adr
    completable: false
    schema: https://brainfile.md/v2/adr.json
```

Each type entry supports:

| Field | Type | Description |
|-------|------|-------------|
| `idPrefix` | `string` (required) | Prefix for auto-generated IDs (e.g., `epic` → `epic-1`) |
| `completable` | `boolean` | Whether items can be completed (moved to `logs/`). Default: `true` |
| `schema` | `string` | JSON Schema URL for validating extended fields |

### `strict`

**Type**: `boolean`
**Default**: `false`
**Description**: Enables strict validation. When `true`, `add` rejects unknown task types and `move` rejects unknown columns.

### `statsConfig`

**Type**: `object`
**Description**: Configuration for progress statistics

```yaml
statsConfig:
  columns:
    - todo
    - in-progress
    - done
```

The `columns` array specifies which column IDs to include in progress calculations. Typically excludes backlog or archive columns.

## Column Structure

### Required Column Fields

#### `id`

**Type**: `string`
**Pattern**: `^[a-z]+(-[a-z]+)*$` (kebab-case)
**Description**: Unique column identifier. Referenced by `task.column` in per-task files.

```yaml
id: in-progress
```

#### `title`

**Type**: `string`
**Description**: Display title for the column

```yaml
title: In Progress
```

### Optional Column Fields

#### `order`

**Type**: `integer`
**Minimum**: 0
**Description**: Display order (lower numbers first)

```yaml
order: 2
```

Columns without `order` appear after ordered columns, in definition order.

#### `completionColumn`

**Type**: `boolean`
**Default**: `false`
**Description**: Marks this column as a completion column

```yaml
completionColumn: true
```

When `true`, tasks moved to this column are considered complete. This enables:
- **Non-English workflows**: "Terminé", "Fertig", "完了" are recognized
- **Custom semantics**: "Deployed", "Verified", "Archived" as completion
- **Explicit configuration**: No reliance on name-based pattern matching

## Task File Structure

Tasks are standalone `.md` files in `.brainfile/board/`. Each file has YAML frontmatter and an optional markdown body. See the [Task Schema](/reference/types) for the full specification.

### Task ID Patterns

| Type | Pattern | Example |
|------|---------|---------|
| task | `task-N` | `task-42` |
| epic | `epic-N` | `epic-3` |
| adr | `adr-N` | `adr-7` |
| custom | `{idPrefix}-N` | `spike-1` |

IDs must be unique across all board files and logs.

### Example Task File

File: `.brainfile/board/task-1.md`

```yaml
---
id: task-1
title: Add user authentication
column: todo
priority: high
effort: large
tags:
  - backend
  - security
assignee: alice
createdAt: "2025-11-24T10:00:00Z"
relatedFiles:
  - src/auth/jwt.ts
  - src/middleware/auth.ts
subtasks:
  - id: task-1-1
    title: Implement JWT generation
    completed: false
  - id: task-1-2
    title: Create login endpoint
    completed: false
  - id: task-1-3
    title: Write tests
    completed: false
---

## Requirements
- JWT-based authentication
- Login/logout endpoints
- Token refresh mechanism
```

### Subtask Structure

```yaml
subtasks:
  - id: task-1-1
    title: Write integration tests
    completed: false
  - id: task-1-2
    title: Update documentation
    completed: true
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Unique subtask identifier (e.g., `task-1-1`) |
| `title` | `string` | Yes | Subtask title |
| `completed` | `boolean` | Yes | Whether the subtask is done |

## Complete Example

### Board Config (`.brainfile/brainfile.md`)

```yaml
---
type: board
schema: https://brainfile.md/v2/board.json
title: Product Development
protocolVersion: 2.0.0
agent:
  instructions:
    - Update task status as work progresses
    - Preserve all task IDs
    - Use the CLI or MCP tools for task operations
rules:
  always:
    - id: 1
      rule: test all features before moving to done
    - id: 2
      rule: link related files for each task
  never:
    - id: 1
      rule: skip code review
  prefer:
    - id: 1
      rule: small focused tasks over large epics
types:
  epic:
    idPrefix: epic
    completable: false
    schema: https://brainfile.md/v2/epic.json
  adr:
    idPrefix: adr
    completable: false
    schema: https://brainfile.md/v2/adr.json
columns:
  - id: todo
    title: To Do
    order: 1
  - id: in-progress
    title: In Progress
    order: 2
  - id: done
    title: Done
    order: 3
    completionColumn: true
statsConfig:
  columns:
    - todo
    - in-progress
    - done
---
```

### Task Files (`.brainfile/board/`)

**`.brainfile/board/task-1.md`** — Active task:
```yaml
---
id: task-1
title: Add user authentication
column: todo
priority: high
effort: large
tags: [backend, security]
assignee: alice
createdAt: "2025-11-24T10:00:00Z"
relatedFiles:
  - src/auth/jwt.ts
  - src/middleware/auth.ts
subtasks:
  - id: task-1-1
    title: Implement JWT generation
    completed: false
  - id: task-1-2
    title: Create login endpoint
    completed: false
---
```

**`.brainfile/board/epic-1.md`** — Epic grouping tasks:
```yaml
---
id: epic-1
type: epic
title: Authentication System
column: in-progress
children: [task-1, task-3, task-4]
status: active
---
```

### Completed Task (`.brainfile/logs/`)

**`.brainfile/logs/task-2.md`**:
```yaml
---
id: task-2
title: Set up CI/CD pipeline
priority: medium
tags: [devops]
createdAt: "2025-11-20T10:00:00Z"
completedAt: "2025-11-23T16:45:00Z"
subtasks:
  - id: task-2-1
    title: Configure GitHub Actions
    completed: true
  - id: task-2-2
    title: Test deployment
    completed: true
---
```

## Use Cases

### Sprint Board

```yaml
columns:
  - id: backlog
    title: Backlog
    order: 1
  - id: sprint
    title: Sprint
    order: 2
  - id: in-progress
    title: In Progress
    order: 3
  - id: review
    title: Review
    order: 4
  - id: done
    title: Done
    order: 5
    completionColumn: true
```

### Bug Triage

```yaml
columns:
  - id: reported
    title: Reported
    order: 1
  - id: triaged
    title: Triaged
    order: 2
  - id: in-progress
    title: In Progress
    order: 3
  - id: fixed
    title: Fixed
    order: 4
  - id: verified
    title: Verified
    order: 5
    completionColumn: true
```

### Personal GTD

```yaml
columns:
  - id: inbox
    title: Inbox
    order: 1
  - id: next
    title: Next Actions
    order: 2
  - id: waiting
    title: Waiting
    order: 3
  - id: someday
    title: Someday/Maybe
    order: 4
  - id: done
    title: Done
    order: 5
    completionColumn: true
```

### International Workflows

```yaml
columns:
  - id: todo
    title: À faire
    order: 1
  - id: en-cours
    title: En cours
    order: 2
  - id: termine
    title: Terminé
    order: 3
    completionColumn: true
```

## Best Practices

### Column Design

- **Keep it simple**: 3-5 columns is usually sufficient
- **Clear stages**: Each column should represent a distinct workflow stage
- **Use order**: Explicit `order` prevents visual inconsistency
- **Mark completion**: Use `completionColumn: true` for non-English workflows or custom semantics
- **Stats config**: Exclude backlog/archive from progress calculations

### Task Management

- **Atomic tasks**: Each task should be independently completable
- **Clear titles**: Task titles should be actionable (verb + object)
- **Use subtasks**: Break large tasks into trackable steps
- **Link files**: Always include `relatedFiles` for context
- **Set priorities**: Use priority for urgent or blocking tasks

### AI Agent Integration

```yaml
agent:
  instructions:
    - Use CLI or MCP tools for task operations
    - Move tasks to in-progress when starting work
    - Mark subtasks complete as you finish them
    - Add timestamps when creating or updating tasks
```

## See Also

- [Base Schema](./base.md)
- [Task Schema](/reference/types)
- [Contract Schema](./contract.md)
- [Example Board](https://brainfile.md/example/.brainfile/brainfile.md)
