---
id: task-80
title: "Core: one shared runner that claims, starts, stops and lands hand-offs, used by the desktop first"
description: |-
  The lifecycle of a hand-off lives in the desktop's agents process today: `reserve`, `liveDispatch`, `startDispatch`, `dispatch`, `newRun`, `update`, `stopRun`, `live`, `checkThenMerge`, `land`, `ready`, `settle` and `sendBackLanding`, with the in-memory `runs` map and `reserved` set. Move it to `Runner` in core/src/dispatch/runner.ts, built on task-75 (sessions), task-76 (worktrees and landing) and task-74 (the record and the run files).

  - `queue(taskIds, {agent, model, effort, until, by})` writes the request.
  - `start(taskId)` claims, prepares the worktree, writes the brief and runs the turn. It refuses while a dependsOn is open on this board (decision-15) or a run is live.
  - `stop(runId)` works across processes: stopping its own run cancels the session; for another runner's run it writes `stop: true` in the run file, which that runner watches, and falls back to SIGTERM on its pid.
  - `work()` takes queued requests in order while fewer than N run on this repository. N is `dispatch.maxRunning` in the board config, default 3 (spec-16-5).
  - `land(taskId)` lands it. A conflict or a failed check sends it back to the same agent and model up to the contract's maxRetries, then it parks in Review.
  - Run files: written on every state change and beat every 10 s. Events go out to an `onRun` listener as well.
  - `until: done` with the repository's policy at bypass: land and complete when the validation passes; otherwise stop in Review.

  Permission asks go to a callback the host gives. The desktop shows them in its band. A terminal runner asks at a prompt (task-82).

  The desktop's agents.ts becomes a thin adapter. Hand to…, the desk's `dispatch` and Merge all go through the Runner, and the run registry is the run files. Hand to… now writes the request record too (spec-16 said it wrote none).
tags:
  - core
  - dispatch
  - runner
relatedFiles:
  - desktop/src/agents/agents.ts
  - desktop/src/agents/live.ts
  - desktop/src/agents/startup.ts
  - core/src/dispatch
  - core/src/repo/runFiles.ts
parentId: epic-6
dependsOn:
  - task-74
  - task-75
  - task-76
decisions:
  - decision-11
  - decision-12
  - decision-15
contract:
  status: delivered
  deliverables:
    - type: file
      path: core/src/dispatch/runner.ts
      description: Queue, claim, start, stop, work the queue, land and send back, with run files and events
    - type: test
      path: core/src/__tests__/dispatch-runner.test.ts
      description: "A fake ACP agent: two runners never start one task, waits on dependsOn, at most N at once, a stop from another process, send-back up to maxRetries then Review, a lost runner's claim taken again"
    - type: file
      path: desktop/src/agents/agents.ts
      description: A thin adapter over the Runner; IPC and behaviour unchanged
  validation:
    commands:
      - npm install --prefer-offline --no-audit --no-fund && npm run build && npm test
      - cd desktop && npm install --prefer-offline --no-audit --no-fund && npm run typecheck && npm test && node scripts/build-electron.mjs
  constraints:
    - "No daemon: a runner lives as long as the process that made it (spec-16)"
    - Landings stay serial and by compare-and-swap (decision-12)
  metrics:
    readyAt: "2026-10-15T21:40:10.519Z"
    pickedUpAt: "2026-10-15T21:47:25.186Z"
    reworkCount: 0
    deliveredAt: "2026-10-15T22:06:08.991Z"
    duration: 1124
createdAt: "2026-10-14T22:15:55.916Z"
updatedAt: "2026-10-15T22:08:32.497Z"
dispatch:
  agent: claude
  model: claude-opus-5-5
  by: lead
  at: "2026-10-15T21:47:18.615Z"
assignee: claude
completedAt: "2026-10-15T22:08:32.497Z"
---

## Description
The lifecycle of a hand-off lives in the desktop's agents process today: `reserve`, `liveDispatch`, `startDispatch`, `dispatch`, `newRun`, `update`, `stopRun`, `live`, `checkThenMerge`, `land`, `ready`, `settle` and `sendBackLanding`, with the in-memory `runs` map and `reserved` set. Move it to `Runner` in core/src/dispatch/runner.ts, built on task-75 (sessions), task-76 (worktrees and landing) and task-74 (the record and the run files).

- `queue(taskIds, {agent, model, effort, until, by})` writes the request.
- `start(taskId)` claims, prepares the worktree, writes the brief and runs the turn. It refuses while a dependsOn is open on this board (decision-15) or a run is live.
- `stop(runId)` works across processes: stopping its own run cancels the session; for another runner's run it writes `stop: true` in the run file, which that runner watches, and falls back to SIGTERM on its pid.
- `work()` takes queued requests in order while fewer than N run on this repository. N is `dispatch.maxRunning` in the board config, default 3 (spec-16-5).
- `land(taskId)` lands it. A conflict or a failed check sends it back to the same agent and model up to the contract's maxRetries, then it parks in Review.
- Run files: written on every state change and beat every 10 s. Events go out to an `onRun` listener as well.
- `until: done` with the repository's policy at bypass: land and complete when the validation passes; otherwise stop in Review.

Permission asks go to a callback the host gives. The desktop shows them in its band. A terminal runner asks at a prompt (task-82).

The desktop's agents.ts becomes a thin adapter. Hand to…, the desk's `dispatch` and Merge all go through the Runner, and the run registry is the run files. Hand to… now writes the request record too (spec-16 said it wrote none).

## Log
- 2026-10-15T15:49:44.914Z: [claude] Rules the Runner must carry from the desktop as of 2cff04e: a dependsOn is met only when complete AND its branch has landed (unlanded() in worktree.ts; desktop dispatch's wait and the lead's readyOf both use it); the brief's finish line never tells a worker on a branch to complete its task (finish() in agents.ts), landing completes it; the brief includes each dependency's last notes (leftFor() in agents.ts). Found on Hotline's epic-6, where workers completed tasks before landing and dependents forked from a trunk without their dependencies.
- 2026-10-15T22:06:08.472Z: [claude] Done on dispatch/task-80 (cec721d, 7863c23). core/src/dispatch/runner.ts: Runner(dataDir, runner, board, ask, cancelAsk, onRun, ledBy, landed) with queue/dispatch/start/stop/work/land, per-project methods (projectId first). Claims by CAS through RunnerBoard (fileBoard() writes files + scheduleBoardCommit; desktop's goes through new host methods claimDispatch/releaseDispatch/parkInReview); claim helpers in core/src/repo/claims.ts. Run files for every run (dispatch, ask, lead) with projectId/threadId/from/stop; beat 10s, stop:true watched every 1s, SIGTERM after 15s. A claim is kept with ended+outcome when its run ends (review/failed/stopped, done when until:done landed), so queued() = request with no claim or a lost one; role:lead requests are skipped. Limit: board config dispatch.maxRunning, else dispatch.json projects[repo].concurrency, else 3. until:done + bypass lands on 'done' run, sends back to the same agent+model to maxRetries, then parks in Review with a note. Tests: core/src/__tests__/dispatch-runner.test.ts (fake ACP agent over the real SDK; jest loads the ESM SDK via process.getBuiltinModule('module').createRequire). Left for later: leads stay in desktop (task-83) and use runner.live/lastRun/limit; no CLI/MCP surface yet (task-81/82 build on Runner + fileBoard(); fileBoard's commits are debounced so a short-lived CLI must flushBoardCommits); desktop live() still lists only its own runs (task-84: runner.live() already reads other runners' run files); a stop:true written between the owner's read and write of its own file can be lost, the SIGTERM fallback covers it.
