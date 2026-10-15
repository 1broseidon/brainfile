---
id: task-98
title: "QA: the CLI without the desktop — fix, issues, add --source, pr, patch --lands-on and lint"
column: todo
position: 15
description: |-
  Not a hand-off. In a terminal at this repository, with `bfq` from the setup task. Tests task-77, task-78 and the CLI half of spec-18 (decision-17: everything the desktop runs is reachable without it).
  1. `bfq --help` lists `fix`, `issues` and `pr`.
  2. `bfq fix --dry-run`: "Nothing to fix" on this board (or the problem and fix in the desktop's health-list words). Exit 0.
  3. `bfq issues`: the open issues of 1broseidon/brainfile, each marked with its task when one carries its URL as `source`. It finds your token through `gh auth token` (or GH_TOKEN / GITHUB_TOKEN, or the saved token). `bfq issues --json` gives the same as JSON.
  4. Import one: `bfq issues --import <n> --column backlog`. A task appears with the issue's title, its labels as tags and `source:` the issue's URL. Run the same import again: it reports the task already made and makes no second one. Then `bfq add --title x --source <that URL>`: refused, "That issue is already task-N." Delete the imported task afterwards (`bfq delete -t <id>`).
  5. `bfq pr <task-92> --status` (hand-off 3, once its pull request is open or merged): the state and the link.
  6. `bfq lint`: no errors; the only lands-on warnings are ones you made on purpose.
  7. `bfq where`: unchanged from the published `brainfile where`, apart from a fix section in `--json`.
tags:
  - qa
  - cli
  - epic-6
parentId: epic-8
dependsOn:
  - task-89
subtasks:
  - id: task-98-1
    title: "--help lists fix, issues and pr"
    completed: true
  - id: task-98-2
    title: fix --dry-run reports, exit 0
    completed: true
  - id: task-98-3
    title: issues lists this repository's open issues, marked when on the board
    completed: true
  - id: task-98-4
    title: issues --import makes one task with source; a second import and add --source are refused
    completed: true
  - id: task-98-5
    title: pr --status gives the state and link
    completed: true
  - id: task-98-6
    title: lint is clean apart from deliberate warnings
    completed: true
createdAt: "2026-10-15T18:21:50.418Z"
updatedAt: "2026-10-15T20:30:42.464Z"
---

## Description
Not a hand-off. In a terminal at this repository, with `bfq` from the setup task. Tests task-77, task-78 and the CLI half of spec-18 (decision-17: everything the desktop runs is reachable without it).
1. `bfq --help` lists `fix`, `issues` and `pr`.
2. `bfq fix --dry-run`: "Nothing to fix" on this board (or the problem and fix in the desktop's health-list words). Exit 0.
3. `bfq issues`: the open issues of 1broseidon/brainfile, each marked with its task when one carries its URL as `source`. It finds your token through `gh auth token` (or GH_TOKEN / GITHUB_TOKEN, or the saved token). `bfq issues --json` gives the same as JSON.
4. Import one: `bfq issues --import <n> --column backlog`. A task appears with the issue's title, its labels as tags and `source:` the issue's URL. Run the same import again: it reports the task already made and makes no second one. Then `bfq add --title x --source <that URL>`: refused, "That issue is already task-N." Delete the imported task afterwards (`bfq delete -t <id>`).
5. `bfq pr <task-92> --status` (hand-off 3, once its pull request is open or merged): the state and the link.
6. `bfq lint`: no errors; the only lands-on warnings are ones you made on purpose.
7. `bfq where`: unchanged from the published `brainfile where`, apart from a fix section in `--json`.
