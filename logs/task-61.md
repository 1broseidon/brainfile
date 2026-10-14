---
id: task-61
title: Hand-offs fork from the trunk, and a hand-off that only reads leaves no branch
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
  status: done
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
    pickedUpAt: "2026-10-14T19:21:01.508Z"
    reworkCount: 0
    deliveredAt: "2026-10-14T19:24:25.189Z"
    duration: 204
createdAt: "2026-10-14T15:15:56.764Z"
updatedAt: "2026-10-14T19:24:36.954Z"
completedAt: "2026-10-14T19:24:36.954Z"
---

## Description
decision-11. prepareWorktree forks from the HEAD of the person's checkout and records its branch as the base (worktree.ts:123); reviewOf merges into currentBranch (:141). Both become the trunk: the repository's default branch (origin's HEAD, else main), which the repository's settings may name. A hand-off that only reads (a contract whose deliverables are all research, a validation run, a review) gets a detached worktree at the trunk's tip and no dispatch/ branch, and cleanUp lets go of both kinds. Branches made before this keep their recorded base until merged or discarded. Tests in desktop/test/worktree.test.ts with a scratch repository whose checkout is on another branch.

## Log
- 2026-10-14T19:24:42.814Z: [claude] Built in the checkout (uncommitted, on feat/desktop-app). worktree.ts: trunkOf (git config brainfile.trunk, else origin/HEAD, else main, else master; forks from the local branch, else origin's copy); new branches fork from the trunk and record it as base; reviewOf's into is the recorded base while that branch exists, else the trunk, with checkout beside it; Merge waits until the checkout is on into (until task-62), except to remove an already-merged worktree. Read-only: onlyReads(contract) when every deliverable is research, review or link; a detached checkout at the trunk's tip, no branch; a task with a branch keeps it; a reader that now writes gives way to a branch; releaseReader removes it when the run ends unless it holds changes; discard handles both. Brief and the desk's reply say read-only; Review shows 'Read-only checkout' with Open and Discard only. design.md and README updated. 8 new tests (17 in worktree.test.ts); typecheck clean, 179/179; contract validation passed. Not tried with a live agent.
