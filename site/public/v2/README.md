# Brainfile v2 Schema Directory

Per-task file architecture. No deprecated fields. Clean break from v1.

## Schemas

| File | Purpose |
|------|---------|
| **base.json** | Shared fields (title, agent instructions) |
| **board.json** | Board configuration (columns, types, strict mode) |
| **task.json** | Standalone task documents |
| **contract.json** | PM-to-agent contracts |
| **epic.json** | Epic documents (groups related tasks) |
| **decision.json** | Decisions: standing choices, no column, never completed |
| **adr.json** | Architecture Decision Records (alias of decision) |
| **index.json** | Schema directory metadata |

## Architecture

```
.brainfile/
├── brainfile.md      # Board config (validated against board.json)
├── board/            # Active task files (validated against task.json)
│   ├── task-1.md
│   ├── epic-1.md
│   ├── spec-1.md
│   └── decision-1.md
└── logs/             # Completion history
    ├── ledger.jsonl  # Unified completion log
    └── task-2.md     # (legacy) Archived task
```

The board file is config-only: columns, types, metadata. Tasks are standalone `.md` files with YAML frontmatter and optional markdown body.

## Document Types

Five types are built in and need no entry in `board.types`:

| Type | Goes under | Holds |
|------|------------|-------|
| **epic** | top level | spec, plan, task |
| **spec** | epic | plan, task |
| **plan** | epic, spec | task |
| **task** (alias `issue`) | epic, spec, plan, task | task |
| **decision** (alias `adr`) | never in the tree | nothing; no column, never completed |

`parentId` is the one parent link; `decisions: [ids]` on work names the decisions it rests on (the reverse is computed); `supersedes`/`supersededBy` link decisions. New documents are written with the canonical type (`adr` → `decision`); existing `type: adr` files read as decisions and keep their IDs.

`board.types` names additions and overrides. A type of your own can take a built-in's place with `like` (`bug: { like: task }`); without it a type behaves as a task.

## Schema URLs

```
https://brainfile.md/v2/base.json
https://brainfile.md/v2/board.json
https://brainfile.md/v2/task.json
https://brainfile.md/v2/contract.json
https://brainfile.md/v2/epic.json
https://brainfile.md/v2/decision.json
https://brainfile.md/v2/adr.json
```

## Changes from v1

| What | v1 | v2 |
|------|----|----|
| Task storage | Embedded in column arrays or `.brainfile/tasks/` | `.brainfile/board/` |
| Board file | Contains tasks | Config-only |
| Contract context | `contract.context.background`, `contract.context.relevantFiles` | `task.description`, `task.relatedFiles` |
| Epic/ADR schemas | Examples (`v1/examples/`) | First-class (`v2/epic.json`, `v2/adr.json`) |
| Deprecated fields | Present with markers | Removed |
