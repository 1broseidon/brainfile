---
id: task-125
title: "The task view carries the hand-off record: dispatch (agent, model, by, at, until, tries, the claim held or ended with its outcome) in the snapshot and getTask, in link.md under target, and in link:dev's fixtures"
column: todo
position: 17
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
  status: ready
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
createdAt: "2026-10-16T06:56:53.515Z"
subtasks:
  - id: task-125-1
    title: link:dev --features <list> plays an older desk; documented in desktop/link.md
    completed: false
updatedAt: "2026-10-16T07:06:58.435Z"
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
