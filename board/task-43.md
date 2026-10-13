---
id: task-43
title: "Calm ADHD list view: take the mobile app's list as the reference"
column: backlog
position: 6
description: |-
  A calmer, ADHD-friendly way to read the task list on the desktop, modelled on how brainfile-mobile shows its board. The mobile list is quieter than the desktop's rows (desktop/design.md, Rows): at rest a row is its status box, its title on one line, and at most one signal, the loudest it has. The ID, tags, assignee and everything else wait for the task's sheet. Pressing is a fill, and there are no lines between rows.

  Reference (in ~/Projects/personal/brainfile-mobile):
  - src/components/rows.tsx: TaskRow and the calm row layout
  - src/data/outline.ts: restingSignal (choosing the one signal), subtaskCount, taskProgress
  - src/screens/Board.tsx: how the list is grouped and nested
  - src/theme.ts: ROW, INSET, INDENT, BOX_CELL spacing

  Goal: a list view (or a mode of the existing one) that cuts noise down to one thing per row, so the eye can land on what to do next without scanning signals. Keep the desktop's outline rules (children stay under their parent) and keyboard walk (j / k). Write down any change to desktop/design.md.
priority: medium
tags:
  - desktop
  - calm
  - adhd
  - list
relatedFiles:
  - desktop/design.md
  - desktop/src/renderer
createdAt: "2026-10-13T15:38:45.419Z"
assignee: claude
updatedAt: "2026-10-13T15:58:24.555Z"
---

## Description
A calmer, ADHD-friendly way to read the task list on the desktop, modelled on how brainfile-mobile shows its board. The mobile list is quieter than the desktop's rows (desktop/design.md, Rows): at rest a row is its status box, its title on one line, and at most one signal, the loudest it has. The ID, tags, assignee and everything else wait for the task's sheet. Pressing is a fill, and there are no lines between rows.

Reference (in ~/Projects/personal/brainfile-mobile):
- src/components/rows.tsx: TaskRow and the calm row layout
- src/data/outline.ts: restingSignal (choosing the one signal), subtaskCount, taskProgress
- src/screens/Board.tsx: how the list is grouped and nested
- src/theme.ts: ROW, INSET, INDENT, BOX_CELL spacing

Goal: a list view (or a mode of the existing one) that cuts noise down to one thing per row, so the eye can land on what to do next without scanning signals. Keep the desktop's outline rules (children stay under their parent) and keyboard walk (j / k). Write down any change to desktop/design.md.
