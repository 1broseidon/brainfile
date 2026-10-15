---
id: epic-6
title: "Headless parity: everything the desktop runs also works over MCP and the CLI, and the desktop shows it live"
type: epic
column: backlog
position: 9
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
  - decision-17
  - decision-18
createdAt: "2026-10-14T22:14:19.304Z"
updatedAt: "2026-10-15T17:11:59.603Z"
---

## Description
Today hand-offs, ACP agents, landing, send-backs, Discuss, issue import and board fixes run only inside the desktop's agents process, main process and host, with their live state in memory (the `runs` map, the `reserved` set, the in-process landing queue) and in the Mac-only settings folder (dispatch.json, models.json, agents/). This epic moves that runtime into core so it runs the same way from the CLI, from any MCP client and from the desktop. A hand-off is a record on the board that any runner can claim. A run on this machine is a file under `.brainfile/state/runs/` that the desktop watches, so a run someone starts headless shows in the desktop as it happens.

The investigation, the inventory and the reasons are in plan-2 under this epic (from task-73). This epic extends spec-16: its children carry out spec-16-1 (task-74), spec-16-7 (task-81), spec-16-8 (task-82) and spec-16-4/5/6 (task-83), so those parts are built once in core and not first in the desktop. It follows spec-13's rule: every new CLI command gets an MCP tool, or goes on the exclusion list with a reason, in cli/src/__tests__/mcp-parity.test.ts.

Order:
- Can start now, in parallel: the record (task-74), the agents (task-75), worktrees and landing (task-76), issues (task-77) and board fixes (task-78).
- Discuss (task-79) needs task-75.
- The shared runner (task-80) needs task-74, task-75 and task-76.
- The MCP and CLI surface (task-81) needs task-80.
- `brainfile run` (task-82), the lead (task-83) and the desktop's live view (task-84) need task-80 and task-81.

Not in scope: a daemon or background server, remote runners, scheduling by time and cost budgets (as spec-16). The chat pane, the dock, the review pane, editors, updates and the phone link stay in the desktop.
