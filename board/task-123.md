---
id: task-123
title: "Link queue: the real desk answers queue(projectId) from core's dispatch status, alias waits included; the feature queue is offered in hello"
column: review
position: 20
priority: high
tags:
  - link
  - desktop
  - core
  - queue
relatedFiles:
  - cli/src/commands/dispatch.ts
  - core/src/dispatch/runner.ts
  - desktop/src/shared/api.ts
  - desktop/src/link/bridge.ts
  - desktop/src/link/server.ts
  - desktop/src/link/dev.ts
  - desktop/link.md
  - desktop/test/link.test.ts
parentId: epic-10
dependsOn:
  - task-120
  - task-122
decisions:
  - decision-17
  - decision-16
  - decision-10
contract:
  status: delivered
  deliverables:
    - type: file
      path: desktop/src/shared/api.ts
      description: queue(projectId) and its QueueView
    - type: file
      path: desktop/src/link/bridge.ts
      description: queue bridged
    - type: file
      path: desktop/src/link/server.ts
      description: LINK_FEATURES gains queue
    - type: file
      path: desktop/src/link/dev.ts
      description: link:dev answers queue with fixtures
    - type: test
      path: desktop/test/link.test.ts
      description: queue through the bridge on the real host and the fake; an older desk unchanged
    - type: docs
      path: desktop/link.md
      description: The queue section matches what the desk answers
  validation:
    commands:
      - npm install --prefer-offline --no-audit --no-fund && npm run build && npm test
      - cd desktop && npm install --prefer-offline --no-audit --no-fund && npm run typecheck && npm test && node scripts/build-electron.mjs
  constraints:
    - dispatch status from the CLI and MCP says what it said before for boards with no related-board dependencies
    - A feature missing from hello means the phone's older behaviour
    - Plain copy in any string the phone shows (decision-10)
  metrics:
    readyAt: "2026-10-16T06:12:36.686Z"
    pickedUpAt: "2026-10-16T06:31:57.871Z"
    reworkCount: 0
    deliveredAt: "2026-10-16T06:43:34.465Z"
    duration: 697
createdAt: "2026-10-16T06:12:36.693Z"
updatedAt: "2026-10-16T06:43:34.465Z"
dispatch:
  agent: claude
  model: opus
  effort: high
  by: lead
  at: "2026-10-16T06:28:11.175Z"
  until: done
  tries: 1
  claim:
    host: Georges-Mac-Studio
    runner: desktop
    pid: 20499
    at: "2026-10-16T06:31:41.564Z"
assignee: claude
---

## Description
Split from task-120 by the lead: the `queue` feature of link contract v3, for the real desk. task-120 documents the queue call's shape in desktop/link.md and may give link:dev a fake answer; this child makes the real desk answer it.

Today what `brainfile dispatch status` reports (statusReport and waitsOn in cli/src/commands/dispatch.ts: queued hand-offs with what each waits on, claims, live runs from any runner, runners up) lives in the CLI, where the desktop cannot reach it. task-122 makes "what a hand-off waits on" alias-aware (dependencies on related boards) in one core function. Here:

- Move the status report the desktop needs into core (decision-17: a core feature, reachable from the CLI and MCP), using task-122's alias-aware waits; `brainfile dispatch status` and the MCP dispatch_status call the core one and say the same as before.
- Add `queue(projectId)` to desktop/src/shared/api.ts and the main process, returning what desktop/link.md (task-120) documents: queued hand-offs with the dependency each waits on (an alias wait names its board), runs started by any runner on this machine (confirm the desktop's state/runs merge reaches the phone), the runners up, and `unpushed(projectId)` for the "main is N commits ahead of origin" line.
- Bridge `queue` in bridge.ts, add `queue` to LINK_FEATURES only now that the real desk answers it, and make link:dev's answer go through the same shape (a queued hand-off waiting on another, a run from `brainfile run`, two runners, main 2 ahead).
- If the shape has to differ from what task-120 wrote in desktop/link.md, change link.md in the same commit and say so in a note on epic-10 (the phone builds against it).

Tests in desktop/test/link.test.ts (hello lists queue; queue through the bridge, on the real desk host and the fake; a desk without the feature leaves the phone's older view) and in cli for dispatch status unchanged.

**Left by task-120 (landed on dispatch/epic-10, 8456f21):**
- link.md › Version 3 › The queue: `queue(projectId) → Result<QueueView>` = `{limit, runners[{runner,host,pid,startedAt}], queued[{taskId,title,agentId,model?,effort?,until,by,at,waitsOn[] (alias:task-id for a related board)}], running: AgentRun[] (brainfile run's with `where`), unpushed: UnpushedView|null}`, modelled on cli's dispatchStatusOutputSchema.
- To do: add 'queue' to LINK_FEATURES (server.ts), a `queue: { args: [id], project: true }` entry in bridge.ts CALLS, a case in link:dev's FakeAgents (dev.ts). `unpushed` is already bridged (under `target`).
- link:dev fixtures in place: task-3 landsOn release/0.24, epic-2 epicBranch with child task-9, task-8 PR #31, main 2 ahead (grows with landings on main), new PRs from #32.

**Left by task-122 (4dc65ef):**
- `@brainfile/core/dispatch` exports `handOffWaits(brainfilePath, projectId, task: Pick<Task,'dependsOn'>): DependencyWait[]` (empty = no wait; entries keep ref/alias/state/done/board/doc and add `unlanded`). It resolves related boards afresh each call; missing aliases/folders/boards/tasks stay open. Re-check each time; don't cache.
- `handOffWaitMessage(taskId, waits, action='starts')` gives the board-named reason ("…starts once that has landed on the mobile board", or that the board is missing).
- CLI/MCP queued reports already keep `waitsOn: string[]` and add `waitMessage` for alias waits: when moving the report into core, keep both, and consider carrying `waitMessage` into QueueView's queued entries (if so, add it to link.md as optional and note it on epic-10).

## Log
- 2026-10-16T06:43:34.125Z: [claude] Done on branch dispatch/task-123 (b68ddf9). Core: @brainfile/core/dispatch status.ts exports dispatchStatus(runner, brainfilePath, projectId, {visible, ownEpic, withSelf}), queuedWaits (waitsOn + waitMessage, via handOffWaits) and statusLeads; CLI statusReport/dispatchReport and MCP dispatch_status call them (StatusReport/RunLine/LeadLine are aliases of core's types; output unchanged). Desktop: Api.queue(projectId) → QueueView (shared/api.ts, with QueuedHandOff), answered in the agents process by src/agents/queue.ts deskQueue (core status with withSelf, runs from the window's runner + ExternalRuns so a terminal's run carries where, titles from the board, unpushed); preload, AGENT_METHODS, bridge CALLS and LINK_FEATURES gain queue; link:dev answers through the same queueView (src/link/devQueue.ts). link.md: optional waitMessage, running = hand-offs only, noted on epic-10. Tests: 3 new in link.test.ts (bridge + checkCall; the real desk with a core Runner, a terminal runner, alias wait, main 2 ahead, live unchanged; link:dev). Validation green: root build + tests (1223 core, 713 CLI, 191 TUI), desktop typecheck, 161 tests, Electron build. Not wired: the window's renderer does not show the queue (phone only); nothing on brainfile-mobile.
