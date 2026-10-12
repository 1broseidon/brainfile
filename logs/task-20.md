---
id: task-20
title: "Outline: children stay under their parent across columns"
priority: high
tags:
  - desktop
  - tui
  - outline
createdAt: "2026-10-12T18:47:59.125Z"
assignee: claude
updatedAt: "2026-10-12T20:47:54.005Z"
subtasks:
  - id: task-20-1
    title: "Host: completed children travel with their parent past the Done limit"
    completed: true
  - id: task-20-2
    title: "List: outline across columns (format.ts outline, ListView, counts)"
    completed: true
  - id: task-20-3
    title: "Keyboard: j/k follow the outline; folds live in app state"
    completed: true
  - id: task-20-4
    title: "Board view: parent card shows its children's boxes"
    completed: true
  - id: task-20-5
    title: "Task pane: child tasks include completed ones, ticked"
    completed: true
  - id: task-20-6
    title: "TUI: children under the parent across columns, own status, completed until parent done"
    completed: true
  - id: task-20-7
    title: "design.md: Rows section for the new rule"
    completed: true
  - id: task-20-8
    title: "Visual check: offscreen capture of a scratch board"
    completed: true
completedAt: "2026-10-12T20:47:54.005Z"
---

## Description
Today the list nests by parentId only within a column, so a parent in In Progress shows alone while its children sit as roots in Review or Done (epic-2 in In Progress, its specs in Review). Decide: a child stays attached to its parent wherever the child's own column is, and the outline is drawn in the parent's column.

- Each child keeps its own status box: the level its column gives it (filled for Review), ticked once completed.
- Completed children stay under their parent, ticked, until the parent itself is done; then they go with it.
- A child is not shown a second time in its own column's group.
- Same rule in the TUI's list and in the board view (a card shows its children's state).

## Log
- 2026-10-12T19:22:37.776Z: [claude] Built on feat/outline-across-columns (worktree ~/Projects/personal/brainfile-outline), 5 commits 21b8bea..8951df1, not pushed. Desktop: host keeps completed children of shown parents past the 50 limit; format.ts outline/childMap/childrenOf replace asTree; list, board cards, task pane, j/k follow it.
- 2026-10-12T19:22:38.071Z: [claude] Checks: desktop svelte-check 0/0, tsc node OK, vite build + build-electron OK, node tests 7/7 (npm test in desktop/). TUI 189/189 (was 179, +10). CLI 605 pass / 9 known failures (brainfile-finder, command-lint, hook-settings). Root npm run build OK.
- 2026-10-12T19:22:38.361Z: [claude] Visual: offscreen captures of a scratch board (/tmp/bf-outline, own --user-data-dir so George's app and projects are untouched): /tmp/outline-list2.png, /tmp/outline-done.png, /tmp/outline-board.png, /tmp/outline-keys.png, /tmp/outline-list-light.png.
- 2026-10-12T19:22:38.658Z: [claude] Decision: a child is drawn under its parent in the parent's group whatever its own column, not again in its own; it keeps its own box (the column's level, named in the box tooltip). Children run by column, then completed ones newest first. Completed children stay under an open parent, ticked, until it is done, then nest in Done with it; an open child of a done parent is a root in its own column. A group (and a TUI tab) counts what it holds, cross-column and completed children included, collapsed or not. Board view: cards stay in their own columns (drag-and-drop needs them there); a parent card shows one 12px box per child (over 12: ticked box + done/total). TUI says a child's status as its column id at the row's right edge and completed as '✓ done' (muted, read-only) rather than inventing box glyphs; the done stop stays flat. j/k walk rows as drawn (folds moved into app state); on the board view, cards column by column.
