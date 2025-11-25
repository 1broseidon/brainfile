---
title: Schema Types
description: Brainfile document types and JSON schemas
---

# Schema Types

Brainfile supports multiple document types, each with its own schema and optimal renderer.

## Available Types

| Type | Schema | Status | Use Case |
|------|--------|--------|----------|
| **Board** | `/v1/board.json` | Stable | Kanban task management |
| **Journal** | `/v1/journal.json` | Stable | Time-ordered entries, dev logs |
| **Collection** | `/v1/collection.json` | Planned | Curated resource lists |
| **Checklist** | `/v1/checklist.json` | Planned | Flat ordered checklists |
| **Document** | `/v1/document.json` | Planned | Structured docs (RFCs, specs) |

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

## Journal

Time-ordered entries with timestamps. Great for developer journals, changelogs, or status updates.

```yaml
---
type: journal
schema: https://brainfile.md/v1/journal.json
title: Dev Journal
entries:
  - id: entry-1
    date: 2025-01-15
    title: Started authentication work
    content: |
      Researched OAuth providers.
      Decided on Auth0.
    tags: [auth, research]
---
```

**Structure:** `entries[]` with timestamps

**Renderer:** Timeline view

[View Journal Schema](https://brainfile.md/v1/journal.json) · [Example](https://brainfile.md/example/journal.md)

---

## Base Schema

All types inherit from the base schema which defines shared fields:

```yaml
---
title: string           # Required for all types
type: string            # Optional, inferred if missing
schema: string          # Optional JSON schema URL
protocolVersion: string # Optional version string
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

[View Base Schema](https://brainfile.md/v1/base.json)

---

## Type Inference

When `type` is not specified, tools determine the type by:

1. **Schema URL** — `/v1/journal.json` → journal
2. **Filename suffix** — `project.journal.md` → journal
3. **Structural analysis** — `columns[]` → board, `entries[]` → journal
4. **Default** → board

This allows files to work without explicit type declarations.

---

## Schema Directory

Browse all schemas at [brainfile.md/v1/](https://brainfile.md/v1/)

Programmatic access: `GET https://brainfile.md/v1/index.json`

```json
{
  "schemas": {
    "base": { "url": "https://brainfile.md/v1/base.json" },
    "board": { "url": "https://brainfile.md/v1/board.json" },
    "journal": { "url": "https://brainfile.md/v1/journal.json" }
  }
}
```

---

## Custom Types

You can create custom types by:

1. Extending the base schema
2. Hosting your schema at a URL
3. Referencing it in your brainfile

```yaml
---
type: sprint-board
schema: https://mycompany.com/schemas/sprint-board.json
title: Sprint 42
---
```

Tools that don't recognize the custom type will fall back to generic tree rendering.

---

## Renderer Hints

Schemas can include `x-brainfile-*` hints for optimal display:

```json
{
  "x-brainfile-renderer": "kanban",
  "x-brainfile-items-path": "columns[].tasks[]"
}
```

This helps generic tools render unknown types appropriately.

---

## Next Steps

- [Protocol Specification](/reference/protocol) — File format details
- [API Reference](/reference/api) — Library documentation
- [Core Library](/tools/core) — Build custom tools
