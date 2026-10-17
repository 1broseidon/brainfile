---
id: task-9
title: Remove or gate the fetch() call in core schemaHints
column: backlog
position: 4
tags:
  - core
  - boundary
relatedFiles:
  - core/src/schemaHints.ts
createdAt: "2026-08-12T02:39:48.219Z"
updatedAt: "2026-10-17T05:34:17.325Z"
dispatch:
  agent: claude
  by: cli
  at: "2026-10-17T05:34:13.146Z"
  tries: 1
  claim:
    host: Georges-Mac-Studio
    runner: desktop
    pid: 12851
    at: "2026-10-17T05:34:17.325Z"
assignee: claude
---

## Description
Verifier flagged: core/src/schemaHints.ts contains a pre-existing fetch() call — the only network touchpoint in an otherwise pure fs+parse library, and it contradicts the stated core-stays-network-free boundary (adr-1 era decision). Decide: delete the remote schema-hint fetching, or gate it behind an injected fetcher so core itself stays network-free. Pre-existing, not introduced by the refactor.

## Log
- 2026-10-12T01:32:47.356Z: [claude] Verified 2026-10-11: still open. core/src/schemaHints.ts:70 still calls fetch(schemaUrl).
