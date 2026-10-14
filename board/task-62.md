---
id: task-62
title: "Merge lands from the worktree: a conflict said before, checks run there, the trunk moved by compare-and-swap"
column: review
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
  status: delivered
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
  metrics:
    pickedUpAt: "2026-10-14T20:51:17.010Z"
    reworkCount: 0
    deliveredAt: "2026-10-14T20:54:54.175Z"
    duration: 217
createdAt: "2026-10-14T15:16:09.885Z"
updatedAt: "2026-10-14T20:54:54.175Z"
---

## Description
decision-12. Today mergeReview runs git merge --no-ff in the person's own folder and aborts on a conflict (worktree.ts:201-226). Instead: Review says whether the branch conflicts with the trunk now, with git merge-tree --write-tree --name-only (nothing written; git 2.38+). Merge brings the trunk into the branch inside the task's worktree, runs the contract's validation (else the repository's checks), makes the landing commit 'Merge task-N: title' with git commit-tree on the trunk tip and the branch, and moves the trunk with git update-ref <trunk> <new> <old>; if the trunk moved, it starts again from the new tip. One landing at a time per repository. When the person's checkout is on the trunk it follows with git merge --ff-only, which works around uncommitted changes in other files; if the landing touches a file they changed, it waits and names the file. The worktree and branch go once landed, as today. Tests with a scratch repository: the trunk moved meanwhile, a conflict, a failing check, a person's checkout with changes on the trunk.

## Log
- 2026-10-14T20:43:04.480Z: [claude] Part of this is in (2026-10-14, unnumbered task under epic-4): Merge runs the contract's validation in the hand-off's worktree before merging. Still task-62's: bringing the trunk into the branch first, so the checks see the merged result, and the compare-and-swap landing.
- 2026-10-14T20:43:09.116Z: [claude] That task is task-70.
- 2026-10-14T20:54:54.587Z: [claude] Built on main (uncommitted). worktree.ts landReview: the trunk is merged into the branch in the task's worktree (a conflict aborts and returns its files), the check runs there on the result, commit-tree makes 'Merge task-N: title' on the old tip and the branch, and the trunk moves only from that tip: merge --ff-only when the checkout is on it (keeps uncommitted changes in other files; one that would be overwritten refuses and names the file), else update-ref <new> <old>; a moved trunk starts the round again (5 at most). Serial per repository (a promise chain). Returns landed / refused / conflict {files} / check {command, output} for task-63. reviewOf says conflicts (merge-tree --name-only); Review shows 'Conflicts with main in …'; the checkout gating is gone from all three Merge keys. 'Else the repository's checks' is not done: with no contract validation nothing runs. 5 new landing tests (27 in worktree.test.ts); 194/194, typecheck clean. Real app on the demo board: merged from the feed with the folder on another branch; main moved, the folder did not, the task completed.
