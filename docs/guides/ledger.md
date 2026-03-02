---
title: Ledger and Context Guide
description: How Brainfile stores completion history in logs/ledger.jsonl and uses it for context and analytics
---

# Ledger and Context Guide

Brainfile tracks completed work in an append-only JSONL ledger at `.brainfile/logs/ledger.jsonl`. Each line represents a single completion record.

The ledger is additive to v2. Existing board and task behavior remains unchanged; no protocol version bump is required.

## Why the Ledger Exists

The ledger provides a queryable completion history without requiring agents to parse numerous historical Markdown files:

- **Fast Filtering**: Query by assignee, type, tags, and date ranges.
- **Consistent Metrics**: Track lifecycle data like `cycleTimeHours` and `validationAttempts`.
- **Improved Context**: Better retrieval for planning and follow-up work.
- **Auditable Snapshots**: Immutable history of completion-time metadata.

## Record Format (JSONL)

`ledger.jsonl` is newline-delimited JSON. Each line must validate against the v2 ledger record schema:

- **Schema**: [ledger-record.json](https://brainfile.md/v2/ledger-record.json)
- **Reference**: [Ledger Schema Reference](/reference/ledger-schema)

**Example record:**

```json
{"id":"task-137","type":"task","title":"Add ledger record schema","filesChanged":["protocol/v2/ledger-record.json"],"createdAt":"2026-03-01T10:00:00Z","completedAt":"2026-03-01T13:30:00Z","cycleTimeHours":3.5,"summary":"Added schema and docs for the completion ledger."}
```

Because this is append-only JSONL, writes are efficient and history remains immutable.

## Completion Flow

When a task is completed:

1. The `complete` command generates a ledger record by combining task data, contract data, and runtime completion metadata.
2. The record is appended as a new line to `.brainfile/logs/ledger.jsonl`.
3. Context and analytics APIs read from the ledger for historical lookups.

### Record Data Sources

- **Task Frontmatter**: `id`, `type`, `title`, `tags`, `relatedFiles`, `createdAt`
- **Contract Metadata**: `deliverables`, `constraints`, `contractStatus`, `validationAttempts`
- **Completion Runtime**: `filesChanged`, `completedAt`, `cycleTimeHours`, `summary`

## Context Queries (`get_task_context`)

Use the `get_task_context` MCP tool to retrieve structured historical context for a task ID or related workstream.

The tool combines:

- Current task state (if active)
- Ledger history for the same `id`
- Related task history via `parentId`, `tags`, and `relatedFiles`
- File-level signals from `filesChanged`

This provides agents with a compact, queryable summary, eliminating the need to scan multiple Markdown log files.

## File History

The `filesChanged` field enables path-based history tracking:

- Identify all completed tasks that modified a specific file (e.g., `src/auth.ts`).
- Analyze ownership trends by cross-referencing assignees and file paths.
- Reconstruct implementation timelines for specific modules.

### Intent vs. Impact

- `filesChanged`: The files that were actually modified during completion (Impact).
- `relatedFiles`: The files declared as task context (Intent).

Pairing these fields supports both impact and intent analysis for better system understanding.

## Analytics

Ledger records support straightforward reporting and insights:

- **Throughput**: Tasks completed per day or week.
- **Cycle Time**: Aggregate `cycleTimeHours` by type, assignee, or priority.
- **Rework Indicators**: Identify tasks with high `validationAttempts`.
- **Scope Patterns**: Analyze deliverable counts and file changes per task.

**Example `jq` queries:**

```bash
# Average cycle time for tasks
jq -s '[.[] | select(.type=="task") | .cycleTimeHours] | add / length' .brainfile/logs/ledger.jsonl

# Most frequently changed files
jq -r '.filesChanged[]' .brainfile/logs/ledger.jsonl | sort | uniq -c | sort -nr
```

## Related References

- [Protocol Specification](/reference/protocol)
- [Ledger Schema Reference](/reference/ledger-schema)
- [Contract Schema Reference](/reference/contract-schema)
