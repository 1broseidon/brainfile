---
id: task-125
title: "The task view carries the hand-off record: dispatch (agent, model, by, at, until, tries, the claim held or ended with its outcome) in the snapshot and getTask, in link.md under target, and in link:dev's fixtures"
column: in-progress
position: 1
tags:
  - link
  - desktop
  - contract
relatedFiles:
  - desktop/src/shared/api.ts
  - desktop/src/host/host.ts
  - desktop/src/link/dev.ts
  - desktop/link.md
  - desktop/test/link.test.ts
parentId: epic-10
dependsOn:
  - task-120
contract:
  status: delivered
  deliverables:
    - type: file
      path: desktop/src/shared/api.ts
      description: TaskView.dispatch
    - type: file
      path: desktop/src/host/host.ts
      description: The snapshot and getTask carry dispatch as written
    - type: docs
      path: desktop/link.md
      description: The hand-off record in the contract
    - type: file
      path: desktop/src/link/dev.ts
      description: Fixtures carry records
    - type: test
      path: desktop/test/link.test.ts
      description: The record reaches the phone
  validation:
    commands:
      - npm install --prefer-offline --no-audit --no-fund && npm run build && npm test
      - cd desktop && npm install --prefer-offline --no-audit --no-fund && npm run typecheck && npm test && node scripts/build-electron.mjs
  metrics:
    readyAt: "2026-10-16T06:56:53.503Z"
    pickedUpAt: "2026-10-16T07:07:15.459Z"
    reworkCount: 0
    deliveredAt: "2026-10-16T07:16:13.750Z"
    duration: 538
createdAt: "2026-10-16T06:56:53.515Z"
subtasks:
  - id: task-125-1
    title: link:dev --features <list> plays an older desk; documented in desktop/link.md
    completed: true
updatedAt: "2026-10-16T07:20:59.656Z"
dispatch:
  agent: claude
  model: opus
  by: lead
  at: "2026-10-16T07:06:59.393Z"
  until: done
  tries: 1
  claim:
    host: Georges-Mac-Studio
    runner: desktop
    pid: 20499
    at: "2026-10-16T07:07:01.099Z"
    ended: "2026-10-16T07:16:21.331Z"
    outcome: review
assignee: claude
---

## Description
Found by the phone epic's lead (mobile epic-1, 2026-10-16 06:55): the phone's task sheet shows the hand-off record (agent, model, when, by whom; held by a runner or ended with its outcome), but the desk's TaskView (desktop/src/shared/api.ts) and desktop/link.md carry no `dispatch`, so the sheet is empty on a linked board.

- `TaskView.dispatch?: DispatchRecord` (core's type, from `@brainfile/core/browser`), filled by the host in the board snapshot and `getTask` from the task file's `dispatch:` as it is (the record round-trips; `tries` and `claim` included; `paused` for a lead).
- desktop/link.md › Version 3 › target (or its own short section, "The hand-off record"): the field, its shape and that an older desk omits it.
- link:dev: task-3's fixture carries a request from the chat with a claim ended `review`; the queued fixture carries a claim held by the `brainfile run` runner.
- A test in desktop/test/link.test.ts: the record reaches a phone through openBoard's snapshot and getTask.
The renderer need not show it (the desktop shows the record elsewhere); this is for the link.

**Left by task-121 (landed on dispatch/epic-10):**
- desktop/test/link-parity.test.ts now checks that link.md's Calls table and bridge.ts's CALLS (exported as LINK_CALLS) name the same calls, and that every LINK_FEATURES entry has a Hello table row and a `### … (`feature`)` section. This task adds a field, not a call or a feature: do not add a row to the Calls table or a new feature for it; if you give the record its own section, keep it out of the `### … (`feature`)` heading form, or put it under ### Target.
- desktop/test/link-epic.test.ts runs the epic end to end with the real server, bridge, host and agents process; it must stay green. If it is cheap, assert there that a handed-off task's snapshot row carries `dispatch`.

## Log
- 2026-10-16T07:06:54.752Z: [claude] Also in scope (asked by the phone epic's integration child, mobile task-4): link:dev takes a `--features` option (e.g. `--features effort,merge`) so it plays an older desk for QA, instead of the person editing LINK_FEATURES by hand; say how to start it that way in desktop/link.md's link:dev paragraph (and find the npm script name the phone's docs/qa-one-system.md should quote). Keep it to the dev fake; the real desk's features stay LINK_FEATURES.
- 2026-10-16T07:16:17.888Z: [claude] Done on branch dispatch/task-125 (commit 717c7c4): TaskView.dispatch = core's readDispatchRecord of the task file's dispatch: (claim, tries, paused, unknown keys kept), set in host toView, so it is in the snapshot rows and getTask. It is a field, not a feature: no Calls row and no hello entry. link.md › Version 3 › "### The hand-off record" (no feature heading) gives the shape and says an older desk omits it. link:dev: fixture task-3 has a chat request with claim ended review; task-1 has brainfile run's held claim (cli, pid 48213; dev.ts rewrites host to this machine's). `npm run link:dev -- --features effort,merge` (or `none`) plays an older desk's hello: LinkServerOptions.features, defaults to LINK_FEATURES, refuses unknown names; every call is still answered. The phone's docs/qa-one-system.md should quote `npm run link:dev -- --features <list>`. Tests: link.test.ts (record over a real socket via openBoard + getTask, a lead's paused record included; --features hello), link-epic.test.ts asserts task-3's row carries dispatch. Full validation green. Nothing left unwired; the renderer does not show it.
- 2026-10-16T07:20:34.349Z: Landed on dispatch/epic-10
- 2026-10-16T07:20:35.849Z: Merged; 1 of 1 subtasks left, so it stays open
- 2026-10-16T07:20:59.351Z: [claude] Lead: the open subtask is delivered on dispatch/epic-10 (717c7c4): `--features` in desktop/src/link/dev.ts and its line in desktop/link.md (Dev fake, ~line 420). Only the checkbox was left; ticking it.
- 2026-10-16T07:28:31.875Z: [claude] Completed by Claude: its branch landed on dispatch/epic-10 (b342984) and the one subtask the landing left open was ticked by the lead afterwards; nothing completes a task in that state, so the epic could not be offered. Filed on task-118.
