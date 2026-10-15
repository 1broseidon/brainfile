---
id: task-86
title: "Mobile: Merge from the phone — Ready to merge on the board, Merge and Send back on the task, Waiting on you in Projects"
column: in-progress
position: 4
priority: high
tags:
  - mobile
  - merge
  - parity
assignee: claude
parentId: epic-7
createdAt: "2026-10-15T01:34:59.268Z"
updatedAt: "2026-10-15T01:35:09.188Z"
---

## Description
Behind the link's `merge` feature (docs/link.md). Board: a Ready to merge group above every column, every one shown (it is the person's queue, not a glance), each row the task with +added −removed as its one signal and Merge as its swipe action; a conflicting hand-off stays in its column with `conflicts` in the warn colour and Send back. Task sheet: the review gets Merge into <branch> (the sheet's one accent key, `Checking…` while it lands), Send back… (a note, then the same agent), Discard (asked once, in place); `Merged · remove worktree` when already in. Projects: Waiting on you pinned on top across linked boards, each row its board, ID and lines, Merge or Send back; gone when empty. Silent success; a send-back is news. Older desk: read-only review as today.

## Log
- 2026-10-15T01:50:12.474Z: [claude] Built on branch task-86 of brainfile-mobile (worktree brainfile-mobile-wt/task-86), commit c8f6acd. Link: src/link/ready.ts (ReadyStore: readyToMerge on board open / board event throttled 5s per board / dispatch run end / after merge+discard / every ready project on connect; mergeReview via new LinkManager.callWithin with 10 min; settleOutcome, failedChecksNote, sendBackNote, splitReady, waitingOn; everything gated on hello features 'merge'), src/link/api.ts (ReadyView, ReviewView.conflicts), src/state/link.ts (ready store, useReady(projectId): ReadyView[] | null, useReadyState(), sendBack()). Screens: Board (Ready to merge group, conflicts in column, swipe + context menu), components/Swipe.tsx (SwiftUI swipeActions: each row hosted as the one row of a non-scrolling List), rows.tsx (MergeSignal, shared GroupHeader), TaskAgents.tsx (review keys: Merge into main / Checking… / Merged · remove worktree / Send back to settle, Send back… note field, Discard asked in place), Projects (Waiting on you). Tests: tests/ready.test.ts, 15 tests; npm run check green (140 tests, tsc, prettier). Not verified on simulator or phone: the SwiftUI List-hosted swipe rows (height from onLayout, safe area, tap passthrough) need eyeballing. npm ci needed --legacy-peer-deps in the worktree (lockfile peer conflict react-dom 19.3).
