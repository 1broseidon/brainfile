---
id: task-110
title: "brainfile discuss: talk a task over in the terminal, under decision-19's rules"
column: review
position: 2
tags:
  - cli
  - discuss
relatedFiles:
  - cli/src/commands/run.ts
  - core/src/dispatch/discuss.ts
  - cli/src/commands/discuss.ts
parentId: epic-6
dependsOn:
  - task-79
contract:
  status: delivered
  deliverables:
    - type: file
      path: cli/src/commands/discuss.ts
      description: "brainfile discuss: the turn loop over core's session, terminalAsk for asks"
    - type: file
      path: cli/src/__tests__/mcp-parity.test.ts
      description: discuss mapped to the discuss tool or prompt
    - type: test
      path: cli/src/__tests__/discuss.test.ts
      description: "A fake agent: the mode set, an edit refused before asking, a note left on the task"
    - type: docs
      path: MANUAL.md
      description: brainfile discuss
  validation:
    commands:
      - npm install --prefer-offline --no-audit --no-fund && npm run build && npm test
      - node cli/dist/cli.js discuss --help
      - cd desktop && npm install --prefer-offline --no-audit --no-fund && npm run typecheck && npm test && node scripts/build-electron.mjs
  constraints:
    - "Follow decision-19: the same rules as the desktop's Discuss, from core"
    - "No second ACP client: core's sessions and task-82's terminalAsk"
  metrics:
    readyAt: "2026-10-16T01:16:29.656Z"
    pickedUpAt: "2026-10-16T01:43:23.800Z"
    reworkCount: 0
    deliveredAt: "2026-10-16T01:53:46.561Z"
    duration: 623
createdAt: "2026-10-16T01:16:29.662Z"
decisions:
  - decision-19
updatedAt: "2026-10-16T01:53:46.561Z"
dispatch:
  agent: claude
  model: opus
  effort: high
  by: lead
  at: "2026-10-16T01:43:10.846Z"
assignee: claude
---

## Description
Split from task-79 (agreed with the person, 2026-10-15). Discuss rests on decision-19, which task-79 records, superseding decision-6.

`brainfile discuss <task-id> [--agent --model --effort]` opens a session through core's Runner and its sessions, as `brainfile run` does. brainfile mcp runs in role discuss (task-81). Do not build a second ACP chat.

- **From `@brainfile/core/dispatch` (task-79):** the context, the rules, the mode and the refusals. Never bypass; read-only when the agent offers it; refusals happen before anyone is asked.
- **Every other ask** goes through task-82's `terminalAsk` (cli/src/commands/run.ts): Allow once · Always · Deny.
- **The only new code is the turn loop:** read a line, send it, print the reply. Ctrl-C ends the session and releases it.
- **What was agreed** goes in the task's log as a note.

Document it in MANUAL.md beside `brainfile run`.

From task-79 (landed on dispatch/epic-6): build the first message with `discussSession({...discussContext(file, id), work: discussWork(projectId, id, runner)})` (surface 'session'); keep the session at role discuss with `discussPermission` and `discussMode`. In cli/src/__tests__/mcp-parity.test.ts add `discuss: 'discuss'` to TOOL_FOR, and remove that test's 'discuss' exception in 'every advertised tool'.

## Log
- 2026-10-16T01:53:46.274Z: [claude] Done on dispatch/task-110 (13c90dd). brainfile discuss <task> [--agent --model --effort] (cli/src/commands/discuss.ts): a Runner('cli') session through core's open/turn at role discuss, keepsMode discussMode, rule discussPermission; first turn discussSession({...discussContext, work: discussWork(projectId, id, runner)}); other asks via run.ts's terminalAsk; the only new code is the turn loop. The session's idle timer is cleared after each turn (the terminal holds it). Ctrl-C or end of input ends it: once the person has said something the agent gets one last turn, "The person says the discussion is done.", and decision-19's rules have it note what was agreed; a second Ctrl-C leaves at once. Then the session closes, the runner lets go, and board commits are flushed. Default agent: the last hand-off's agent, else the assignee, else the first installed. Core change: the 'session' rules told the agent it may read with git, but discussPermission refused every command. It now takes (title, kind, surface='window', rawInput) and allows git that only reads in a 'session' (new readsGit in readOnly.ts); the window, the desktop and the brainfile CLI are unchanged. mcp-parity: discuss→discuss in TOOL_FOR, and the 'discuss' exception is gone. MANUAL: "discuss — Talk a task over in a terminal" after run. Test cli/src/__tests__/discuss.test.ts: a fake ACP agent covering the read-only mode, the discuss role, an edit refused unasked, a read asked at the prompt, a note on the task at the end. Validation passes: core 1178, cli 694, tui 191, discuss --help; desktop typecheck, 141 tests, build-electron. Not wired: the desktop does not show a terminal discussion's 'ask' run files as a discussion. Still open from task-79: set decision-19's source to core/src/dispatch/discuss.ts once epic-6 lands.
