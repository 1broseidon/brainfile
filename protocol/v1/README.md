# Brainfile v1 Schema Directory

This directory contains the v1 schema specifications for the Brainfile protocol.

## Schema Files

| File | Purpose |
|------|---------|
| **base.json** | Shared fields across all brainfiles (title, agent instructions, rules) |
| **board.json** | Kanban boards with columns (config-only in v2, embedded tasks in v1) |
| **task.json** | Standalone task documents for per-task file architecture (v2) |
| **contract.json** | PM-to-agent contract object attached to tasks |
| **index.json** | Schema directory metadata |

## Architecture: v1 vs v2

### v1 (Legacy) - Embedded Tasks

Tasks are YAML arrays inside column definitions in `brainfile.md`:

```yaml
---
columns:
  - id: todo
    title: To Do
    tasks:
      - id: task-1
        title: Implement feature
        description: ...
---
```

### v2 (Current) - Per-Task Files

The board file is config-only. Tasks are standalone `.md` files:

**Board file** (`.brainfile/brainfile.md`):
```yaml
---
title: My Project
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
---
```

**Task file** (`.brainfile/tasks/task-1.md`):
```yaml
---
id: task-1
title: Implement rate limiting
column: todo
position: 1
priority: high
assignee: codex
description: |
  Add token bucket rate limiting to API endpoints.
relatedFiles:
  - src/api/middleware.ts
subtasks:
  - id: task-1-1
    title: Write implementation
    completed: false
contract:
  status: ready
  deliverables:
    - path: src/rateLimiter.ts
      description: Token bucket implementation
  validation:
    commands:
      - npm test
  constraints:
    - Use token bucket algorithm
---

## Log

- 2026-02-18T10:00:00Z: Task created
```

**Completed task** (`.brainfile/logs/task-1.md`):
```yaml
---
id: task-1
title: Implement rate limiting
completedAt: "2026-02-20T14:30:00Z"
# column and position are removed on completion
---

## Log

- 2026-02-18T10:00:00Z: Task created
- 2026-02-20T14:30:00Z: Completed
```

### Directory Structure

```
project/
└── .brainfile/
    ├── brainfile.md      # Board config (columns, rules, metadata)
    ├── tasks/            # Active task files
    │   ├── task-1.md
    │   └── task-2.md
    ├── logs/             # Completed task files
    │   └── task-3.md
    ├── state.json        # Agent state (git-ignored)
    └── .gitignore
```

## Frontmatter Structure

All brainfiles use YAML frontmatter:

```yaml
---
type: board
schema: https://brainfile.md/v1/board.json
title: My Project
---
```

## Base Schema Fields

All brainfiles inherit these fields from [base.json](./base.json):

### Required

- `title` (string) - Brainfile title

### Optional

- `type` (string) - Type identifier (default: `board`)
- `schema` (URI) - Schema reference for validation
- `protocolVersion` (string) - Protocol version (semver)
- `agent` (object) - AI agent instructions
  - `instructions` (array) - List of instructions
  - `llmNotes` (string) - Free-form agent notes
  - `tools` (object) - CLI tools available for agents
- `rules` (object) - Project rules
  - `always` (array) - Must always follow
  - `never` (array) - Must never violate
  - `prefer` (array) - Preferred approaches
  - `context` (array) - Contextual information

## Board Schema

The [board.json](./board.json) schema extends base with board configuration:

### Board-Specific Fields

- `columns` (array, required) - Workflow stage definitions
- `statsConfig` (object) - Statistics configuration
- `archive` (array) - Deprecated in v2; use `.brainfile/logs/` instead

### Column Fields

- `id` (string, required) - Unique identifier in kebab-case
- `title` (string, required) - Display title
- `order` (integer) - Display order (lower first)
- `completionColumn` (boolean) - Marks column as a completion stage
- `tasks` (array) - Deprecated in v2; tasks declare their column via `task.column`

## Task Schema

The [task.json](./task.json) schema defines standalone task documents:

### Required Fields

- `id` (string) - Unique identifier (`task-N` pattern)
- `title` (string) - Task title
- `column` (string) - Column ID this task belongs to (optional for completed tasks)

### Optional Fields

