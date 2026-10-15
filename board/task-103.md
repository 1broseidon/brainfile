---
id: task-103
title: "Desktop: the feed is crowded — polish it, and decide whether to split it or move it from a popover to a docked side bar like the chat pane"
column: todo
position: 11
description: |-
  Seen in QA (epic-8, 2026-10-15). The feed, the titlebar's ⚡ popover, now carries several kinds of things at once:
  - "Waiting on you": every board's hand-offs, each with Pull request and Merge (or Send back) keys.
  - Open pull requests.
  - One "main is N commits ahead of origin" line per board.
  - "Changes", every board edit.

  With five Hotline hand-offs waiting it is a dense column:
  - titles cut to a few words
  - two keys on every row
  - the diff counts and "conflicts with m…" cut off
  - the ahead-of-origin lines wedged between the groups
  - Changes pushed below the fold

  **Decide first** (Discuss, then record it with decide under a `desktop.feed` claim):
  - **Split it?** Act on these (waiting, open pull requests, unpushed) versus what happened (changes). Each could get its own key, or tabs in one surface.
  - **Keep it a popover, or make it a side bar docked on the right like the chat pane?** A docked bar has room for full titles and could stay open while you work. A popover is quick to glance at and gone.
  - **Where do the ahead-of-origin lines belong?** Options: the project rail, the Ready to merge header (already there), or a footer.

  **Then polish** whichever is chosen:
  - one key per row, with the rest under the pointer or a ▾, as the list's Ready to merge row does
  - titles that wrap to two lines, or a tooltip
  - conflicts said in full
  - group by board when more than one board is waiting

  Keep the phone's view in step (link), and update design.md.
tags:
  - desktop
  - design
  - feed
  - polish
relatedFiles:
  - desktop/src/renderer/components/Titlebar.svelte
  - desktop/src/renderer/components/PullRequestSignal.svelte
  - desktop/src/renderer/components/MergeSignal.svelte
  - desktop/src/renderer/lib/state.svelte.ts
  - desktop/design.md
subtasks:
  - id: task-103-1
    title: "Discuss and decide: split or not, popover or docked bar, where unpushed lines live"
    completed: false
  - id: task-103-2
    title: Build the chosen shape
    completed: false
  - id: task-103-3
    title: One action key per row, the rest on hover or a menu; titles and conflicts readable
    completed: false
  - id: task-103-4
    title: design.md and the phone's view updated
    completed: false
  - id: task-103-5
    title: "Hand to… / Lead with on an epic with its own branch: under \"Lands on <target>\", a second line \"children land on dispatch/<epic-id>\""
    completed: false
createdAt: "2026-10-15T20:35:23.327Z"
updatedAt: "2026-10-15T21:51:20.020Z"
---

## Description
Seen in QA (epic-8, 2026-10-15). The feed, the titlebar's ⚡ popover, now carries several kinds of things at once:
- "Waiting on you": every board's hand-offs, each with Pull request and Merge (or Send back) keys.
- Open pull requests.
- One "main is N commits ahead of origin" line per board.
- "Changes", every board edit.

With five Hotline hand-offs waiting it is a dense column:
- titles cut to a few words
- two keys on every row
- the diff counts and "conflicts with m…" cut off
- the ahead-of-origin lines wedged between the groups
- Changes pushed below the fold

**Decide first** (Discuss, then record it with decide under a `desktop.feed` claim):
- **Split it?** Act on these (waiting, open pull requests, unpushed) versus what happened (changes). Each could get its own key, or tabs in one surface.
- **Keep it a popover, or make it a side bar docked on the right like the chat pane?** A docked bar has room for full titles and could stay open while you work. A popover is quick to glance at and gone.
- **Where do the ahead-of-origin lines belong?** Options: the project rail, the Ready to merge header (already there), or a footer.

**Then polish** whichever is chosen:
- one key per row, with the rest under the pointer or a ▾, as the list's Ready to merge row does
- titles that wrap to two lines, or a tooltip
- conflicts said in full
- group by board when more than one board is waiting

Keep the phone's view in step (link), and update design.md.
