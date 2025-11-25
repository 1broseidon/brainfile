# Base Schema

The base schema defines fields that are shared across all brainfile types. All type-specific schemas extend this base.

## Schema URL

```
https://brainfile.md/v1/base.json
```

## Overview

The base schema establishes the foundational structure for the Brainfile protocol's type system. It provides:

- Type discrimination via the `type` field
- Common metadata fields (title, schema, version)
- AI agent instructions
- Project rules
- Reusable definitions (timestamps, rules)

## Required Fields

### `title`

**Type**: `string`
**Min Length**: 1
**Description**: Human-readable title for the brainfile

```yaml
title: My Project Board
```

## Type Field

### `type`

**Type**: `string` (open - any value allowed)
**Official Values**: `board`, `journal`, `collection`, `checklist`, `document`
**Custom Values**: Any string with a matching `schema` URL for validation
**Description**: Type discriminator that determines which schema applies

```yaml
# Official type (schema URL optional)
type: board

# Custom type (schema URL required)
type: sprint-board
schema: https://mycompany.com/schemas/sprint-board.json
```

The `type` field enables:
- Type-aware validation
- Runtime type checking
- Type-specific tooling
- Clear semantic meaning
- **Community extensibility** - anyone can create new types

## Optional Fields

### `schema`

**Type**: `string` (URI)
**Description**: Reference to the specific schema for validation
**Required for**: Custom types (non-official types MUST provide this)

```yaml
# Official type - schema URL is optional (defaults to brainfile.md/v1/{type}.json)
type: board
schema: https://brainfile.md/v1/board.json

# Custom type - schema URL is REQUIRED
type: sprint-board
schema: https://mycompany.com/schemas/sprint-board.json
```

Supports both remote URLs and local file paths:
- Remote: `https://brainfile.md/v1/board.json`
- Community: `https://mycompany.com/schemas/sprint-board.json`
- Local relative: `./schemas/custom-type.json`
- Local absolute: `/usr/local/share/brainfile/schema.json`

### `protocolVersion`

**Type**: `string` (semver pattern)
**Pattern**: `^[0-9]+\.[0-9]+\.[0-9]+$`
**Default**: `0.5.0`
**Description**: Version of the Brainfile protocol

```yaml
protocolVersion: 0.5.0
```

### `agent`

**Type**: `object`
**Description**: Instructions for AI agents interacting with the brainfile

```yaml
agent:
  instructions:
    - Modify only the YAML frontmatter
    - Preserve all IDs
    - Use ISO dates for entries
  llmNotes: This project uses TypeScript and React
```

#### `agent.instructions`

**Type**: `array` of `string`
**Description**: List of specific instructions for AI behavior

Common instructions:
- Data manipulation rules (modify frontmatter only)
- ID preservation requirements
- Formatting conventions
- Update patterns

#### `agent.llmNotes`

**Type**: `string`
**Description**: Free-form notes about project context and preferences

Use for:
- Technology stack information
- Architectural decisions
- Team preferences
- Workflow notes

### `rules`

**Type**: `object`
**Description**: Project rules organized by category

```yaml
rules:
  always:
    - id: 1
      rule: test all features before moving to done
  never:
    - id: 1
      rule: skip code review
  prefer:
    - id: 1
      rule: small focused tasks over large epics
  context:
    - id: 1
      rule: this is a TypeScript project
```

#### Rule Categories

| Category | Purpose | Example |
|----------|---------|---------|
| `always` | Must always follow | Always write tests |
| `never` | Must never violate | Never skip code review |
| `prefer` | Preferred approaches | Prefer functional style |
| `context` | Contextual info | This is a React project |

#### Rule Structure

Each rule has:
- `id` (integer, minimum 1): Unique ID within category
- `rule` (string): The rule text

IDs are scoped per category, so `always[0].id = 1` and `never[0].id = 1` are distinct.

## Reusable Definitions

### `timestamp`

**Type**: `string` (ISO 8601)
**Format**: `date-time`
**Examples**:
- `2025-11-24T10:30:00Z`
- `2025-11-24T14:22:00-08:00`

