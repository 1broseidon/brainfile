---
id: task-43
title: "Calm ADHD list view: take the mobile app's list as the reference"
column: in-progress
position: 1
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
updatedAt: "2026-10-13T16:05:36.512Z"
decisions:
  - decision-5
---

## Description
A calmer, ADHD-friendly way to read the task list on the desktop, modelled on how brainfile-mobile shows its board. The mobile list is quieter than the desktop's rows (desktop/design.md, Rows): at rest a row is its status box, its title on one line, and at most one signal, the loudest it has. The ID, tags, assignee and everything else wait for the task's sheet. Pressing is a fill, and there are no lines between rows.

Reference (in ~/Projects/personal/brainfile-mobile):
- src/components/rows.tsx: TaskRow and the calm row layout
- src/data/outline.ts: restingSignal (choosing the one signal), subtaskCount, taskProgress
- src/screens/Board.tsx: how the list is grouped and nested
- src/theme.ts: ROW, INSET, INDENT, BOX_CELL spacing

Goal: a list view (or a mode of the existing one) that cuts noise down to one thing per row, so the eye can land on what to do next without scanning signals. Keep the desktop's outline rules (children stay under their parent) and keyboard walk (j / k). Write down any change to desktop/design.md.

## Log
- 2026-10-13T16:05:39.771Z: [claude] Calm list added as a mode of the desktop list (Settings › List › Calm list, ⇧V, palette; off until turned on): box, one-line title, one resting signal; nearest done first, backlog/done rest folded, three roots at a glance with `N more`; outline and j / k kept (N more is a walk stop). Spec in desktop/design.md › Calm list, decision-5; tests in desktop/test/calm.test.ts (99/99 pass, typecheck clean). Not run in the app. On branch dispatch/task-43.
