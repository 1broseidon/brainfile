---
id: task-46
title: "Dock and chat: sessions in the dock, the chat as a right-hand pane that hides"
column: in-progress
position: 2
priority: high
tags:
  - desktop
  - dock
  - chat
assignee: claude
relatedFiles:
  - desktop/src/renderer/components/ChatPop.svelte
  - desktop/src/renderer/components/Dock.svelte
  - desktop/src/renderer/App.svelte
  - desktop/src/renderer/lib/state.svelte.ts
  - desktop/design.md
decisions:
  - decision-8
createdAt: "2026-10-13T19:25:57.699Z"
updatedAt: "2026-10-13T19:26:11.983Z"
subtasks:
  - id: task-46-1
    title: "Phase A: the chat is a pane on the right; hide keeps the thread; the key reopens it"
    completed: false
  - id: task-46-2
    title: "Phase B: dock tabs are sessions (chats, discussions, hand-offs); recent documents in the palette"
    completed: false
  - id: task-46-3
    title: "Phase C: a hand-off's tab opens its run (steps, asks, Stop) in the chat pane, the task beside it"
    completed: false
---

## Description
decision-8. In three phases, each QA'd live by the person in the dev app before the next: A, the chat is a pane on the right that hides without losing its thread; B, the dock holds sessions (chats, discussions, hand-offs) and recent documents move to the palette; C, a hand-off's tab opens its run (steps, asks, Stop) in the chat pane with the task beside it.
