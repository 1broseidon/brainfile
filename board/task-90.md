---
id: task-90
title: "QA hand-off 1: Lands on, inherited from the epic, and Merge onto qa/parity with main untouched"
column: in-progress
position: 10
description: |-
  **For the agent this is handed to:** append one line to `qa/parity-wave-1.md` (make the file and the folder if they are not there): `- QA hand-off 1 (<task id>): landed through Merge, <the time now, ISO>`. Commit it on your branch. Change nothing else, and do not tick this task's subtasks: they are the person's checks. Then do as your brief says when you finish.

  **For the person (QA).** Tests the Lands on picker (spec-18-3), forking from and landing on a target (spec-18-2), and task-76's landing in core.
  1. Open Hand to… on this task. Under the agents it says "Lands on qa/parity · from epic-8".
  2. Open the picker: it lists the trunk, local branches and recent targets, never `dispatch/*` or `brainfile`. Choose qa/parity (what it inherits): the task file gets no `landsOn` of its own (`bfq show -t <this task>`).
  3. Hand it to an agent. `git worktree list` shows its worktree on `dispatch/<this task>`, and `git config branch.dispatch/<this task>.brainfileBase` says `qa/parity`.
  4. When it is in Review / Ready to merge: the review says it is from qa/parity, and the key reads "Merge into qa/parity".
  5. Merge. `git log --oneline -3 qa/parity` shows `Merge <this task>: …`; `git log main` does not; `git show qa/parity:qa/parity-wave-1.md` has the line. The worktree and `dispatch/<this task>` are gone, and the task is done.
tags:
  - qa
  - spec-18
  - hand-off
relatedFiles:
  - qa/parity-wave-1.md
parentId: epic-8
dependsOn:
  - task-89
subtasks:
  - id: task-90-1
    title: Hand to… says Lands on qa/parity · from epic-8
    completed: false
  - id: task-90-2
    title: The picker lists the trunk, branches and recent targets, no dispatch/* or brainfile
    completed: false
  - id: task-90-3
    title: Choosing what it inherits writes no landsOn
    completed: false
  - id: task-90-4
    title: The worktree is on dispatch/<task>, with brainfileBase qa/parity
    completed: false
  - id: task-90-5
    title: Review says from qa/parity and Merge into qa/parity
    completed: false
  - id: task-90-6
    title: "After Merge: the line is on qa/parity and not on main; worktree and branch gone; task done"
    completed: false
createdAt: "2026-10-15T18:20:11.927Z"
assignee: claude
updatedAt: "2026-10-15T19:04:47.241Z"
dispatch:
  agent: claude
  model: opus
  effort: high
  by: person
  at: "2026-10-15T19:04:25.963Z"
---

## Description
**For the agent this is handed to:** append one line to `qa/parity-wave-1.md` (make the file and the folder if they are not there): `- QA hand-off 1 (<task id>): landed through Merge, <the time now, ISO>`. Commit it on your branch. Change nothing else, and do not tick this task's subtasks: they are the person's checks. Then do as your brief says when you finish.

**For the person (QA).** Tests the Lands on picker (spec-18-3), forking from and landing on a target (spec-18-2), and task-76's landing in core.
1. Open Hand to… on this task. Under the agents it says "Lands on qa/parity · from epic-8".
2. Open the picker: it lists the trunk, local branches and recent targets, never `dispatch/*` or `brainfile`. Choose qa/parity (what it inherits): the task file gets no `landsOn` of its own (`bfq show -t <this task>`).
3. Hand it to an agent. `git worktree list` shows its worktree on `dispatch/<this task>`, and `git config branch.dispatch/<this task>.brainfileBase` says `qa/parity`.
4. When it is in Review / Ready to merge: the review says it is from qa/parity, and the key reads "Merge into qa/parity".
5. Merge. `git log --oneline -3 qa/parity` shows `Merge <this task>: …`; `git log main` does not; `git show qa/parity:qa/parity-wave-1.md` has the line. The worktree and `dispatch/<this task>` are gone, and the task is done.

## Log
- 2026-10-15T19:05:12.729Z: [claude] Made qa/parity-wave-1.md with "- QA hand-off 1 (task-90): landed through Merge, 2026-10-15T19:04:47Z", committed as 9e2aa24 on dispatch/task-90 (forked from qa/parity). Nothing else changed and the subtasks are left for QA. For whoever comes next: .gitignore ignores everything outside its allowlist (/*), and qa/ isn't on it, so I had to force-add the file (git add -f). Now that it's tracked, later appends commit normally. A new file under qa/ would need -f again, or an !/qa/ line in .gitignore. Nothing is left unwired.
