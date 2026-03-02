# Brainfile Protocol

An open protocol for agentic task coordination. Manage tasks, decisions, and project artifacts as structured markdown files — readable by both humans and AI agents.

## 1. Protocol Overview

Brainfile defines a structured way to manage project work using Markdown files. It separates **configuration** (the board) from **content** (tasks, documents).

- **Schema-driven**: All files are validated against JSON schemas (`board.json`, `task.json`, `contract.json`).
- **File-based**: Tasks are individual files in `.brainfile/board/`, allowing for easy diffs, history, and conflict resolution.
- **Agent-centric**: Designed to be read and manipulated by AI agents (human-readable frontmatter, clear instructions).

## 2. File Structure

A Brainfile project lives in a `.brainfile` directory:

```
.brainfile/
├── brainfile.md        # Board Configuration
├── board/              # Active Documents (Todo, In Progress)
│   ├── task-1.md
│   └── epic-1.md
└── logs/               # Completion History
    ├── ledger.jsonl    # Unified completion log
    ├── task-2.md       # (legacy) Archived task
    └── adr-1.md        # (legacy) Archived ADR
```

### Board Configuration (`brainfile.md`)

The entry point. Defines columns, rules, and document types. **No tasks are stored here.**

```yaml
---
title: My Project
columns:
  - id: todo
    title: To Do
  - id: in-progress
    title: In Progress
agent:
  instructions:
    - "Update task status in real-time"
strict: true
rules:
  always:
    - id: 1
      rule: "Use TypeScript for all new code"
types:
  epic:
    idPrefix: epic
    completable: true
  adr:
    idPrefix: adr
    completable: false
---

# Project Description
High-level context for the project...
```

### Document Files (`board/*.md`)

Each document is a standalone Markdown file with YAML frontmatter.

```yaml
---
id: task-1
type: task
title: Implement feature X
column: in-progress
parentId: epic-1
assignee: codex
contract:
  status: ready
  deliverables: ...
---

## Description
Detailed requirements...

## Log
- 2026-02-18T10:00:00Z: Started work
```

## 3. Document Types

The protocol supports custom document types via the `types` configuration in `brainfile.md`.

| Field | Description |
|-------|-------------|
| `idPrefix` | Prefix for IDs (e.g., `epic` -> `epic-1`). |
| `completable` | If `true`, a completion record is appended to `logs/ledger.jsonl` and the file is archived to `logs/`. If `false`, items stay on the board (e.g., ADRs). |
| `schema` | Optional JSON Schema URL for validation. |

**Strict Mode**: If `strict: true` is set in `brainfile.md`, only explicitly defined types (plus the default `task`) are allowed.

## 4. Lifecycle & Behavior

### Task Lifecycle
1.  **Created**: Added to `board/` in a default column.
2.  **Active**: Moves between columns in `board/`.
3.  **Completed**: A record is appended to `logs/ledger.jsonl`, the file is archived from `board/` to `logs/`, and `completedAt` is set. Optionally, if a column has `completionColumn: true`, moving a task there triggers auto-completion.

### Epic Lifecycle
Epics are container documents. They can be completed like tasks, but often stay active longer.
- **Linking**: Tasks link to Epics via `parentId: epic-N`.
- **Progress**: Calculated based on the completion status of child tasks.

### ADR Lifecycle (Architecture Decision Records)
ADRs track decisions.
1.  **Draft**: Created in `board/` (or a specific column).
2.  **Accepted**: Marked as `status: accepted`.
3.  **Promoted**: Using `brainfile adr promote`, a record is appended to `logs/ledger.jsonl`, the ADR is archived to `logs/` (status: `promoted`), and its title is extracted as a permanent rule in `brainfile.md`.

## 5. Linking Model (`parentId`)

Brainfile uses a loose linking model via the `parentId` field in frontmatter.

- **Any-to-Any**: Any document can parent any other document.
- **One Parent**: A document has exactly one parent.
- **Reference**: `parentId` stores the ID string (e.g., `epic-1`).

This replaces the need for inline `subtasks` for complex hierarchies, though inline subtasks are still supported for simple checklists.

## 6. Contract System

Contracts define formal agreements between a Project Manager (PM) and an Agent (Assignee). They are embedded in the `contract` field of a task.

### Structure

```yaml
contract:
  status: ready      # ready | in_progress | delivered | done | failed | blocked
  version: 1
  deliverables:
    - path: src/main.ts
      description: Core implementation
  validation:
    commands: ["npm test"]
  constraints:
    - "No external dependencies"
```

### Lifecycle

1.  **Ready**: PM defines requirements.
2.  **In Progress**: Agent picks up the task (`brainfile contract pickup`).
3.  **Delivered**: Agent submits work (`brainfile contract deliver`).
4.  **Done**: PM validates and approves (`brainfile contract validate`).
5.  **Failed**: Validation fails, requires rework.

## 7. Rules System

Project rules are centralized in `brainfile.md`. Agents must read these before starting work.

**Format:**
```yaml
rules:
  category: # always, never, prefer, context
    - id: 1
      rule: "Rule text"
      source: "adr-1" # Optional backlink
```

## 8. Schema Reference

- **Board**: [`https://brainfile.md/v1/board.json`](https://brainfile.md/v1/board.json)
- **Task**: [`https://brainfile.md/v1/task.json`](https://brainfile.md/v1/task.json)
- **Contract**: [`https://brainfile.md/v1/contract.json`](https://brainfile.md/v1/contract.json)

---

Full documentation at [brainfile.md](https://brainfile.md)
