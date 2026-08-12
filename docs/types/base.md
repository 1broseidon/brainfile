# Base Schema

The base schema defines fields that are shared across all brainfile types.

::: info Inherited by All Types
The base schema is the foundation — every brainfile type (Board, Task, Epic, ADR) inherits these fields. You don't need to declare `type: board` in most cases, as it's the default.
:::

## Schema URL

```
https://brainfile.md/v2/base.json
```


## Overview

The base schema establishes the foundational structure for all brainfile documents:

- Common metadata fields (title, schema, version)
- AI agent instructions
- Reusable definitions (timestamps)

## Required Fields

### `title`

**Type**: `string`
**Min Length**: 1
**Description**: Human-readable title for the brainfile

```yaml
title: My Project Board              # Required — must be non-empty
```

## Optional Fields

### `type`

**Type**: `string`
**Default**: `board`
**Description**: Type identifier

```yaml
type: board                           # Optional — defaults to "board"
```

### `schema`

**Type**: `string` (URI)
**Description**: Reference to the specific schema for validation

```yaml
schema: https://brainfile.md/v2/board.json  # Optional — enables schema validation
```

### `protocolVersion`

**Type**: `string` (semver pattern)
**Pattern**: `^[0-9]+\.[0-9]+\.[0-9]+$`
**Default**: `2.0.0`
**Description**: Version of the board format

```yaml
protocolVersion: 2.0.0               # Optional — defaults to 2.0.0
```

### `agent`

**Type**: `object`
**Description**: Instructions for AI agents interacting with the brainfile

```yaml
agent:                              # Optional — AI agent configuration
  instructions:                     # Optional — behavioural guidance
    - Modify only the YAML frontmatter
    - Preserve all IDs
  llmNotes: This project uses TypeScript and React  # Optional — free-form context
  tools:                            # Optional — available CLI tools
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

### `rules` (removed)

::: warning Removed in v2
`rules` was removed by [adr-2](https://github.com/1broseidon/brainfile). Project
guidance now lives in [`agent.instructions`](#agent), which agents already read.

A legacy `rules:` block still parses without error, and `brainfile lint` warns
about it. `brainfile lint --fix` folds each entry into `agent.instructions`,
prefixed by its old category, and removes the block:

```yaml
# before
agent:
  instructions:
    - Preserve all IDs
rules:
  always:
    - id: 1
      rule: write tests

# after `brainfile lint --fix`
agent:
  instructions:
    - Preserve all IDs
    - "always: write tests"
```
:::

## Reusable Definitions

### `timestamp`

**Type**: `string` (ISO 8601)
**Format**: `date-time`
**Examples**:
- `2025-11-24T10:30:00Z`
- `2025-11-24T14:22:00-08:00`

Used by type-specific schemas for `createdAt` and `updatedAt` fields.

## Example

```yaml
---
type: board
schema: https://brainfile.md/v2/board.json
title: Production Project
protocolVersion: 2.0.0
agent:
  instructions:
    - Modify only YAML frontmatter
    - Preserve all IDs
  llmNotes: React + TypeScript + Tailwind CSS
  tools:
    brainfile:
      prefer: true
columns: [...]
---
```

## See Also

- [Board Schema](./board.md) — Board configuration (columns, types)
- [Task Schema](/reference/types) — All schema types including Task, Epic, ADR
- [Contract Schema](./contract.md) — Contract object for PM-to-agent workflows
