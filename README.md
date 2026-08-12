# Brainfile

[![npm](https://img.shields.io/npm/v/brainfile?color=blue)](https://www.npmjs.com/package/brainfile)
[![CI](https://github.com/1broseidon/brainfile/actions/workflows/ci.yml/badge.svg)](https://github.com/1broseidon/brainfile/actions/workflows/ci.yml)

Markdown task boards for you and your AI agents. Tasks, epics, and decisions live as plain Markdown files in your repo — you manage them from a CLI or TUI, your agents manage them through an MCP server, and git is the audit trail. No database, no SaaS, no lock-in.

```bash
npm i -g brainfile
brainfile init          # scaffold a .brainfile/ board
brainfile tui           # interactive terminal UI
brainfile mcp           # MCP server for your coding agents
brainfile --help        # add, list, move, contract, search, …
```

## How it works

A board is a `.brainfile/` directory:

```
.brainfile/
├── brainfile.md        # board config: columns, agent instructions, document types
├── board/              # active documents, one file each
│   ├── task-1.md
│   └── epic-1.md
└── logs/               # completion history
    ├── ledger.jsonl    # append-only completion log
    └── task-2.md       # archived documents
```

`brainfile.md` holds configuration only — columns, agent instructions, and custom document types. Every task, epic, or ADR is its own Markdown file with YAML frontmatter:

```yaml
---
id: task-1
title: Implement feature X
column: in-progress
parentId: epic-1
assignee: codex
contract:
  status: ready
  deliverables:
    - path: src/main.ts
      description: Core implementation
  validation:
    commands: ["npm test"]
---

## Description
Detailed requirements...
```

One file per document means clean diffs, painless merges, and history for free. Completing a task appends a record to `logs/ledger.jsonl` and archives the file to `logs/`.

## Working with agents

- **MCP server** — `brainfile mcp` exposes board operations (`list_tasks`, `task_add`, `task_move`, `task_patch`, `subtask`, `contract`, `search`, …) to Claude, Cursor, or any MCP client, so agents read and update the same board you see in the TUI.
- **Contracts** — a task can carry a contract: deliverables, validation commands, and constraints. Agents pick up (`brainfile contract pickup`), deliver, and you validate (`brainfile contract validate`) — which actually runs the validation commands. "Please do X" becomes verifiable.
- **Agent instructions** — project guidance lives in `agent.instructions` in the board config, one place agents are told to read before working.

## This repository

| Path | Package | What |
|------|---------|------|
| [`cli/`](cli) | [`brainfile`](https://www.npmjs.com/package/brainfile) | the CLI, TUI, and MCP server |
| [`core/`](core) | [`@brainfile/core`](https://www.npmjs.com/package/@brainfile/core) | parser, schema, and operations library |
| [`docs/`](docs) | — | the documentation site → [brainfile.md](https://brainfile.md) |

The board schema ships inside the CLI (`cli/src/schemas/`); the copies served at [brainfile.md/v2/board.json](https://brainfile.md/v2/board.json) exist so board frontmatter can reference a stable URL.

## Docs

Full documentation at **[brainfile.md](https://brainfile.md)** — quick start, contract guides, CLI and MCP reference. For agents: [brainfile.md/llms-install.txt](https://brainfile.md/llms-install.txt).

## License

MIT © George Dikeakos
