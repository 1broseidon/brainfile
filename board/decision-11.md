---
id: decision-11
title: A hand-off that changes code works in its own worktree on dispatch/<task-id>, forked from the trunk
type: decision
status: current
claimKey: desktop.dispatch.worktree
kind: decision
stance: requires
subject: git worktree per code-changing dispatch, forked from the trunk
holdsWhile: The board is shared across worktrees through the board branch
sourcePath: desktop/src/agents/worktree.ts
sourceHash: sha256:b2052d243bde839e014e3102f6b8eb0498fabb367c6d5dbc5d9ab5712e98a059
supersedes: decision-2
tags:
  - desktop
  - dispatch
  - git
createdAt: "2026-10-14T15:14:37.158Z"
---

## Description
A hand-off that changes code works in its own worktree on dispatch/<task-id>, forked from the trunk

Hand to… checks the task out into a git worktree under ~/.brainfile-worktrees/<repo>-<hash>/<task-id>, on branch dispatch/<task-id>, forked from the tip of the repository's trunk: its default branch (origin's HEAD, else main), which the repository's settings may name. It no longer forks from whatever the person's checkout is on. The trunk and the fork commit are kept in the branch's git config (branch.dispatch/<id>.brainfileBase / brainfileFork). Not brainfile/<task-id>: git cannot create refs/heads/brainfile/… while the board branch refs/heads/brainfile exists. A hand-off that only reads (research, validation, a review) gets a detached worktree at the trunk's tip and no branch, so it leaves no ref behind. Only when the board lives on the board branch (storage linked), so every worktree shares it; a board kept as plain files in the code stays in the folder. How the work lands is desktop.dispatch.landing. Why: forking from the person's checkout carried their branch, and whatever was unfinished on it, into every hand-off, and made long-lived branches the place work collected (repo.branches.trunk).
