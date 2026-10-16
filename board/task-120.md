---
id: task-120
title: "Link contract v3: features target, pull-request, merge-to and queue; desktop/link.md is the full contract; link:dev answers every new call"
column: todo
position: 17
tags:
  - link
  - desktop
  - contract
relatedFiles:
  - desktop/src/link/bridge.ts
  - desktop/src/link/server.ts
  - desktop/src/link/dev.ts
  - desktop/src/link/devReviews.ts
  - desktop/link.md
  - desktop/src/shared/api.ts
  - desktop/test/link.test.ts
parentId: epic-10
decisions:
  - decision-16
  - decision-10
contract:
  status: ready
  deliverables:
    - type: file
      path: desktop/src/link/server.ts
      description: LINK_FEATURES gains target, pull-request, merge-to (queue is task-123's)
    - type: file
      path: desktop/src/link/bridge.ts
      description: branches, openPullRequest, unpushed bridged; mergeReview takes to; patchTask allows landsOn and epicBranch
    - type: file
      path: desktop/src/link/dev.ts
      description: link:dev answers every call bridged here with fixtures
    - type: docs
      path: desktop/link.md
      description: The full link contract, version 3, canonical, with the queue call's shape for task-123
    - type: test
      path: desktop/test/link.test.ts
      description: Each feature added through the bridge and the fake; an older desk unchanged
  validation:
    commands:
      - npm install --prefer-offline --no-audit --no-fund && npm run build && npm test
      - cd desktop && npm install --prefer-offline --no-audit --no-fund && npm run typecheck && npm test && node scripts/build-electron.mjs
  constraints:
    - "A feature missing from hello means the phone's older behaviour: nothing new is required of an old phone or desk"
    - Plain copy in any string the phone shows (decision-10)
    - Change nothing in ../brainfile-mobile
    - "Do not add queue to LINK_FEATURES or move dispatch status into core: task-123 does"
  metrics:
    readyAt: "2026-10-16T06:13:09.261Z"
createdAt: "2026-10-16T06:09:34.204Z"
updatedAt: "2026-10-16T06:13:09.261Z"
---

## Description
The phone reaches the desktop through the link (desktop/src/link: server.ts offers `features` in hello, bridge.ts whitelists the api calls a phone may make with their argument shapes, dev.ts and devReviews.ts are the fake desk `link:dev` the phone is tried against). Today `LINK_FEATURES = ['effort', 'merge']` and the bridge carries 25 calls. Add, each gated on a feature the phone checks in hello:

- **`target`**: the task view carries `landsOn`, `epicBranch` and the resolved `target` (TaskView already has them on the desktop); `branches(projectId)` (BranchesView: trunk, local, remote, recent) is bridged; `patchTask` with `landsOn`/`epicBranch` is allowed (check bridge's patch argument shape).
- **`pull-request`**: `openPullRequest(projectId, taskId)` bridged; the task view's `pullRequest` record; `readyToMerge` already leaves an open PR out (keep); the board snapshot's tasks carry `pullRequest` so the row can show `#12`.
- **`merge-to`**: `mergeReview(projectId, taskId, to?)` takes `to` (`MergeTo`: target | branch | pull-request | keep) through the bridge, so an epic's Merge menu works from the phone; `review(projectId, taskId)` returns the epic-branch facts the menu needs (is it an epic branch, its target).
- **`unpushed`**: bridge `unpushed(projectId)` (UnpushedView) under `target` so the phone can show "main is N commits ahead of origin".

**Lead's split (epic-10 plan): the `queue` feature's real-desk implementation is task-123**, which waits on task-122 (alias-aware waits in core). Here, do NOT add `queue` to LINK_FEATURES and do not move dispatch status into core. DO write the queue call's contract in desktop/link.md (name `queue(projectId)`, its result: queued hand-offs with agent, model, until and `waitsOn` refs (an `alias:task-id` wait names its board), live runs including those from `brainfile run`, runners up, and unpushed; the degrade when a desk lacks the feature), so the phone can build against it now. task-123 implements it and may adjust the doc.

**The contract.** desktop/link.md is 16 lines pointing at the phone's docs/link.md (208 lines, in ../brainfile-mobile: read it, change nothing there). Make desktop/link.md the full contract: copy the phone's text in, then add version 3 (the four features, each call's name, arguments, result shape and the degrade when a desk lacks it). Say at the top that brainfile's copy is canonical. The server's `protocol` stays 1; features carry the versioning, as today.

**The fake desk.** link:dev (dev.ts, devReviews.ts, the fixtures in desktop/test/fixtures/link) answers every new call bridged here with believable data: a task with landsOn, an epic with its own branch, one with an open PR (#31 exists already), main 2 ahead. The phone is QA'd against it in the morning.

Tests in desktop/test/link.test.ts for each feature added here (hello lists them; each call through the bridge; the dev fake's answers), and the older-desk path untouched.
