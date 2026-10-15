---
id: task-81
title: MCP tools and CLI commands for dispatch, status, stop, review, land and discard, with roles so a worker cannot dispatch
column: todo
position: 9
tags:
  - cli
  - mcp
  - dispatch
  - parity
relatedFiles:
  - cli/src/program.ts
  - cli/src/commands
  - cli/src/mcp/tools
  - cli/src/mcp/instructions.ts
  - cli/src/__tests__/mcp-parity.test.ts
  - desktop/src/agents/desk.ts
  - desktop/src/agents/desk-mcp.ts
  - MANUAL.md
parentId: epic-6
dependsOn:
  - task-80
decisions:
  - decision-12
  - decision-14
  - decision-15
contract:
  status: ready
  deliverables:
    - type: file
      path: cli/src/commands/dispatch.ts
      description: brainfile dispatch, dispatch status, dispatch stop
    - type: file
      path: cli/src/commands/review.ts
      description: brainfile review, land, discard
    - type: file
      path: cli/src/mcp/tools/dispatch_tool.ts
      description: dispatch, dispatch_status and dispatch_stop
    - type: file
      path: cli/src/mcp/tools/review_tool.ts
      description: "review: show, ready, land, discard"
    - type: test
      path: cli/src/__tests__/dispatch.test.ts
      description: Queue, status from run files, stop, land against a scratch repository with a fake agent, roles hiding tools
    - type: file
      path: cli/src/__tests__/mcp-parity.test.ts
      description: The new commands mapped; run excluded with its reason
    - type: docs
      path: MANUAL.md
      description: Dispatch from the CLI and MCP
  validation:
    commands:
      - npm install --prefer-offline --no-audit --no-fund && npm run build && npm test
      - node cli/dist/cli.js dispatch --help && node cli/dist/cli.js review --help
      - cd desktop && npm install --prefer-offline --no-audit --no-fund && npm run typecheck && npm test && node scripts/build-electron.mjs
  metrics:
    readyAt: "2026-10-15T21:40:10.771Z"
createdAt: "2026-10-14T22:16:11.028Z"
updatedAt: "2026-10-15T22:09:25.477Z"
dispatch:
  agent: claude
  model: opus
  effort: high
  by: lead
  at: "2026-10-15T22:09:25.352Z"
assignee: claude
---

## Description
This builds spec-16-7, over the Runner from task-80, with spec-13's naming and parity rule.

CLI:
- `brainfile dispatch <ids…|--column|--parent> [--agent --model --effort --until review|done]` queues the work. `--now` also runs it in the foreground until it ends.
- `brainfile dispatch status` shows the queue, the claims and the live runs from the run files. `brainfile dispatch stop <run-id|task-id>` stops one.
- `brainfile review <task-id>` shows the branch, commits, files and conflicts. `brainfile review --ready` lists the hand-offs that can land now.
- `brainfile land <task-id>` checks, then lands; a conflict is sent back. `brainfile discard <task-id>` drops the work.
- `brainfile agents` lists the agents, which are installed, and their models.

MCP:
- `dispatch` (queue), `dispatch_status`, `dispatch_stop`, and `review` (action show | ready | land | discard), plus `agents`.
- `dispatch` says plainly when no runner is up on this machine (no live file in state/runners): "Queued. Run `brainfile run` or open Brainfile to start it."
- Server instructions: ask before dispatching more than three at once; never dispatch a task whose dependsOn are open.

Roles: whoever starts `brainfile mcp` for an agent sets `BRAINFILE_AGENT_ROLE` (chat | lead | worker | discuss), and the Runner does so for every agent it starts.
- A worker's server lists no dispatch, stop or land tools, so a hand-off never hands off (decision-15).
- A lead's server reaches only its tree (`BRAINFILE_LEAD_SCOPE`).
- With no role set (a person's own client), everything is listed.
- This is a rule, not a security boundary: anyone on the machine can run the CLI. The desk's token and socket guard against nothing more, so the desk retires in task-84.

Parity: every new command is mapped in cli/src/__tests__/mcp-parity.test.ts. `run` goes on EXCLUDED: a foreground runner is an interface, like `tui` and `mcp`. MANUAL lists them all.

From task-80 (what it built, to build on): `Runner(dataDir, runner, board, ask, cancelAsk, onRun, ledBy, landed)` in core/src/dispatch/runner.ts, with queue/dispatch/start/stop/work/land and per-project methods (projectId first). Use `fileBoard()` as the RunnerBoard from the CLI and MCP; claim helpers are in core/src/repo/claims.ts. `runner.live()` already reads other runners' run files, so `dispatch status` should use it. fileBoard's board commits are debounced: a short-lived CLI command must call `flushBoardCommits` before it exits, or its queue/claim/land writes go uncommitted. The concurrency limit is board config `dispatch.maxRunning`, else dispatch.json, else 3. Requests with role:lead are skipped by `queued()`; leave that to task-83.
