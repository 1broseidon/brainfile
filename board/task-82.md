---
id: task-82
title: "brainfile run: a foreground runner that works the queue in a terminal, and live runs on the TUI's rows"
column: backlog
position: 18
tags:
  - cli
  - tui
  - runner
  - dispatch
relatedFiles:
  - cli/src/commands/run.ts
  - cli/src/program.ts
  - cli/src/tui
  - cli/src/tui/hooks/useBrainfileLoader.ts
  - core/src/dispatch/runner.ts
parentId: epic-6
dependsOn:
  - task-80
  - task-81
  - task-83
decisions:
  - decision-11
  - decision-12
contract:
  status: ready
  deliverables:
    - type: file
      path: cli/src/commands/run.ts
      description: "brainfile run: work the queue in the foreground, ask at a prompt, let go on exit"
    - type: file
      path: cli/src/tui/hooks/useRuns.ts
      description: Live runs for the TUI's rows, from state/runs
    - type: test
      path: cli/src/__tests__/run.test.ts
      description: "A fake agent: works the queue, --once returns, Ctrl-C ends runs and releases claims, two runners share a queue"
  validation:
    commands:
      - npm install --prefer-offline --no-audit --no-fund && npm run build && npm test
      - node cli/dist/cli.js run --help
      - cd desktop && npm install --prefer-offline --no-audit --no-fund && npm run typecheck && npm test && node scripts/build-electron.mjs
  metrics:
    readyAt: "2026-10-15T21:40:11.044Z"
createdAt: "2026-10-14T22:16:23.437Z"
updatedAt: "2026-10-15T22:56:00.917Z"
---

## Description
This builds spec-16-8. `brainfile run [--once] [--max N] [--until review|done]` is a foreground runner left open in a terminal split. It is not a daemon.

- It writes its presence file (state/runners/), works the queue through the Runner from task-80, and prints one plain line per change (`task-74 · codex · editing`, `task-74 in Review`).
- It asks permission at a prompt (Allow once · Always · Deny), one ask at a time, naming the run.
- It lets go of its claims on Ctrl-C: stops its sessions, ends its run files and leaves the queue on the board.
- `--once` returns when the queue is empty.
- The runner the desktop has open (task-84) and this one take turns through claims. Two runners on one machine never start one task.

The TUI shows `codex · editing` on a row from the run files and refreshes when they change, as the desktop's rows do.

From task-80: build on `Runner(dataDir, runner, board, ask, cancelAsk, onRun, ledBy, landed)` with `fileBoard()` as its board; `ask`/`cancelAsk` are where the terminal prompt goes, and `onRun` gives the change lines. fileBoard's board commits are debounced: call `flushBoardCommits` on Ctrl-C and before `--once` returns, or claims released and landings made are left uncommitted. `runner.live()` already reads every runner's run files, for the TUI's rows too.

From task-81: add `run` to EXCLUDED in cli/src/__tests__/mcp-parity.test.ts (the comment with its reason is already there). Build on `openRunner(kind, {sendBack: 'start', ask, onRun})` in cli/src/commands/dispatch.ts: a long-lived runner sends a failed landing back by starting the agent, where CLI/MCP calls use 'queue'. `dispatch --now` (runNow + terminalAsk in dispatch.ts) is a minimal foreground loop that `brainfile run` should take over, so there is one loop, not two.

From task-83 (landed): the Runner runs leads when it works the queue with `leads: true`: it takes up lead requests (dispatch: with role lead on an epic), runs the lead's turns read-only with brainfile mcp scoped to its tree, starts what the lead queues inside its rules (workLed), parks a child whose tries are spent in Review, and follows the board (boardChanged, plus a look every 2 s while it leads). `brainfile run` must open its Runner with `leads: true` and sendBack 'start', print lead changes (onLead) as change lines too, and on Ctrl-C let go of the lead's claim on the epic as well as its children's. `dispatch <epic> --now` already runs a lead here: fold that into the one loop as well. Test: `brainfile dispatch <epic>` then `brainfile run --once` with fake agents runs the lead and its children to Review/landed.
