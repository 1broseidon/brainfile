---
id: task-4
type: task
title: "Revisit @modelcontextprotocol/sdk pin (1.22.0)"
tags:
  - deps
  - cli
createdAt: "2026-08-11T21:59:31.072Z"
completedAt: "2026-08-12T04:23:37.218Z"
---

## Description
SDK 1.30.0 types OOM tsc (>12GB) against zod 3.25 — pinned exactly 1.22.0 in cli/package.json. Watch upstream releases; upgrade needs a compile-memory check (npx tsc in cli/ should stay seconds, not minutes).

## Log
- 2026-08-12T04:23:37.218Z: [reconstructed] Archived body lost to migrate --logs-to-ledger (destructive pre-fix); frontmatter and description restored from ledger record.
