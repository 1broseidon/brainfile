---
id: task-76
title: "Core: hand-off worktrees, review, compare-and-swap landing and send-back move out of the desktop"
column: in-progress
position: 5
tags:
  - core
  - dispatch
  - worktree
  - landing
relatedFiles:
  - desktop/src/agents/worktree.ts
  - desktop/src/agents/agents.ts
  - desktop/test/worktree.test.ts
  - desktop/test/handoff.test.ts
  - core/src/repo/index.ts
parentId: epic-6
decisions:
  - decision-11
  - decision-12
  - decision-13
contract:
  status: draft
  deliverables:
    - type: file
      path: core/src/repo/worktree.ts
      description: Worktrees, review, ready-to-merge, checks, landing by compare-and-swap, discard
    - type: file
      path: core/src/repo/landingLock.ts
      description: One landing at a time per repository, across processes
    - type: test
      path: core/src/__tests__/repo-worktree.test.ts
      description: The desktop's worktree and hand-off tests, ported, plus two processes landing at once
    - type: file
      path: desktop/src/agents/worktree.ts
      description: Removed; callers import @brainfile/core/repo
  validation:
    commands:
      - npm run build -w core && npm run test:ci -w core
      - cd desktop && npm run typecheck && npm test
  constraints:
    - Landing never runs in the person's checkout (decision-12)
    - Hand-offs fork from the trunk (decision-11)
createdAt: "2026-10-14T22:15:08.235Z"
updatedAt: "2026-10-15T17:11:59.873Z"
---

## Description
Move desktop/src/agents/worktree.ts into core/src/repo/worktree.ts, exported from `@brainfile/core/repo`. That covers `trunkOf`, `canBranch`, `prepareWorktree`, `onlyReads`, `reviewOf`, `readyToMerge`, `uncommittedIn`, `collisions`, `runChecks`, `landReview`, `discardReview` and `releaseReader`. It keeps the branch config keys (`brainfileBase`, `brainfileFork`, `brainfile.trunk`) and the root at ~/.brainfile-worktrees/.

Two parts hold state in memory today, which works only while one process lands:
- `serially` (the `landings` map) keeps landings one at a time per repository inside one process. Replace it with a lock file the CLI and the desktop share, `.brainfile/state/landing.lock` (pid, host, at), taken with O_EXCL and taken over when its pid is gone. The compare-and-swap with update-ref already stops a lost update; the lock keeps landings serial and keeps the checks from running twice.
- `sendBackLanding` (agents.ts) builds the note (`Landing sent back (n of m)`, the colliding commits and the tasks that brought them) and counts earlier send-backs from the task's log. Move how it composes the note and decides whether it may send back again into core as `sendBackNote(task, landing)`. The re-dispatch itself stays with the runner (task-80).

Keep the checks in `land` (agents.ts): refuse while a run is live on the task (now from the run files of task-74) or while a claim is starting. The desktop keeps its Review pane and calls core.

## Log
- 2026-10-15T15:49:44.635Z: [claude] Since this was planned (2026-10-15, commits 2cff04e and 0d3ff0e), worktree.ts gained what must move with it: `freshest` (fork from origin/<trunk> when the local trunk is only behind it; a local trunk with its own commits is kept) and `unlanded(projectId, taskId)` (a branch with commits not yet in where it lands), plus landedIn's forge checks (into@{upstream}, origin/<trunk>, squash by merge-tree). host.settleLanded is a no-op for a task its worker already completed. Build the fork-base and landing-target choice here so spec-18's landsOn (decision-16) needs no second implementation.
