---
id: decision-8
title: The dock holds agent sessions, and the chat is a pane on the right that hides without losing its thread
type: decision
status: current
claimKey: desktop.dock.sessions
kind: decision
stance: requires
subject: dock tabs as agent sessions
tags:
  - desktop
  - dock
  - chat
createdAt: "2026-10-13T19:25:57.343Z"
---

## Description
The dock holds agent sessions, and the chat is a pane on the right that hides without losing its thread

A dock tab is an agent session on the board in front: a board chat, a discussion, or a hand-off. It shows its agent and live state (Working, Needs you, a reply waiting, done) and opens that session where it was left: a chat or a discussion in the chat pane (a discussion with its task in the task pane beside it), a hand-off as its run in the chat pane with the task beside it. Every thread started is its own tab until its × closes it; its thread stays in history. Opening a task no longer makes a tab: recently opened documents are in the palette. Another board's sessions are not in the dock; one that needs you shows in the strip as asks already do. The chat is a pane at the window's right edge, beside the task pane, with its own gutter; when the board would be left under 520px the task and chat panes lie over it together. Its header hides it (also Esc and ⌘J) and starts a new chat (+). Hiding keeps the thread, its scroll and the draft; the chat key brings back the session last shown, never a blank page, which only + gives. Why: the popover was confined to the board pane beside an open task, the dock read as sessions but opened documents, and closing a discussion lost it.
