---
id: task-37
title: "Light code review: spec-16 phase 1 (dispatch from the desktop chat)"
column: todo
position: 4
description: |-
  A very quick, light review of spec-16 phase 1 as merged in 2ad5bc9 (feature commit e7280cc: `git show e7280cc`): the desktop's in-app MCP server (dispatch, runs, stop) and the chat showing hand-offs under the reply.

  Surface only highly critical issues: data loss, board corruption, broken worktree/branch isolation (decision-2), security problems, crashes, or dispatch/stop doing the wrong thing. Skip style, naming, nits and nice-to-haves.

  Do not change code. For each critical issue found, create a follow-up task under spec-16 with the brainfile tools (title, file:line, the failure scenario). Then note a one-line verdict on this task ("no critical issues" or the follow-up IDs) and move it to review.
priority: high
tags:
  - review
  - desktop
  - dispatch
parentId: spec-16
decisions:
  - decision-2
createdAt: "2026-10-12T23:37:06.928Z"
assignee: codex
dispatch:
  agent: codex
  model: gpt-6.1-sol
  by: chat
  at: "2026-10-12T23:37:08.343Z"
updatedAt: "2026-10-12T23:37:08.443Z"
---

## Description
A very quick, light review of spec-16 phase 1 as merged in 2ad5bc9 (feature commit e7280cc: `git show e7280cc`): the desktop's in-app MCP server (dispatch, runs, stop) and the chat showing hand-offs under the reply.

Surface only highly critical issues: data loss, board corruption, broken worktree/branch isolation (decision-2), security problems, crashes, or dispatch/stop doing the wrong thing. Skip style, naming, nits and nice-to-haves.

Do not change code. For each critical issue found, create a follow-up task under spec-16 with the brainfile tools (title, file:line, the failure scenario). Then note a one-line verdict on this task ("no critical issues" or the follow-up IDs) and move it to review.
