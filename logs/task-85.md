---
id: task-85
title: "Link: the merge feature on the desk — readyToMerge, mergeReview, discardReview"
priority: high
tags:
  - desktop
  - link
  - merge
assignee: claude
relatedFiles:
  - desktop/src/link/bridge.ts
  - desktop/src/link/server.ts
  - desktop/src/link/dev.ts
parentId: epic-7
createdAt: "2026-10-15T01:34:58.774Z"
updatedAt: "2026-10-15T02:09:03.220Z"
completedAt: "2026-10-15T02:09:03.220Z"
---

## Description
brainfile-mobile docs/link.md › Merge from the phone is the contract (commit b60d444). The desk names `merge` in its hello's features and lets the three window calls through the bridge with checked arguments; npm run link:dev's fake desk answers them with a ready hand-off and a conflicting one, so the phone can be built against the simulator. Copy the contract into the desktop's docs where link.md is referenced; design.md › Phone says what the phone can now do.

## Log
- 2026-10-15T01:43:19.767Z: [claude] Done on dispatch/task-85, commit 509a1ae. Hello names merge (server.ts LINK_FEATURES ['effort','merge']). bridge.ts CALLS lets through readyToMerge(projectId), mergeReview(projectId, taskId), discardReview(projectId, taskId), project: true; they go to the agents process exactly as the window's (AGENT_METHODS, same callAgents). A phone's mergeReview also completes the task when it is still on the board, as the window's Merge (contract: 'lands it and completes the task'); if completion fails the answer is ok with 'Merged. task-N stays open: <error>'. Server answers by id and does not serialize per connection (frame() is fire-and-forget), agents process handles each request async, no desk-side timeout: a long merge stalls nothing (test proves it). Window refresh: a merge completes the task, the host publishes the board, receive() -> refreshReady; a discard writes nothing, so linkDesk now calls settled(projectId) and main sends a new CHANNEL.ready to the window, which runs refreshReady(projectId, true) (api.onReadyChanged, preload, state.svelte.ts). link:dev: new src/link/devReviews.ts; on brainfile task-7 (new fixture, review, claude) can merge +42 -7, 3 commits into main, Merge waits 2 s then lands; task-5 (codex) conflicts in src/a.ts, Merge answers 'task-5 conflicts with main in src/a.ts: sent back to Codex to settle (1 of 1)' (the real desk's wording) and starts a fake Codex run, after which it can merge; Discard drops either; review agrees. Docs: desktop/link.md, desktop/design.md (Phone: what a phone can do). Tests: 5 new in test/link.test.ts; npm test 217/217, typecheck clean. No prettier in repo. Not run: link:dev itself (would wipe a running instance's copies), the Electron app.
