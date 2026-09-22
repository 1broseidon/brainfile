---
schema: https://brainfile.md/v2/board.json
title: brainfile
strict: true
agent:
  instructions:
    - Task files are individual .md files in board/
    - Completed tasks are archived to logs/ via complete (recorded in ledger.jsonl)
    - Preserve all IDs; make minimal changes
    - Larger arcs are epics; link children via parentId
    - Design work lives as spec documents before implementation
    - Read CLAUDE.md for build/test/release commands and repo constraints
types:
  task:
    idPrefix: task
    completable: true
  epic:
    idPrefix: epic
    completable: true
  spec:
    idPrefix: spec
    completable: true
  adr:
    idPrefix: adr
    completable: false
  plan:
    idPrefix: plan
    completable: false
columns:
  - id: backlog
    title: Backlog
  - id: todo
    title: To Do
  - id: in-progress
    title: In Progress
  - id: review
    title: Review
---

# brainfile

Development board for the brainfile monorepo (core library, CLI/TUI/MCP server, docs site). Issues are tasks, larger arcs are epics with parentId children, design work starts as specs, decisions are ADRs.
