---
id: task-31
title: "Command palette: the top is janky (scope chip, field and first section collide)"
column: backlog
position: 6
priority: medium
tags:
  - desktop
  - palette
  - polish
createdAt: "2026-10-12T21:01:50.480Z"
---

## Description
Screenshot 2026-10-12 16:01. The palette's top reads broken:

- The `every project` scope chip sits above the field, half out of the panel's top edge and cut off.
- The field has no search mark and no room: its text ("Type a command or search tasks…") runs straight into the `Actions` section label below it, with no line or space between field and results.
- The field and its chip are stacked in a column (`.field` is `flex-direction: column`, `desktop/src/renderer/components/Palette.svelte` ~L142, L208-233), so the chip adds height above the input instead of sitting inside it.

Fix: one field row at the top of the pop: the search mark, the input, and the scope as a quiet mono chip at the row's right end (or a prefix inside the field); a hairline under the row; the first section label stepped down from it on the 4px grid. Check every state: empty, typing, no project open (no chip), narrow window, light theme.
