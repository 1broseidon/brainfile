---
id: task-62
title: "Merge lands from the worktree: a conflict said before, checks run there, the trunk moved by compare-and-swap"
column: todo
position: 5
priority: medium
tags:
  - git
  - dispatch
  - desktop
relatedFiles:
  - desktop/src/agents/worktree.ts
  - desktop/src/renderer/components/Review.svelte
parentId: epic-4
dependsOn:
  - task-61
decisions:
  - decision-12
contract:
  status: draft
  deliverables:
    - type: file
      path: desktop/src/agents/worktree.ts
      description: Land from the worktree by compare-and-swap
    - type: test
      path: desktop/test/worktree.test.ts
      description: Landing cases
  validation:
    commands:
      - cd desktop && npm run typecheck && npm test
createdAt: "2026-10-14T15:16:09.885Z"
updatedAt: "2026-10-14T19:11:56.608Z"
---

## Description
decision-12. Today mergeReview runs git merge --no-ff in the person's own folder and aborts on a conflict (worktree.ts:201-226). Instead: Review says whether the branch conflicts with the trunk now, with git merge-tree --write-tree --name-only (nothing written; git 2.38+). Merge brings the trunk into the branch inside the task's worktree, runs the contract's validation (else the repository's checks), makes the landing commit 'Merge task-N: title' with git commit-tree on the trunk tip and the branch, and moves the trunk with git update-ref <trunk> <new> <old>; if the trunk moved, it starts again from the new tip. One landing at a time per repository. When the person's checkout is on the trunk it follows with git merge --ff-only, which works around uncommitted changes in other files; if the landing touches a file they changed, it waits and names the file. The worktree and branch go once landed, as today. Tests with a scratch repository: the trunk moved meanwhile, a conflict, a failing check, a person's checkout with changes on the trunk.

## Log
- 2026-10-14T20:43:04.480Z: [claude] Part of this is in (2026-10-14, unnumbered task under epic-4): Merge runs the contract's validation in the hand-off's worktree before merging. Still task-62's: bringing the trunk into the branch first, so the checks see the merged result, and the compare-and-swap landing.
