---
id: epic-7
title: "Mobile parity 2: what the desktop gained since epic-3 — merge from the phone, waiting on you, sessions"
type: epic
column: todo
position: 3
priority: high
tags:
  - mobile
  - desktop
  - parity
  - link
createdAt: "2026-10-15T01:34:14.107Z"
---

## Description
Since epic-3 closed (2026-10-14 03:00) the desktop gained Ready to merge (task-69), Merge that lands and completes (decision-12, task-63), Waiting on you in the feed, and the dock as sessions (task-46 phase B). The link has not changed since, so the phone cannot see or do any of it. This epic brings it over in linked mode only, keeping task-57's rule: iOS for the chrome, the desktop for the content (Plex, Forge tokens, calm rows, one signal a row, plain copy per decision-10).

Contract first: brainfile-mobile docs/link.md gains the `merge` feature (readyToMerge, mergeReview, discardReview), offered in the hello so an older desk degrades. Send back needs nothing new: noteTask, patchTask and dispatch are on the link already.

Children run in parallel, three at most: the desk's side (task A), Merge and Waiting on you on the phone (task B), sessions on the phone (task C). Not in scope: a hand-off's run view (waits on task-46 phase C), chat history sync (task-59), leads.

## Log
- 2026-10-15T01:55:50.902Z: [claude] Phone side merged on brainfile-mobile main (task-86 c8f6acd, task-87 728e750, merge f1a3004, polish after simulator QA against link:dev). task-85 waits in Review on dispatch/task-85 (509a1ae): merging it lets the real desktop offer merge to the phone.
