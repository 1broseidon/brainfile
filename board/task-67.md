---
id: task-67
title: Fix task hand-off changing the main chat backend and model
column: in-progress
position: 3
description: |-
  Reported bug: handing off a task currently changes the main chat's selected backend and model.

  Expected behavior: the backend and model chosen for a task hand-off apply only to that task's agent session. The main chat keeps its selected backend and model.

  Acceptance criteria:
  - Hand off a task using a different backend and/or model and confirm the main chat selections remain unchanged.
  - Subsequent messages in the main chat continue using its original backend and model.
  - Add regression coverage for hand-off session settings remaining separate from main chat settings.
tags:
  - bug
  - desktop
  - dispatch
createdAt: "2026-10-14T18:46:44.730Z"
assignee: codex
updatedAt: "2026-10-14T18:47:15.518Z"
---

## Description
Reported bug: handing off a task currently changes the main chat's selected backend and model.

Expected behavior: the backend and model chosen for a task hand-off apply only to that task's agent session. The main chat keeps its selected backend and model.

Acceptance criteria:
- Hand off a task using a different backend and/or model and confirm the main chat selections remain unchanged.
- Subsequent messages in the main chat continue using its original backend and model.
- Add regression coverage for hand-off session settings remaining separate from main chat settings.
