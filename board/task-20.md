---
id: task-20
title: "Outline: children stay under their parent across columns"
column: in-progress
position: 0
priority: high
tags:
  - desktop
  - tui
  - outline
createdAt: "2026-10-12T18:47:59.125Z"
assignee: claude
updatedAt: "2026-10-12T19:22:27.033Z"
subtasks:
  - id: task-20-1
    title: "Host: completed children travel with their parent past the Done limit"
    completed: true
  - id: task-20-2
    title: "List: outline across columns (format.ts outline, ListView, counts)"
    completed: false
  - id: task-20-3
    title: "Keyboard: j/k follow the outline; folds live in app state"
    completed: false
  - id: task-20-4
    title: "Board view: parent card shows its children's boxes"
    completed: false
  - id: task-20-5
    title: "Task pane: child tasks include completed ones, ticked"
    completed: false
  - id: task-20-6
    title: "TUI: children under the parent across columns, own status, completed until parent done"
    completed: false
  - id: task-20-7
    title: "design.md: Rows section for the new rule"
    completed: false
  - id: task-20-8
    title: "Visual check: offscreen capture of a scratch board"
    completed: false
---

## Description
Today the list nests by parentId only within a column, so a parent in In Progress shows alone while its children sit as roots in Review or Done (epic-2 in In Progress, its specs in Review). Decide: a child stays attached to its parent wherever the child's own column is, and the outline is drawn in the parent's column.

- Each child keeps its own status box: the level its column gives it (filled for Review), ticked once completed.
- Completed children stay under their parent, ticked, until the parent itself is done; then they go with it.
- A child is not shown a second time in its own column's group.
- Same rule in the TUI's list and in the board view (a card shows its children's state).
