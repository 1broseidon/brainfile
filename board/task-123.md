---
id: task-123
title: "Link queue: the real desk answers queue(projectId) from core's dispatch status, alias waits included; the feature queue is offered in hello"
column: todo
position: 20
description: |-
  Split from task-120 by the lead: the `queue` feature of link contract v3, for the real desk. task-120 documents the queue call's shape in desktop/link.md and may give link:dev a fake answer; this child makes the real desk answer it.

  Today what `brainfile dispatch status` reports (statusReport and waitsOn in cli/src/commands/dispatch.ts: queued hand-offs with what each waits on, claims, live runs from any runner, runners up) lives in the CLI, where the desktop cannot reach it. task-122 makes "what a hand-off waits on" alias-aware (dependencies on related boards) in one core function. Here:

  - Move the status report the desktop needs into core (decision-17: a core feature, reachable from the CLI and MCP), using task-122's alias-aware waits; `brainfile dispatch status` and the MCP dispatch_status call the core one and say the same as before.
  - Add `queue(projectId)` to desktop/src/shared/api.ts and the main process, returning what desktop/link.md (task-120) documents: queued hand-offs with the dependency each waits on (an alias wait names its board), runs started by any runner on this machine (confirm the desktop's state/runs merge reaches the phone), the runners up, and `unpushed(projectId)` for the "main is N commits ahead of origin" line.
  - Bridge `queue` (and `unpushed` if task-120 has not) in bridge.ts, add `queue` to LINK_FEATURES only now that the real desk answers it, and make link:dev's answer go through the same shape (a queued hand-off waiting on another, a run from `brainfile run`, two runners, main 2 ahead).
  - If the shape has to differ from what task-120 wrote in desktop/link.md, change link.md in the same commit and say so in a note on epic-10 (the phone builds against it).

  Tests in desktop/test/link.test.ts (hello lists queue; queue through the bridge, on the real desk host and the fake; a desk without the feature leaves the phone's older view) and in cli for dispatch status unchanged.
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
  status: ready
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
createdAt: "2026-10-16T06:12:36.693Z"
---

## Description
Split from task-120 by the lead: the `queue` feature of link contract v3, for the real desk. task-120 documents the queue call's shape in desktop/link.md and may give link:dev a fake answer; this child makes the real desk answer it.

Today what `brainfile dispatch status` reports (statusReport and waitsOn in cli/src/commands/dispatch.ts: queued hand-offs with what each waits on, claims, live runs from any runner, runners up) lives in the CLI, where the desktop cannot reach it. task-122 makes "what a hand-off waits on" alias-aware (dependencies on related boards) in one core function. Here:

- Move the status report the desktop needs into core (decision-17: a core feature, reachable from the CLI and MCP), using task-122's alias-aware waits; `brainfile dispatch status` and the MCP dispatch_status call the core one and say the same as before.
- Add `queue(projectId)` to desktop/src/shared/api.ts and the main process, returning what desktop/link.md (task-120) documents: queued hand-offs with the dependency each waits on (an alias wait names its board), runs started by any runner on this machine (confirm the desktop's state/runs merge reaches the phone), the runners up, and `unpushed(projectId)` for the "main is N commits ahead of origin" line.
- Bridge `queue` (and `unpushed` if task-120 has not) in bridge.ts, add `queue` to LINK_FEATURES only now that the real desk answers it, and make link:dev's answer go through the same shape (a queued hand-off waiting on another, a run from `brainfile run`, two runners, main 2 ahead).
- If the shape has to differ from what task-120 wrote in desktop/link.md, change link.md in the same commit and say so in a note on epic-10 (the phone builds against it).

Tests in desktop/test/link.test.ts (hello lists queue; queue through the bridge, on the real desk host and the fake; a desk without the feature leaves the phone's older view) and in cli for dispatch status unchanged.