- `position` (integer) - Sort order within column
- `description` (string) - Detailed description (Markdown). Single source of truth for context.
- `assignee` (string) - Task assignee
- `tags` (array) - Tags for filtering
- `priority` (enum) - low, medium, high, critical
- `effort` (enum) - trivial, small, medium, large, xlarge
- `blockedBy` (array) - Blocking task IDs
- `dueDate` (string) - Due date (ISO 8601 date)
- `createdAt` (string) - Creation timestamp (ISO 8601)
- `updatedAt` (string) - Last update timestamp (ISO 8601)
- `completedAt` (string) - Completion timestamp (ISO 8601). Set when task moves to logs/.
- `relatedFiles` (array) - Related file paths. Single source of truth for relevant files.
- `subtasks` (array) - Subtasks for granular progress tracking
- `template` (enum) - bug, feature, refactor
- `contract` (object) - Optional PM-to-agent contract (see contract.json)

### Markdown Body

The markdown body below the YAML frontmatter is free-form. Common sections:

- `## Log` - Timestamped activity entries appended by agents and CLI
- `## Notes` - Additional context, research, decisions

## Contract Schema

The [contract.json](./contract.json) schema defines PM-to-agent workflow contracts:

### Required Fields

- `status` (enum) - ready, in_progress, delivered, done, failed, blocked

### Optional Fields

- `version` (integer) - Contract version, increment on amendment
- `deliverables` (array) - Files/artifacts the agent must produce
  - `path` (string, required) - File path relative to project root
  - `type` (string, optional) - Category: file, test, docs, design, research
  - `description` (string, optional) - Human-readable description
- `validation` (object) - Automated validation
  - `commands` (array) - Shell commands to run
- `constraints` (array) - Implementation rules to follow
- `outOfScope` (array) - Items the agent must NOT implement
- `feedback` (string) - Rework guidance after failed validation
- `metrics` (object) - Automatically tracked timing data
  - `pickedUpAt`, `deliveredAt`, `validatedAt` (ISO 8601 timestamps)
  - `duration` (integer, seconds)
  - `reworkCount` (integer)
- `context` (object) - Deprecated in v2; use task.description and task.relatedFiles

### v2 Changes from v1

| Change | v1 | v2 |
|--------|----|----|
| Background context | `contract.context.background` | `task.description` |
| Relevant files | `contract.context.relevantFiles` | `task.relatedFiles` |
| Out of scope | `contract.context.outOfScope` | `contract.outOfScope` (top-level) |
| Deliverable type | Required | Optional |
| Status values | draft, ready, in_progress, delivered, done, failed | ready, in_progress, delivered, done, failed, blocked |
| Version tracking | Not available | `contract.version` |
| Feedback | Not available | `contract.feedback` |
| Metrics | Not available | `contract.metrics` |

## Timestamps

ISO 8601 timestamps are used throughout:

- `createdAt` - When the item was created
- `updatedAt` - When the item was last modified
- `completedAt` - When a task was completed (moved to logs/)

## Type Inference

If the `type` field is missing (backward compatibility):

1. **Explicit type field** - Use the specified type
2. **Structure analysis** - Detect by presence of `columns` field
3. **Default** - Assume `board`

## Validation

Brainfiles are validated against their specified schema:

```yaml
schema: https://brainfile.md/v1/board.json
```

Task files are validated against:

```
https://brainfile.md/v1/task.json
```

The `@brainfile/core` library automatically validates frontmatter structure.

## Schema URLs

- **Base**: `https://brainfile.md/v1/base.json`
- **Board**: `https://brainfile.md/v1/board.json`
- **Task**: `https://brainfile.md/v1/task.json`
- **Contract**: `https://brainfile.md/v1/contract.json`

## Examples

See the [../example/](../example/) directory:

- [board.md](../example/board.md) - Full-featured Kanban board (v1 format)

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.1.0 | 2026-02-18 | Added task.json schema, updated board.json for v2 per-task file architecture, updated contract.json with v2 fields |
| 1.0.0 | 2025-11-25 | Stable release: board-only task management |
| 0.5.0 | 2025-11-24 | Added base schema, agent tools support |
| 0.4.0 | 2025-11-21 | Initial board schema |
