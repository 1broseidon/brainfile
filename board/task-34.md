---
id: task-34
title: "Health: fix a board problem from its line (safe fix, or ask an agent)"
column: review
position: 3
priority: high
tags:
  - desktop
  - integrity
  - sync
createdAt: "2026-10-12T21:23:49.425Z"
updatedAt: "2026-10-12T22:05:21.613Z"
subtasks:
  - id: task-34-1
    title: "Health rows: problem sentence under the name, Fix / Ask agent keys; long row tooltip dropped, short words (two copies, old copy in main, N unsent…)"
    completed: true
  - id: task-34-2
    title: Host planFix / fixBoard / undoFix (HOST_METHODS, preload, api); logic in host/fix.ts, Fix offered only when the kept copy holds every other copy
    completed: true
  - id: task-34-3
    title: Fix backs up every copy first (core saveBoardBackup), nothing runs if a backup fails or the plan changed; untrack / adopt / prune per problem
    completed: true
  - id: task-34-4
    title: Inline Confirm / Cancel before it runs; result line with Undo for 10s that puts folder, branch, checkouts and code branch back
    completed: true
  - id: task-34-5
    title: "Ask agent: opens the project's chat and sends the default agent what was found (where survey, notes) with look / explain / ask, change nothing"
    completed: true
  - id: task-34-6
    title: Tests on scratch repos (old copy in main, two copies contained either way, origin's copy, diverged, nothing to fix, backup failure, stale plan) + core saveBoardBackup test
    completed: true
  - id: task-34-7
    title: "Checks: svelte-check 0/0, tsc, vite build, build-electron, desktop npm test 21/21, core jest 879/879, root build; offscreen captures of list, confirm, done, undo, ask"
    completed: true
---

## Description
Screenshot 2026-10-12 16:21. The health list says runprism.ai has an "old copy still in main" and the tip tells you to run brainfile migrate --to-branch, but offers no way to do it. Each problem line offers its fix:

- Fix (safe): back up every copy first (refs/brainfile/backups/<time>-…), then run the settling command (migrate --to-branch for an old copy in the code branch, adopt/merge-boards when one copy already has everything, prune a stray checkout). Only offered when the fix loses nothing; says what it will do in a few words before it runs, and Undo restores the backup.
- Ask an agent: hands the problem to the default agent with a brief (what was found, `brainfile where` output) to review both copies and ask the person how to settle it, never deciding alone; it shows in the dock like any hand-off.
- Applies to two copies of the board, an old copy in the code branch, a checkout elsewhere, an unfinished merge. Core already has adopt, merge-boards, backups and migrate --to-branch (spec-15).

## Log
- 2026-10-12T22:05:21.137Z: [claude] Decision: Fix is offered only when the kept copy already holds every document every other copy has; it backs up every copy to refs/brainfile/backups first (core saveBoardBackup) and runs nothing if a backup fails or the confirmed words no longer match the plan, then untracks the code branch's old copy, adopts the copy that has everything, or forgets a lost checkout. Undo lasts 10s in the window (host keeps it 20s) and refuses if anything moved since. Unfinished merges, diverged or unrelated copies, standalone board repos and checkouts with work get Ask agent only; its brief opens 'Board problem: <short>.' (the chat title) and tells the agent to look, explain, ask, and change nothing. 'Push <branch> to share it.' only when a remote exists. Branch feat/health-fix: 2af04df, 26261f2, bce3e57; not merged (feat/desktop-app moved on). Captures: /tmp/hf-list.png, /tmp/hf-confirm.png, /tmp/hf-done.png, /tmp/hf-undo.png, /tmp/hf-ask.png. Outside this task, TwoBoardsLine.svelte, DecisionsView, TaskRow and BoardView still have tips longer than five words.
