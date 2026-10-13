---
id: decision-7
title: "The calm list is how the list reads: one switch for the window, on by default"
type: decision
status: current
claimKey: desktop.list.calm
kind: decision
stance: requires
subject: calm list as the list's default reading, a window-wide mode
recheck: If you keep switching back to the full rows, should they be the default again, or is the calm row missing a signal?
supersedes: decision-5
tags:
  - desktop
  - calm
  - list
createdAt: "2026-10-13T18:41:39.624Z"
---

## Description
The calm list is how the list reads: one switch for the window, on by default
The ADHD-friendly reading of the task list (task-43, after brainfile-mobile's board) is a second way of reading the existing list, not a fifth view in the band. It shows one row per task with its status box, title and at most one signal (restingSignal). The groups nearest done come first, the backlog and Done rest folded, and a group shows a glance with `N more`. It belongs to the reader, not to a board, so it is one switch for the whole window (Settings › List › Calm list, ⇧V, the palette), remembered. It is on by default: only a stored "off" turns it off, and the full rows are one ⇧V away. Switching either way keeps your place. Its spec is desktop/design.md › Calm list. The outline rules and the j / k walk are shared with the full list through app.listGroups.
