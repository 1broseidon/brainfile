---
title: Schema Types
description: Brainfile JSON schemas for task management
---

# Schema Types

Brainfile uses JSON Schema to define the structure of board configuration and task files.

## Available Schemas

| Schema | v2 URL | Purpose |
|--------|--------|---------|
| **Base** | `/v2/base.json` | Shared fields (title, agent, rules) |
| **Board** | `/v2/board.json` | Board configuration (columns, types) |
| **Task** | `/v2/task.json` | Standalone task documents |
| **Contract** | `/v2/contract.json` | Task contract object (`task.contract`) |
| **Epic** | `/v2/epic.json` | Epic documents (groups related tasks) |
| **ADR** | `/v2/adr.json` | Architecture Decision Records |

---

## Board (Default)

Board configuration defines columns, document types, and project rules. Tasks are standalone files in `.brainfile/board/`.

```yaml
---
type: board
schema: https://brainfile.md/v2/board.json
title: My Project
columns:
  - id: todo
    title: To Do
  - id: in-progress
    title: In Progress
types:
  epic:
    idPrefix: epic
    completable: false
---
```

**Renderer:** Kanban board with columns

[View Board Schema](https://brainfile.md/v2/board.json) · [Example](https://brainfile.md/example/board.md)

---

## Task

Standalone task documents with YAML frontmatter and optional markdown body. Each task is an individual `.md` file in `.brainfile/board/` (active) or `.brainfile/logs/` (completed).

```yaml
---
id: task-1
title: Implement feature
column: todo
priority: high
tags: [backend]
assignee: codex
---
```

[View Task Schema](https://brainfile.md/v2/task.json) · [Docs](/types/board#task-file-structure)

---

## Contract (Task Extension)

Task contracts define structured deliverables, validation commands, and constraints for PM-to-agent workflows. Embedded in the `contract` field of a task file.

```yaml
contract:
  status: ready
  deliverables:
    - type: file
      path: src/feature.ts
      description: Implementation
  validation:
    commands:
      - npm test
```

[View Contract Schema](https://brainfile.md/v2/contract.json) · [Docs](/types/contract)

---

## Epic

Groups related tasks and tracks collective progress. Extends the task schema with `children` and `status` fields.

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

[View Epic Schema](https://brainfile.md/v2/epic.json)

---

## ADR

Architecture Decision Records with lifecycle status and supersession tracking. Extends the task schema.

```yaml
---
id: adr-1
type: adr
title: Use Postgres for user data
column: todo
status: proposed
---
```

[View ADR Schema](https://brainfile.md/v2/adr.json)

---

## Base Schema

All brainfile config files inherit from the base schema which defines shared fields:

```yaml
---
title: string           # Required
type: string            # Optional (defaults to board)
schema: string          # Optional JSON schema URL
protocolVersion: string # Optional version string
agent:
  instructions: []
  llmNotes: string
  tools: {}
rules:
  always: []
  never: []
  prefer: []
  context: []
---
```

[View Base Schema](https://brainfile.md/v2/base.json)

---

## Type Inference

When `type` is not specified, tools determine the type by:

1. **Schema URL** — `/v2/board.json` → board
2. **Filename suffix** — `project.board.md` → board
3. **Structural analysis** — `columns[]` present → board
4. **Default** → board

---

## Schema Directories

| Version | URL | Status |
|---------|-----|--------|
| **v2** | [brainfile.md/v2/](https://brainfile.md/v2/) | Current |
| **v1** | [brainfile.md/v1/](https://brainfile.md/v1/) | Maintained for backward compatibility |

---

## Next Steps

- [Protocol Specification](/reference/protocol) — File format details
- [API Reference](/reference/api) — Library documentation
- [Core Library](/tools/core) — Build custom tools
