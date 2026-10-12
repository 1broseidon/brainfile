---
id: task-29
title: "spec-15 phase 3: one home for the board branch; migrate --to-branch finishes the job"
priority: high
tags:
  - sync
  - git
  - integrity
assignee: claude
parentId: spec-15
createdAt: "2026-10-12T20:39:19.176Z"
updatedAt: "2026-10-12T21:07:41.282Z"
completedAt: "2026-10-12T21:07:41.282Z"
---

## Description
where/lint report board-branch worktrees outside .brainfile/, prune ones whose folder is gone; migrate --to-branch untracks .brainfile/ on the code branch and adds it to .gitignore in one commit; end-to-end runprism.ai reproduction on scratch repos. Covers spec-15-5, spec-15-6, spec-15-8.

## Log
- 2026-10-12T21:07:40.419Z: [claude] Phase 3 done (4ef2298). migrate --to-branch: always one untrack commit (untrackBoardOnCodeBranch, rel-aware, detects tracking via HEAD or index since migrate unstages first), linked-board tracked-twice cleanup, two-boards error pointing at merge-boards. pruneLostBoardCheckouts (targeted admin-dir removal, skips locked) in materializeBoardWorktree and lint --fix; survey.outsideHome; lint location issues (two-boards error; board-checkout-elsewhere, board-checkout-lost [fixable], board-tracked-twice warnings). Tests: cli board-integrity now 15 incl. end-to-end through dist/cli.js (where --fetch, refused add, migrate error, merge-boards adopts, add, sync fast-forwards to origin, backups listed). One existing test changed on purpose: migrate without --commit used to leave the removal staged. Suites: core 878/878, desktop 189/189 + 7, cli 620/629 (baseline 9).
