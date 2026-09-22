---
id: task-11
type: task
title: "Completions never write ledger.jsonl \u2014 legacyMode everywhere"
tags:
  - core
  - ledger
  - bug
relatedFiles:
  - core/src/taskOperations.ts
  - cli/src/commands/complete.ts
createdAt: "2026-08-12T06:32:35.200Z"
completedAt: "2026-08-13T02:53:42.732Z"
---

## Description
Found while verifying brief: complete.ts:74, task_complete_tool.ts:60, and moveTaskFileToColumn's auto-complete all pass legacyMode: true, so buildLedgerRecord/appendLedgerRecord never run — .brainfile/logs/ledger.jsonl doesn't exist and core warns 'falling back to legacy markdown logs' on every ledger read. The board's agent instructions even claim completions are 'recorded in ledger.jsonl'. Decide: dual-write (ledger record AND archived markdown — likely right: ledger for queries, markdown for humans) or fix the default. Affects brief's completion lane, log/search over history, and getTaskContext.

## Log
- 2026-08-13T02:53:42.732Z: [reconstructed] Archived body lost to migrate --logs-to-ledger (destructive pre-fix); frontmatter and description restored from ledger record.
