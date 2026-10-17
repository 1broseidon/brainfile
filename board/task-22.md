---
id: task-22
title: "Decision groups: one order everywhere"
column: review
position: 0
tags:
  - desktop
  - tui
  - decisions
createdAt: "2026-10-12T18:48:00.001Z"
dispatch:
  agent: claude
  by: cli
  at: "2026-10-17T05:34:13.398Z"
  tries: 1
  claim:
    host: Georges-Mac-Studio
    runner: desktop
    pid: 12851
    at: "2026-10-17T05:35:35.997Z"
    ended: "2026-10-17T05:38:28.090Z"
    outcome: review
assignee: claude
updatedAt: "2026-10-17T05:38:28.090Z"
---

## Description
The TUI orders decision families alphabetically (core's groupDecisionsByPrefix, unfiled last); the desktop puts the largest family first. Use core's order in the desktop too, from the same function.

## Log
- 2026-10-17T05:38:22.502Z: [claude] Desktop host now orders snapshot decisions with core's groupDecisionsByPrefix (standing by family, alphabetical, unfiled last; history newest first) and the window's decisionGroups keeps that order instead of largest-first; test in desktop/test/decide.test.ts, changelog fragment added. On branch dispatch/task-22 (5a0497a); desktop typecheck and tests pass.