Used by type-specific schemas for `createdAt` and `updatedAt` fields.

Reference in type-specific schemas:
```json
{
  "createdAt": {
    "$ref": "https://brainfile.md/v1/base.json#/definitions/timestamp"
  }
}
```

### `rule`

**Type**: `object`
**Required**: `id`, `rule`
**Structure**:
```json
{
  "id": 1,
  "rule": "Rule text here"
}
```

Used by the `rules` object for all rule categories.

## Extension Pattern

Type-specific schemas extend the base using JSON Schema's `allOf`:

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
          ...
        }
      }
    }
  ]
}
```

This pattern:
- Inherits all base fields
- Constrains `type` to a specific value
- Adds type-specific required fields
- Adds type-specific properties

## Validation

Files are validated against their complete schema (base + type-specific):

1. **Type detection**: Explicit `type` field or inference
2. **Schema selection**: 
   - Official type → `brainfile.md/v1/{type}.json`
   - Custom type → Must use provided `schema` URL
3. **Base validation**: Validate shared fields
4. **Type validation**: Validate type-specific fields
5. **Additional properties**: Allowed (`additionalProperties: true` for extensibility)

## Backward Compatibility

The `type` field is:
- **Required** in base.json (for new explicit files)
- **Optional** in v1.json (for legacy files)
- **Inferred** if missing (defaults to `board`)

Legacy files without `type`:
```yaml
---
title: My Project
columns: [...]
---
```

Are treated as:
```yaml
---
type: board
title: My Project
columns: [...]
---
```

## Custom Types

The Brainfile protocol supports community-defined types. Custom types:

1. **Use any `type` string** - Not limited to official types
2. **Must provide `schema` URL** - For validation
3. **Should extend base schema** - Use `allOf` pattern
4. **Can add custom fields** - `additionalProperties: true`

### Creating a Custom Type Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://mycompany.com/schemas/sprint-board.json",
  "title": "Sprint Board Schema",
  "allOf": [
    { "$ref": "https://brainfile.md/v1/base.json" },
    {
      "type": "object",
      "required": ["sprints"],
      "properties": {
        "type": { "const": "sprint-board" },
        "sprints": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["id", "goal"],
            "properties": {
              "id": { "type": "string" },
              "goal": { "type": "string" },
              "startDate": { "type": "string", "format": "date" },
              "endDate": { "type": "string", "format": "date" }
            }
          }
        }
      }
    }
  ]
}
```

### Using a Custom Type

```yaml
---
type: sprint-board
schema: https://mycompany.com/schemas/sprint-board.json
title: Q1 2025 Sprint Board
sprints:
  - id: sprint-1
    goal: Launch MVP
    startDate: 2025-01-06
    endDate: 2025-01-20
---
```

## Examples

### Minimal Board

```yaml
---
type: board
title: Quick Tasks
columns:
  - id: todo
    title: To Do
    tasks: []
---
```

### With Agent Instructions

```yaml
---
type: journal
title: Dev Log 2025
agent:
  instructions:
    - Append entries at the top
    - Use ISO date format for IDs
rules:
  always:
    - id: 1
      rule: include daily summary
entries: []
---
```

### With All Optional Fields

```yaml
---
type: board
schema: https://brainfile.md/v1/board.json
title: Production Project
protocolVersion: 0.5.0
agent:
  instructions:
    - Modify only YAML frontmatter
    - Preserve all IDs
  llmNotes: React + TypeScript + Tailwind CSS
rules:
  always:
    - id: 1
      rule: write tests
  never:
    - id: 1
      rule: skip reviews
  prefer:
    - id: 1
      rule: functional components
  context:
    - id: 1
      rule: this is a web app
columns: [...]
---
```

## See Also

- [Board Schema](./board.md)
- [Journal Schema](./journal.md)
- [Type Inference](../type-inference.md)
- [Schema Evolution Roadmap](../../../SCHEMA_EVOLUTION_ROADMAP.md)
