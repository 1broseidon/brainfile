# Brainfile v2 Schema Directory

Per-task file architecture. No deprecated fields. Clean break from v1.

## Schemas

| File | Purpose |
|------|---------|
| **base.json** | Shared fields (title, agent instructions, rules) |
| **board.json** | Board configuration (columns, types, strict mode) |
| **task.json** | Standalone task documents |
| **contract.json** | PM-to-agent contracts |
| **epic.json** | Epic documents (groups related tasks) |
| **adr.json** | Architecture Decision Records |
| **index.json** | Schema directory metadata |

## Architecture

```
.brainfile/
├── brainfile.md      # Board config (validated against board.json)
├── board/            # Active task files (validated against task.json)
│   ├── task-1.md
│   ├── epic-1.md
│   └── adr-1.md
└── logs/             # Completion history
    ├── ledger.jsonl  # Unified completion log
    └── task-2.md     # (legacy) Archived task
```

The board file is config-only: columns, types, rules, metadata. Tasks are standalone `.md` files with YAML frontmatter and optional markdown body.

## Document Types

- **task** — Standard unit of work. Always valid, even without a `types` map.
- **epic** — Groups related tasks via `children` array. Extends task.json.
- **adr** — Architecture Decision Record with lifecycle status. Extends task.json.

Custom types can be defined in `board.types` with their own `idPrefix` and optional schema URL.

## Schema URLs

```
https://brainfile.md/v2/base.json
https://brainfile.md/v2/board.json
https://brainfile.md/v2/task.json
https://brainfile.md/v2/contract.json
https://brainfile.md/v2/epic.json
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
