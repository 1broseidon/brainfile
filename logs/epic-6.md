---
id: epic-6
title: "Headless parity: everything the desktop runs also works over MCP and the CLI, and the desktop shows it live"
type: epic
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
  - decision-19
  - decision-4
  - decision-17
  - decision-18
createdAt: "2026-10-14T22:14:19.304Z"
updatedAt: "2026-10-16T03:41:35.368Z"
epicBranch: true
assignee: claude
completedAt: "2026-10-16T03:41:35.368Z"
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

## Log
- 2026-10-15T21:25:56.994Z: [claude] Board cleanup (2026-10-15): the first wave is on main (task-74 to task-78, plus spec-18). spec-16 now sits under this epic. Next wave, in To Do: task-79 (Discuss in core), task-80 (the shared runner), task-81 (MCP/CLI dispatch surface). Then task-82, task-83, task-84 and task-88. The notes on task-80 and task-83 list today's rules that must move into core with them.
- 2026-10-15T21:27:52.732Z: [claude] Correction: spec-16 is not under this epic after all. It is completed; its last two items are task-81 and task-82 here.
- 2026-10-15T21:43:03.316Z: [claude] Set up for its lead (2026-10-15). epicBranch is on: the children fork from and land on dispatch/epic-6, made from main, and main is touched only by the epic's one Merge at the end, after Claude reviews the branch.
- Contracts for task-79 to task-84 and task-88 are active (ready), with the same checks on each. First: `npm install --prefer-offline --no-audit --no-fund && npm run build && npm test`. Second: `cd desktop && npm install … && npm run typecheck && npm test && node scripts/build-electron.mjs`. Plus each task's own: `dispatch --help`/`review --help`, `run --help`, `test ! -e desktop/src/agents/desk-mcp.ts`.
- Both shared checks pass on a fresh worktree from main in about 2.5 minutes.
- task-84 now waits on task-83 too: both rework the agents process and the desk.
- Order: task-79 and task-80 together → task-81 → task-82 and task-83 → task-84 → task-88.
- 2026-10-15T21:47:17.760Z: [claude] Lead plan (claude/opus). Order: task-80 (shared Runner) → task-81 (CLI/MCP surface, roles) → task-83 (lead into core) → task-82 (brainfile run) and task-84 (desktop live view, desk retires) in parallel → task-79 (Discuss) → task-88 (end to end). Why: 80 is the critical path for everything. 82 now waits on 83 (both change core/src/dispatch/runner.ts); 83 before 82 lets 82 and 84 run together (no shared files). task-79 now waits on 82 and 84: it touches desktop/src/agents/agents.ts (rewritten by 80, 83, 84), cli/src/mcp/instructions.ts and mcp-parity.test.ts (81) and program.ts (81, 82), so it goes last, on agents.ts as it ends up; it is off the critical path. task-79 must ask the person about superseding decision-6 before it builds: expect a question in its tab. task-88 is the integration child (its e2e test matches *.test.ts, so npm test runs it). plan-2 is task-73's research document, not work: it is not handed off; the person should close it so the epic can reach Ready to merge.
- 2026-10-15T21:48:40.124Z: [claude] plan-2 completed (Claude, at the lead's request): it was task-73's research document, not work, and the epic can reach Ready to merge only with every child closed.
- 2026-10-16T01:43:09.592Z: [claude] Lead: task-79 landed on dispatch/epic-6. Its leftovers for brainfile discuss went into task-110, now dispatched. task-88 now depends on task-110 because its step 4 runs Discuss from the CLI. epic-6 now rests on decision-19 instead of the superseded decision-6. decision-19's source (core/src/dispatch/discuss.ts) can't be set yet: the file exists only on dispatch/epic-6, not on the trunk the hash is taken from. Set it once epic-6 merges.
- 2026-10-16T01:57:10.324Z: [claude] Lead: task-110 landed on dispatch/epic-6. task-88, the last child, is dispatched (claude/opus). I added task-110's leftovers to its description: run brainfile discuss in step 4, and in step 3 check how the desktop handles a terminal discussion's ask run files. Still to do after the merge: set decision-19's source to core/src/dispatch/discuss.ts.
- 2026-10-16T02:46:50.910Z: [claude] All 8 children landed on dispatch/epic-6 (5a2b87c: 83 files, +9.5k/-2.2k). Every suite passes there: core 1179, CLI 698 + 191, desktop 142, with typecheck, the bundle and the vite build clean. Claude's review found one blocker and five should-fixes, so it is not merged yet.
- Blocker: the chat and the lead reach brainfile mcp through whatever brainfile is on PATH, the published 0.22.1, which has no dispatch tools.
- Old dispatch:/lead: records re-run on upgrade with nobody asking.
- The lead and the chat can get around their roles through the brainfile CLI.
- A refused claim still starts the agent.
- A stop from another process can be lost, and the whole runner is then SIGTERMed.
- A task being landed can be started meanwhile.
- A lead taken up when its children are complete but unlanded is refused.
- Minors: quitting re-runs hand-offs; run files pruned only once; offerIfLast is desktop-only; SUBCOMMANDS is missing the new commands; pull_request ignores roles.
Fixes are being built on e6fix/cli and e6fix/runner, to be merged into dispatch/epic-6 before the epic lands.

## Child Tasks
Summary: 14/14 children completed.
- plan-2: Desktop headless parity: what runs only in the desktop, where its state lives, and how the desktop sees headless runs (completed)
- task-110: brainfile discuss: talk a task over in the terminal, under decision-19's rules (completed)
- task-74: Board record: a dispatch request and a runner's claim on the task, and run files under state/ (completed)
- task-75: Core: ACP agents, the agent registry, custom agents, settings and sessions move out of the desktop (completed)
- task-76: Core: hand-off worktrees, review, compare-and-swap landing and send-back move out of the desktop (completed)
- task-77: Issues from the CLI and MCP: source on a task, list a repository's issues, make a task from one (completed)
- task-78: Board fixes from the CLI and MCP: the desktop's Fix and Undo move to core (completed)
- task-79: Discuss without the desktop: the task's context and rules in core, brainfile discuss, and an MCP discuss prompt (completed)
- task-80: Core: one shared runner that claims, starts, stops and lands hand-offs, used by the desktop first (completed)
- task-81: MCP tools and CLI commands for dispatch, status, stop, review, land and discard, with roles so a worker cannot dispatch (completed)
- task-82: brainfile run: a foreground runner that works the queue in a terminal, and live runs on the TUI's rows (completed)
- task-83: Move the desktop's epic lead into core's shared runner, so it runs the same from brainfile run and MCP (completed)
- task-84: Desktop: show runs started outside it, live, from the board and state/runs; the chat dispatches through brainfile mcp and the desk retires (completed)
- task-88: Without the desktop, end to end: an epic run from a terminal and an MCP client, from hand-off to landed, and the desktop watching it live (completed)
