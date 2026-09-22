---
id: task-13
title: "spec-9 phase 2: sync verb, remote config, gitattributes + merge driver, brief auto-sync"
tags:
  - storage
  - git
  - sync
assignee: claude
parentId: spec-9
createdAt: "2026-09-22T04:41:06.119Z"
updatedAt: "2026-09-22T04:59:48.774Z"
completedAt: "2026-09-22T04:59:48.774Z"
---

## Description
brainfile sync [--pull|--push] [--set-remote <name|url>]: fetch, ff or merge --no-edit, push; git config brainfile.remote / brainfile.remoteBranch / brainfile.autosync; .gitattributes on the board branch (ledger merge=union, board/*.md merge=brainfile); 'brainfile merge-driver' field-level LWW + union of log lists; brief syncs first unless --offline; network failures are one-line warnings; tests with two clones and a bare remote.

## Log
- 2026-09-22T04:59:48.569Z: Phase 2 done: cli/src/utils/board-sync.ts (remote config brainfile.remote/remoteBranch/autosync, fetch→ff/merge→push, complete-vs-edit resolution, state/sync.json), cli/src/commands/merge-driver.ts (field-level LWW by updatedAt, tie→theirs; list-union for log conflicts; hidden 'brainfile merge-driver' command), cli/src/commands/sync.ts (--pull/--push/--set-remote/--remote-branch/--autosync/--json; --set-remote in a repo without a board materializes it), .gitattributes + merge.brainfile.driver registered by init/migrate/sync, brief and the MCP brief tool sync first unless offline, materialize honors the configured remote. 11 tests in board-sync.test.ts (two clones + bare boards remote; both-move resolves to the later move; ledger union; origin never gets board refs; unreachable remote is a warning). core now exports parseFrontmatter/serializeFrontmatter.
