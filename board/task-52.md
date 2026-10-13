---
id: task-52
title: "Calm list: a task an agent is working never sits behind More"
column: in-progress
position: 5
description: In the calm list an open group shows its first three roots and the rest under `N more` (design.md, Calm list; `glance` in format.ts). A task an agent is working — starting, working, or waiting — must stay in the drawn list, never behind `N more`, even when it is past that glance. Its family stays with it, the same way a family is never cut. The glance still holds for every other row. Update the Calm list section of design.md to say so.
priority: medium
tags:
  - desktop
  - calm
  - list
relatedFiles:
  - desktop/src/renderer/lib/format.ts
  - desktop/src/renderer/lib/state.svelte.ts
  - desktop/design.md
decisions:
  - decision-7
createdAt: "2026-10-13T21:50:15.918Z"
assignee: cursor
dispatch:
  agent: cursor
  model: grok-4.7[context=256k,reasoning_effort=high,fast=true]
  by: chat
  at: "2026-10-13T21:50:18.614Z"
updatedAt: "2026-10-13T21:50:36.981Z"
---

## Description
In the calm list an open group shows its first three roots and the rest under `N more` (design.md, Calm list; `glance` in format.ts). A task an agent is working — starting, working, or waiting — must stay in the drawn list, never behind `N more`, even when it is past that glance. Its family stays with it, the same way a family is never cut. The glance still holds for every other row. Update the Calm list section of design.md to say so.

## Log
- 2026-10-13T21:55:54.510Z: [cursor] A task an agent is working stays in the calm list past the glance, with its family; the glance still holds for every other row. On dispatch/task-52.
