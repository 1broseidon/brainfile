---
id: task-49
title: "Desktop: remove the board (kanban) view; the list is the one view of work"
column: todo
position: 1
description: |-
  The desktop's Board tab is the only kanban left: the phone and the TUI read as a list grouped by column. The list already does what the board does (drop a task on a group, Move to…, the status box), and the outline, calm rows and the review moment live only there, so the board costs its own rules (a parent's card showing child boxes across columns) for a layout nobody needs in an agentic backend. Columns stay as a task's stage; only the column layout goes.

  Remove:
  - `desktop/src/renderer/components/BoardView.svelte`
  - `'board'` from `ViewMode` (`desktop/src/renderer/lib/state.svelte.ts:59`), the Board tab in `Workspace.svelte`, and `v` / `toggleView` in `App.svelte` (`⇧V` keeps opening the list)
  - the board's row order in `state.svelte.ts` (`if (this.view === 'board')` in the row walk)
  - a saved `brainfile.view` of `'board'` falls back to the list
  - design.md: "Cards stay in their columns" and the board-view aside in "Empty groups are not shown"

  Keep: the format's `x-brainfile-renderer: kanban` hint and core's `RendererType.KANBAN` (the format's word for other tools; a separate question). A task lost by the empty-column drop is moved with Move to….
priority: medium
tags:
  - desktop
  - views
relatedFiles:
  - desktop/src/renderer/components/BoardView.svelte
  - desktop/src/renderer/components/Workspace.svelte
  - desktop/src/renderer/App.svelte
  - desktop/src/renderer/lib/state.svelte.ts
  - desktop/design.md
subtasks:
  - id: task-49-1
    title: Remove BoardView.svelte, the 'board' ViewMode, the Board tab and the v toggle
    completed: false
  - id: task-49-2
    title: Drop the board's row order; a saved 'board' view falls back to the list
    completed: false
  - id: task-49-3
    title: "design.md: remove the board view passages"
    completed: false
  - id: task-49-4
    title: Tests and svelte-check pass
    completed: false
createdAt: "2026-10-13T21:06:45.161Z"
decisions:
  - decision-9
updatedAt: "2026-10-13T21:45:58.317Z"
assignee: cursor
---

## Description
The desktop's Board tab is the only kanban left: the phone and the TUI read as a list grouped by column. The list already does what the board does (drop a task on a group, Move to…, the status box), and the outline, calm rows and the review moment live only there, so the board costs its own rules (a parent's card showing child boxes across columns) for a layout nobody needs in an agentic backend. Columns stay as a task's stage; only the column layout goes.

Remove:
- `desktop/src/renderer/components/BoardView.svelte`
- `'board'` from `ViewMode` (`desktop/src/renderer/lib/state.svelte.ts:59`), the Board tab in `Workspace.svelte`, and `v` / `toggleView` in `App.svelte` (`⇧V` keeps opening the list)
- the board's row order in `state.svelte.ts` (`if (this.view === 'board')` in the row walk)
- a saved `brainfile.view` of `'board'` falls back to the list
- design.md: "Cards stay in their columns" and the board-view aside in "Empty groups are not shown"

Keep: the format's `x-brainfile-renderer: kanban` hint and core's `RendererType.KANBAN` (the format's word for other tools; a separate question). A task lost by the empty-column drop is moved with Move to….
