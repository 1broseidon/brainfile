---
id: task-84
title: "Desktop: show runs started outside it, live, from the board and state/runs; the chat dispatches through brainfile mcp and the desk retires"
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
  status: delivered
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
    pickedUpAt: "2026-10-15T23:21:16.733Z"
    reworkCount: 1
    deliveredAt: "2026-10-15T23:25:02.565Z"
    duration: 226
createdAt: "2026-10-14T22:16:44.174Z"
updatedAt: "2026-10-15T23:27:50.421Z"
dispatch:
  agent: claude
  model: opus
  effort: high
  by: lead
  at: "2026-10-15T22:56:19.194Z"
assignee: claude
completedAt: "2026-10-15T23:27:50.421Z"
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

From task-81: the desktop does not work the queue yet, but its Runner writes a runner file (state/runners), so an MCP `dispatch` made while the window is open says nothing about starting it, and nothing starts it. The desktop's Runner must work the queue (with sendBack 'start'), or the "Queued. Run `brainfile run` or open Brainfile" message is wrong while it is open. The desktop already passes role chat / lead+scope / discuss to its sessions.

From task-83 (landed): the lead's session is already core's (brainfile mcp as lead of its tree, no desk), and the host reads the lead from core's record, with where it runs when another runner leads it. What is still on the desk is the chat: agents.ts ASK_PREAMBLE, and the chat's desk starting a lead on an epic. Move the chat to brainfile mcp's dispatch / dispatch_status / dispatch_stop / dispatch_lead, then remove desk.ts, desk-mcp.ts and DESK_TOOL. The desktop's Runner should work the queue with `leads: true` and sendBack 'start', so a lead queued by `brainfile dispatch <epic>` or MCP while the window is open runs there, and the Lead block shows a lead held by a terminal runner. task-82 builds `brainfile run` in parallel on the same Runner: keep to the Runner's API and leave cli/src/commands/run.ts and dispatch.ts to it.

## Log
- 2026-10-15T22:56:01.234Z: [claude] From task-83 (landed): the lead's session is already core's (brainfile mcp as lead of its tree, no desk), and the host reads the lead from core's record including "where it runs" when another runner leads it. What is still on the desk: the chat (agents.ts ASK_PREAMBLE, and the chat's desk starting a lead on an epic) — move the chat to brainfile mcp's dispatch/dispatch_status/dispatch_stop/dispatch_lead, then remove desk.ts, desk-mcp.ts and DESK_TOOL. The desktop's Runner should work the queue with leads: true and sendBack 'start', so a lead queued by `brainfile dispatch <epic>` or MCP while the window is open gets run there, and its Lead block shows a lead held by a terminal runner.
- 2026-10-15T23:14:06.393Z: [claude] Done on dispatch/task-84 (c999f61, 4aa3d67, e9e3864, 7f014b3, 3a84da2). Validation passes: core 1158, cli 676, tui 189; desktop typecheck, 155 tests and build-electron; desk-mcp.ts is gone. One TUI refresh test timed out once under load and passed on a clean rerun. Core: Runner.answerAsk writes state/runs/<id>.answer.json for another runner's ask; the owning runner applies it within 1 s and calls cancelAsk. The answer is a separate file, so the run file's read-modify-write cannot lose it. Runner.others(projectId) lists other runners' run files, ended and lost included. The fromOf option names the chat turn behind a queued request by chat, so the run carries from. queued() skips answeredBefore requests: no claim, no tries, by person/chat/lead, on a task in Review or done. Those are records from desktops before claims, which would otherwise rerun the moment a window works the queue. DESK_TOOL is gone. Desktop: host.ts lets state/runs and state/runners through its watch and sends {kind:'runs'}, debounced 250 ms; main forwards it as runsChanged. The new external.ts (ExternalRuns) diffs runner.others into run, permission and permission-done events, marking each run with where it runs ('in a terminal', 'from an MCP client'). A lost run shows as failed. The desktop looks again every 5 s while one is going. External ask ids are <run-id>/<ask-id>, and answers go through answerAsk. live() merges own and external runs and asks, so the phone gets them too. The Runner has leads: true and sendBack 'start'. boardChanged now also calls runner.work and external.look, and main calls it when a board opens, which starts the agents process. Renderer: Working, the dock tab and AskLine show where. On init it seeds from api.live(). A chat hand-off that starts after the reply joins the reply's line. The update restart counts only runs without where. Chat: role chat with chatPermission and discussMode. The preamble points at dispatch, dispatch_status, dispatch_stop and dispatch_lead. Each turn carries a [Hand-offs: …] line with the default agent, model and effort, and the person's per-agent choices. desk.ts, desk-mcp.ts, desk.test.ts and the desk bundle are removed. Docs: design.md › Dispatch, MANUAL Hand-offs, link.md, and changes/task-84-desktop-external-runs.md. Left unwired: (1) `brainfile run` (task-82) must honour cancelAsk to take its readline prompt down; I left a note on task-82. Until then the window's answer is applied but the terminal prompt stays on screen. (2) The by-hand check (brainfile dispatch plus brainfile run --once with the window open) was not done: `run` is not on this branch yet, and I did not drive the GUI. desktop/test/external-runs.test.ts covers the path with a real core Runner standing in for the terminal. (3) Opening this build takes up any lead whose record has no live claim (epic-6's included, if the desktop that runs it now is gone), and starts its queued children inside the lead's rules.
- 2026-10-15T23:21:05.557Z: Landing sent back (1 of 1): dispatch/task-84 conflicts with dispatch/epic-6 in core/src/dispatch/runner.ts. On dispatch/epic-6 since this branch started: b7af6a3 brainfile run: a foreground runner over core's Runner; dispatch --now uses its loop; live runs on the TUI's rows (task-82) (task-82). Merge dispatch/epic-6 into this branch (git merge dispatch/epic-6), keep what both sides meant, commit the merge, and run the checks: npm install --prefer-offline --no-audit --no-fund && npm run build && npm test && cd desktop && npm install --prefer-offline --no-audit --no-fund && npm run typecheck && npm test && node scripts/build-electron.mjs && test ! -e desktop/src/agents/desk-mcp.ts.
- 2026-10-15T23:21:22.682Z: [claude] Lead, on the runner.ts conflict: the two sides add different things, so keep both. dispatch/epic-6 (task-82) adds letGo/goingDown/lettingGo, the `ending` set, inPass and chain(projectId, onlyLed) with work() writing the runner file, settled(), options.until/maxRunning, and release() with an optional outcome (none means queued again). This branch adds others(), answerAsk, fromOf and answeredBefore in queued(). Put answeredBefore's filter in the queued() that task-82's chain/pass uses. Have letGo also stop the external-run look and pending answer watches. Run the full validation, including cli's run.test.ts, since `brainfile run` now relies on cancelAsk being called after an answer file is applied.
- 2026-10-15T23:25:02.095Z: [claude] Merged dispatch/epic-6 (task-82's brainfile run) into dispatch/task-84 at dec3676. The conflict in core/src/dispatch/runner.ts is settled: a dispatch run keeps the chat's from (options.from, else fromOf) and task-82's until fallback (record, then request, then the runner's until). Left-for-later item (1) from my earlier note is now closed: brainfile run already takes its prompt down through cancelAsk. cancelAsk now passes why ('answered' | 'stopped'), so the terminal says "That ask was answered outside this terminal." instead of "its run stopped" when the window answers; run.test.ts covers both. Validation passes: core 1158, cli 685, tui 191; desktop typecheck, 155 tests and build-electron; desk-mcp.ts is gone. Still not done: the by-hand check with the window open (brainfile dispatch, then brainfile run --once).
