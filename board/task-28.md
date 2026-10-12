---
id: task-28
title: "spec-15 phase 2: backups as refs, merge-boards and adopt"
column: in-progress
position: 2
priority: high
tags:
  - sync
  - git
  - integrity
assignee: claude
parentId: spec-15
createdAt: "2026-10-12T20:39:18.720Z"
updatedAt: "2026-10-12T20:52:17.347Z"
---

## Description
refs/brainfile/backups/<UTC timestamp> before any replace or merge; brainfile backups / backups restore. merge-boards <ref|path> on the field-level merge with ID collisions renumbered and references rewritten; adopt <ref>; containment adopts without a question. Covers spec-15-3, spec-15-4.

## Log
- 2026-10-12T21:01:15.866Z: [claude] Phase 2 done (feat/board-integrity, daf9201). core/src/repo/consolidate.ts: adoptBoard, mergeBoards, mergeBoardFiles, restoreBackup, listBackups, untrackBoardOnCodeBranch; CLI adopt / merge-boards / backups [restore <name>] (MCP-excluded as the person's call). Tests: core repo-consolidate 9 (runprism end to end via merge-boards, keep-this, unrelated origin merge then fast-forward push, restore, refusal-before-write, ID collision renumbering with reference rewrite, LWW + log union, completion wins, untrack keeps other staged work), cli board-integrity +2. Suites: core 878/878, desktop 189/189 + 7 node, cli 613/622 (baseline 9). Found and fixed: the stray checkout got a hand-edit commit before a refusal; all refusals now precede writes.
