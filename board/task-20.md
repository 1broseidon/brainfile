---
id: task-20
title: "Outline: children stay under their parent across columns"
column: backlog
position: 0
priority: high
tags:
  - desktop
  - tui
  - outline
createdAt: "2026-10-12T18:47:59.125Z"
assignee: claude
updatedAt: "2026-10-12T18:58:18.215Z"
---

## Description
Today the list nests by parentId only within a column, so a parent in In Progress shows alone while its children sit as roots in Review or Done (epic-2 in In Progress, its specs in Review). Decide: a child stays attached to its parent wherever the child's own column is, and the outline is drawn in the parent's column.

- Each child keeps its own status box: the level its column gives it (filled for Review), ticked once completed.
- Completed children stay under their parent, ticked, until the parent itself is done; then they go with it.
- A child is not shown a second time in its own column's group.
- Same rule in the TUI's list and in the board view (a card shows its children's state).
