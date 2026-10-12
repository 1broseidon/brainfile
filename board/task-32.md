---
id: task-32
title: "Sync health: quiet, true, and in one place"
column: todo
position: 3
priority: high
tags:
  - desktop
  - sync
  - calm
  - bug
createdAt: "2026-10-12T21:12:16.663Z"
---

## Description
Screenshots 2026-10-12 16:10 and 16:11. The top-right corner says three things about sync at once ("3 waiting to send", "⚡ 10 new", and the band's "synced 6m ago ↑6"), the words mean nothing to a person, and the counts are stale: brainfile where reported nothing waiting on any of the six boards at that moment.

- Bug: pending counts are taken when a snapshot is published and never redone after the autosync push or a fetch finishes. Recount after every push, fetch and sync, and publish.
- At rest, no sync text anywhere: not in the strip, not in the board's band. Autosync pushes in seconds.
- When changes really are unsent (a push failed, or waiting longer than about a minute), one sync icon in the strip, no words; its tip names the count and the board ("3 changes on brainfile not shared yet"); its list shows each board with what is waiting and Send now; warn colour only when a push failed.
- The feed is the bolt and a count (`⚡ 10`), no "new"; its tip and panel say "changes from agents and other machines".
- The band's "synced 6m ago ↑6" goes; details live in the strip's list.
- Land after spec-15 phase 4 (desktop two-boards line and health), which touches the same code; fold its two-boards line into the same quiet pattern.
