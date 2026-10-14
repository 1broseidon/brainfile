---
id: epic-6
title: "Headless parity: everything the desktop runs also works over MCP and the CLI, and the desktop shows it live"
type: epic
column: backlog
position: 9
description: |-
  Today hand-offs, ACP agents, landing, send-backs, Discuss, issue import and board fixes run only inside the desktop's agents process, main process and host, with their live state in memory (the `runs` map, the `reserved` set, the in-process landing queue) and in the Mac-only settings folder (dispatch.json, models.json, agents/). This epic moves that runtime into core so it runs the same way from the CLI, from any MCP client and from the desktop. A hand-off is a record on the board that any runner can claim. A run on this machine is a file under `.brainfile/state/runs/` that the desktop watches, so a run someone starts headless shows in the desktop as it happens.

  The investigation, the inventory and the reasons are in the plan under this epic (task-73). This epic extends spec-16: its children carry out spec-16-1 (the record), spec-16-7 (`brainfile dispatch`, MCP `dispatch` and `dispatch_status`), spec-16-8 (`brainfile run` and the TUI) and spec-16-4/5/6 (the lead), so those parts are built once in core and not first in the desktop. It follows spec-13's rule: every new CLI command gets an MCP tool, or goes on the exclusion list with a reason, in cli/src/__tests__/mcp-parity.test.ts.

  Order: the record (C), the agents (A), the worktrees and landing (B), issues (I) and board fixes (J) can start in parallel. Discuss (H) needs A. The shared runner (D) needs A, B and C. The MCP and CLI surface (E) needs D. The runner command (F), the lead (G) and the desktop's live view (K) need D and E.

  Not in scope: a daemon or background server, remote runners, scheduling by time and cost budgets (as spec-16). The chat pane, the dock, the review pane, editors, updates and the phone link stay in the desktop.
tags:
  - desktop
  - mcp
  - cli
  - dispatch
  - acp
  - parity
  - core
relatedFiles:
  - desktop/src/agents/agents.ts
  - desktop/src/agents/worktree.ts
  - desktop/src/agents/desk.ts
  - desktop/src/agents/desk-mcp.ts
  - desktop/src/agents/discuss.ts
  - desktop/src/host/host.ts
  - desktop/src/host/fix.ts
  - desktop/src/main/github.ts
  - desktop/src/main/forge.ts
  - core/src/repo
  - cli/src/mcp/tools
  - cli/src/commands
  - cli/src/__tests__/mcp-parity.test.ts
decisions:
  - decision-11
  - decision-12
  - decision-14
  - decision-15
  - decision-6
  - decision-4
createdAt: "2026-10-14T22:14:19.304Z"
---

## Description
Today hand-offs, ACP agents, landing, send-backs, Discuss, issue import and board fixes run only inside the desktop's agents process, main process and host, with their live state in memory (the `runs` map, the `reserved` set, the in-process landing queue) and in the Mac-only settings folder (dispatch.json, models.json, agents/). This epic moves that runtime into core so it runs the same way from the CLI, from any MCP client and from the desktop. A hand-off is a record on the board that any runner can claim. A run on this machine is a file under `.brainfile/state/runs/` that the desktop watches, so a run someone starts headless shows in the desktop as it happens.

The investigation, the inventory and the reasons are in the plan under this epic (task-73). This epic extends spec-16: its children carry out spec-16-1 (the record), spec-16-7 (`brainfile dispatch`, MCP `dispatch` and `dispatch_status`), spec-16-8 (`brainfile run` and the TUI) and spec-16-4/5/6 (the lead), so those parts are built once in core and not first in the desktop. It follows spec-13's rule: every new CLI command gets an MCP tool, or goes on the exclusion list with a reason, in cli/src/__tests__/mcp-parity.test.ts.

Order: the record (C), the agents (A), the worktrees and landing (B), issues (I) and board fixes (J) can start in parallel. Discuss (H) needs A. The shared runner (D) needs A, B and C. The MCP and CLI surface (E) needs D. The runner command (F), the lead (G) and the desktop's live view (K) need D and E.

Not in scope: a daemon or background server, remote runners, scheduling by time and cost budgets (as spec-16). The chat pane, the dock, the review pane, editors, updates and the phone link stay in the desktop.
