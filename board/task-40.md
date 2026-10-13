---
id: task-40
title: "Phone link, desktop side: sealed LAN server, pairing QR, bridge to the API"
column: in-progress
position: 1
priority: high
tags:
  - mobile
  - link
assignee: claude
parentId: spec-17
subtasks:
  - id: task-40-1
    title: noise.ts copied with vector tests
    completed: true
  - id: task-40-2
    title: "Link store: desk key in safeStorage + linked phones"
    completed: true
  - id: task-40-3
    title: "Server: handshake + pairing + close codes + limits"
    completed: true
  - id: task-40-4
    title: "Bridge: whitelisted calls + events + board refcount"
    completed: false
  - id: task-40-5
    title: decide and live in host and agents
    completed: false
  - id: task-40-6
    title: Settings Phone section with QR and Forget
    completed: false
  - id: task-40-7
    title: Node end-to-end tests with a fake phone
    completed: false
  - id: task-40-8
    title: link:dev harness for the simulator
    completed: false
createdAt: "2026-10-13T04:15:11.393Z"
updatedAt: "2026-10-13T04:39:51.697Z"
---

## Description
Protocol 1 in brainfile-mobile/docs/link.md. Settings, Phone: link switch, Link a phone (QR + Copy link), linked phones with Forget. A ws server on port 47210 running Noise IK (desktop/src/link/noise.ts, identical to the phone's), bridging the whitelisted calls to the host and agents processes and forwarding projects, board and agent events. New calls: decide, live. Branch feat/phone-link.

## Log
- 2026-10-13T04:21:57.436Z: [claude] noise.ts copied verbatim to desktop/src/link with the IK and Hotline vector tests (b4b7b91 on feat/phone-link)
