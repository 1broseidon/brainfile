---
title: Protocol Specification
description: Complete specification of the Brainfile file format
---

# Protocol Specification

The Brainfile protocol defines a structured format for project tasks stored in markdown files with YAML frontmatter.

## File Format

### Primary File

| Filename | Priority | Notes |
|----------|----------|-------|
| `brainfile.md` | 1 (preferred) | Non-hidden, visible in file browsers |
| `.brainfile.md` | 2 | Hidden, backward compatibility |

### Archive File

Completed tasks can be moved to `brainfile-archive.md`.

---

## YAML Structure

### Minimal Valid File

```yaml
---
title: My Project
columns:
  - id: todo
    title: To Do
    tasks: []
---
```

### Complete Structure

```yaml
---
title: string              # Required: Project title
type: board                # Optional: board|journal|collection|checklist|document
schema: string             # Optional: URL or path to JSON schema
protocolVersion: string    # Optional: e.g., "0.4.0"

agent:                     # Optional: AI agent instructions
  instructions:
    - string
  llmNotes: string

rules:                     # Optional: Project rules
  always:
    - id: number
      rule: string
  never: []
  prefer: []
  context: []

columns:                   # Required: Array of columns
  - id: string             # Unique kebab-case identifier
    title: string          # Display title
    tasks:                 # Array of tasks
      - id: string         # Pattern: task-N
        title: string      # Required
        description: string
        priority: string   # low|medium|high|critical
        effort: string     # trivial|small|medium|large|xlarge
        assignee: string
        dueDate: string    # ISO 8601 (YYYY-MM-DD)
        tags: []
        relatedFiles: []
        blockedBy: []      # Array of task IDs
        subtasks:
          - id: string     # Pattern: task-N-M
            title: string
            completed: boolean

archive: []                # Optional: Archived tasks
---
```

---

## Field Reference

### Board Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | Yes | Project or board title |
| `type` | string | No | Document type (default: `board`) |
| `schema` | string | No | JSON schema URL for validation |
| `protocolVersion` | string | No | Protocol version |
| `agent` | object | No | AI agent instructions |
| `rules` | object | No | Project rules |
| `columns` | array | Yes | Workflow columns |
| `archive` | array | No | Archived tasks |

### Column Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique identifier (kebab-case) |
| `title` | string | Yes | Display title |
| `tasks` | array | Yes | Tasks in this column |

### Task Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique ID (pattern: `task-N`) |
| `title` | string | Yes | Task title |
| `description` | string | No | Detailed description (markdown) |
| `priority` | string | No | `low`, `medium`, `high`, `critical` |
| `effort` | string | No | `trivial`, `small`, `medium`, `large`, `xlarge` |
| `assignee` | string | No | Person responsible |
| `dueDate` | string | No | ISO 8601 date |
| `tags` | array | No | String tags for filtering |
| `relatedFiles` | array | No | File paths |
| `blockedBy` | array | No | Task IDs that block this task |
| `subtasks` | array | No | Subtask objects |
| `template` | string | No | `bug`, `feature`, `refactor` |

### Subtask Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique ID (pattern: `task-N-M`) |
| `title` | string | Yes | Subtask title |
| `completed` | boolean | Yes | Completion status |

---

## Standard Column IDs

These IDs are conventional but not required:

| ID | Purpose |
|----|---------|
| `backlog` | Tasks not yet scheduled |
| `todo` | Tasks to be started |
| `in-progress` | Tasks being worked on |
| `review` | Tasks pending review |
| `done` | Completed tasks |

---

## Agent Instructions

The `agent` block guides AI assistant behavior:

```yaml
agent:
  instructions:
    - Modify only the YAML frontmatter
    - Preserve all IDs
    - Keep ordering
    - Make minimal changes
    - Preserve unknown fields
  llmNotes: "Prefer functional patterns and comprehensive tests"
```

| Instruction | Reason |
|-------------|--------|
| Modify only YAML frontmatter | Content after `---` is user documentation |
| Preserve all IDs | Changing IDs breaks references |
| Keep ordering | Maintains visual consistency |
| Make minimal changes | Reduces merge conflicts |
| Preserve unknown fields | Future-proofs against extensions |

---

## Rules Block

Project rules for AI and human reference:

```yaml
rules:
  always:
    - id: 1
      rule: write tests for new features
    - id: 2
      rule: update task status as you work
  never:
    - id: 1
      rule: commit directly to main
  prefer:
    - id: 1
      rule: functional patterns over classes
  context:
    - id: 1
      rule: TypeScript monorepo with Jest
```

---

## Schema Reference

### Official Schemas

| Type | URL |
|------|-----|
| Base | `https://brainfile.md/v1/base.json` |
| Board | `https://brainfile.md/v1/board.json` |
| Journal | `https://brainfile.md/v1/journal.json` |

Browse all: [brainfile.md/v1/](https://brainfile.md/v1/)

### Type Inference

When `type` is omitted, tools infer from:
1. Schema URL pattern (`/v1/journal.json` → journal)
2. Filename suffix (`*.journal.md` → journal)
3. Structural analysis (`columns[]` → board)
4. Default: `board`

---

## ID Patterns

### Task IDs

Pattern: `task-N` where N is a sequential number.

```yaml
- id: task-1
- id: task-2
- id: task-15
```

### Subtask IDs

Pattern: `task-N-M` where N is parent task number, M is subtask number.

```yaml
subtasks:
  - id: task-1-1
  - id: task-1-2
```

---

## Version History

### v0.4.0 (Current)

- Added `protocolVersion` field
- Added `effort` and `blockedBy` task fields
- Added `llmNotes` to agent block
- Enforced `task-N` ID pattern

### v0.3.0

- Changed default to non-hidden files (`brainfile.md`)
- Added `agent` instruction block
- Added subtasks support

---

## Best Practices

1. **Use non-hidden files** — Better visibility, AI-friendly
2. **Include agent instructions** — Consistent AI behavior
3. **Preserve IDs** — Never regenerate or change task IDs
4. **Use semantic IDs** — Sequential `task-1`, `task-2`
5. **Keep descriptions concise** — But informative
6. **Archive completed tasks** — Keep board clean

---

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
columns:
  - id: todo
    title: To Do
    tasks:
      - id: task-1
        title: Implement user authentication
        description: Add OAuth2 support for Google and GitHub
        priority: high
        effort: large
        tags: [backend, security]
        subtasks:
          - id: task-1-1
            title: Setup OAuth provider
            completed: false
          - id: task-1-2
            title: Create login UI
            completed: false
  - id: in-progress
    title: In Progress
    tasks: []
  - id: done
    title: Done
    tasks: []
---

# My Project

Project documentation can go here. This content is preserved
but not parsed by tools.
```
