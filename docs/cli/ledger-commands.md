---
title: CLI Ledger Commands
description: Reference for ledger-backed completion, history, context, and analytics commands
---

# CLI Ledger Commands

Brainfile tracks completion history in `.brainfile/logs/ledger.jsonl`. Use these commands to query and manage the ledger.

Legacy `logs/*.md` files are converted automatically by `brainfile migrate`. Use `brainfile migrate --clean` to remove migrated markdown log files after conversion.

## complete

Complete a task and append a record to `logs/ledger.jsonl`.

```bash
brainfile complete --task task-139
brainfile complete --task task-139 --summary "Implemented ledger commands"
brainfile complete --task task-139 --files-changed "cli/src/commands/ledger.ts,cli/src/cli.ts"
brainfile complete --task task-139 --auto-files false
```

**Options:**
- `--task <id>`: The ID of the task to complete (required).
- `-s, --summary <text>`: A retrospective summary of the work.
- `-f, --files-changed <paths>`: A comma-separated list of modified file paths.
- `--auto-files [enabled]`: Automatically infer changed files from git diff (default: `true`).
- `--force`: Force completion of an epic even if it has active child tasks.
- `--file <path>`: Brainfile path (default: `brainfile.md`).

## ledger

Query ledger records with combinable filters.

```bash
brainfile ledger
brainfile ledger --assignee codex --tag cli
brainfile ledger --since 2026-02-01 --until 2026-02-29 --contract-status done
```

**Options:**
- `--assignee <name>`: Filter records by assignee.
- `--since <date>`: Filter by completion date (on or after).
- `--until <date>`: Filter by completion date (on or before).
- `--tag <name>`: Filter records by tag.
- `--contract-status <status>`: Filter by contract status (`ready`, `in_progress`, `delivered`, `done`, `failed`, `blocked`).
- `-f, --file <path>`: Brainfile path.

## history

Show completion history for a specific file path.

```bash
brainfile history cli/src/commands/complete.ts
brainfile history core/src/ledger.ts --last 5 --since 2026-01-01
```

**Arguments:**
- `<file-path>`: The file path to query history for.

**Options:**
- `--last <N>`: The maximum number of history entries to return.
- `--since <date>`: Filter by completion date (on or after).
- `-f, --file <path>`: Brainfile path.

## stats

Show aggregated ledger analytics.

```bash
brainfile stats
brainfile stats --since 2026-01-01
brainfile stats --assignee codex --tag ledger
```

**Reported metrics:**
- Total tasks completed.
- Average cycle time (in hours).
- Top assignee.
- Tag distribution.
- Validation failure rate (`failed / (done + failed)`).

**Options:**
- `--assignee <name>`: Filter statistics by assignee.
- `--since <date>`: Filter by completion date (on or after).
- `--tag <name>`: Filter statistics by tag.
- `-f, --file <path>`: Brainfile path.

## context

Show recent related history for a task using `relatedFiles` and contract deliverables.

```bash
brainfile context task-139
brainfile context task-139 --max-entries 10 --max-age 30
```

**Arguments:**
- `<task-id>`: The ID of the task to retrieve context for.

**Options:**
- `--max-entries <N>`: The maximum number of context entries (default: `5`).
- `--max-age <days>`: The lookback window in days (default: `90`).
- `-f, --file <path>`: Brainfile path.
