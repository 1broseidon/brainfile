---
id: task-16
title: "complete: let callers supply filesChanged for the ledger"
column: backlog
position: 6
priority: medium
tags:
  - ledger
  - cli
  - mcp
  - provenance
relatedFiles:
  - cli/src/commands/complete.ts
  - cli/src/mcp/tools/task_complete_tool.ts
  - core/src/taskOperations.ts
  - core/src/ledger.ts
createdAt: "2026-09-23T03:04:32.175Z"
updatedAt: "2026-10-17T05:36:28.744Z"
dispatch:
  agent: claude
  by: cli
  at: "2026-10-17T05:34:13.649Z"
  tries: 1
  claim:
    host: Georges-Mac-Studio
    runner: desktop
    pid: 12851
    at: "2026-10-17T05:36:28.743Z"
assignee: claude
---

## Description
The ledger record has filesChanged and core accepts it (core/src/taskOperations.ts:106, 896; core/src/ledger.ts:347), but neither `brainfile complete` (cli/src/commands/complete.ts:74) nor the MCP task_complete tool passes it. Every record therefore falls back to defaultFilesChanged: contract deliverable paths, else relatedFiles, else `<id>.md` (core/src/ledger.ts:177-189). The ledger records what the task claimed it would touch, not what it touched, which undermines file-history queries over the ledger.

Add `brainfile complete --files <a,b>` and `--files -` (newline-separated paths on stdin, so any tool's output can be piped in, e.g. a git diff --name-only), and a filesChanged argument on the MCP tool. Optionally default to `git diff --name-only <base>` when the task recorded a base commit at pickup.

## Log
- 2026-10-12T01:32:46.807Z: [claude] Verified 2026-10-11: still open. complete.ts and the MCP task_complete tool still never pass filesChanged.
