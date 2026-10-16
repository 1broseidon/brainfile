---
id: task-114
title: "Board writes: every task-file writer takes the same lock, and a board pushes once per quiet period rather than after every commit"
column: todo
position: 13
description: |-
  Two findings from the final pass (2026-10-16).

  **Two writers, one lock.** `swapTaskFile` (dispatchRecord.ts) guards compare-and-swap writers against each other only. The host's `mutate` operations, `fileBoard.note/park/settleLanded`, `recordPullRequestFile` and the CLI's `appendTaskNote` are plain read-modify-write. A plain write that spans a swap (the host vs `brainfile dispatch`; an agent's MCP `note` vs its runner's release) clobbers the claim or the request. The window is under a millisecond but real, and it grows with slow disks. Fix: export the per-file lock and take it in `writeTaskFile` for files under board/ and logs/ (fast path when uncontended), so every writer serialises on the same lock.

  **Pushes per hand-off.** All seven boards here have a remote, so autosync pushes: the host 5 s after each of its commits, and each CLI commit (the chat's or a worker's `brainfile mcp`) spawns a detached `brainfile sync --push`. A hand-off is a request, a claim, each note and patch, the move or release, and the landing, minutes apart: four or more pushes, plus one per note. Today's session made 261 board commits. Fix: a per-board push debounce of 30–60 s shared by the host and the CLI (a timestamp in state/), and when the window is open, let it do the pushing for CLI commits.
tags:
  - core
  - board
  - concurrency
  - sync
relatedFiles:
  - core/src/dispatchRecord.ts
  - core/src/taskFile.ts
  - desktop/src/host/host.ts
  - cli/src/utils/board-autosync.ts
  - core/src/repo/boardSync.ts
createdAt: "2026-10-16T04:50:09.944Z"
---

## Description
Two findings from the final pass (2026-10-16).

**Two writers, one lock.** `swapTaskFile` (dispatchRecord.ts) guards compare-and-swap writers against each other only. The host's `mutate` operations, `fileBoard.note/park/settleLanded`, `recordPullRequestFile` and the CLI's `appendTaskNote` are plain read-modify-write. A plain write that spans a swap (the host vs `brainfile dispatch`; an agent's MCP `note` vs its runner's release) clobbers the claim or the request. The window is under a millisecond but real, and it grows with slow disks. Fix: export the per-file lock and take it in `writeTaskFile` for files under board/ and logs/ (fast path when uncontended), so every writer serialises on the same lock.

**Pushes per hand-off.** All seven boards here have a remote, so autosync pushes: the host 5 s after each of its commits, and each CLI commit (the chat's or a worker's `brainfile mcp`) spawns a detached `brainfile sync --push`. A hand-off is a request, a claim, each note and patch, the move or release, and the landing, minutes apart: four or more pushes, plus one per note. Today's session made 261 board commits. Fix: a per-board push debounce of 30–60 s shared by the host and the CLI (a timestamp in state/), and when the window is open, let it do the pushing for CLI commits.
