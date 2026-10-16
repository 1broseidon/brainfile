---
id: task-120
title: "Link contract v3: features target, pull-request, merge-to and queue; desktop/link.md is the full contract; link:dev answers every new call"
column: review
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
  status: delivered
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
    pickedUpAt: "2026-10-16T06:13:43.411Z"
    reworkCount: 0
    deliveredAt: "2026-10-16T06:23:14.247Z"
    duration: 571
createdAt: "2026-10-16T06:09:34.204Z"
updatedAt: "2026-10-16T06:23:19.515Z"
dispatch:
  agent: claude
  model: opus
  effort: high
  by: lead
  at: "2026-10-16T06:13:27.475Z"
  until: done
  tries: 1
  claim:
    host: Georges-Mac-Studio
    runner: desktop
    pid: 20499
    at: "2026-10-16T06:13:29.140Z"
    ended: "2026-10-16T06:23:19.515Z"
    outcome: review
assignee: claude
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

## Log
- 2026-10-16T06:20:28.543Z: [claude] For task-123 and the phone: desktop/link.md is now the full, canonical link contract (protocol stays 1; features carry versions). LINK_FEATURES = effort, merge, target, pull-request, merge-to; `queue` is NOT in it. The queue call is written in link.md › Version 3 › The queue: queue(projectId) → Result<QueueView> {limit, runners[{runner,host,pid,startedAt}], queued[{taskId,title,agentId,model?,effort?,until,by,at,waitsOn[] (alias:task-id for a related board)}], running: AgentRun[] (brainfile run's with `where`), unpushed: UnpushedView|null}; modelled on cli's dispatchStatusOutputSchema. task-123: add 'queue' to LINK_FEATURES (server.ts), a `queue: { args: [id], project: true }` entry in bridge.ts CALLS, a case in link:dev's FakeAgents (dev.ts), and adjust the doc if the shape moves. Bridge notes: review() is enriched in linkDesk with epicBranch + target (LinkReviewView in shared/api.ts); mergeReview passes `to` only when given (older phones unchanged) and never completes the task for to:pull-request. link:dev fixtures: task-3 landsOn release/0.24, epic-2 epicBranch with child task-9, task-8 PR #31, main 2 ahead (grows with landings on main), new PRs numbered from #32.
- 2026-10-16T06:23:16.621Z: [claude] Done on branch dispatch/task-120 (commit 8456f21): hello features gain target, pull-request, merge-to; bridge carries branches, unpushed, openPullRequest, mergeReview's `to`, patchTask's landsOn/epicBranch, and review adds epicBranch + target; link:dev answers each with fixtures (task-3 landsOn, epic-2 own branch, #31, main 2 ahead); desktop/link.md is the full canonical contract with queue described for task-123. Tests: 6 new in link.test.ts, older-phone calls unchanged; full validation green (root npm test, desktop typecheck + test, electron build). brainfile-mobile untouched.
