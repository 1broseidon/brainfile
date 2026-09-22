---
id: spec-9
title: "Board on a branch: shared board storage on a git ref"
type: spec
tags:
  - product
  - storage
  - git
  - sync
relatedFiles:
  - .brainfile/plans/2026-09-21-board-on-a-branch-spec.md
createdAt: "2026-09-22T01:51:27.534Z"
updatedAt: "2026-09-22T05:05:11.083Z"
completedAt: "2026-09-22T05:05:11.083Z"
---

## Description
Decision (George, 2026-09-21): the board becomes a linked git worktree on an orphan branch of the project repo, like gh-pages for tasks. Every mutation is one commit authored as the agent; sync is optional and targets a remote the user chooses, which may differ from the code remote so private boards can sit next to public code. Solves the actual sharing failure: board state versioned with code is stale per worktree and branch and invisible across machines; gitignored boards leave linked worktrees blind. Core stays git-free (task-9 boundary); commits and sync live in cli. Binding spec: .brainfile/plans/2026-09-21-board-on-a-branch-spec.md. Phase 1 (storage, resolution, per-mutation commits, migrate) ships same-machine sharing with zero sync; phase 2 adds sync, merge driver, brief auto-sync; phase 3 autosync, TUI indicator, MANUAL, spec-5 re-scope.

## Log
- 2026-09-22T02:29:04.563Z: [claude] User journeys A (repo), B (plain folder), C (system-wide home board) added to the binding spec after talking them through with George. Decisions: mode renamed tracked (linked worktree in repos, standalone repo elsewhere); hide via .git/info/exclude so the code branch is never touched; walk-up stops at the git toplevel; -g targets ~/.brainfile; remoteBranch defaults brainfile / folder basename / home. All git mechanics verified in a scratch repo.
- 2026-09-22T03:44:23.055Z: [claude] Before/after explainer (folio, single-file, no external deps): .brainfile/plans/board-on-a-branch-explainer/index.html — scenario switcher (single tree / linked worktree / second machine / private ideas) dims the non-participating parts of both diagrams; comparison table, five moves, three journeys, and the eight scratch-repo checks.
- 2026-09-22T05:05:10.876Z: All three phases implemented and left uncommitted in the working tree for review (2026-09-22 overnight run). Test matrix: cli 46 suites/ ~430 tests + tui 12/129 green; core green except 4 discovery watcher tests failing with EMFILE (inotify instances exhausted on this machine; fails on a clean tree too). cli tsc 2.5s. Not done: commit, release, dogfooding this repo's own board (.brainfile is gitignored here; 'brainfile migrate --to-branch' would import it as a fresh branch).
