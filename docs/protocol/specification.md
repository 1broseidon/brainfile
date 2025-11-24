---
title: Protocol Specification
description: Complete specification of the Brainfile task management protocol
---

## Overview

Brainfile is a protocol for task management designed specifically for AI-assisted software development. It defines a structured format for project tasks that both humans and AI agents can understand and modify.

## File Format

### Primary File: `brainfile.md`

The protocol uses a Markdown file with YAML frontmatter. The default filename is `brainfile.md` (non-hidden), though `.brainfile.md` (hidden) is supported for backward compatibility.

**Priority Order** (when multiple files exist):

1. `brainfile.md` (preferred)
2. `.brainfile.md` (backward compatibility)
3. `.bb.md` (shorthand, deprecated)

### Archive File: `brainfile-archive.md`

Completed tasks can be archived to `brainfile-archive.md` (or `.brainfile-archive.md` for hidden variant).

## YAML Structure

### Required Fields

```yaml
---
title: string # Project or board title
columns: [] # Array of task columns
---
```

### Optional Fields

```yaml
---
type: string # Document type: board|journal|collection|checklist|document
protocolVersion: string # Version of protocol (e.g., "0.4.0")
schema: string # Reference to schema for validation (URL or local file path)
agent: # AI agent instructions (recommended)
  instructions: [] # Array of instruction strings
  llmNotes: string # Free-form notes about AI work preferences
rules: # Project rules and guidelines
  always: [] # Rules that must always be followed
  never: [] # Rules that must never be violated
  prefer: [] # Preferred approaches
  context: [] # Contextual information
archive: [] # Archived tasks (usually in separate file)
---
```

## Schema Reference

The `schema` field provides a reference to the Brainfile schema for validation and structure enforcement. This helps ensure AI agents and tools respect the exact protocol structure.

```yaml
schema: string # URL or local file path
```

### Official Schemas

The protocol schemas are hosted at `brainfile.md/v1/`:

| Schema | URL | Description |
|--------|-----|-------------|
| Base | `https://brainfile.md/v1/base.json` | Shared fields for all types |
| Board | `https://brainfile.md/v1/board.json` | Kanban boards (default) |
| Journal | `https://brainfile.md/v1/journal.json` | Time-ordered entries |

Browse all schemas: [brainfile.md/v1/](https://brainfile.md/v1/)

Programmatic access: `GET /v1/index.json`

### Schema Types

Brainfile supports multiple document types via the `type` field:

```yaml
---
type: board    # or: journal, collection, checklist, document
schema: https://brainfile.md/v1/board.json
title: My Project
---
```

When `type` is omitted, tools infer the type from:
1. Schema URL pattern (`/v1/journal.json` → journal)
2. File name suffix (`*.journal.md` → journal)
3. Structural analysis (`columns[]` → board, `entries[]` → journal)
4. Default: `board`

### Schema Formats

1. **Type-specific URL** (recommended):
   ```yaml
   schema: https://brainfile.md/v1/board.json
   ```

2. **Generic URL** (backward compatible):
   ```yaml
   schema: https://brainfile.md/v1
   ```

3. **Local file** (for offline or custom schemas):
   ```yaml
   schema: ./schemas/brainfile.schema.json
   ```

When present, AI agents and tools should fetch and validate against this schema to ensure proper structure and prevent taking liberties with the format.

### Examples

Example files for each type are available at [brainfile.md/example/](https://brainfile.md/example/):

- [board.md](https://brainfile.md/example/board.md) - Kanban board with columns and tasks
- [journal.md](https://brainfile.md/example/journal.md) - Developer journal with entries

## Agent Instructions Block

The `agent` block provides explicit guidance to AI agents interacting with the board:

```yaml
agent:
  instructions:
    - Modify only the YAML frontmatter
    - Preserve all IDs
    - Keep ordering
    - Make minimal changes
    - Preserve unknown fields
```

This ensures consistent behavior across different AI agents and prevents destructive changes.

## Column Structure

Each column represents a workflow state:

```yaml
columns:
  - id: string # Unique identifier (kebab-case)
    title: string # Display title
    tasks: [] # Array of tasks
```

### Standard Column IDs

While customizable, these IDs are conventional:

- `todo` - Tasks to be started
- `in-progress` - Tasks being worked on
- `review` - Tasks pending review
- `done` - Completed tasks

## Task Structure

### Required Task Fields

```yaml
- id: string # Unique identifier (pattern: task-N)
  title: string # Task title
```

### Optional Task Fields

```yaml
description: string # Detailed description (markdown supported)
assignee: string # Person responsible
priority: string # low|medium|high|critical
effort: string # trivial|small|medium|large|xlarge
blockedBy: [] # Array of task IDs (e.g., ["task-1", "task-5"])
dueDate: string # ISO 8601 date
tags: [] # Array of tag strings
relatedFiles: [] # Array of file paths
subtasks: [] # Array of subtasks
template: string # bug|feature|refactor
```

## Subtask Structure

Subtasks track granular progress within a task:

```yaml
subtasks:
  - id: string # Pattern: task-N-M
    title: string # Subtask title
    completed: boolean # Completion status
```

## Rule Structure

Rules guide project behavior:

```yaml
rules:
  always:
    - id: number
      rule: string # Rule description
```

## Version Compatibility

### v0.4.0 (Latest)

- Added `protocolVersion` field for explicit versioning
- Added AI-friendly task fields: `effort`, `blockedBy`
- Added `llmNotes` field to agent block
- Task IDs now enforce `task-N` pattern

### v0.3.0

- Default to non-hidden files (`brainfile.md`)
- Added `agent` instruction block
- Maintains backward compatibility with hidden files
- Added subtasks support

### Migration Path

1. Projects can use either hidden or non-hidden files
2. Tools should check for both variants
3. Non-hidden files take priority when both exist

## Best Practices

1. **Use non-hidden files** for better visibility and AI compatibility
2. **Include agent instructions** to ensure consistent AI behavior
3. **Preserve IDs** when moving tasks between columns
4. **Use semantic IDs** (task-1, task-2) for easy reference
5. **Keep descriptions concise** but informative
6. **Archive completed tasks** to maintain board performance

## File Discovery

Tools implementing the protocol should:

1. Check for `brainfile.md` first
2. Fall back to `.brainfile.md` if not found
3. Create `brainfile.md` for new projects
4. Support both formats for existing projects

## Validation

Use the JSON schemas at `https://brainfile.md/v1/` to validate YAML structure:

- **Board**: `https://brainfile.md/v1/board.json`
- **Journal**: `https://brainfile.md/v1/journal.json`
- **Generic**: `https://brainfile.md/v1.json` (backward compatible)

## Example

```yaml
---
title: My Project
type: board
schema: https://brainfile.md/v1/board.json
agent:
  instructions:
    - Modify only the YAML frontmatter
    - Preserve all IDs
    - Keep ordering
  llmNotes: "Prefer functional patterns and comprehensive tests"
rules:
  always:
    - id: 1
      rule: update task status as you work
columns:
  - id: todo
    title: To Do
    tasks:
      - id: task-1
        title: Implement user authentication
        description: Add OAuth2 support
        priority: high
        effort: large
        blockedBy: []
        subtasks:
          - id: task-1-1
            title: Setup OAuth provider
            completed: false
          - id: task-1-2
            title: Create login UI
            completed: false
---
```

