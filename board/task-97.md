---
id: task-97
title: "QA: the epic branch, run on epic-9 — its lead makes the branch, brings the target in, and the epic is merged once from a four-way Merge menu"
column: todo
position: 14
description: |-
  Not a hand-off itself: it drives epic-9 (the drill epic, with task-95 and task-96). Tests spec-18-6, 7 and 8, and the review fixes in 18a7aa1. Do it after hand-off 1 (task-90) has merged, so qa/parity already has a line in `qa/parity-wave-1.md`.
  1. Turn the branch on: `bfq patch -t epic-9 --epic-branch`. `bfq show -t epic-9` has `epicBranch: true` and `landsOn: qa/parity`.
  2. Hand to… on task-95: it says it lands on epic-9's branch.
  3. Hand epic-9 off (its lead). `git branch` shows `dispatch/epic-9`, made from qa/parity, with no worktree (`git worktree list`), and `git config branch.dispatch/epic-9.brainfileEpic` says true.
  4. The lead hands off task-95. Its worktree forks from `dispatch/epic-9`. Merge it (or let it land): `git log dispatch/epic-9` has it; qa/parity does not yet.
  5. Make the target move before task-96 starts, so the next hand-off has something to bring in. Before you merge task-95, run:
     `git worktree add /tmp/qa-drift qa/parity && echo "- drift on qa/parity" >> /tmp/qa-drift/qa/parity-wave-1.md && git -C /tmp/qa-drift commit -qam "QA: qa/parity moves under the epic" && git worktree remove /tmp/qa-drift`
     When task-96 is handed off, `git log dispatch/epic-9` has `Merge qa/parity into dispatch/epic-9` (or, if that conflicted, task-96's brief told its agent to merge it first, and epic-9 has a note saying so).
  6. Merge task-96. The lead ends with "epic-9 is in Ready to merge, dispatch/epic-9 into qa/parity". The epic is one item in Ready to merge; the children each completed as they landed.
  7. The epic's Merge opens a menu: Merge into qa/parity · Merge into another branch… · Open a pull request · Keep as a branch. Choose **Merge into qa/parity**. qa/parity has both children's lines; `dispatch/epic-9` and its worktree are gone; epic-9 is done; main is untouched.
  8. Optional, to try **Keep as a branch** instead: run it again on a copy of epic-9 and choose Keep. The worktree goes, the branch stays, the epic is done.
tags:
  - qa
  - spec-18
  - epic-branch
relatedFiles:
  - core/src/repo/target.ts
  - desktop/src/agents/lead.ts
  - desktop/src/renderer/components/MergeMenu.svelte
parentId: epic-8
dependsOn:
  - task-89
  - task-90
subtasks:
  - id: task-97-1
    title: patch --epic-branch sets it; show has epicBranch and landsOn
    completed: true
  - id: task-97-2
    title: Hand to… on a child says it lands on epic-9's branch
    completed: true
  - id: task-97-3
    title: The lead makes dispatch/epic-9 from qa/parity with no worktree
    completed: true
  - id: task-97-4
    title: Children fork from and land on dispatch/epic-9, not qa/parity
    completed: true
  - id: task-97-5
    title: A moved target is brought into the epic's branch before the next hand-off
    completed: true
  - id: task-97-6
    title: After the last child the epic alone is in Ready to merge
    completed: true
  - id: task-97-7
    title: The Merge menu has four choices; Merge into qa/parity lands both lines and lets the branch go
    completed: true
  - id: task-97-8
    title: "Optional: Keep as a branch keeps the branch and completes the epic"
    completed: true
createdAt: "2026-10-15T18:21:50.129Z"
updatedAt: "2026-10-15T20:58:33.612Z"
---

## Description
Not a hand-off itself: it drives epic-9 (the drill epic, with task-95 and task-96). Tests spec-18-6, 7 and 8, and the review fixes in 18a7aa1. Do it after hand-off 1 (task-90) has merged, so qa/parity already has a line in `qa/parity-wave-1.md`.
1. Turn the branch on: `bfq patch -t epic-9 --epic-branch`. `bfq show -t epic-9` has `epicBranch: true` and `landsOn: qa/parity`.
2. Hand to… on task-95: it says it lands on epic-9's branch.
3. Hand epic-9 off (its lead). `git branch` shows `dispatch/epic-9`, made from qa/parity, with no worktree (`git worktree list`), and `git config branch.dispatch/epic-9.brainfileEpic` says true.
4. The lead hands off task-95. Its worktree forks from `dispatch/epic-9`. Merge it (or let it land): `git log dispatch/epic-9` has it; qa/parity does not yet.
5. Make the target move before task-96 starts, so the next hand-off has something to bring in. Before you merge task-95, run:
   `git worktree add /tmp/qa-drift qa/parity && echo "- drift on qa/parity" >> /tmp/qa-drift/qa/parity-wave-1.md && git -C /tmp/qa-drift commit -qam "QA: qa/parity moves under the epic" && git worktree remove /tmp/qa-drift`
   When task-96 is handed off, `git log dispatch/epic-9` has `Merge qa/parity into dispatch/epic-9` (or, if that conflicted, task-96's brief told its agent to merge it first, and epic-9 has a note saying so).
6. Merge task-96. The lead ends with "epic-9 is in Ready to merge, dispatch/epic-9 into qa/parity". The epic is one item in Ready to merge; the children each completed as they landed.
7. The epic's Merge opens a menu: Merge into qa/parity · Merge into another branch… · Open a pull request · Keep as a branch. Choose **Merge into qa/parity**. qa/parity has both children's lines; `dispatch/epic-9` and its worktree are gone; epic-9 is done; main is untouched.
8. Optional, to try **Keep as a branch** instead: run it again on a copy of epic-9 and choose Keep. The worktree goes, the branch stays, the epic is done.
