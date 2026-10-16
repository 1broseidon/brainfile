---
id: task-122
title: "Dependencies across boards: a hand-off, a lead and a brief treat alias:task-id as a real dependency, open until it is complete and landed on the related board"
column: review
position: 19
tags:
  - core
  - dispatch
  - related-boards
  - lead
relatedFiles:
  - core/src/dispatch/runner.ts
  - core/src/dispatch/lead.ts
  - core/src/dispatch/brief.ts
  - core/src/repo/related.ts
  - cli/src/commands/dispatch.ts
  - desktop/src/renderer/components/TaskDetail.svelte
  - core/src/__tests__/dispatch-runner.test.ts
  - core/src/__tests__/dispatch-lead.test.ts
parentId: epic-10
decisions:
  - decision-15
  - decision-12
contract:
  status: delivered
  deliverables:
    - type: file
      path: core/src/dispatch/runner.ts
      description: A hand-off waits on alias dependencies, landed on the related board
    - type: file
      path: core/src/dispatch/lead.ts
      description: The lead counts alias dependencies and is woken by the related board
    - type: file
      path: core/src/dispatch/brief.ts
      description: leftFor reads the related task's notes
    - type: test
      path: core/src/__tests__/dispatch-runner.test.ts
      description: "Two related boards: the hand-off waits, then starts"
    - type: test
      path: core/src/__tests__/dispatch-lead.test.ts
      description: A child waiting on another board is not ready; woken when it lands
    - type: docs
      path: MANUAL.md
      description: "Related boards: dependencies hold for hand-offs and leads"
  validation:
    commands:
      - npm install --prefer-offline --no-audit --no-fund && npm run build && npm test
      - cd desktop && npm install --prefer-offline --no-audit --no-fund && npm run typecheck && npm test && node scripts/build-electron.mjs
  constraints:
    - A missing related board counts as an open dependency, said plainly, never as satisfied
  metrics:
    readyAt: "2026-10-16T06:09:34.752Z"
    pickedUpAt: "2026-10-16T06:14:12.422Z"
    reworkCount: 0
    deliveredAt: "2026-10-16T06:24:25.823Z"
    duration: 613
createdAt: "2026-10-16T06:09:34.759Z"
updatedAt: "2026-10-16T06:24:25.823Z"
dispatch:
  agent: codex
  model: gpt-6.1-sol
  effort: high
  by: lead
  at: "2026-10-16T06:13:28.607Z"
  until: done
  tries: 1
  claim:
    host: Georges-Mac-Studio
    runner: desktop
    pid: 20499
    at: "2026-10-16T06:13:32.611Z"
assignee: codex
---

## Description
A task may depend on one on a related board (`dependsOn: [mobile:task-3]`; `related:` in brainfile.md names the alias and the repo folder; `brainfile show` and the CLI's `relatedBoards(filePath).dependencies` already resolve them). The runtime ignores them: runner.ts ≈866 filters `!ref.includes(':')` from a hand-off's waits, lead.ts ≈162/229/249 drops them from readyOf, the plan and the waves, and brief.ts ≈97 leaves their notes out of leftFor. So tonight's phone epic cannot wait on this epic's contract child by dependsOn; Claude starts it by hand.

Make them real:
- **One function for what a hand-off waits on**, in core (core/src/dispatch), alias-aware: the same filter is copied today in runner.ts ≈866 and in the CLI's `waitsOn` (cli/src/commands/dispatch.ts ≈307, used by `dispatch` and `dispatch status`). Export it from core and use it in both, so `brainfile dispatch` and `dispatch status` (CLI and MCP) say an alias wait too. task-123 (the link's queue) builds on this function: keep it exported and documented.
- **A hand-off waits** on an alias dependency until the task on the related board is complete and, if it has a hand-off branch, landed there (`unlanded` against the related board's repo root, found through `relatedBoards`); the wait message names the board: "task-3 waits on mobile:task-1: it starts once that has landed on the mobile board".
- **The lead** counts alias dependencies in readyOf and the waves (a child waiting on another board is not ready; it is not an error in the plan), says so in its tree text, and is woken when the related board changes (the runner already watches boards it has worktrees for: extend `boardChanged` to the related boards of a led board, or poll them on the lead's tick).
- **The brief's leftFor** includes the related task's last notes, read from that board's logs, prefixed with the alias.
- **The desktop's Hand to…** (TaskDetail.svelte ≈171 drops `:` refs from waitsOn): count an open alias dependency as a wait there too.
- A related board that cannot be found (no folder, no board) is a warning in lint already; at run time it counts as open and the message says the board is missing.

Tests with two scratch boards related to each other, in dispatch-runner and dispatch-lead, and in the CLI's dispatch tests for status; MANUAL's related-boards section says dependencies across boards hold for hand-offs and leads.

## Log
- 2026-10-16T06:19:15.673Z: [codex] Implemented exported core handOffWaits/handOffWaitMessage, shared by runner and CLI/MCP reports; leads read alias waits on their existing tick, briefs read related logs, desktop counts open alias waits. Runner regressions pass for complete-but-unlanded related branches and missing boards; lead and CLI/MCP status validation in progress.
- 2026-10-16T06:21:51.243Z: [codex] For task-123: @brainfile/core/dispatch now exports handOffWaits(brainfilePath, projectId, task: Pick<Task,'dependsOn'>): DependencyWait[]. Empty means no dependency wait; entries retain ref/alias/state/done/board/doc and add unlanded. Recheck each time before starting: it resolves related boards afresh, checks completed dependencies with unlanded at that board's code root, and keeps missing aliases/folders/boards/tasks open. handOffWaitMessage(taskId, waits, action='starts') supplies the board-named reason. CLI/MCP queued reports preserve waitsOn: string[] and add waitMessage for alias waits. Leads poll dependencies on the existing 2s lead tick and wake on changed related wait state. Implemented in 4dc65ef on dispatch/task-122; full validation still running.
- 2026-10-16T06:24:26.114Z: [codex] Finished in commit 4dc65ef on dispatch/task-122: alias dependencies now hold hand-offs and leads until complete and landed on their related board; shared waits and board-named/missing-board reasons reach CLI/MCP status, related log notes reach briefs, and desktop counts open alias waits. MANUAL updated. Contract validation commands passed: root install/build/full tests (including 713 CLI and 191 TUI tests), desktop install/typecheck/all 151 tests/Electron bundle; focused runner/lead 70 tests and CLI dispatch 31 tests also passed. Contract delivered; branch is clean and ready for review. Task-123 API hand-off is in the preceding note.
