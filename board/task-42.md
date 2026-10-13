---
id: task-42
title: "Chat: stream agent replies as they arrive, fading in line by line"
column: backlog
position: 5
description: "Agent (ACP) response text should show up as it streams in, on desktop and on the phone, but not as a character-by-character typing stream. Buffer incoming deltas until a line is complete (newline, or the end of the message), then reveal that line with a short fade-in. The partial line in progress stays hidden until it completes or the turn ends, so nothing jitters or reflows mid-word. Markdown blocks (lists, code fences, tables) should still render correctly as lines arrive. Respect reduced-motion: no fade, just appear. The phone gets its text over the desk link (task-40/41), so it should receive the same deltas and apply the same per-line reveal."
priority: medium
tags:
  - desktop
  - mobile
  - chat
  - acp
relatedFiles:
  - desktop/design.md
subtasks:
  - id: task-42-1
    title: "Desktop chat: buffer ACP text deltas by line and fade each completed line in"
    completed: false
  - id: task-42-2
    title: "Phone chat (brainfile-mobile): receive streamed deltas over the desk link and fade lines in the same way"
    completed: false
  - id: task-42-3
    title: Keep markdown (code fences, lists, tables) rendering correctly while lines arrive
    completed: false
  - id: task-42-4
    title: "Reduced-motion: show lines without the fade"
    completed: false
createdAt: "2026-10-13T05:40:02.019Z"
---

## Description
Agent (ACP) response text should show up as it streams in, on desktop and on the phone, but not as a character-by-character typing stream. Buffer incoming deltas until a line is complete (newline, or the end of the message), then reveal that line with a short fade-in. The partial line in progress stays hidden until it completes or the turn ends, so nothing jitters or reflows mid-word. Markdown blocks (lists, code fences, tables) should still render correctly as lines arrive. Respect reduced-motion: no fade, just appear. The phone gets its text over the desk link (task-40/41), so it should receive the same deltas and apply the same per-line reveal.
