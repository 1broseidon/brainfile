---
id: task-57
title: "Mobile: final polish with native iOS glass, cards and buttons, keeping desktop's look"
column: in-progress
position: 4
priority: medium
tags:
  - mobile
  - ios
  - polish
  - parity
parentId: epic-3
dependsOn:
  - task-54
  - task-55
  - task-56
decisions:
  - decision-10
  - decision-7
  - decision-9
createdAt: "2026-10-14T01:44:12.943Z"
updatedAt: "2026-10-14T02:09:43.325Z"
---

## Description
The last step of epic-3, after task-54, task-55 and task-56. Use the native iOS surface wherever iOS has one: Liquid Glass on bars, toolbars, sheets and floating controls; native buttons, menus, context menus and sheets; inset cards for grouped content such as settings and a task's details. Keep what makes the phone read as the desktop: IBM Plex Sans and Mono, desktop's tokens for planes, ink and accent, the status boxes, the row signals, the calm list and plain copy (decision-10). Where the two disagree, native wins for chrome (bars, sheets, buttons, menus) and desktop wins for content (rows, type, ink and signals). Check every screen on the simulator against desktop/design.md, then build and install on the iPhone over WiFi with npm run phone.
