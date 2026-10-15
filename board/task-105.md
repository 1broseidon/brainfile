---
id: task-105
title: "Test: a hand-off that asks for approval before it runs a shell command"
column: review
position: 8
description: A test of the approval prompt in the dock. Change no code. In the worktree, run `git status` and `node --version` through the shell, which should ask the person for approval first, then leave a note on this task with both outputs and move it to review.
tags:
  - test
  - dispatch
  - permissions
contract:
  status: delivered
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
    pickedUpAt: "2026-10-15T21:04:04.998Z"
    reworkCount: 0
    deliveredAt: "2026-10-15T21:04:13.521Z"
    duration: 9
createdAt: "2026-10-15T21:03:53.603Z"
dispatch:
  agent: claude
  model: opus
  effort: high
  by: chat
  at: "2026-10-15T21:03:56.172Z"
assignee: claude
updatedAt: "2026-10-15T21:04:13.521Z"
---

## Description
A test of the approval prompt in the dock. Change no code. In the worktree, run `git status` and `node --version` through the shell, which should ask the person for approval first, then leave a note on this task with both outputs and move it to review.

## Log
- 2026-10-15T21:04:13.120Z: [claude] Ran both commands through the shell tool in the worktree. `git status` gave: "Not currently on any branch. nothing to commit, working tree clean". `node --version` gave: "v26.11.1". Both commands ran. From the agent's side I cannot see whether an approval prompt appeared or was answered, so whoever reviews this should confirm in the dock that it asked. No files changed; `git diff --quiet main` passes.
