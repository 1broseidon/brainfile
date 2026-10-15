---
kind: Added
---
- `brainfile run [--once] [--max N] [--until review|done]`: a foreground
  runner for a terminal split. It writes its runner file, works the board's
  queue (tasks and epics' leads, and what the leads hand off), prints one line
  per change (`task-74 · codex · editing`, `task-74 in Review`), asks you at
  its prompt one ask at a time, and on Ctrl-C stops its agents and gives
  their tasks back to the queue, its leads' with them. `--once` returns when
  nothing more can start. The desktop and another `brainfile run` share the
  queue through claims. `dispatch --now` now runs through the same loop.
- The TUI's rows say what an agent is doing on a task (`● codex · editing`),
  from the run files, and change as the run does.
- Core: `Runner.letGo()` and `settled()`; `RunnerOptions.until` and
  `maxRunning`; a runner that works a queue keeps its runner file beaten
  while idle; a claim released with no outcome is queued again; a runner
  closing no longer pauses a lead whose turn it stops.
