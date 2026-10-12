---
id: task-27
title: "spec-15 phase 1: detect every board; where reports them; writes refuse when boards disagree"
column: in-progress
position: 2
priority: high
tags:
  - sync
  - git
  - integrity
assignee: claude
parentId: spec-15
createdAt: "2026-10-12T20:39:18.204Z"
---

## Description
core surveyBoards (checkout folder tracked or not, local board branch, remote tracking refs for the configured board name, worktrees of the board branch outside .brainfile/), counts and last change per board, relation by git ancestry within the branch lineage and by content across homes. locateBoard returns the conflict; brainfile where reports every board; CLI preAction, MCP withBoardCommit and the desktop host refuse writes with a resolving error naming the command. Covers spec-15-1, spec-15-2.
