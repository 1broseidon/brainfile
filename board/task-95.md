---
id: task-95
title: "Drill child 1: a line on the epic's branch"
column: todo
position: 12
description: "Append one line to `qa/parity-wave-1.md` (make the file and the folder if they are not there): `- Drill child 1 (<task id>): on <the branch you started from>, <the time now, ISO>`. Commit it on your branch. Change nothing else."
tags:
  - qa
  - epic-branch
relatedFiles:
  - qa/parity-wave-1.md
parentId: epic-9
createdAt: "2026-10-15T18:20:54.384Z"
dependsOn:
  - task-89
updatedAt: "2026-10-15T20:55:46.171Z"
contract:
  status: ready
  deliverables:
    - type: file
      path: qa/parity-wave-1.md
      description: the file with the Drill child 1 line appended
  validation:
    commands:
      - "grep -Eq '^- Drill child 1 \\(task-95\\): on dispatch/epic-9, [0-9]{4}-[0-9]{2}-[0-9]{2}T' qa/parity-wave-1.md"
      - grep -q '^- QA hand-off 3 (task-92)' qa/parity-wave-1.md
  constraints:
    - Change nothing but qa/parity-wave-1.md; keep its existing lines
  metrics:
    readyAt: "2026-10-15T20:55:46.170Z"
---

## Description
Append one line to `qa/parity-wave-1.md` (make the file and the folder if they are not there): `- Drill child 1 (<task id>): on <the branch you started from>, <the time now, ISO>`. Commit it on your branch. Change nothing else.
