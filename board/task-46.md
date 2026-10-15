---
id: task-46
title: "Dock and chat: sessions in the dock, the chat as a right-hand pane that hides"
priority: high
tags:
  - desktop
  - dock
  - chat
assignee: claude
relatedFiles:
  - desktop/src/renderer/components/ChatPane.svelte
  - desktop/src/renderer/components/ChatKey.svelte
  - desktop/src/renderer/components/Dock.svelte
  - desktop/src/renderer/App.svelte
  - desktop/src/renderer/lib/state.svelte.ts
  - desktop/design.md
decisions:
  - decision-8
createdAt: "2026-10-13T19:25:57.699Z"
updatedAt: "2026-10-15T21:25:56.230Z"
subtasks:
  - id: task-46-1
    title: "Phase A: the chat is a pane on the right; hide keeps the thread; the key reopens it"
    completed: true
  - id: task-46-2
    title: "Phase B: dock tabs are sessions (chats, discussions, hand-offs); recent documents in the palette"
    completed: true
  - id: task-46-3
    title: "Phase C: a hand-off's tab opens its run (steps, asks, Stop) in the chat pane, the task beside it"
    completed: false
column: todo
position: 10
---

## Description
decision-8. In three phases, each QA'd live by the person in the dev app before the next: A, the chat is a pane on the right that hides without losing its thread; B, the dock holds sessions (chats, discussions, hand-offs) and recent documents move to the palette; C, a hand-off's tab opens its run (steps, asks, Stop) in the chat pane with the task beside it.

## Log
- 2026-10-15T00:51:06.480Z: Reopened into In Progress
- 2026-10-13T19:30:20.101Z: [claude] Phase A built, not committed: ChatPop split into ChatKey (the key at the dock's end, pressed while the chat shows) and ChatPane (a pane at the window's right edge with its own gutter, 340-600px, 400 to start). App.svelte lays out task and chat panes beside the board, or over it together under 520px. openChat no longer blanks: the thread last shown is kept per board (localStorage brainfile.thread) with its scroll and draft; + is the only new chat; hide is the band's mirrored rail key, Esc and ⌘J. A discussion picked from history opens its task. design.md › Macrostructure, Dock and Ask the board updated. 102/102 tests, typecheck clean. Waiting for QA.
- 2026-10-13T19:57:24.107Z: [claude] From QA: the Working line (with any ask above it) now sits just above the composer, on its text edge, instead of in the thread; a reply that has just landed comes in from the top, a soft 32px edge passing down it at about 70ms a line (320ms to 1.6s), the thread following the edge; older replies and reduced motion show at once. design.md › Motion and Ask the board updated.
- 2026-10-14T04:21:20.702Z: [xena] Checkpoint reconciliation: Phase A committed in a82f644 (ChatPane.svelte + ChatKey.svelte, App.svelte). Corrects 'Phase A built, not committed' log. Phases B/C still open; stays in-progress.
- 2026-10-14T04:27:20.849Z: [claude] Phase A committed in a82f644 on feat/desktop-app (supersedes the earlier "built, not committed" note); Phases B and C still open.
- 2026-10-14T22:18:42.309Z: [claude] Phase B built and committed on dispatch/task-46 (3c71126), waiting for live QA: dock tabs are the board's sessions (each thread shown until ×, each hand-off from its start) with agent and state (Working, Reply waiting, Done/Stopped/Failed, Ready to merge/Conflicts); a chat opens in the chat pane, a discussion with its task beside it, a hand-off as its task until phase C. Opening a document makes no tab; the palette shows Recent first (old tabs migrated there). lib/sessions.ts + test; design.md Macrostructure and Dock updated; changes/task-46-dock-sessions.md. 212/212 tests, typecheck and build clean. Phase C not started, as it waits on B's QA.
