---
id: task-12
title: "spec-9 phase 1: tracked storage, resolution, per-mutation commits, init/migrate"
tags:
  - storage
  - git
assignee: claude
parentId: spec-9
createdAt: "2026-09-22T04:41:05.905Z"
completedAt: "2026-09-22T04:50:04.558Z"
updatedAt: "2026-09-22T04:50:04.558Z"
---

## Description
BoardRepo git helper (cli/src/utils/board-repo.ts); core findBrainfile stopAtGitRoot; CLI resolution steps 3-4 (worktree list lookup, materialize from local or origin branch); pre/postAction commit hooks in cli.ts with hand edits committed as 'edit:'; MCP withBoardCommit wrapper on the 7 mutating tools; TUI debounced commits; init --tracked/--plain/--here/-g; migrate --to-branch (subtree split, standalone fold-in, orphan import) and --to-plain; tests with real git.

## Log
- 2026-09-22T04:44:40.451Z: [claude] Code written: board-repo.ts, board-commit-hooks.ts, brainfile-path.ts rewrite, core stopAtGitRoot, init.ts rewrite, migrate-tracked.ts, MCP withBoardCommit on 7 tools + mcp.ts strategy 2b, TUI scheduleBoardCommit (14 sites), cli.ts hooks/options/help. Tests: board-repo.test.ts (13 cases, real git). Next: typecheck + run suites.
- 2026-09-22T04:48:48.609Z: [claude] Phase 1 done: core stopAtGitRoot, cli/src/utils/board-repo.ts (worktree/materialize/commit), resolution via findTrackedBoardDir+materialize, init --tracked/--plain/--here (linked default inside a repo), migrate --to-branch/--to-plain, per-mutation commits via CLI pre/postAction hooks, withBoardCommit on 7 MCP tools, scheduleBoardCommit in TUI actions, 13 real-git tests in board-repo.test.ts. Full run: 638/642 pass; the 4 failures are core discovery watchBrainfiles EMFILE (inotify instances exhausted on this machine, fails on a clean tree too). tsc 2.4s.
