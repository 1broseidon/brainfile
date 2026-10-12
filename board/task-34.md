---
id: task-34
title: "Health: fix a board problem from its line (safe fix, or ask an agent)"
column: in-progress
position: 1
priority: high
tags:
  - desktop
  - integrity
  - sync
createdAt: "2026-10-12T21:23:49.425Z"
updatedAt: "2026-10-12T21:55:46.816Z"
subtasks:
  - id: task-34-1
    title: "Health rows: problem sentence under the name, Fix / Ask agent keys; long row tooltip dropped, short words (two copies, old copy in main, N unsent…)"
    completed: false
  - id: task-34-2
    title: Host planFix / fixBoard / undoFix (HOST_METHODS, preload, api); logic in host/fix.ts, Fix offered only when the kept copy holds every other copy
    completed: false
---

## Description
Screenshot 2026-10-12 16:21. The health list says runprism.ai has an "old copy still in main" and the tip tells you to run brainfile migrate --to-branch, but offers no way to do it. Each problem line offers its fix:

- Fix (safe): back up every copy first (refs/brainfile/backups/<time>-…), then run the settling command (migrate --to-branch for an old copy in the code branch, adopt/merge-boards when one copy already has everything, prune a stray checkout). Only offered when the fix loses nothing; says what it will do in a few words before it runs, and Undo restores the backup.
- Ask an agent: hands the problem to the default agent with a brief (what was found, `brainfile where` output) to review both copies and ask the person how to settle it, never deciding alone; it shows in the dock like any hand-off.
- Applies to two copies of the board, an old copy in the code branch, a checkout elsewhere, an unfinished merge. Core already has adopt, merge-boards, backups and migrate --to-branch (spec-15).
