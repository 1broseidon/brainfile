---
id: task-27
title: "spec-15 phase 1: detect every board; where reports them; writes refuse when boards disagree"
priority: high
tags:
  - sync
  - git
  - integrity
assignee: claude
parentId: spec-15
createdAt: "2026-10-12T20:39:18.204Z"
decisions:
  - decision-1
updatedAt: "2026-10-12T20:52:17.125Z"
completedAt: "2026-10-12T20:52:17.125Z"
---

## Description
core surveyBoards (checkout folder tracked or not, local board branch, remote tracking refs for the configured board name, worktrees of the board branch outside .brainfile/), counts and last change per board, relation by git ancestry within the branch lineage and by content across homes. locateBoard returns the conflict; brainfile where reports every board; CLI preAction, MCP withBoardCommit and the desktop host refuse writes with a resolving error naming the command. Covers spec-15-1, spec-15-2.

## Log
- 2026-10-12T20:52:16.466Z: [claude] Phase 1 done on feat/board-integrity (6f46b42, worktree ../brainfile-wt-board-integrity, branched from feat/desktop-app 250da20). core/src/repo/boards.ts: surveyBoards/boardConflict/boardConflictError/boardConflictRelation; locateBoard carries conflict; where (CLI+MCP) lists boards, behind count, stray worktrees, tracked-twice, --fetch; write guard in CLI preAction (commandWrites), MCP withBoardCommit (toolWrites) and desktop host mutate. Decision-1 records when writes refuse. Tests: core repo-boards (12, real git incl. runprism shape and unrelated remote), cli board-integrity (6). Full suites: core 869/869, desktop 189/189, cli 611/620 with the same 9 pre-existing macOS /private/var failures as baseline. Checked read-only against runprism.ai: reports main's 21-doc copy as tracked twice. Gaps for later phases: the TUI does not guard writes yet; adopt/merge-boards named in errors arrive in phase 2; where's 'Remove it: brainfile migrate --to-branch' hint needs phase 3's untrack path for an already-linked board.
