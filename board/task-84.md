---
id: task-84
title: "Desktop: show runs started outside it, live, from the board and state/runs; the chat dispatches through brainfile mcp and the desk retires"
column: backlog
position: 20
description: |-
  With the Runner shared (task-80) and its runs in files, the desktop shows every run on this machine the same way, whoever started it.

  - **Watching:** the host's `fs.watch` on the board folder ignores `state/` today (host.ts `watch`). It should let `state/runs/` and `state/runners/` through, read them debounced, and pass them to the agents process. The agents process merges them with its own runs, so `live()` and the AgentEvent stream cover every run. A run that ends refreshes Ready to merge, as the desktop's own runs do.
  - **The window:** an external run gets the row line (`codex · editing`) and a tab in the dock, marked with where it runs (`in a terminal`). Stop works through the Runner's stop across processes.
  - **Asks:** an ask from a terminal runner shows in the band, saying where it is waiting. Allow and Deny write `state/runs/<id>.answer.json`, which that runner watches and applies, and the terminal prompt then goes away.
  - **Chat:** the chat's agents get dispatch from `brainfile mcp` (role chat) instead of the desk. Remove desk.ts, desk-mcp.ts and the DESK_TOOL rule once the chat works through brainfile mcp. The reply's `task-N handed to codex` line comes from the request record and the run files.
  - **Phone:** the link relays external runs too (bridge.ts `live`).
  - **Docs:** design.md › Dispatch says all of this.

  Check it by hand: run `brainfile dispatch task-N --agent codex` and `brainfile run --once` in a terminal while the desktop is open, and see the row, the tab, an ask answered from the band, and Review.
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
updatedAt: "2026-10-15T21:40:12.089Z"
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
