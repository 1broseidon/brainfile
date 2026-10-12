---
id: spec-5
title: "Web board: first non-CLI frontend on browser-safe core"
type: spec
tags:
  - product
  - web
  - frontend
createdAt: "2026-08-12T04:28:46.895Z"
description: "Follows spec-9 (board on a branch, shipped in phases 1-3). The board is now a synced worktree with per-mutation commits, a merge driver and autosync, so the scope question answers itself: read-first 'brainfile serve' over the board worktree; mutations go through the same core layer and commit like the CLI does (commitBoard + autosync push); live updates from the existing file watcher plus the autosync fetch (autosync=full) instead of a bespoke poller. This is the human-facing surface for people on other machines who will not install a CLI; the shared state problem it used to imply is already solved by the branch. Original note: validate the thin-frontend platform with a real second frontend; core already ships a browser-safe entrypoint (Apr 2026); reuses the V2 mutation layer, searchTasksRanked, and diffBoards/hashBoard realtime diffing. Local server first; static export optional."
updatedAt: "2026-10-12T01:32:46.251Z"
completedAt: "2026-10-12T01:32:46.251Z"
---

## Description
Validate the thin-frontend platform with a real second frontend: minimal read-first web board (brainfile serve → local web UI, or static export). core already ships a browser-safe entrypoint (Apr 2026). Reuses the V2 mutation layer + searchTasksRanked + realtime diffing (diffBoards/hashBoard were built for exactly this). Scope decision: read-only viewer vs mutating app; local server vs hosted. After inbox design, unless it becomes the demo vehicle for relaunch.

## Log
- 2026-10-12T01:32:45.969Z: [claude] Closed 2026-10-11: superseded by the desktop app (feat/desktop-app), the first non-CLI frontend. It reads and writes boards through @brainfile/core and the new @brainfile/core/repo, committing and syncing exactly like the CLI, so a separate web board is no longer planned.
