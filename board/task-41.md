---
id: task-41
title: "Phone link, phone side: scan, connect, agents on the board, chat"
column: todo
position: 0
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
    completed: false
  - id: task-41-7
    title: "Chat sheet: turns + harness/model + send + stop"
    completed: false
  - id: task-41-8
    title: Tests + simulator against link:dev
    completed: false
createdAt: "2026-10-13T04:15:11.912Z"
updatedAt: "2026-10-13T05:01:35.915Z"
---

## Description
Protocol 1 in docs/link.md. Settings, Desktop: Link desktop (camera QR or pasted link), Linked/Away, Forget. Connection manager over noise.ts. Desk projects join GitHub ones by owner/name; desk-only boards appear. Via the desk: live run as a row's loudest signal, asks band and sheet, Hand to… and Stop on the task sheet, review summary, a chat key and chat sheet with harness and model pickers. Falls back to GitHub when the desk is away.

## Log
- 2026-10-13T04:39:37.743Z: [claude] Phone: link parsing, Keychain keys, connection manager (head starts, backoff, calls, events, close codes) and the desk store/adapter/joins/chat in pure TS, tested against a fake desk on noise.ts's Responder.
