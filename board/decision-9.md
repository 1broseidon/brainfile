---
id: decision-9
title: The list is the one view of work; the desktop drops its board (kanban) view
type: decision
status: current
claimKey: desktop.views.list-only
kind: decision
stance: rejects
subject: board view
tags:
  - desktop
  - views
createdAt: "2026-10-13T21:06:49.475Z"
---

## Description
The list is the one view of work; the desktop drops its board (kanban) view
A task's column is its stage, shown by its status box and its group. Columns are not a layout. The desktop removes the Board tab and its v toggle; the phone and the TUI never had one. To move a task, drop it on a group, use Move to…, or use the status box. The format's renderer hint (x-brainfile-renderer: kanban, core's RendererType.KANBAN) is unchanged. Why: for an agentic task, decision and memory backend the board view adds nothing the list lacks, while the outline, calm rows and the review moment live only in the list, and the board needs its own rules to keep up.
