---
id: task-98
title: "QA: the CLI without the desktop — fix, issues, add --source, pr, patch --lands-on and lint"
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
updatedAt: "2026-10-15T20:30:43.003Z"
completedAt: "2026-10-15T20:30:43.003Z"
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

## Log
- 2026-10-15T20:30:42.736Z: [claude] QA passed (Claude, with the integration CLI):
- --help lists fix, issues and pr.
- fix --dry-run says "Nothing to fix: one board, where it belongs" and exits 0; --json gives {problems: [], plan: null}.
- issues lists #1 "Ideas for docs and enhancements" through gh's login; --json gives repo, auth: gh and issues.
- issues --import 1 --column backlog made task-103 in backlog with source set; the issue had no labels, so it got no tags. issues then marks #1 "on the board: task-103". A second import says "#1 is already task-103", and add --source is refused with "That issue is already task-103." (exit 1). task-103 was deleted afterwards.
- pr --status: task-92 says "#6 … merged", task-93 says "#7 … closed without merging" (both from logs/).
- lint is clean; where's text matches the published brainfile's.
Two notes, neither a bug. The guide was wrong that where --json carries fix: the fix plan is in `brainfile fix --json` and on MCP where. For a discarded hand-off, pr --status still says "Merge it, or open another", though there is nothing left to merge (a wording nit).
