---
kind: Added
---
- The dispatch record on a task is core's: `dispatch:` holds the request
  (`agent`, `model`, `effort`, `by`, `at`, `until`, `role`) and the `claim`
  of the runner that started it, taken by compare-and-swap on the task file
  so two runners never start the same task; a claim from another machine is
  never taken without force. `lint` warns on a malformed record. The
  desktop's hand-offs write it through core.
- `@brainfile/core/repo` has run and runner files under `.brainfile/state/`
  (`runs/<run-id>.json`, `runners/<host>-<pid>.json`), written atomically,
  with a heartbeat that says when a run is lost and pruning of ended runs
  after 30 minutes. Nothing writes them yet.
