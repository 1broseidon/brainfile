---
id: task-74
title: "Board record: a dispatch request and a runner's claim on the task, and run files under state/"
column: backlog
position: 10
description: |-
  This builds spec-16-1 in core, and changes where the heartbeat lives.

  **On the task, committed and synced:** `dispatch:` in frontmatter, written and read by core and no longer by the desktop host alone (host.ts `recordDispatch`, which today writes `{agent, model, effort, by: chat, at}` as a key core does not know).
  - The request: `agent`, `model`, `effort`, `by` (chat | cli | mcp | lead | phone | person), `at`, `until` (review | done) and `role` (worker | lead).
  - The claim: `claim: {host, runner, pid, at}` from the runner that started it. It is cleared when the run ends, or it says `ended` with the outcome. Two runners never start the same task: a claim is taken by a compare-and-swap on the task file before the run starts, and the board commit makes it final.
  - A typed `DispatchRecord` in core/src/types, read and write helpers in a new core/src/dispatchRecord.ts, and a lint rule for a malformed record. Unknown keys round-trip as before.

  **On this machine, never committed:** the heartbeat goes in `.brainfile/state/` (gitignored already, BOARD_STATE_DIR), not in frontmatter. A heartbeat in frontmatter would make a board commit and a push every few seconds.
  - `state/runs/<run-id>.json`: the run as the desktop's AgentRun has it (id, kind, taskId, agent, model, effort, state, activity, reply, error, steps, startedAt, endedAt), plus host, pid, runner (desktop | cli | mcp), worktree and branch, `beatAt`, and any pending ask (title and options).
  - `state/runners/<host>-<pid>.json`: a runner that is up, with its own `beatAt`.
  - Written atomically (temp file, then rename). A run whose pid is gone, or whose beat is older than 30 s, is lost: its claim can be taken again on this host. A claim from another host is never taken without `--force`. Ended runs are pruned after 30 minutes, as live.ts does today.

  Desktop: host.ts `recordDispatch` calls core. api.ts `DispatchRecord` becomes core's type.
tags:
  - core
  - dispatch
  - board-record
relatedFiles:
  - core/src/types/base.ts
  - core/src/linter.ts
  - core/src/repo/boardRepo.ts
  - desktop/src/host/host.ts
  - desktop/src/shared/api.ts
parentId: epic-6
decisions:
  - decision-15
  - decision-1
contract:
  status: draft
  deliverables:
    - type: file
      path: core/src/dispatchRecord.ts
      description: "Read, write, claim and release the dispatch: record on a task"
    - type: file
      path: core/src/repo/runFiles.ts
      description: Run files and runner presence under .brainfile/state/, with heartbeat and staleness
    - type: test
      path: core/src/__tests__/dispatchRecord.test.ts
      description: Round-trip, claim by compare-and-swap, a second claim refused, a stale claim taken on the same host only
    - type: test
      path: core/src/__tests__/repo-runFiles.test.ts
      description: Atomic writes, lost runs, pruning
    - type: file
      path: desktop/src/host/host.ts
      description: recordDispatch writes through core
  validation:
    commands:
      - npm run build -w core && npm run test:ci -w core
      - cd desktop && npm run typecheck && npm test
  constraints:
    - Nothing that changes every few seconds goes in a committed file
    - core's browser entry (core/src/browser.ts) does not import run files or anything that uses fs or child_process
createdAt: "2026-10-14T22:14:43.444Z"
---

## Description
This builds spec-16-1 in core, and changes where the heartbeat lives.

**On the task, committed and synced:** `dispatch:` in frontmatter, written and read by core and no longer by the desktop host alone (host.ts `recordDispatch`, which today writes `{agent, model, effort, by: chat, at}` as a key core does not know).
- The request: `agent`, `model`, `effort`, `by` (chat | cli | mcp | lead | phone | person), `at`, `until` (review | done) and `role` (worker | lead).
- The claim: `claim: {host, runner, pid, at}` from the runner that started it. It is cleared when the run ends, or it says `ended` with the outcome. Two runners never start the same task: a claim is taken by a compare-and-swap on the task file before the run starts, and the board commit makes it final.
- A typed `DispatchRecord` in core/src/types, read and write helpers in a new core/src/dispatchRecord.ts, and a lint rule for a malformed record. Unknown keys round-trip as before.

**On this machine, never committed:** the heartbeat goes in `.brainfile/state/` (gitignored already, BOARD_STATE_DIR), not in frontmatter. A heartbeat in frontmatter would make a board commit and a push every few seconds.
- `state/runs/<run-id>.json`: the run as the desktop's AgentRun has it (id, kind, taskId, agent, model, effort, state, activity, reply, error, steps, startedAt, endedAt), plus host, pid, runner (desktop | cli | mcp), worktree and branch, `beatAt`, and any pending ask (title and options).
- `state/runners/<host>-<pid>.json`: a runner that is up, with its own `beatAt`.
- Written atomically (temp file, then rename). A run whose pid is gone, or whose beat is older than 30 s, is lost: its claim can be taken again on this host. A claim from another host is never taken without `--force`. Ended runs are pruned after 30 minutes, as live.ts does today.

Desktop: host.ts `recordDispatch` calls core. api.ts `DispatchRecord` becomes core's type.
