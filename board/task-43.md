---
id: task-43
title: "Calm ADHD list view: take the mobile app's list as the reference"
column: review
position: 9
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
updatedAt: "2026-10-13T18:41:39.626Z"
decisions:
  - decision-5
  - decision-7
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
- 2026-10-13T16:44:16.730Z: [claude] Agreed in discussion: switching modes must keep your place. Fixed in the dispatch/task-43 worktree, not yet committed. setCalm opens the selected task's group (whole if it is past the first three) when calm would hide it. A selected `N more` hands off to the first row that was waiting. ListView scrolls the selected row into view. design.md › Calm list has a "Switching keeps your place" bullet. Typecheck clean, 99/99 pass; being tried in the dev app.
- 2026-10-13T16:49:24.162Z: [claude] Agreed: the calm list is on by default. Only a stored 'off' turns it off. Changed in the dispatch/task-43 worktree (state.svelte.ts, design.md › Calm list), not yet committed. This goes against decision-5's "off until turned on". Its replacement on desktop.list.calm still needs recording.
- 2026-10-13T18:38:41.873Z: [claude] Merged into feat/desktop-app (bbfddef), after committing the two discussion fixes on dispatch/task-43 (65a658b: keep your place when switching; calm on by default). 99/99 on the branch, 102/102 after the merge, typecheck clean. Worktree and branch kept: a Cursor agent worker is open in the worktree. decision-5 still says calm is off until turned on and needs replacing on desktop.list.calm.
- 2026-10-13T18:41:43.871Z: [claude] Agreed in discussion: decision-7 replaces decision-5 on desktop.list.calm. It records calm on by default, matching the merged code and design.md › Calm list. Its recheck is whether the full rows should be the default again if you keep switching back. No open items left; ready to complete once the dispatch/task-43 worktree's Cursor worker is closed.
