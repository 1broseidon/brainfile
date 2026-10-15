---
id: task-82
title: "brainfile run: a foreground runner that works the queue in a terminal, and live runs on the TUI's rows"
column: backlog
position: 18
description: |-
  This builds spec-16-8. `brainfile run [--once] [--max N] [--until review|done]` is a foreground runner left open in a terminal split. It is not a daemon.

  - It writes its presence file (state/runners/), works the queue through the Runner from task-80, and prints one plain line per change (`task-74 · codex · editing`, `task-74 in Review`).
  - It asks permission at a prompt (Allow once · Always · Deny), one ask at a time, naming the run.
  - It lets go of its claims on Ctrl-C: stops its sessions, ends its run files and leaves the queue on the board.
  - `--once` returns when the queue is empty.
  - The runner the desktop has open (task-84) and this one take turns through claims. Two runners on one machine never start one task.

  The TUI shows `codex · editing` on a row from the run files and refreshes when they change, as the desktop's rows do.
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
updatedAt: "2026-10-15T21:47:11.235Z"
---

## Description
This builds spec-16-8. `brainfile run [--once] [--max N] [--until review|done]` is a foreground runner left open in a terminal split. It is not a daemon.

- It writes its presence file (state/runners/), works the queue through the Runner from task-80, and prints one plain line per change (`task-74 · codex · editing`, `task-74 in Review`).
- It asks permission at a prompt (Allow once · Always · Deny), one ask at a time, naming the run.
- It lets go of its claims on Ctrl-C: stops its sessions, ends its run files and leaves the queue on the board.
- `--once` returns when the queue is empty.
- The runner the desktop has open (task-84) and this one take turns through claims. Two runners on one machine never start one task.

The TUI shows `codex · editing` on a row from the run files and refreshes when they change, as the desktop's rows do.
