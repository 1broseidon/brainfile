---
id: task-101
title: "QA sign-off: land parity/integration on main, move the app back, and tidy what QA made"
description: |-
  Last. When every other task under epic-8 is done (or its failures have qa-bug tasks you are happy to fix after landing), ask Claude to sign off. What it does:
  1. Fix any qa-bug tasks you want fixed first, on parity/integration, with the suites run again.
  2. Merge `parity/integration` into `main` (local; nothing is pushed until you say so) and complete task-74 to task-78 and spec-18.
  3. Move the dev app back to your checkout: stop the one in `~/.brainfile-worktrees/parity/integration/desktop` and run `npm run dev` in `desktop/`.
  4. Tidy: delete `qa/parity` here and on origin (`git push origin --delete qa/parity`) and any `dispatch/task-9x` left on origin, remove the `~/.brainfile-worktrees/parity/*` worktrees and their `parity/*` branches, and complete or delete epic-9.
  5. Then epic-6's next wave: task-79, task-80 and task-81 (the shared runner), then task-82, task-83, task-84 and task-88.
tags:
  - qa
  - sign-off
parentId: epic-8
subtasks:
  - id: task-101-1
    title: Every QA task done, or its failures filed as qa-bug
    completed: true
  - id: task-101-2
    title: parity/integration merged into main (not pushed)
    completed: true
  - id: task-101-3
    title: task-74 to task-78 and spec-18 completed
    completed: true
  - id: task-101-4
    title: The dev app runs from the checkout again
    completed: true
  - id: task-101-5
    title: qa/parity, leftover dispatch branches, the parity worktrees and epic-9 tidied
    completed: true
createdAt: "2026-10-15T18:21:51.258Z"
dependsOn:
  - task-89
  - task-90
  - task-91
  - task-92
  - task-93
  - task-94
  - task-97
  - task-98
  - task-99
  - task-100
updatedAt: "2026-10-15T21:19:18.296Z"
completedAt: "2026-10-15T21:19:18.296Z"
---

## Description
Last. When every other task under epic-8 is done (or its failures have qa-bug tasks you are happy to fix after landing), ask Claude to sign off. What it does:
1. Fix any qa-bug tasks you want fixed first, on parity/integration, with the suites run again.
2. Merge `parity/integration` into `main` (local; nothing is pushed until you say so) and complete task-74 to task-78 and spec-18.
3. Move the dev app back to your checkout: stop the one in `~/.brainfile-worktrees/parity/integration/desktop` and run `npm run dev` in `desktop/`.
4. Tidy: delete `qa/parity` here and on origin (`git push origin --delete qa/parity`) and any `dispatch/task-9x` left on origin, remove the `~/.brainfile-worktrees/parity/*` worktrees and their `parity/*` branches, and complete or delete epic-9.
5. Then epic-6's next wave: task-79, task-80 and task-81 (the shared runner), then task-82, task-83, task-84 and task-88.

## Log
- 2026-10-15T21:19:18.021Z: [claude] Signed off (Claude, at the person's go):
- parity/integration fast-forwarded main from 2cff04e to f9a03b9 (25 commits). Then 7457249: the desktop lockfile records core's new ACP SDK dependency, so npm ci agrees. Not pushed: main is now 37 ahead of origin.
- On main in the checkout: core 1115, CLI 657 + 189, desktop typecheck clean and 189 tests.
- task-74 to task-78 and spec-18 completed.
- The dev app runs from the checkout again, with no errors.
- Removed the eight parity worktrees and their branches (each clean and merged). Deleted qa/parity here and on origin, and dispatch/task-92 and dispatch/task-93 on origin.
Follow-ups filed: task-103 (feed), task-104 (Antigravity sign-in), task-106 (mode selector in the chat box).
- 2026-10-15T21:19:23.726Z: [claude] Correction: main is 36 commits ahead of origin, not 37.
