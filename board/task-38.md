---
id: task-38
title: Prevent concurrent dispatches from sharing a task worktree
column: in-progress
position: 1
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
updatedAt: "2026-10-13T00:01:00.645Z"
---

## Description
desktop/src/agents/agents.ts:846 (busy check: desktop/src/agents/desk.ts:91). Two concurrent desk dispatch calls for the same board/task both pass liveOn before either awaits recordDispatch. After the host replies, both call startDispatch without rechecking or reserving the task. prepareWorktree reuses dispatch/<task-id>, so two agents edit and commit in the same checkout, breaking decision-2 and risking lost changes. Reproduced with actual deskTools and a deferred start matching the host-write await: both calls succeed and start two runs. Reserve atomically before awaiting and cover desk/Hand to overlap; release reservation on failure.
