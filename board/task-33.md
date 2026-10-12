---
id: task-33
title: "Tooltips: two or three words, five at most"
column: in-progress
position: 3
priority: medium
tags:
  - desktop
  - copy
  - calm
createdAt: "2026-10-12T21:23:49.013Z"
updatedAt: "2026-10-12T21:35:01.455Z"
---

## Description
Screenshot 2026-10-12 16:14. Tooltips read as prose ("What changed on any board from outside: agents, the CLI, other machines"). Make every tooltip software-plain: what it is or does, 2-3 words, 5 at most when needed ("Changes", "Sync now", "Open in Cursor", "Hide projects  ⌘B"). Keys stay as the kbd suffix. Audit every use:tip and tipWithin in desktop/src/renderer (Titlebar, Sidebar, Workspace, TaskRow, TaskDetail, ChatPop, Dock, HandTo, Settings, DecisionsView, BoardView); longer explanations move into the list or pane they open, never the tip. Add the rule to design.md (Microinteractions, the one tooltip).

## Log
- 2026-10-12T21:37:46.390Z: [claude] Done on feat/desktop-app (a1ec075, 78f3467): every tooltip is 2-3 words (5 max) — New task, Decision replaced, Waits on…, Past valid date, Backup then merge/replace/keep, N outside changes, brainfile branch · origin, Board issues / Unsent changes; the rule is in design.md (Microinteractions). The health list rows follow with task-34.
