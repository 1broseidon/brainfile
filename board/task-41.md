---
id: task-41
title: "Phone link, phone side: scan, connect, agents on the board, chat"
column: review
position: 9
priority: high
tags:
  - mobile
  - link
assignee: claude
parentId: spec-17
subtasks:
  - id: task-41-1
    title: Link URL parsing + key storage + expo-crypto randomness
    completed: true
  - id: task-41-2
    title: Scanner (expo-camera) + paste link + Local Network and camera strings
    completed: true
  - id: task-41-3
    title: "Connection manager: addresses + backoff + calls + events"
    completed: true
  - id: task-41-4
    title: "Projects: desk boards and joins"
    completed: true
  - id: task-41-5
    title: "Board via desk: adapter + run signal + asks"
    completed: true
  - id: task-41-6
    title: "Task sheet: Hand to… + Stop + review"
    completed: true
  - id: task-41-7
    title: "Chat sheet: turns + harness/model + send + stop"
    completed: true
  - id: task-41-8
    title: Tests + simulator against link:dev
    completed: true
createdAt: "2026-10-13T04:15:11.912Z"
updatedAt: "2026-10-13T05:22:59.435Z"
---

## Description
Protocol 1 in docs/link.md. Settings, Desktop: Link desktop (camera QR or pasted link), Linked/Away, Forget. Connection manager over noise.ts. Desk projects join GitHub ones by owner/name; desk-only boards appear. Via the desk: live run as a row's loudest signal, asks band and sheet, Hand to… and Stop on the task sheet, review summary, a chat key and chat sheet with harness and model pickers. Falls back to GitHub when the desk is away.

## Log
- 2026-10-13T04:39:37.743Z: [claude] Phone: link parsing, Keychain keys, connection manager (head starts, backoff, calls, events, close codes) and the desk store/adapter/joins/chat in pure TS, tested against a fake desk on noise.ts's Responder.
- 2026-10-13T05:01:37.362Z: [claude] Phone: screens done and paired with link:dev in the simulator: Settings Desktop group, scanner + Paste link, desk-only section on Projects, joined board through the desk, run signal on rows, asks line + sheet, Hand to… + Stop, chat sheet with harness/model picks. Review block untested live (link:dev's review is always null).
- 2026-10-13T05:06:53.830Z: [claude] Phone: end-to-end against link:dev passed in the simulator: paired via --link, desk-only notes board, joined brainfile board through the desk, Hand to… codex/claude with the run signal, the ask line and sheet answered, and the chat with context, an in-chat ask and the final reply. npm run check green (110 tests). Not pushed; not installed on the iPhone.
- 2026-10-13T05:23:05.066Z: [claude] Gaps closed: phone db4048a, desktop 4654c88. live() returns runs ended in the last 30 min; forget call; Scan again after three 4400 handshakes. Phone 115 tests, desktop 126. App packaged in brainfile-phone-link/desktop/release, not installed yet.
