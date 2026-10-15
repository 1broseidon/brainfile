---
id: task-89
title: "QA setup: the qa/parity branch, the app and CLI under test, and landsOn on the board (lint, patch)"
column: todo
position: 5
description: |-
  Not a hand-off: you do this one yourself, in a terminal at this repository.

  1. `git branch qa/parity main`, then `git push -u origin qa/parity`. Every hand-off under epic-8 forks from and lands on it, and the pull-request checks need it on GitHub.
  2. Make sure the dev app runs from `~/.brainfile-worktrees/parity/integration/desktop` (`ps -axo command | grep parity/integration/desktop/node_modules/electron` shows it). If not, quit the one that runs and start `npm run dev` there.
  3. `alias bfq="node ~/.brainfile-worktrees/parity/integration/cli/dist/cli.js"`.
  4. `bfq show -t epic-8`: it shows `landsOn: qa/parity`.
  5. `bfq lint`: no `lands-on-missing` warning now the branch exists.
  6. A missing target is a warning: `bfq patch -t <this task> --lands-on qa/nowhere`, then `bfq lint` warns `lands-on-missing` naming this task; then `bfq patch -t <this task> --clear-lands-on` and lint is clean again.
  7. A name git would refuse is refused: `bfq patch -t <this task> --lands-on "bad name.."` fails and changes nothing.
tags:
  - qa
parentId: epic-8
subtasks:
  - id: task-89-1
    title: qa/parity made from main and pushed to origin
    completed: false
  - id: task-89-2
    title: The dev app runs from the integration worktree
    completed: false
  - id: task-89-3
    title: "bfq show -t epic-8 shows landsOn: qa/parity"
    completed: false
  - id: task-89-4
    title: bfq lint has no lands-on warning
    completed: false
  - id: task-89-5
    title: A landsOn naming a missing branch is a lands-on-missing warning, and clearing it clears the warning
    completed: false
  - id: task-89-6
    title: An invalid branch name is refused by patch
    completed: false
createdAt: "2026-10-15T18:20:00.202Z"
landsOn: qa/nowhere
updatedAt: "2026-10-15T18:57:31.054Z"
---

## Description
Not a hand-off: you do this one yourself, in a terminal at this repository.

1. `git branch qa/parity main`, then `git push -u origin qa/parity`. Every hand-off under epic-8 forks from and lands on it, and the pull-request checks need it on GitHub.
2. Make sure the dev app runs from `~/.brainfile-worktrees/parity/integration/desktop` (`ps -axo command | grep parity/integration/desktop/node_modules/electron` shows it). If not, quit the one that runs and start `npm run dev` there.
3. `alias bfq="node ~/.brainfile-worktrees/parity/integration/cli/dist/cli.js"`.
4. `bfq show -t epic-8`: it shows `landsOn: qa/parity`.
5. `bfq lint`: no `lands-on-missing` warning now the branch exists.
6. A missing target is a warning: `bfq patch -t <this task> --lands-on qa/nowhere`, then `bfq lint` warns `lands-on-missing` naming this task; then `bfq patch -t <this task> --clear-lands-on` and lint is clean again.
7. A name git would refuse is refused: `bfq patch -t <this task> --lands-on "bad name.."` fails and changes nothing.
