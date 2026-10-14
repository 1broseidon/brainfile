---
id: decision-13
title: "This repository has one trunk, main: no long-lived integration branches"
type: decision
status: current
claimKey: repo.branches.trunk
kind: rule
stance: forbids
subject: long-lived integration branches
tags:
  - git
  - process
createdAt: "2026-10-14T15:14:49.708Z"
---

## Description
This repository has one trunk, main: no long-lived integration branches

Work on brainfile lands on main, through hand-offs or through short branches that live a day or two. No long-lived integration branch collects work (feat/desktop-app collected task branches and was merged back and forth with feat/phone-link). A release branch takes fixes cherry-picked from main; a fix never lands on a release branch first. A merged branch is deleted with its worktree. Why: on 2026-10-14 local main was 152 commits ahead of origin/main and 7 behind, the two conflicting in CHANGELOG.md, MANUAL.md and core/src/repo/consolidate.ts, because 0.22 shipped from release branches while the desktop work stayed on feat/desktop-app; 14 of 18 local branches were already merged.
