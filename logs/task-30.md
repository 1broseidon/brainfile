---
id: task-30
title: "spec-15 phase 4: desktop two-boards line and health"
priority: high
tags:
  - desktop
  - integrity
assignee: claude
parentId: spec-15
createdAt: "2026-10-12T20:39:19.608Z"
updatedAt: "2026-10-12T21:14:20.695Z"
completedAt: "2026-10-12T21:14:20.695Z"
---

## Description
The board band says 'Two boards: …' with Use theirs / Merge / Keep this one; health covers two boards, stray worktree, ahead/behind the remote, tracked twice, half-done merge. Covers spec-15-7.

## Log
- 2026-10-12T21:14:20.247Z: [claude] Phase 4 done (96a9707). desktop/src/host/integrity.ts (pure view, 4 node tests), host readIntegrity cache (15s TTL, fresh after sync/settle, fetch once on open for plain folder boards only so startup never waits on N fetches), pruneLostBoardCheckouts on open, settleBoards host method; renderer TwoBoardsLine in the band (ask slot), + hidden while two boards, health 'behind' state and per-board short labels + tooltips, ↓N on the sync line; design.md 'Two boards' section. Verified in the built app offscreen (--user-data-dir in scratchpad, real projects.json untouched): band read "Two boards: this folder (7) and origin's (19, newer)." with Use origin's in full ink; pressing it left 19 tasks on the branch at .brainfile/, main's one untrack commit, a -folder backup, health silent. Found there and fixed: settling from origin's copy did not set brainfile.remote, so it would not share back. Suites: core 878/878, desktop 189/189 + 11 node, cli 620/629 (baseline 9).
