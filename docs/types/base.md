# Base Schema

The base schema defines fields that are shared across all brainfile types.

## Schema URL

```
https://brainfile.md/v1/base.json
```

## Overview

The base schema establishes the foundational structure for the Brainfile protocol:

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

## Optional Fields

### `type`

**Type**: `string`
**Default**: `board`
**Description**: Type identifier

```yaml
type: board
```

### `schema`

**Type**: `string` (URI)
**Description**: Reference to the specific schema for validation

```yaml
schema: https://brainfile.md/v1/board.json
```

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
  llmNotes: This project uses TypeScript and React
  tools:
    brainfile:
      prefer: true
      commands:
        - move --task <id> --column <id>
        - add --title "..." --column <id>
```

#### `agent.instructions`

**Type**: `array` of `string`
**Description**: List of specific instructions for AI behavior

#### `agent.llmNotes`

**Type**: `string`
**Description**: Free-form notes about project context and preferences

#### `agent.tools`

**Type**: `object`
**Description**: CLI tools available for agents to use

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

## Reusable Definitions

### `timestamp`

**Type**: `string` (ISO 8601)
**Format**: `date-time`
**Examples**:
- `2025-11-24T10:30:00Z`
- `2025-11-24T14:22:00-08:00`

Used by type-specific schemas for `createdAt` and `updatedAt` fields.

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

## Example

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
  tools:
    brainfile:
      prefer: true
rules:
  always:
    - id: 1
      rule: write tests
  never:
    - id: 1
      rule: skip reviews
columns: [...]
---
```

## See Also

- [Board Schema](./board.md)
