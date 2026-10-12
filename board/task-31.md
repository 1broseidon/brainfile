---
id: task-31
title: "Command palette: the top is janky (scope chip, field and first section collide)"
column: review
position: 3
priority: medium
tags:
  - desktop
  - palette
  - polish
createdAt: "2026-10-12T21:01:50.480Z"
updatedAt: "2026-10-12T21:40:56.525Z"
---

## Description
Screenshot 2026-10-12 16:01. The palette's top reads broken:

- The `every project` scope chip sits above the field, half out of the panel's top edge and cut off.
- The field has no search mark and no room: its text ("Type a command or search tasks…") runs straight into the `Actions` section label below it, with no line or space between field and results.
- The field and its chip are stacked in a column (`.field` is `flex-direction: column`, `desktop/src/renderer/components/Palette.svelte` ~L142, L208-233), so the chip adds height above the input instead of sitting inside it.

Fix: one field row at the top of the pop: the search mark, the input, and the scope as a quiet mono chip at the row's right end (or a prefix inside the field); a hairline under the row; the first section label stepped down from it on the 4px grid. Check every state: empty, typing, no project open (no chip), narrow window, light theme.

## Log
- 2026-10-12T21:40:54.309Z: [claude] Fixed on feat/palette-top (275a126), not merged. Cause: the palette's .field wrapper also took the global .field rule in app.css (a 28px sunk well), so the scope chip stacked above the input was squeezed out of the panel top and the text ran into Actions. Now one 48px query row on the pop: search mark, input, 'every project' chip at the end (only with a board open), hairline under it like the menu filter. Insets match the entries (20px), so mark/text/chip line up with icon/label/key columns; section labels sit on the icons' ink, the first 16px below the line. design.md gained a palette bullet. svelte-check 0/0, vite + electron builds OK. Captures: /tmp/palette.png, /tmp/palette-typing.png, /tmp/palette-noproject.png, /tmp/palette-light.png, /tmp/palette-narrow.png (960x600, long query), before: /tmp/palette-before.png.
