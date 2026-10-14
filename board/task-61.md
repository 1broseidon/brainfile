---
id: task-61
title: Hand-offs fork from the trunk, and a hand-off that only reads leaves no branch
column: todo
position: 4
priority: high
tags:
  - git
  - dispatch
  - desktop
relatedFiles:
  - desktop/src/agents/worktree.ts
  - desktop/src/agents/agents.ts
parentId: epic-4
decisions:
  - decision-11
contract:
  status: ready
  deliverables:
    - type: file
      path: desktop/src/agents/worktree.ts
      description: Fork from and review into the trunk; detached read-only worktrees
    - type: test
      path: desktop/test/worktree.test.ts
      description: Trunk fork, read-only without a branch
  validation:
    commands:
      - cd desktop && npm run typecheck && npm test
  metrics:
    readyAt: "2026-10-14T19:20:58.988Z"
createdAt: "2026-10-14T15:15:56.764Z"
updatedAt: "2026-10-14T19:20:58.988Z"
---

## Description
decision-11. prepareWorktree forks from the HEAD of the person's checkout and records its branch as the base (worktree.ts:123); reviewOf merges into currentBranch (:141). Both become the trunk: the repository's default branch (origin's HEAD, else main), which the repository's settings may name. A hand-off that only reads (a contract whose deliverables are all research, a validation run, a review) gets a detached worktree at the trunk's tip and no dispatch/ branch, and cleanUp lets go of both kinds. Branches made before this keep their recorded base until merged or discarded. Tests in desktop/test/worktree.test.ts with a scratch repository whose checkout is on another branch.
