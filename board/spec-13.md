---
id: spec-13
title: "MCP parity: every CLI capability has an MCP tool"
type: spec
column: in-progress
position: 1
tags:
  - mcp
  - cli
  - agents
parentId: epic-2
createdAt: "2026-10-12T05:56:09.083Z"
subtasks:
  - id: spec-13-1
    title: "Parity test: enumerate CLI commands; each maps to an MCP tool or a reasoned exclusion"
    completed: true
  - id: spec-13-2
    title: note and log tools
    completed: false
  - id: spec-13-3
    title: "columns: new CLI command and MCP tool (list, add, rename, reorder, remove with move-to)"
    completed: false
  - id: spec-13-4
    title: "board tool: title, agent instructions, related entries; types and template tools"
    completed: false
  - id: spec-13-5
    title: lint, sync and where tools; schemas as MCP resources
    completed: false
  - id: spec-13-6
    title: "Server instructions: use the tools for every board change, never hand-edit .brainfile/"
    completed: false
  - id: spec-13-7
    title: "Docs: MANUAL and llms files list every tool"
    completed: false
updatedAt: "2026-10-12T07:46:35.838Z"
---

## Description
An agent working through `brainfile mcp` should be able to do everything a person can do at the command line, so it never falls back to the CLI or, worse, edits board files by hand. Today it can't: the desktop chat was asked to add columns and had no tool for it (neither has the CLI: only the TUI edits columns), and an agent dispatched to a task cannot even leave a log note over MCP.

**The rule.** Every CLI capability that reads or changes a board has an MCP equivalent, and a test keeps it so: it enumerates the CLI's commands and fails unless each maps to an MCP tool or sits on a short exclusion list with a reason.

**Missing today** (MCP has list_tasks, get_task, search, task_add, task_move, task_patch, task_complete, task_delete, subtask, contract, brief):
- `note`: append a line to a task's log. The dispatcher's brief asks for exactly this.
- `columns`: list, add, rename, reorder, remove (remove refuses a column with tasks unless told where they go). New in the CLI too: `brainfile columns`.
- `log`: read completed work (by id, search, recent).
- `board`: read and set the board's own config (title, agent instructions, `related:` entries).
- `types`: list and add types (with spec-12's graph).
- `template`: list templates and add from one.
- `lint`: check, and fix where the CLI can.
- `sync` and `where`: sync now, and say where the board lives and how fresh it is.
- From spec-11 and spec-12: `decide`, `supersede`, `check`, and `patch` with parent and dependsOn, as they land.
- Covered once spec-12 lands: `plan` (a type plus parentId), `adr promote` (decisions).

**Excluded, with reasons.** `tui` and `mcp` (interfaces themselves), `merge-driver` (git's), `hooks install` and `auth` (they change the person's own tools and secrets), `init` and `migrate` (one-off, a person's call), `archive` and `restore` (external services and credentials), `schema` (served as MCP resources instead of a tool).

**The server says how to use it.** `brainfile mcp` gets server instructions: use these tools for every board change, never edit `.brainfile/` files by hand, and what each tool is for in one line. Tool names stay in the existing style (`task_*`, then a noun).

**Not in scope.** New capabilities that the CLI does not have, beyond `columns`.

## Log
- 2026-10-12T07:30:16.640Z: [claude] Started on feat/memory-graph. Baseline: core 837/837, CLI 546 pass / 9 fail (brainfile-finder, command-lint, hook-settings), TUI 129/129. The TUI does not edit columns on any branch, so columns get core operations written through core's readBoardConfig/writeBoardConfig.
