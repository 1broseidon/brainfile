---
title: Ledger Query API
description: Programmatic access to completion history in logs/ledger.jsonl via @brainfile/core
---

# Ledger Query API

Completion history lives in `.brainfile/logs/ledger.jsonl` (see [Ledger Schema Reference](/reference/ledger-schema)). It is queried through the **`@brainfile/core`** library, not through dedicated MCP tools.

::: warning Not MCP tools
There are no `get_task_context`, `query_ledger`, `get_stats`, or `get_file_history` MCP tools. The MCP server exposes 10 task/board tools (see [MCP Server](/tools/mcp#available-tools)); ledger analytics are a library concern. From an assistant, the closest MCP affordance is the `search` tool with `recent: true`, which lists recently completed tasks.
:::

## Access paths

| Need | Use |
|------|-----|
| List recent completions from an assistant | MCP `search` tool with `recent: true` |
| View/search completed task logs from the CLI | `brainfile log --recent`, `brainfile log --search "<query>"`, `brainfile log -t <id>` |
| Programmatic ledger queries | `@brainfile/core` functions below |

## Library functions

Import from `@brainfile/core`. All take the **logs directory** (e.g. `.brainfile/logs/`) as their first argument and read from `ledger.jsonl`.

### `readLedger(logsDir): LedgerRecord[]`

Read and parse every record in `ledger.jsonl`. Invalid lines are skipped.

```typescript
import { readLedger } from '@brainfile/core';

const records = readLedger('.brainfile/logs/');
```

### `queryLedger(logsDir, filters?): LedgerRecord[]`

Filter records by indexed fields.

| Filter | Type | Description |
|--------|------|-------------|
| `assignee` | `string` | Exact assignee match |
| `tags` | `string[]` | OR match across tags (case-insensitive) |
| `dateRange` | `{ since?: string; until?: string }` | Bounds on `completedAt` (ISO 8601) |
| `contractStatus` | `string \| string[]` | One or more contract statuses |
| `files` | `string[]` | Match across `filesChanged`, `relatedFiles`, and `deliverables` |

```typescript
import { queryLedger } from '@brainfile/core';

const recent = queryLedger('.brainfile/logs/', {
  assignee: 'codex',
  tags: ['backend'],
  contractStatus: ['done'],
});
```

### `getFileHistory(logsDir, filePath, options?): LedgerRecord[]`

Return records whose `filesChanged` include `filePath`, newest first.

| Option | Type | Description |
|--------|------|-------------|
| `dateRange` | `{ since?: string; until?: string }` | Restrict to a completion window |
| `limit` | `number` | Cap the number of records returned |

```typescript
import { getFileHistory } from '@brainfile/core';

const history = getFileHistory('.brainfile/logs/', 'src/auth.ts', { limit: 10 });
```

### `getTaskContext(logsDir, relatedFiles, deliverables?, options?): TaskContextEntry[]`

Build recent context for a workstream by intersecting task-scoped files (`relatedFiles` plus contract deliverable paths) with ledger history.

```typescript
import { getTaskContext } from '@brainfile/core';

const context = getTaskContext(
  '.brainfile/logs/',
  ['src/auth.ts', 'src/middleware/auth.ts'],
);
```

## Record shape

Each record conforms to the v2 ledger schema. See [Ledger Schema Reference](/reference/ledger-schema) for the full field table and [`ledger-record.json`](https://brainfile.md/v2/ledger-record.json) for the JSON Schema.

## Related references

- [Ledger and Context Guide](/guides/ledger) — How the ledger works and `jq` query recipes
- [Ledger Schema Reference](/reference/ledger-schema) — Field-by-field record reference
- [MCP Server](/tools/mcp) — The 10 task/board MCP tools
- [API Reference](/reference/api) — Full `@brainfile/core` surface
