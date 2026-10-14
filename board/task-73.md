---
id: task-73
title: "Investigate: which runtime paths live only in the desktop, and plan an epic to make them work headless over MCP and the CLI"
column: todo
position: 3
description: |-
  Goal: anything a person can do in the desktop, at least at the UX level, can also be done with no UI, from any MCP client or the CLI. Hand-offs, sending a task to an ACP agent, landing, conflict returns, epic leads, Discuss, issue import and so on should not depend on the desktop. When the desktop is open, it shows that headless activity live, because both run through the same code and the same board records.

  Investigate, then write up what you find:
  1. Inventory every runtime capability the desktop has (main process, `desktop/src/agents`, `desktop/src/host`, `desktop/src/main`, the IPC surface in `desktop/src/shared/api.ts`, the desk MCP server `desk-mcp.ts`). For each one, record where it lives, whether core, the CLI or the brainfile MCP server already has it, and whether its state is in board files or only in desktop memory or its settings (`dispatch.json`, run registry, dock sessions).
  2. Classify each one: already shared; desktop-only but should move to core; UI-only (stays in the desktop); or needs a new board record so a headless runner and the desktop see the same state (dispatch request and claim, run heartbeat, lead state).
  3. Find out how the desktop would see headless runs live: watching board and worktree files, the ledger, a lock or heartbeat file, or a local socket. Recommend one.
  4. Reconcile this with spec-16's Phase 3 (`brainfile dispatch`, `dispatch_status`, `brainfile run`) and with spec-13 (MCP parity for the CLI) so the epic extends them and does not duplicate them.

  Then create the follow-up epic on the board: the epic, then its children under it (parentId), each with dependsOn naming the children that must land first and a draft contract with deliverables and validation commands, added in dependency order. Expect children along these lines: move ACP agent spawning, the agent registry and custom agents into core; worktree dispatch and compare-and-swap landing in core; a dispatch and claim record on the board; MCP tools and CLI commands for dispatch, runs, stop, land and Discuss; a headless runner; the desktop showing externally started runs live. Leave priority unset.
tags:
  - research
  - desktop
  - mcp
  - cli
  - dispatch
  - acp
  - parity
relatedFiles:
  - desktop/src/agents/desk.ts
  - desktop/src/agents/desk-mcp.ts
  - desktop/src/agents/agents.ts
  - desktop/src/agents/custom.ts
  - desktop/src/agents/registry.ts
  - desktop/src/agents/worktree.ts
  - desktop/src/agents/discuss.ts
  - desktop/src/agents/live.ts
  - desktop/src/agents/settings.ts
  - desktop/src/host/host.ts
  - desktop/src/host/integrity.ts
  - desktop/src/main/github.ts
  - desktop/src/main/forge.ts
  - desktop/src/shared/api.ts
  - desktop/src/shared/issues.ts
  - cli/src/mcp/tools
  - cli/src/commands
  - core
  - desktop/design.md
  - .brainfile/board/spec-16.md
decisions:
  - decision-11
  - decision-12
  - decision-14
  - decision-15
  - decision-6
contract:
  status: draft
  deliverables:
    - type: research
      path: .brainfile/plans/desktop-headless-parity.md
      description: Inventory of desktop runtime paths, their classification (shared / move to core / UI-only / needs a board record), the recommended live-sync mechanism, and how it fits spec-16 and spec-13
    - type: research
      path: board
      description: The follow-up epic and its children on the board, in dependency order, each with dependsOn and a draft contract
  validation:
    commands:
      - test -f .brainfile/plans/desktop-headless-parity.md
      - brainfile list --type epic
      - brainfile lint
  constraints:
    - "Read only: no code changes in this task"
    - Work within decisions 11, 12, 14 and 15; if a finding goes against one, run check and say so in the write-up
    - The epic's children name the files they touch and carry validation commands
createdAt: "2026-10-14T22:07:16.454Z"
---

## Description
Goal: anything a person can do in the desktop, at least at the UX level, can also be done with no UI, from any MCP client or the CLI. Hand-offs, sending a task to an ACP agent, landing, conflict returns, epic leads, Discuss, issue import and so on should not depend on the desktop. When the desktop is open, it shows that headless activity live, because both run through the same code and the same board records.

Investigate, then write up what you find:
1. Inventory every runtime capability the desktop has (main process, `desktop/src/agents`, `desktop/src/host`, `desktop/src/main`, the IPC surface in `desktop/src/shared/api.ts`, the desk MCP server `desk-mcp.ts`). For each one, record where it lives, whether core, the CLI or the brainfile MCP server already has it, and whether its state is in board files or only in desktop memory or its settings (`dispatch.json`, run registry, dock sessions).
2. Classify each one: already shared; desktop-only but should move to core; UI-only (stays in the desktop); or needs a new board record so a headless runner and the desktop see the same state (dispatch request and claim, run heartbeat, lead state).
3. Find out how the desktop would see headless runs live: watching board and worktree files, the ledger, a lock or heartbeat file, or a local socket. Recommend one.
4. Reconcile this with spec-16's Phase 3 (`brainfile dispatch`, `dispatch_status`, `brainfile run`) and with spec-13 (MCP parity for the CLI) so the epic extends them and does not duplicate them.

Then create the follow-up epic on the board: the epic, then its children under it (parentId), each with dependsOn naming the children that must land first and a draft contract with deliverables and validation commands, added in dependency order. Expect children along these lines: move ACP agent spawning, the agent registry and custom agents into core; worktree dispatch and compare-and-swap landing in core; a dispatch and claim record on the board; MCP tools and CLI commands for dispatch, runs, stop, land and Discuss; a headless runner; the desktop showing externally started runs live. Leave priority unset.
