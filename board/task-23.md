---
id: task-23
title: "Chat: while an agent works with the chat closed, the key widens into its status line"
column: review
position: 7
tags:
  - desktop
  - chat
createdAt: "2026-10-12T18:48:00.289Z"
updatedAt: "2026-10-13T02:09:25.504Z"
assignee: claude
---

## Description
From Linear's minimised agent window, our way. Scope: chat turns on the board in front (`app.liveAsk`), not hand-off runs, which already show on rows.

- **While a turn runs with the chat closed,** the corner key widens into a small pill showing the Working line (`<Working run={live} rotate={false} />`): "claude · Thinking…" holds still and keeps its shimmer. A turn waiting on you shows "Needs you" in warn, as elsewhere. The pill widens and shrinks at 130ms; reduced motion has no transition.
- **When the turn ends,** the key goes back to the square. If the chat is still closed and the turn finished with a reply (not stopped or failed), the key shows a small muted badge in its top-right corner (muted ink: not the accent, not warn), and its tip becomes "Reply waiting". Opening the chat clears it. The badge belongs to the board the turn ran on, so it's still there when you come back to that board.
- **Opening from the pill:** `grow()` in ChatPop starts its clip from the key's real width, not the 32px square.
- **design.md:** Calm's "No indicators at rest" stays as it is for the rest of the app. Add one exception: the chat key may show the unread-reply badge, because a missed reply is worse than the noise of one muted badge. Nothing else gets a status indicator. Also update the "Ask the board" paragraph to describe the pill and the badge.

## Log
- 2026-10-13T01:52:21.915Z: [claude] Agreed with George: the key keeps the Working pill while a turn runs (word held still), then goes back to the square with a muted unread-reply badge until the chat opens. This is the one exception to design.md's "no indicators at rest", because a missed reply is worse UX than the noise of one badge; the rest of design.md is unchanged.
- 2026-10-13T02:09:25.175Z: [claude] Done on branch dispatch/task-23 (d3cf1a9): the chat key widens (130ms) into a pill with the held Working line while a turn runs with the chat closed. A reply that lands with the chat closed leaves a muted ink-3 badge on that board's key (tip "Reply waiting"). Opening the chat clears the badge and opens on that thread. grow() starts from the key's real width, and the dock follows it. design.md has Calm's one exception and an updated Ask the board paragraph. Typecheck and the 92 tests pass. Not checked in the running app.
- 2026-10-13T18:47:34.414Z: [claude] Merged into feat/desktop-app (9ca0606), no conflicts; 102/102 tests and typecheck clean on the merged tree. Worktree and dispatch/task-23 removed.
