---
id: spec-13
title: "MCP parity: every CLI capability has an MCP tool"
type: spec
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
    completed: true
  - id: spec-13-3
    title: "columns: new CLI command and MCP tool (list, add, rename, reorder, remove with move-to)"
    completed: true
  - id: spec-13-4
    title: "board tool: title, agent instructions, related entries; types and template tools"
    completed: true
  - id: spec-13-5
    title: lint, sync and where tools; schemas as MCP resources
    completed: true
  - id: spec-13-6
    title: "Server instructions: use the tools for every board change, never hand-edit .brainfile/"
    completed: true
  - id: spec-13-7
    title: "Docs: MANUAL and llms files list every tool"
    completed: true
updatedAt: "2026-10-12T18:47:40.260Z"
completedAt: "2026-10-12T18:47:40.260Z"
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
- 2026-10-12T07:46:37.561Z: [claude] Built and verified: core column/settings edits (351881f), brainfile columns + program.ts (a8d5295), log/lint data functions (c62cd1a), 11 new MCP tools (25 in all), schema resources, server instructions (f7df27d), parity test (1e463f3). Tests: core 857/857, CLI 595 pass / same 9 baseline failures, TUI 129/129. Smoke over stdio on a tracked scratch board: 25 tools, instructions, both schema resources, columns add/rename/reorder/remove (refused, then --moveTo), note, log, board title/instructions/related, types add, template use, lint, where, sync; one board commit per write, none per read. Docs next.
- 2026-10-12T07:49:38.153Z: [claude] Decision: (1) Exclusions, held by cli/src/__tests__/mcp-parity.test.ts: tui, mcp (interfaces), merge-driver (git runs it), hooks after-edit/before-prompt/session-start (host events), hooks install/uninstall/list (the person's agent settings), auth * (secrets), config * (user config), init, migrate (one-off, the person's call), restore (reads the v1 brainfile-archive.md; v2 keeps completed work in logs/), index (a cache search/brief/check refresh). schema maps to resources brainfile://schema/board and /base (the CLI's bundled files, whose $id still says v1; the site's v2 set is not shipped with the CLI). (2) Departures from the spec text: archive is mapped to task_complete (its destination already does local/github/linear) rather than excluded; restore excluded as v1-only rather than for credentials. (3) adr promote was not reachable, so adr_promote is a new tool; plan add/list/show/link map to task_add/list_tasks/get_task/task_patch, with list_tasks gaining a status field and filter for plan list --status. (4) board is MCP-only (no brainfile board command, per the one-new-command rule); people edit brainfile.md by hand. (5) sync tool does pull/push only; --set-remote and --autosync stay the person's call (who can read the board); sync is not wrapped in withBoardCommit, as the CLI skips it too. (6) The TUI edits no columns on any branch, so columns are new core operations (boardConfigEdits pure + boardConfigOperations on disk) through readBoardConfig/writeBoardConfig; YAML comments in the frontmatter are lost on a write, as with types add. rename keeps the ID; reorder puts the named columns first and the rest after; remove refuses a column with tasks unless moveTo, moves them uncompleted (skipAutoComplete) even into a completion column, keeps the column if a move fails, and never removes the last column. Columns are renumbered when the board uses order. (7) The commander program moved to cli/src/program.ts (createProgram) so the parity test enumerates the real CLI. (8) Parity is per command, not per flag: e.g. complete --force has no MCP equivalent. Final: build OK; core 857/857, CLI 595 pass / the same 9 baseline failures, TUI 129/129. Not completed; left for review.
