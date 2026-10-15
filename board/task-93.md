---
id: task-93
title: "QA hand-off 4: a pull request closed without merging puts the work back in Ready to merge, where Discard lets it go"
column: review
position: 5
description: |-
  **For the agent this is handed to:** append one line to `qa/parity-wave-1.md` (make the file and the folder if they are not there): `- QA hand-off 4 (<task id>): its pull request was closed unmerged, <the time now, ISO>`. Commit it on your branch. Change nothing else, and do not tick this task's subtasks: they are the person's checks. Then do as your brief says when you finish.

  **For the person (QA).** Tests spec-18-5's other half, and that Discard still works now worktrees live in core (task-76).
  1. Hand it off; when it is in Ready to merge, open a pull request from it (the "PR" key).
  2. On GitHub, close the pull request without merging.
  3. Keep the window open: within about a minute it is back in Ready to merge, and `bfq show -t <this task>` has `pullRequest:` with `state: closed`.
  4. Discard it from Review. The worktree and `dispatch/<this task>` are gone, `qa/parity` has no line from it, and the task stays open. Then delete the branch on GitHub, and complete this task by hand once the checks pass.
tags:
  - qa
  - spec-18
  - pull-request
  - hand-off
relatedFiles:
  - qa/parity-wave-1.md
parentId: epic-8
dependsOn:
  - task-89
subtasks:
  - id: task-93-1
    title: A PR opened from Ready to merge
    completed: false
  - id: task-93-2
    title: Closed unmerged on GitHub, it is back in Ready to merge within a minute, recorded as closed
    completed: false
  - id: task-93-3
    title: Discard lets the worktree and branch go, lands nothing, and leaves the task open
    completed: false
createdAt: "2026-10-15T18:20:41.058Z"
assignee: claude
updatedAt: "2026-10-15T20:22:22.186Z"
dispatch:
  agent: claude
  model: opus
  effort: high
  by: person
  at: "2026-10-15T20:22:03.351Z"
---

## Description
**For the agent this is handed to:** append one line to `qa/parity-wave-1.md` (make the file and the folder if they are not there): `- QA hand-off 4 (<task id>): its pull request was closed unmerged, <the time now, ISO>`. Commit it on your branch. Change nothing else, and do not tick this task's subtasks: they are the person's checks. Then do as your brief says when you finish.

**For the person (QA).** Tests spec-18-5's other half, and that Discard still works now worktrees live in core (task-76).
1. Hand it off; when it is in Ready to merge, open a pull request from it (the "PR" key).
2. On GitHub, close the pull request without merging.
3. Keep the window open: within about a minute it is back in Ready to merge, and `bfq show -t <this task>` has `pullRequest:` with `state: closed`.
4. Discard it from Review. The worktree and `dispatch/<this task>` are gone, `qa/parity` has no line from it, and the task stays open. Then delete the branch on GitHub, and complete this task by hand once the checks pass.

## Log
- 2026-10-15T20:22:21.804Z: [claude] Appended "- QA hand-off 4 (task-93): its pull request was closed unmerged, 2026-10-15T20:21:33Z" to qa/parity-wave-1.md and committed it (77a773b) on dispatch/task-93; nothing else changed, subtasks left for the person. Nothing from task-89 needed wiring here.
