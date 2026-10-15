---
id: task-96
title: "Drill child 2: a line on the epic's branch, after the target was brought in"
description: "Append one line to `qa/parity-wave-1.md`: `- Drill child 2 (<task id>): on <the branch you started from>, after task-95, <the time now, ISO>`. If your brief says to merge a branch into yours first because bringing it in conflicted, do that first and keep both sides' lines. Commit on your branch. Change nothing else."
tags:
  - qa
  - epic-branch
relatedFiles:
  - qa/parity-wave-1.md
parentId: epic-9
dependsOn:
  - task-95
createdAt: "2026-10-15T18:21:00.558Z"
contract:
  status: delivered
  deliverables:
    - type: file
      path: qa/parity-wave-1.md
      description: the file with the Drill child 2 line appended after child 1's
  validation:
    commands:
      - "grep -q '^- Drill child 1 (task-95): on dispatch/' qa/parity-wave-1.md"
      - "grep -Eq '^- Drill child 2 \\(task-96\\): on dispatch/[^,]+, after task-95, [0-9]{4}-[0-9]{2}-[0-9]{2}T' qa/parity-wave-1.md"
      - grep -q '^- QA hand-off 3 (task-92)' qa/parity-wave-1.md
  constraints:
    - Change nothing but qa/parity-wave-1.md; keep every existing line
  metrics:
    readyAt: "2026-10-15T20:56:02.019Z"
    pickedUpAt: "2026-10-15T20:56:36.438Z"
    reworkCount: 0
    deliveredAt: "2026-10-15T20:56:43.613Z"
    duration: 7
updatedAt: "2026-10-15T20:56:47.576Z"
dispatch:
  agent: claude
  model: claude-opus-5-5
  by: lead
  at: "2026-10-15T20:56:26.261Z"
assignee: claude
completedAt: "2026-10-15T20:56:47.576Z"
---

## Description
Append one line to `qa/parity-wave-1.md`: `- Drill child 2 (<task id>): on <the branch you started from>, after task-95, <the time now, ISO>`. If your brief says to merge a branch into yours first because bringing it in conflicted, do that first and keep both sides' lines. Commit on your branch. Change nothing else.

## Log
- 2026-10-15T20:56:43.134Z: [claude] Appended "- Drill child 2 (task-96): on dispatch/epic-9, after task-95, 2026-10-15T20:56:40Z" to qa/parity-wave-1.md after child 1's line, all existing lines kept; committed as 9b82cab on dispatch/task-96 (one file, one line). All three validation greps pass. No merge was needed: the brief asked for none and dispatch/epic-9 already had task-95's line. For the next child: qa/ is gitignored but the file is tracked, so stage it with `git add -f` or `git commit -a`. Nothing left unwired.
