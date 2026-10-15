---
id: task-94
title: "QA: the trunk said when it is ahead of origin, in Ready to merge and the feed"
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
    completed: true
  - id: task-94-2
    title: No push key; nothing is pushed
    completed: true
  - id: task-94-3
    title: The line goes when main is level with origin
    completed: true
createdAt: "2026-10-15T18:20:41.345Z"
updatedAt: "2026-10-15T20:35:29.299Z"
completedAt: "2026-10-15T20:35:29.299Z"
---

## Description
Not a hand-off. Tests spec-18's note: landing never pushes, so the app says when the trunk has commits origin lacks.
1. `git fetch origin`, then `git rev-list --count origin/main..main`. Today main is ahead of origin (unpushed commits), so this is more than 0.
2. The Ready to merge group's header, and the feed, say `main is N commits ahead of origin` with that N, in faint mono. There is no push key.
3. If main is level with origin when you run this: make a throwaway commit on main (`git commit --allow-empty -m qa`), see the line say 1, then `git reset --hard HEAD~1` (only when that empty commit is the tip) and see it go.

## Log
- 2026-10-15T20:35:29.033Z: [claude] QA passed (person + Claude). The Ready to merge header said "main is 10 commits ahead of origin" (screenshot), matching `git rev-list --count origin/main..main` = 10. The feed showed one line per board that is ahead: "brainfile · main is 10 commits ahead of origin" and "runprism.ai · main is 1 commit ahead of origin". There is no push key and nothing was pushed. I did not test the line going away when level (that needs main pushed); core's unpushed() test covers it. The feed was getting crowded, filed as task-103.
