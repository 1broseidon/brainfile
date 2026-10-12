---
id: task-25
title: "Window: remember its size and position and restore them on launch"
column: in-progress
position: 0
description: The desktop app opens large and centered every time. Save the window's bounds (size, position, maximized/fullscreen state) when they change or on close, and restore them on the next launch. If the saved position is no longer on any connected display (monitor unplugged, resolution changed), fall back to the current centered default.
tags:
  - desktop
  - window
relatedFiles:
  - desktop/src/main/main.ts
subtasks:
  - id: task-25-1
    title: Persist bounds and maximized/fullscreen state on move/resize/close
    completed: false
  - id: task-25-2
    title: Restore saved bounds when creating the BrowserWindow
    completed: false
  - id: task-25-3
    title: Fall back to the centered default when the saved bounds are off every display
    completed: false
createdAt: "2026-10-12T19:06:07.091Z"
assignee: cursor
updatedAt: "2026-10-12T19:26:08.942Z"
---

## Description
The desktop app opens large and centered every time. Save the window's bounds (size, position, maximized/fullscreen state) when they change or on close, and restore them on the next launch. If the saved position is no longer on any connected display (monitor unplugged, resolution changed), fall back to the current centered default.
