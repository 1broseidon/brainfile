# Brainfile v1 Schema Directory

This directory contains the v1 schema specifications for the Brainfile protocol.

## Schema Files

| File | Purpose |
|------|---------|
| **base.json** | Shared fields across all brainfiles (title, agent instructions, rules) |
| **board.json** | Kanban boards with columns and tasks |

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

The [board.json](./board.json) schema extends base with task management:

### Board-Specific Fields

- `columns` (array, required) - Task columns (e.g., To Do, In Progress, Done)
- `archive` (array) - Archived tasks
- `statsConfig` (object) - Statistics configuration

### Task Fields

Each task supports:
- `id`, `title` (required)
- `description`, `assignee`, `tags`, `priority`, `effort`
- `dueDate`, `createdAt`, `updatedAt`
- `subtasks`, `blockedBy`, `relatedFiles`

## Timestamps

Tasks support optional ISO 8601 timestamps:

- `createdAt` - When the item was created
- `updatedAt` - When the item was last modified

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

The `@brainfile/core` library automatically validates the frontmatter structure.

## Schema URLs

- **Base**: `https://brainfile.md/v1/base.json`
- **Board**: `https://brainfile.md/v1/board.json`

## Examples

See the [../example/](../example/) directory:

- [board.md](../example/board.md) - Full-featured Kanban board
- [brainfile.md](../example/brainfile.md) - Basic example

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-11-25 | Stable release: board-only task management |
| 0.5.0 | 2025-11-24 | Added base schema, agent tools support |
| 0.4.0 | 2025-11-21 | Initial board schema |
