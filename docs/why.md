---
title: Why Brainfile?
description: Design rationale for a file-based task coordination protocol
---

# Why Brainfile?

## The Coordination Gap

AI coding agents can read your source code, run your tests, and edit your files. But they have no structured way to understand **what work needs to happen**, who is responsible for it, or how to verify completion.

Task management context — priorities, contracts, dependencies, acceptance criteria — lives in external systems (Linear, Jira, Notion) that agents cannot access during a session. The human becomes the integration layer: copying requirements into prompts, manually updating status, and translating between the task board and the codebase.

Brainfile closes this gap by defining a protocol for task coordination that lives directly in the repository, in a format that both humans and agents can read and operate on.

---

## Design Principles

### Protocol over product

Brainfile is a file format specification, not a SaaS application. The protocol defines the structure; implementations are separate. The [CLI](/tools/cli), [MCP server](/tools/mcp), [core library](/tools/core), and [VS Code extension](/tools/vscode) are reference implementations — anyone can build tooling against the same specification.

### Files over databases

Tasks are individual markdown files with YAML frontmatter. The board config is a separate file defining columns, types, and rules. This means:

- **Version control** — Task changes appear in diffs and git history
- **No merge conflicts** — Individual files avoid the single-file bottleneck
- **Offline-first** — No server, no network dependency
- **Portable** — Copy the `.brainfile/` directory and you have everything

### Completion as archival

Active tasks live in `.brainfile/board/`. When completed, they move to `.brainfile/logs/`. There is no "done" column. Completion is a file-system operation that sets `completedAt` and preserves the full task history in the logs directory.

```
.brainfile/
├── brainfile.md    # Board config (columns, types, rules)
├── board/          # Active tasks
│   ├── task-1.md
│   └── epic-1.md
└── logs/           # Completed tasks
    └── task-2.md
```

### Explicit coordination semantics

The contract system defines a formal lifecycle for delegated work:

1. **PM** defines deliverables, validation commands, and constraints
2. **Worker agent** picks up the contract and implements
3. **Worker agent** delivers; PM validates against the contract

This replaces informal "please implement X" instructions with structured, verifiable agreements. Contract status (`ready → in_progress → delivered → done/failed`) is tracked in the task file itself.

### Type safety at the protocol level

Document types (task, epic, adr) are declared in the board config with `idPrefix` and `completable` flags. Strict mode enforces that only declared types can be created. This prevents drift in large projects where multiple agents or humans create documents.

### Decisions become rules

Architecture Decision Records (ADRs) are first-class document types. When an ADR is accepted, it can be promoted to a permanent project rule in the board config — with a backlink to the source ADR. Agents read these rules before starting work.

---

## What the Protocol Defines

| Concept | Description |
|---------|-------------|
| **Board config** | Columns, document types, strict mode, rules, agent instructions |
| **Task files** | Individual markdown files with structured YAML frontmatter |
| **Lifecycle** | `board/` → `logs/` completion model with `completedAt` timestamps |
| **Contracts** | Deliverables, validation commands, constraints, and status lifecycle |
| **Types** | `task`, `epic`, `adr` — extensible via config, with optional strict enforcement |
| **Rules** | `always`/`never`/`prefer`/`context` categories with numeric IDs and optional source backlinks |
| **Linking** | `parentId` for any-to-any document relationships |

---

## What the Protocol Does Not Define

- How to render a kanban board (that's an implementation concern)
- Authentication or access control
- Notification or webhook systems
- Sync mechanisms between multiple repositories
- How AI agents should interpret instructions (beyond providing the data)

The protocol is deliberately narrow. It defines the data format, lifecycle semantics, and coordination primitives. Everything else is left to implementations.

---

## Schema

The protocol is backed by JSON schemas for validation:

- **Board**: [`brainfile.md/v1/board.json`](https://brainfile.md/v1/board.json)
- **Task**: [`brainfile.md/v1/task.json`](https://brainfile.md/v1/task.json)
- **Contract**: [`brainfile.md/v1/contract.json`](https://brainfile.md/v1/contract.json)

---

## Next Steps

- [Protocol Specification](/reference/protocol) — Full format reference
- [Contract System](/guides/contracts) — Agent coordination semantics
- [Quick Start](/quick-start) — Install and initialize a board
- [Core Library](/tools/core) — Build on the protocol
