# Brainfile v1 Schema Directory

This directory contains the v1 schema specifications for the Brainfile protocol, organized using a polymorphic type system.

## Schema Architecture

### Base + Type-Specific Pattern

All brainfile types extend from a common base schema:

```
base.json
├── board.json (extends base)
├── journal.json (extends base)
├── collection.json (extends base)
├── checklist.json (extends base)
└── document.json (extends base)
```

### Schema Files

| File | Purpose | Status |
|------|---------|--------|
| **base.json** | Shared fields across all types | ✅ Implemented |
| **board.json** | Kanban boards with columns and tasks | ✅ Implemented |
| **journal.json** | Daily logs and journal entries | ✅ Implemented |
| **collection.json** | Bookmarks and resource collections | 🔜 Phase 4 |
| **checklist.json** | Procedural checklists | 🔜 Phase 4 |
| **document.json** | Structured documents (RFCs, specs) | 🔜 Phase 4 |

## Type Discriminator

All brainfiles include a `type` field that determines which schema to use:

```yaml
---
type: board
schema: https://brainfile.md/v1/board.json
title: My Project
---
```

### Official Types

- `board` - Kanban-style task boards
- `journal` - Time-ordered journal entries
- `collection` - Curated collections of resources
- `checklist` - Flat, ordered checklists
- `document` - Structured documents with sections

### Custom Types

The type system is **open and extensible**. Any string value is valid for the `type` field, enabling community-defined types:

```yaml
---
type: sprint-board                    # Custom type
schema: https://myorg.com/sprint.json # Required for custom types
title: Q1 Sprint Board
---
```

Custom types MUST provide a `schema` URL for validation. See [base.md Custom Types](../docs/types/base.md#custom-types) for details.

## Base Schema Fields

All types inherit these fields from [base.json](./base.json):

### Required Fields

- `title` (string) - Brainfile title

### Type Field

- `type` (string) - Type discriminator (any string, official types or custom)

### Optional Fields

- `schema` (URI) - Schema reference for validation
- `protocolVersion` (string) - Protocol version (semver)
- `agent` (object) - AI agent instructions
  - `instructions` (array) - List of instructions
  - `llmNotes` (string) - Free-form agent notes
- `rules` (object) - Project rules
  - `always` (array) - Must always follow
  - `never` (array) - Must never violate
  - `prefer` (array) - Preferred approaches
  - `context` (array) - Contextual information

## Extension Pattern

Type-specific schemas use JSON Schema's `allOf` to extend the base:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://brainfile.md/v1/board.json",
  "allOf": [
    {
      "$ref": "https://brainfile.md/v1/base.json"
    },
    {
      "type": "object",
      "required": ["columns"],
      "properties": {
        "type": {
          "const": "board"
        },
        "columns": {
          "type": "array",
          "items": { ... }
        }
      }
    }
  ]
}
```

## Type Inference

If the `type` field is missing (backward compatibility), the type is inferred:

1. **Explicit type field** - Use the specified type
2. **Schema URL pattern** - Extract type from URL (e.g., `/v1/journal.json` → `journal`)
3. **File name suffix** - Extract from filename (e.g., `brainfile.journal.md` → `journal`)
4. **Structure analysis** - Detect by presence of type-specific fields:
   - `columns` present → `board`
   - `entries` present → `journal`
   - `categories` present → `collection`
   - `items` present (flat) → `checklist`
   - `sections` present → `document`
5. **Default** - Assume `board` if no indicators found

## Schema-Driven Rendering

Schemas include **rendering hints** (via JSON Schema extensions) that guide tools on how to display data, without hardcoding view logic per type. This enables community schemas to work automatically.

### Rendering Hints (`x-brainfile-*`)

Schemas can include these optional extensions:

| Hint | Purpose | Example |
|------|---------|---------|
| `x-brainfile-renderer` | Force specific renderer (kanban, timeline, checklist, tree) | `"kanban"` |
| `x-brainfile-columns-path` | JSONPath to column-like array | `"$.columns"` |
| `x-brainfile-items-path` | JSONPath to item arrays | `"$.columns[*].tasks"` |
| `x-brainfile-title-field` | Field to use as item title | `"title"` |
| `x-brainfile-status-field` | Field for status/completion | `"priority"` |
| `x-brainfile-timestamp-field` | Field for timestamps | `"createdAt"` |

### Example: Board Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "x-brainfile-renderer": "kanban",
  "x-brainfile-columns-path": "$.columns",
  "x-brainfile-items-path": "$.columns[*].tasks",
  "x-brainfile-title-field": "title",
  "x-brainfile-status-field": "priority",
  "allOf": [...]
}
```

### Renderer Inference

Tools use a **fallback chain** to determine rendering:

1. **Schema hint** - Use `x-brainfile-renderer` if present
2. **Structural pattern** - Detect patterns in data:
   - `columns[]` with nested items → kanban
   - `entries[]` with timestamps → timeline
   - `items[]` with `completed` → checklist
3. **Default** - Use tree view for unknown structures

This means community schemas work automatically if they follow common patterns, **without requiring tool updates**.

## Timestamps

All item types (tasks, entries, etc.) support optional timestamps:

- `createdAt` (ISO 8601) - When the item was created
- `updatedAt` (ISO 8601) - When the item was last modified

These are defined in `base.json#/definitions/timestamp` and can be referenced by any type.

## Examples

Example files for each type are in the [../example/](../example/) directory:

- [board.md](../example/board.md) - Full-featured Kanban board with inline comments
- [journal.md](../example/journal.md) - Developer daily log with 5 entries
- [collection.md](../example/collection.md) - Technical reading list with categories
- [checklist.md](../example/checklist.md) - Production release procedure (24 steps)
- [document.md](../example/document.md) - RFC template with full proposal structure
- [brainfile.md](../example/brainfile.md) - Legacy example (backward compatibility)

## Validation

Brainfiles are validated against their specified schema:

```yaml
schema: https://brainfile.md/v1/board.json
```

The `@brainfile/core` library automatically:
1. Detects the type (explicit or inferred)
2. Loads the appropriate schema
3. Validates the frontmatter structure
4. Provides detailed error messages for invalid files

## Backward Compatibility

The `type` field is optional to maintain backward compatibility with v1.0 files:

- **Old files** (no `type` field) → Inferred as `board`
- **New files** (with `type` field) → Explicit type used
- **Migration tool** → `brainfile migrate` adds explicit types

## URLs

All schemas are served from:

- **Base**: `https://brainfile.md/v1/base.json`
- **Board**: `https://brainfile.md/v1/board.json`
- **Journal**: `https://brainfile.md/v1/journal.json`
- **Legacy**: `https://brainfile.md/v1` (redirects to board.json)

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 0.5.0 | 2025-11-24 | Added type system, base schema, journal type |
| 0.4.0 | 2025-11-21 | Board-only schema (legacy) |

## See Also

- [Protocol Documentation](https://brainfile.md/protocol/)
- [Type System Overview](https://brainfile.md/protocol/types/)
- [Migration Guide](https://brainfile.md/protocol/migration/)
- [Schema Evolution Roadmap](../../SCHEMA_EVOLUTION_ROADMAP.md)
