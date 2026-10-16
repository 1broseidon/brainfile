---
id: task-87
title: "Mobile: sessions — the chat's history as the dock: chats, discussions and hand-offs, one signal each"
column: review
position: 5
priority: high
tags:
  - mobile
  - chat
  - sessions
  - parity
assignee: claude
parentId: epic-7
createdAt: "2026-10-15T01:34:59.741Z"
updatedAt: "2026-10-15T01:50:28.493Z"
---

## Description
decision-8 on the phone. The Chat screen's history becomes the board's sessions, newest first, up to 12 a board: chat threads, discussions (a thread about a task) and hand-offs (from Hand to… or the chat, from live runs and the board's assignees). A row is its mark (the chat's for a chat or discussion, the task's status box for a hand-off), its title (a chat's first question, else the task's title) and one signal, as desktop/src/renderer/lib/sessions.ts restingWord: the Working line while at work (`codex · Editing…`, or `Needs you` in warn), else the agent muted with Reply waiting, Done, Stopped, Ready to merge, or Failed and Conflicts in warn. A chat opens in Chat; a discussion in Chat with its task as context; a hand-off opens its task sheet. Swipe to close a session (a thread stays in history).

## Log
- 2026-10-15T01:50:28.016Z: [claude] Built on branch task-87 of brainfile-mobile (worktree brainfile-mobile-wt/task-87), commits 11b1c99, d9bb53c, 728e750; not pushed. The chat keeps each board's threads (30) and which it shows; a thread opened from a task is its discussion (every turn takes the task as context). Sessions (src/link/sessions.ts, ported from the desktop's lib/sessions.ts: keepSession, dropSession, handoffRun, restingWord with an optional ready) are every thread shown and every hand-off (Hand to…, the chat, agent events, live), 12 a board, kept across a restart; a closed run's hand-off stays closed. They live on Chat's blank page (New chat), in iOS's own list (SwiftUI List + SwipeActions via @expo/ui) with rows on a board row's edges: mark, title, one signal; trailing swipe is Close; closed threads fold under Earlier. A reply landing away from its thread waits as Reply waiting; the chat comes back as left or on a waiting reply. Ready to merge / Conflicts: Chat.tsx has one marked spot (const ready) where task-86's useReady(projectId) is passed. 140 tests pass (15 new in tests/sessions.test.ts), tsc and prettier clean. Needs simulator QA: list inset under the bar, row taps vs swipe, row width.
- 2026-10-16T06:08:17.980Z: [claude] Closed in cleanup (2026-10-16): shipped on brainfile-mobile main (728e750, merge f1a3004, polish 510ad8c).
