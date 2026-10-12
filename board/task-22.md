---
id: task-22
title: "Decision groups: one order everywhere"
column: backlog
position: 3
tags:
  - desktop
  - tui
  - decisions
createdAt: "2026-10-12T18:48:00.001Z"
---

## Description
The TUI orders decision families alphabetically (core's groupDecisionsByPrefix, unfiled last); the desktop puts the largest family first. Use core's order in the desktop too, from the same function.
