---
id: task-102
title: "QA bug: a pull request carries every local landing its base has not pushed, and once squash-merged the local base and origin's diverge"
column: todo
position: 14
description: |-
  Found in task-92. task-90 and task-91 landed on qa/parity locally (Merge never pushes). task-92 then forked from local qa/parity (2dec56c) and its pull request #6 went into origin's qa/parity (still 2cff04e). So #6 carried three lines, task-90's and task-91's work as well as its own, and nobody was told. The squash merge made 880d7b8 on origin; local qa/parity still has the four landing commits. They now share only 2cff04e (4 local, 1 on origin), with the same file contents. The next hand-off forks from local (freshest keeps a local branch with commits of its own), so it misses the squash, and its pull request would carry task-90 and task-91 again.

  Fix:
  1. Before opening, whyNotPullRequest (or the plan) compares `<base>` with `origin/<base>` after a fetch. When the local base has commits origin lacks, it refuses with "<base> has N commits here that origin does not (the landings of task-X, task-Y): push <base> first, or the pull request carries them too". It offers no push of its own.
  2. After a pull request merges, settling it brings the local base up to `origin/<base>`: a fast-forward when the local base is an ancestor. When they have diverged only by commits whose changes are all in origin's (a squash of them), move the local base to origin's by compare-and-swap, unless it is checked out. Otherwise leave it, and say so in the task's log.
  3. Tests in core/src/__tests__/repo-pullRequest.test.ts against the local bare origin: a base with unpushed landings is refused; squash-merged, the local base follows origin's.
priority: high
tags:
  - qa-bug
  - spec-18
  - pull-request
  - landing
relatedFiles:
  - core/src/forge/handOffPullRequest.ts
  - core/src/repo/worktree.ts
  - desktop/src/agents/pullRequests.ts
parentId: epic-8
subtasks:
  - id: task-102-1
    title: Opening refuses when the base has unpushed local commits, naming them
    completed: true
  - id: task-102-2
    title: Settling a merged PR brings the local base to origin's when nothing would be lost
    completed: true
  - id: task-102-3
    title: Tests against a bare origin
    completed: true
  - id: task-102-4
    title: qa/parity reconciled for the rest of QA
    completed: true
createdAt: "2026-10-15T20:02:21.568Z"
updatedAt: "2026-10-15T20:10:16.261Z"
---

## Description
Found in task-92. task-90 and task-91 landed on qa/parity locally (Merge never pushes). task-92 then forked from local qa/parity (2dec56c) and its pull request #6 went into origin's qa/parity (still 2cff04e). So #6 carried three lines, task-90's and task-91's work as well as its own, and nobody was told. The squash merge made 880d7b8 on origin; local qa/parity still has the four landing commits. They now share only 2cff04e (4 local, 1 on origin), with the same file contents. The next hand-off forks from local (freshest keeps a local branch with commits of its own), so it misses the squash, and its pull request would carry task-90 and task-91 again.

Fix:
1. Before opening, whyNotPullRequest (or the plan) compares `<base>` with `origin/<base>` after a fetch. When the local base has commits origin lacks, it refuses with "<base> has N commits here that origin does not (the landings of task-X, task-Y): push <base> first, or the pull request carries them too". It offers no push of its own.
2. After a pull request merges, settling it brings the local base up to `origin/<base>`: a fast-forward when the local base is an ancestor. When they have diverged only by commits whose changes are all in origin's (a squash of them), move the local base to origin's by compare-and-swap, unless it is checked out. Otherwise leave it, and say so in the task's log.
3. Tests in core/src/__tests__/repo-pullRequest.test.ts against the local bare origin: a base with unpushed landings is refused; squash-merged, the local base follows origin's.
