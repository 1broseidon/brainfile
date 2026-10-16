---
id: task-119
title: "Live check of the new runner: append one line to qa/runner-live.md on the qa/runner branch"
column: in-progress
position: 2
description: |-
  **For the agent this is handed to:** append one line to `qa/runner-live.md` (make the folder and file if missing; the repo's .gitignore ignores qa/, so add it with `git add -f`): `- live runner check (<task id>): <the time now, ISO>, run by <your agent name>`. Commit it on your branch. Change nothing else. Then leave a short note on this task saying what you did and move it to Review.

  **What this checks (for Claude, not the agent):** the first live hand-off through core's shared Runner on this Mac (task-117's last subtask). Queued from the CLI, claimed and started by the desktop's runner; the claim on the record, a run file in state/runs, the worktree forked from qa/runner (landsOn), the worker's role and the app's own CLI as its board server, then `brainfile land` from the CLI and the claim given back. It lands on the throwaway local branch qa/runner, never main.
tags:
  - qa
  - live-runner
parentId: task-117
createdAt: "2026-10-16T05:46:33.299Z"
landsOn: qa/runner
updatedAt: "2026-10-16T05:46:56.010Z"
dispatch:
  agent: claude
  model: haiku
  by: cli
  at: "2026-10-16T05:46:43.129Z"
  until: review
  tries: 1
  claim:
    host: Georges-Mac-Studio
    runner: desktop
    pid: 20499
    at: "2026-10-16T05:46:44.337Z"
assignee: claude
---

## Description
**For the agent this is handed to:** append one line to `qa/runner-live.md` (make the folder and file if missing; the repo's .gitignore ignores qa/, so add it with `git add -f`): `- live runner check (<task id>): <the time now, ISO>, run by <your agent name>`. Commit it on your branch. Change nothing else. Then leave a short note on this task saying what you did and move it to Review.

**What this checks (for Claude, not the agent):** the first live hand-off through core's shared Runner on this Mac (task-117's last subtask). Queued from the CLI, claimed and started by the desktop's runner; the claim on the record, a run file in state/runs, the worktree forked from qa/runner (landsOn), the worker's role and the app's own CLI as its board server, then `brainfile land` from the CLI and the claim given back. It lands on the throwaway local branch qa/runner, never main.
