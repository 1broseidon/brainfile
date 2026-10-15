---
id: task-94
title: "QA: the trunk said when it is ahead of origin, in Ready to merge and the feed"
column: todo
position: 10
description: |-
  Not a hand-off. Tests spec-18's note: landing never pushes, so the app says when the trunk has commits origin lacks.
  1. `git fetch origin`, then `git rev-list --count origin/main..main`. Today main is ahead of origin (unpushed commits), so this is more than 0.
  2. The Ready to merge group's header, and the feed, say `main is N commits ahead of origin` with that N, in faint mono. There is no push key.
  3. If main is level with origin when you run this: make a throwaway commit on main (`git commit --allow-empty -m qa`), see the line say 1, then `git reset --hard HEAD~1` (only when that empty commit is the tip) and see it go.
tags:
  - qa
  - spec-18
parentId: epic-8
dependsOn:
  - task-89
subtasks:
  - id: task-94-1
    title: The header and the feed say main is N commits ahead of origin, with N matching git
    completed: false
  - id: task-94-2
    title: No push key; nothing is pushed
    completed: false
  - id: task-94-3
    title: The line goes when main is level with origin
    completed: false
createdAt: "2026-10-15T18:20:41.345Z"
---

## Description
Not a hand-off. Tests spec-18's note: landing never pushes, so the app says when the trunk has commits origin lacks.
1. `git fetch origin`, then `git rev-list --count origin/main..main`. Today main is ahead of origin (unpushed commits), so this is more than 0.
2. The Ready to merge group's header, and the feed, say `main is N commits ahead of origin` with that N, in faint mono. There is no push key.
3. If main is level with origin when you run this: make a throwaway commit on main (`git commit --allow-empty -m qa`), see the line say 1, then `git reset --hard HEAD~1` (only when that empty commit is the tip) and see it go.
