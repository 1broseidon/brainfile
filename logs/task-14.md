---
id: task-14
title: "spec-9 phase 3: autosync debounce, TUI sync indicator, MANUAL section, spec-5 re-scope, changelog"
tags:
  - storage
  - docs
assignee: claude
parentId: spec-9
createdAt: "2026-09-22T04:41:06.320Z"
updatedAt: "2026-09-22T05:05:10.681Z"
completedAt: "2026-09-22T05:05:10.681Z"
---

## Description
Debounced background push after mutations when autosync=push|full; fetch-before-read in full mode; TUI header 'synced Ns ago'; MANUAL.md 'Sharing a board' section replacing the one-file-per-document justification; CHANGELOG Unreleased entry; spec-5 description updated to 'serve over the synced worktree'.

## Log
- 2026-09-22T05:05:10.482Z: Phase 3 done: cli/src/utils/board-autosync.ts (detached 'sync --push --wait <ms>' child after each committed mutation via an onBoardCommitted listener in board-repo; state/autosync.lock dedupes bursts; BRAINFILE_AUTOSYNC env override; fetchBeforeRead for autosync=full when the last sync is >60s old, wired into CLI preAction, MCP requireV2 and the TUI launch), TUI header 'synced Ns ago' / 'sync failed' via useSyncStatus + HeaderBar statusLabel, MANUAL.md 'Sharing a board' section (+ init/migrate/sync/brief docs, resolution note, one-file-per-document note), CHANGELOG Unreleased entry, spec-5 re-scoped to serve over the synced worktree. 4 more tests in board-sync.test.ts (28 spec-9 tests total). Site builds from MANUAL.
