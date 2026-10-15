---
id: task-92
title: "QA hand-off 3: Open pull request, followed until GitHub merges it, which completes the task"
column: in-progress
position: 10
description: |-
  **For the agent this is handed to:** append one line to `qa/parity-wave-1.md` (make the file and the folder if they are not there): `- QA hand-off 3 (<task id>): landed through a pull request, <the time now, ISO>`. Commit it on your branch. Change nothing else, and do not tick this task's subtasks: they are the person's checks. Then do as your brief says when you finish.

  **For the person (QA).** Tests spec-18-4 and spec-18-5. It pushes `dispatch/<this task>` to GitHub and opens a real pull request into `qa/parity` on 1broseidon/brainfile.
  1. Hand it off. When it is in Ready to merge, hover its row: a "PR" key is beside Merge. Review shows "Open pull request" beside Merge too.
  2. Press it. On GitHub: the branch `dispatch/<this task>` is there, and a pull request into `qa/parity` titled as this task, whose body has the task id, its description's first lines and its last notes.
  3. In the app: it has left Ready to merge, its row shows `#N` as a link, and the feed lists it under "Open pull requests". `bfq show -t <this task>` has `pullRequest:` with `state: open`; the log has a line for it.
  4. Merge is refused while it is open: Merge on the phone (or from the review) says it has pull request #N open.
  5. `bfq pr <this task> --status` says open, with the link.
  6. Merge the pull request on GitHub; a squash merge is the harder case, so use that. Keep the window open: within about a minute the task completes, and its worktree and local branch are gone (`git worktree list`, `git branch`).
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
  - id: task-92-1
    title: Ready to merge row and Review offer Open pull request
    completed: true
  - id: task-92-2
    title: GitHub has the branch and a PR into qa/parity with the task's title and body
    completed: true
  - id: task-92-3
    title: "The item leaves Ready to merge; the row shows #N; the feed lists it; the task records pullRequest: open"
    completed: false
  - id: task-92-4
    title: Merge is refused while the PR is open
    completed: false
  - id: task-92-5
    title: bfq pr --status says open with the link
    completed: true
  - id: task-92-6
    title: Squash-merged on GitHub, the task completes within a minute and its worktree and branch go
    completed: false
createdAt: "2026-10-15T18:20:40.775Z"
assignee: claude
updatedAt: "2026-10-15T20:00:26.524Z"
dispatch:
  agent: claude
  model: opus
  effort: high
  by: person
  at: "2026-10-15T19:28:54.188Z"
pullRequest:
  number: 6
  url: https://github.com/1broseidon/brainfile/pull/6
  state: merged
  base: qa/parity
  head: dispatch/task-92
  at: "2026-10-15T19:45:42.902Z"
---

## Description
**For the agent this is handed to:** append one line to `qa/parity-wave-1.md` (make the file and the folder if they are not there): `- QA hand-off 3 (<task id>): landed through a pull request, <the time now, ISO>`. Commit it on your branch. Change nothing else, and do not tick this task's subtasks: they are the person's checks. Then do as your brief says when you finish.

**For the person (QA).** Tests spec-18-4 and spec-18-5. It pushes `dispatch/<this task>` to GitHub and opens a real pull request into `qa/parity` on 1broseidon/brainfile.
1. Hand it off. When it is in Ready to merge, hover its row: a "PR" key is beside Merge. Review shows "Open pull request" beside Merge too.
2. Press it. On GitHub: the branch `dispatch/<this task>` is there, and a pull request into `qa/parity` titled as this task, whose body has the task id, its description's first lines and its last notes.
3. In the app: it has left Ready to merge, its row shows `#N` as a link, and the feed lists it under "Open pull requests". `bfq show -t <this task>` has `pullRequest:` with `state: open`; the log has a line for it.
4. Merge is refused while it is open: Merge on the phone (or from the review) says it has pull request #N open.
5. `bfq pr <this task> --status` says open, with the link.
6. Merge the pull request on GitHub; a squash merge is the harder case, so use that. Keep the window open: within about a minute the task completes, and its worktree and local branch are gone (`git worktree list`, `git branch`).

## Log
- 2026-10-15T19:29:18.233Z: [claude] Appended "- QA hand-off 3 (task-92): landed through a pull request, 2026-10-15T19:29:09Z" to qa/parity-wave-1.md, committed on dispatch/task-92 (909947e); nothing else changed, subtasks left for QA. Note: qa/ is matched by a .gitignore rule, but the file is already tracked so the change commits normally. Nothing left unwired.
- 2026-10-15T19:45:43.027Z: Opened pull request #6 from dispatch/task-92 into qa/parity: https://github.com/1broseidon/brainfile/pull/6
- 2026-10-15T20:00:26.224Z: Pull request #6 was merged into qa/parity
- 2026-10-15T20:00:26.524Z: Merged; 3 of 6 subtasks left, so it stays open
