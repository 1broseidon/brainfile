---
id: task-105
title: "Test: a hand-off that asks for approval before it runs a shell command"
column: todo
position: 8
description: A test of the approval prompt in the dock. Change no code. In the worktree, run `git status` and `node --version` through the shell, which should ask the person for approval first, then leave a note on this task with both outputs and move it to review.
tags:
  - test
  - dispatch
  - permissions
contract:
  status: ready
  deliverables:
    - type: research
      path: task log
      description: the output of git status and node --version, run after the person approved them, noted on this task
  validation:
    commands:
      - git diff --quiet main
  constraints:
    - Change no files in the repository
    - Run the commands through the shell so the person is asked to approve them
  metrics:
    readyAt: "2026-10-15T21:03:53.595Z"
createdAt: "2026-10-15T21:03:53.603Z"
dispatch:
  agent: claude
  model: opus
  effort: high
  by: chat
  at: "2026-10-15T21:03:56.172Z"
assignee: claude
updatedAt: "2026-10-15T21:03:56.291Z"
---

## Description
A test of the approval prompt in the dock. Change no code. In the worktree, run `git status` and `node --version` through the shell, which should ask the person for approval first, then leave a note on this task with both outputs and move it to review.
