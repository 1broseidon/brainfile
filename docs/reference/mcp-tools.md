---
title: MCP Tool Reference (Ledger)
description: Reference for ledger MCP tools and completion metadata fields
---

# MCP Tool Reference (Ledger)

This page documents the MCP tools for interacting with the Brainfile ledger.

## `get_task_context`

Returns structured historical context for a task by matching its `relatedFiles` and contract deliverable paths.

| Input | Type | Required | Default | Notes |
|---|---|---|---|---|
| `taskId` | `string` | Yes | - | The ID of the task to retrieve context for (supports `task_id` alias). |
| `maxEntries` | `number` | No | `5` | The maximum number of ledger entries to return (supports `max_entries` alias). |
| `maxAgeDays` | `number` | No | `90` | The lookback window in days (supports `max_age_days` alias). |
| `file` | `string` | No | server default | Optional brainfile path override. |

## `query_ledger`

Returns ledger records filtered via indexed fields.

| Input | Type | Required | Default | Notes |
|---|---|---|---|---|
| `assignee` | `string` | No | - | Filter by exact assignee name. |
| `tags` | `string[]` | No | - | Filter by one or more tags (OR match). |
| `since` | `string` | No | - | The ISO 8601 start date for the query (`completedAt >= since`). |
| `until` | `string` | No | - | The ISO 8601 end date for the query (`completedAt <= until`). |
| `files` | `string[]` | No | - | Filter by files touched across `filesChanged`, `relatedFiles`, or `deliverables`. |
| `contractStatus` | `string \| string[]` | No | - | Filter by one or more contract statuses (supports `contract_status` alias). |
| `file` | `string` | No | server default | Optional brainfile path override. |

Supported contract statuses: `ready`, `in_progress`, `delivered`, `done`, `failed`, `blocked`.

## `get_stats`

Returns aggregate analytics from ledger records.

| Input | Type | Required | Default | Notes |
|---|---|---|---|---|
| `assignee` | `string` | No | - | Filter statistics by a specific assignee. |
| `since` | `string` | No | - | Filter statistics to records completed on or after this ISO 8601 date. |
| `tag` | `string` | No | - | Filter statistics to records containing a specific tag. |
| `file` | `string` | No | server default | Optional brainfile path override. |

The response includes totals, cycle-time metrics, breakdowns (`type`, `contractStatus`, `assignee`, `tag`), and top touched files.

## `get_file_history`

Returns recent ledger records that touched a specific file path.

| Input | Type | Required | Default | Notes |
|---|---|---|---|---|
| `filePath` | `string` | Yes | - | The file path to query history for (supports `file_path` alias). |
| `last` | `number` | No | `10` | The maximum number of entries to return. |
| `since` | `string` | No | - | The ISO 8601 start date for the query. |
| `file` | `string` | No | server default | Optional brainfile path override. |

## Updated `complete_task`

The `complete_task` tool now accepts ledger metadata parameters for v2 file-based boards:

| Input | Type | Required | Default | Notes |
|---|---|---|---|---|
| `summary` | `string` | No | `Completed: {title}` | The retrospective summary for the completion record. |
| `filesChanged` | `string[]` | No | inferred | A list of modified file paths. Defaults to git diff inference if omitted. |
| `files_changed` | `string[]` | No | inferred | Alias of `filesChanged`. |

## Updated `contract_deliver`

The `contract_deliver` response now includes a prompt to prepare the `summary` and `filesChanged` list for the subsequent `complete_task` call.
