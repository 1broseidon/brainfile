---
id: decision-16
title: A hand-off forks from and lands on its task's target branch, the trunk unless set; an epic may opt into its own branch
type: decision
status: current
claimKey: desktop.dispatch.target
kind: decision
tags:
  - desktop
  - dispatch
  - worktree
  - landing
  - git
createdAt: "2026-10-15T04:25:54.848Z"
---

## Description
A hand-off forks from and lands on its task's target branch, the trunk unless set; an epic may opt into its own branch

Each task has a branch its work lands on: `landsOn` in its frontmatter, else its parent's, up the tree, else the repository's trunk (decision-11). The hand-off forks dispatch/<id> from that branch and lands back on it, with decision-12's checks, compare-and-swap and send-back unchanged. A release line is set once on its epic (`landsOn: release/0.38.0`) and every child follows. It lives on the board, not in the app's settings, so headless runners (epic-6) see the same target.

An epic may opt into its own branch (`epicBranch: true`). Its lead then makes dispatch/<epic-id> from the epic's target, its children fork from and land on that branch, and each child's worktree and branch go as it lands. The lead brings the epic's target into the epic branch before each hand-off, so the branch does not drift. When the last child is done, the epic is one item in Ready to merge, and its Merge asks where it goes: the target (default), another branch, a pull request, or kept as a branch. Off by default: children land on the epic's target directly.

Opening a pull request is a way to land, beside Merge, for any hand-off: the branch is pushed, a pull request opened against its target, and the item leaves Ready to merge, showing the open pull request instead. Merged on the forge, it counts as landed (landedIn already sees it): the task completes and its worktree goes. Closed without merging, it is back in Ready to merge.

A dependency is met once it has landed on its own target: on the epic branch for an epic that has one.

Why: work aimed at a release line (Hotline's 0.38) had no way to fork from or land on it, and a large epic put every child straight onto the trunk. decision-11 and decision-12 warned against long-lived integration branches collecting work and needing tending; an epic branch is short-lived, made, refreshed and landed by the app, never merged in the person's folder, and gone when its epic lands, so it is opt-in and the defaults stay as they are.
