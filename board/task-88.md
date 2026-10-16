---
id: task-88
title: "Without the desktop, end to end: an epic run from a terminal and an MCP client, from hand-off to landed, and the desktop watching it live"
column: backlog
position: 22
tags:
  - parity
  - integration
  - e2e
  - cli
  - mcp
parentId: epic-6
dependsOn:
  - task-79
  - task-82
  - task-83
  - task-84
  - task-110
decisions:
  - decision-17
  - decision-11
  - decision-12
  - decision-15
contract:
  status: ready
  deliverables:
    - type: test
      path: cli/src/__tests__/headless-epic.e2e.test.ts
      description: "Scripted headless epic run: lead, hand-offs, landing, conflict send-back, MCP dispatch"
  validation:
    commands:
      - npm install --prefer-offline --no-audit --no-fund && npm run build && npm test
      - cd desktop && npm install --prefer-offline --no-audit --no-fund && npm run typecheck && npm test && node scripts/build-electron.mjs
  metrics:
    readyAt: "2026-10-15T21:40:11.828Z"
createdAt: "2026-10-15T15:49:57.479Z"
updatedAt: "2026-10-16T01:57:03.940Z"
---

## Description
The task that puts epic-6 together: each child moves one part into core, and this one proves the whole works with no desktop running (decision-17).

On a demo repository with a remote (a bare clone), an epic of three children where two touch the same file and one depends on both:
1. From a terminal only: `brainfile run` with the epic handed to its lead. The lead checks the plan, hands off in order, at most N at once; workers in their worktrees validate there; each child lands on the trunk with its checks, a conflict goes back to its agent; a dependent forks only after its dependency has landed; the epic completes with its last child.
2. From an MCP client only (Claude Code with `brainfile mcp`): dispatch one task, see its status, stop it, dispatch again, land it. A worker's server has no dispatch tools.
3. With the desktop open but not starting anything: the runs from 1 and 2 show live in its list and dock from the board and state/runs, and its Merge and Stop act on them.
4. Discuss and Fix from the CLI on the same board.

Write it as a scripted test (like the desktop's offscreen e2e harness, but headless: a fake ACP agent that commits and moves its task) that CI can run, plus one live run with a real agent, noted here. Whatever does not work headless is a bug on the child that owns it, not a skip.

From task-82 and task-84 (landed): when the desktop answers an ask, its state/runs/<id>.answer.json takes down `brainfile run`'s prompt (cancelAsk), and the terminal says "That ask was answered outside this terminal." Cover it in step 3: an ask from the terminal runner answered from the desktop's band, the terminal prompt gone, the run going on.

From task-84: its by-hand check was never done, because `brainfile run` was not on its branch and the GUI was not driven. Do it in the live run: with the window open, `brainfile dispatch task-N --agent codex` and `brainfile run --once` in a terminal, then see the row and the dock tab marked "in a terminal", an ask answered from the band, and Review. desktop/test/external-runs.test.ts covers that path with a core Runner standing in for the terminal. The desktop's Runner now works the queue with leads: true. Opening the window takes up any lead whose record has no live claim and starts its queued children. Check that a desktop and a `brainfile run` open together never both take one lead or one child, and that a request answered before claims existed (answeredBefore) is not run again.

From task-110 (landed): `brainfile discuss <task>` (cli/src/commands/discuss.ts) runs a Runner('cli') session at role discuss; cli/src/__tests__/discuss.test.ts already drives it with a fake ACP agent. For step 4, run it on the demo epic's board alongside the runs from 1 and 2 (it must not take a hand-off's claim or be counted as one) and check the note it leaves on Ctrl-C. Known gap left by task-110: the desktop does not show a terminal discussion's 'ask' run files as a discussion. In step 3, check what the desktop does with them: if it shows them wrongly (as a hand-off, or an ask it cannot answer), fix that here; if it just ignores them, note it on this task and leave it.
