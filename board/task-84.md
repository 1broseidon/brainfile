---
id: task-84
title: "Desktop: show runs started outside it, live, from the board and state/runs; the chat dispatches through brainfile mcp and the desk retires"
column: backlog
position: 20
tags:
  - desktop
  - dispatch
  - live
  - dock
relatedFiles:
  - desktop/src/host/host.ts
  - desktop/src/agents/agents.ts
  - desktop/src/agents/desk.ts
  - desktop/src/agents/desk-mcp.ts
  - desktop/src/shared/api.ts
  - desktop/src/link/bridge.ts
  - desktop/src/renderer/lib/state.svelte.ts
  - desktop/design.md
parentId: epic-6
dependsOn:
  - task-80
  - task-81
  - task-83
decisions:
  - decision-8
  - decision-14
  - decision-10
contract:
  status: ready
  deliverables:
    - type: file
      path: desktop/src/host/host.ts
      description: Watches state/runs and state/runners
    - type: file
      path: desktop/src/agents/agents.ts
      description: Runs from every runner on this machine in live() and events; answers to external asks
    - type: test
      path: desktop/test/external-runs.test.ts
      description: A run file written by another process shows as a run, ends, and an answer file reaches it
    - type: docs
      path: desktop/design.md
      description: "Dispatch: runs started outside the window"
  validation:
    commands:
      - npm install --prefer-offline --no-audit --no-fund && npm run build && npm test
      - cd desktop && npm install --prefer-offline --no-audit --no-fund && npm run typecheck && npm test && node scripts/build-electron.mjs
      - test ! -e desktop/src/agents/desk-mcp.ts
  metrics:
    readyAt: "2026-10-15T21:40:11.572Z"
createdAt: "2026-10-14T22:16:44.174Z"
updatedAt: "2026-10-15T22:31:25.125Z"
---

## Description
With the Runner shared (task-80) and its runs in files, the desktop shows every run on this machine the same way, whoever started it.

- **Watching:** the host's `fs.watch` on the board folder ignores `state/` today (host.ts `watch`). It should let `state/runs/` and `state/runners/` through, read them debounced, and pass them to the agents process. The agents process merges them with its own runs, so `live()` and the AgentEvent stream cover every run. A run that ends refreshes Ready to merge, as the desktop's own runs do.
- **The window:** an external run gets the row line (`codex · editing`) and a tab in the dock, marked with where it runs (`in a terminal`). Stop works through the Runner's stop across processes.
- **Asks:** an ask from a terminal runner shows in the band, saying where it is waiting. Allow and Deny write `state/runs/<id>.answer.json`, which that runner watches and applies, and the terminal prompt then goes away.
- **Chat:** the chat's agents get dispatch from `brainfile mcp` (role chat) instead of the desk. Remove desk.ts, desk-mcp.ts and the DESK_TOOL rule once the chat works through brainfile mcp. The reply's `task-N handed to codex` line comes from the request record and the run files.
- **Phone:** the link relays external runs too (bridge.ts `live`).
- **Docs:** design.md › Dispatch says all of this.

Check it by hand: run `brainfile dispatch task-N --agent codex` and `brainfile run --once` in a terminal while the desktop is open, and see the row, the tab, an ask answered from the band, and Review.

From task-80: the desktop's `live()` still lists only its own runs, but `runner.live()` in core already reads other runners' run files: build on it rather than reading state/runs a second time. Run files carry projectId, threadId, from and stop, and beat every 10 s; a stop for another runner's run writes `stop: true` (watched every 1 s), then SIGTERM after 15 s. Known gap: a `stop: true` written between the owner's read and write of its own run file can be lost (the SIGTERM covers it); if the answer files for asks go through the same read-modify-write, avoid that race, e.g. a separate `<id>.answer.json` as above, not a field in the run file.

From task-81: the desktop does not work the queue yet, but its Runner writes a runner file (state/runners), so an MCP `dispatch` made while the window is open says nothing about starting it, and nothing starts it. The desktop's Runner must work the queue (with sendBack 'start'), or the "Queued. Run `brainfile run` or open Brainfile" message is wrong while it is open. The chat prompt (agents.ts ASK_PREAMBLE) and, if task-83 has not already, the lead prompt still tell agents to use the desk's dispatch: change them to brainfile mcp's dispatch/dispatch_status/dispatch_stop when the desk retires. The desktop already passes role chat / lead+scope / discuss to its sessions.

## Log
- 2026-10-15T22:56:01.234Z: [claude] From task-83 (landed): the lead's session is already core's (brainfile mcp as lead of its tree, no desk), and the host reads the lead from core's record including "where it runs" when another runner leads it. What is still on the desk: the chat (agents.ts ASK_PREAMBLE, and the chat's desk starting a lead on an epic) — move the chat to brainfile mcp's dispatch/dispatch_status/dispatch_stop/dispatch_lead, then remove desk.ts, desk-mcp.ts and DESK_TOOL. The desktop's Runner should work the queue with leads: true and sendBack 'start', so a lead queued by `brainfile dispatch <epic>` or MCP while the window is open gets run there, and its Lead block shows a lead held by a terminal runner.
