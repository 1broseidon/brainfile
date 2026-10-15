---
id: task-87
title: "Mobile: sessions — the chat's history as the dock: chats, discussions and hand-offs, one signal each"
column: in-progress
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
updatedAt: "2026-10-15T01:35:09.704Z"
---

## Description
decision-8 on the phone. The Chat screen's history becomes the board's sessions, newest first, up to 12 a board: chat threads, discussions (a thread about a task) and hand-offs (from Hand to… or the chat, from live runs and the board's assignees). A row is its mark (the chat's for a chat or discussion, the task's status box for a hand-off), its title (a chat's first question, else the task's title) and one signal, as desktop/src/renderer/lib/sessions.ts restingWord: the Working line while at work (`codex · Editing…`, or `Needs you` in warn), else the agent muted with Reply waiting, Done, Stopped, Ready to merge, or Failed and Conflicts in warn. A chat opens in Chat; a discussion in Chat with its task as context; a hand-off opens its task sheet. Swipe to close a session (a thread stays in history).
