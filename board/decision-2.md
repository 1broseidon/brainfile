---
id: decision-2
title: Each hand-off works in its own worktree on dispatch/<task-id>
type: decision
status: current
claimKey: desktop.dispatch.worktree
kind: decision
stance: requires
subject: git worktree per dispatch
holdsWhile: The board is shared across worktrees through the board branch
sourcePath: desktop/src/agents/worktree.ts
sourceHash: sha256:b2052d243bde839e014e3102f6b8eb0498fabb367c6d5dbc5d9ab5712e98a059
tags:
  - desktop
  - dispatch
  - git
createdAt: "2026-10-12T23:12:07.287Z"
---

## Description
Each hand-off works in its own worktree on dispatch/<task-id>

Hand to… checks the task out into a git worktree under ~/.brainfile-worktrees/<repo>-<hash>/<task-id>, on branch dispatch/<task-id> from the commit the person's checkout is on; the base branch and fork commit are kept in the branch's git config (branch.dispatch/<id>.brainfileBase / brainfileFork). Not brainfile/<task-id> as spec-14 first suggested: git cannot create refs/heads/brainfile/… while the board branch refs/heads/brainfile exists. Only when the board lives on the board branch (storage linked), so every worktree shares it; a board kept as plain files in the code stays in the folder. Merge goes into the branch the person's checkout is on, --no-ff, refusing on uncommitted work or conflicts; merge or discard removes the worktree and branch.
