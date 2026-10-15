---
kind: Added
---
- `brainfile fix [--dry-run] [--undo] [--expected <words>]`: the desktop's
  Fix from the command line. It says what is wrong with where the board lives
  in the desktop's words, and what fix would do, then does it while that is
  still the plan shown: only a fix that loses nothing (untrack the code
  branch's old copy, adopt the copy that has everything, forget a lost
  checkout), with every copy backed up first. `--undo` puts it back within 20
  seconds, whether the CLI, an agent or the desktop ran the fix: Undo now
  reads `.brainfile/state/last-fix.json`, not the desktop's memory.
- MCP: `where` reports `fix` (the problems and the plan) and takes
  `action: fix` (with `expected`, the plan's words) or `action: undo`.
- Core: `planFix`, `applyFix`, `undoFix`, `lastFix` and `boardProblems` in
  `@brainfile/core/repo`, moved from the desktop, which now calls them.
