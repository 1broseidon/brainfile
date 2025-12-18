---
title: Schema Types
description: Brainfile JSON schemas for task management
---

# Schema Types

Brainfile uses JSON Schema to define the structure of task boards.

## Available Schemas

| Schema | URL | Purpose |
|--------|-----|---------|
| **Base** | `/v1/base.json` | Shared fields (title, agent, rules) |
| **Board** | `/v1/board.json` | Kanban task management |
| **Contract** | `/v1/contract.json` | Task contract object (`task.contract`) |

---

## Board (Default)

Kanban-style task boards with columns and draggable tasks.

```yaml
---
type: board
schema: https://brainfile.md/v1/board.json
title: My Project
columns:
  - id: todo
    title: To Do
    tasks:
      - id: task-1
        title: Implement feature
        priority: high
---
```

**Structure:** `columns[]` containing `tasks[]`

**Renderer:** Kanban board with columns

[View Board Schema](https://brainfile.md/v1/board.json) · [Example](https://brainfile.md/example/board.md)

---

## Contract (Task Extension)

Task contracts define structured deliverables, validation commands, and constraints for PM-to-agent workflows.

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

[View Contract Schema](https://brainfile.md/v1/contract.json) · [Docs](/types/contract)

---

## Base Schema

All brainfiles inherit from the base schema which defines shared fields:

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

[View Base Schema](https://brainfile.md/v1/base.json)

---

## Type Inference

When `type` is not specified, tools determine the type by:

1. **Schema URL** — `/v1/board.json` → board
2. **Filename suffix** — `project.board.md` → board
3. **Structural analysis** — `columns[]` present → board
4. **Default** → board

---

## Schema Directory

Browse all schemas at [brainfile.md/v1/](https://brainfile.md/v1/)

```json
{
  "schemas": {
    "base": { "url": "https://brainfile.md/v1/base.json" },
    "board": { "url": "https://brainfile.md/v1/board.json" }
  }
}
```

---

## Next Steps

- [Protocol Specification](/reference/protocol) — File format details
- [API Reference](/reference/api) — Library documentation
- [Core Library](/tools/core) — Build custom tools
