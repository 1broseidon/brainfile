---
id: task-38
title: Prevent concurrent dispatches from sharing a task worktree
description: "desktop/src/agents/agents.ts:846 (busy check: desktop/src/agents/desk.ts:91). Two concurrent desk dispatch calls for the same board/task both pass liveOn before either awaits recordDispatch. After the host replies, both call startDispatch without rechecking or reserving the task. prepareWorktree reuses dispatch/<task-id>, so two agents edit and commit in the same checkout, breaking decision-2 and risking lost changes. Reproduced with actual deskTools and a deferred start matching the host-write await: both calls succeed and start two runs. Reserve atomically before awaiting and cover desk/Hand to overlap; release reservation on failure."
priority: critical
relatedFiles:
  - desktop/src/agents/agents.ts
  - desktop/src/agents/desk.ts
parentId: spec-16
decisions:
  - decision-2
createdAt: "2026-10-12T23:38:24.028Z"
assignee: claude
updatedAt: "2026-10-13T19:57:32.505Z"
completedAt: "2026-10-13T19:57:32.505Z"
---

## Description
desktop/src/agents/agents.ts:846 (busy check: desktop/src/agents/desk.ts:91). Two concurrent desk dispatch calls for the same board/task both pass liveOn before either awaits recordDispatch. After the host replies, both call startDispatch without rechecking or reserving the task. prepareWorktree reuses dispatch/<task-id>, so two agents edit and commit in the same checkout, breaking decision-2 and risking lost changes. Reproduced with actual deskTools and a deferred start matching the host-write await: both calls succeed and start two runs. Reserve atomically before awaiting and cover desk/Hand to overlap; release reservation on failure.

## Log
- 2026-10-13T00:02:40.373Z: [claude] Reserved the task atomically before any await: desk.ts holds it from the busy check until start settles; agents.ts reserve() is shared by desk start (across recordDispatch) and Hand to… (which now also refuses a live task); merge/discard wait out a starting hand-off; released on success, failure or throw. Tests cover overlapping deferred starts and release on fail/throw (fails without the fix). Commit 5e54ec2 on branch dispatch/task-38.
