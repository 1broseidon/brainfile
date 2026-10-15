---
id: plan-2
title: "Desktop headless parity: what runs only in the desktop, where its state lives, and how the desktop sees headless runs"
type: plan
description: |-
  Written by task-73, from main at a3106a3. Read only; nothing was changed in the code.

  ## 1. Inventory

  The desktop has three processes. **main** handles IPC, projects, issues, editors, updates and the phone link. **host** (a utility process) does every board read, write and git call. **agents** (a utility process) handles ACP agents, hand-offs, review and landing, and the desk. The IPC surface is `Api` in desktop/src/shared/api.ts: `HOST_METHODS` go to the host and `AGENT_METHODS` go to agents. The agents process reaches the board only through `AGENT_HOST_METHODS`, which are `recordDispatch` and `noteTask`.

  Key: **S** already shared · **M** desktop-only, should move to core · **R** needs a new record so another process sees the same state · **U** UI-only, stays.

  | Capability | Where it is | Core / CLI / MCP today | State lives in | Class |
  |---|---|---|---|---|
  | Board reads and writes: add, move, patch, subtasks, complete, delete, note, decide | host.ts over core ops | yes, every one (spec-13) | board files | S |
  | Undo a delete (`restoreTask`) | host.ts | no | window memory | U |
  | Commits, autosync, sync now | host.ts over core/repo | `brainfile sync`, MCP `sync` | board branch | S |
  | Where the board lives; settling two boards | host.ts, integrity.ts | `where`, `adopt`, `merge-boards`, `backups` | board branch, backup refs | S (the words are U) |
  | Lossless Fix and Undo (untrack, adopt, prune) | host/fix.ts | no | undo record in host memory for 20 s | M+R → task-78 |
  | `brainfile init` | main.ts runs the CLI | CLI | board | S |
  | Projects list | main/projects.ts | no | app settings | U |
  | Forge detection; GitHub issues list and auth | main/forge.ts, main/github.ts | the CLI has separate GitHub auth (device flow) and no issue list | Keychain token, an ETag cache in memory | M → task-77 |
  | Task from an issue (`source:`) and the sources map | shared/issues.ts, host `sourcesOf` | `source` is not a core field; add and task_add cannot set it | board files (unknown key) | M → task-77 |
  | Known agents and how they start (npm install, Antigravity download, real node) | agents.ts 98–330 | no | ~/Library/Application Support/Brainfile/agents | M → task-75 |
  | Custom agents (`agentServers`) | custom.ts, shared/agentServers.ts | no | dispatch.json | M → task-75 |
  | ACP registry | registry.ts | no | registry cache in the data folder | M → task-75 |
  | Settings: bypass, modes, each repository's permissions | settings.ts | no | dispatch.json | M → task-75 (same file) |
  | Models, modes, effort probing | agents.ts 355–540, effort.ts | no | models.json | M → task-75 |
  | ACP session: open, turn, steps, reply, idle close, startups | agents.ts 576–930, startup.ts | no | process memory (`sessions`) | M → task-75 |
  | Permission policy and asks | agents.ts `requestPermission`, discuss.ts `chatPermission` | no | `asks` map in memory | M (policy) + R (pending ask in the run file) → task-75, task-80, task-84 |
  | Hand-off brief, standing decisions | agents.ts `brief` | core `brief` is a different brief (the session brief) | — | M → task-75 |
  | Hand to…: reserve, waits on dependsOn, start | agents.ts `reserve`, `startDispatch` | no | `reserved` set, `runs` map | M+R → task-74, task-80 |
  | Dispatch record (`dispatch: {agent, model, effort, by: chat, at}`) | host.ts `recordDispatch`; only the desk writes it | core keeps it as an unknown key; no lint | board files | R → task-74 |
  | Run registry, `live()`, the 30-minute tail | agents.ts `runs`, live.ts | no | memory only | R → task-74 (state/runs) |
  | Stop | agents.ts `stopRun` | no | memory | M+R → task-80 (works across processes) |
  | Worktree per hand-off, trunk, read-only checkouts | worktree.ts | no | git: worktrees, `dispatch/<id>`, branch config | M → task-76 (state is already in git) |
  | Review, Ready to merge, conflicts | worktree.ts `reviewOf`, `readyToMerge` | no | git | M → task-76 |
  | Landing by compare-and-swap, checks | worktree.ts `landReview`, `runChecks` | no | git; one landing at a time kept by the in-process `landings` map | M+R → task-76 (state/landing.lock) |
  | Send-back on a conflict or failed check | agents.ts `sendBackLanding` | no | the task's log (counts "Landing sent back") | M → task-76 (the note), task-80 (re-dispatch) |
  | Discard | worktree.ts `discardReview` | no | git | M → task-76 |
  | The chat (ask): preamble, threads, what you have open | agents.ts `ask`, renderer threads in localStorage (30) | any MCP client is a chat already | renderer localStorage | U (its rules become MCP server instructions → task-81) |
  | Discuss | discuss.ts, agents.ts `discuss` | no | thread in renderer localStorage; agreements in the task log | M → task-79 |
  | The desk: dispatch, runs, stop over a socket and a token | desk.ts, desk-mcp.ts | no | memory (grants) | M → task-81, retired in task-84 |
  | Epic lead (spec-16 Phase 2) | not built | no | — | R → task-83 (epic request record and notes) |
  | Dock tabs, the chat pane, the review pane, editors, updater, window state, the dev busy file | renderer, main/* | — | localStorage, app settings | U |
  | Phone link | link/* | — | link store | U (relays external runs → task-84) |

  ## 2. Findings that shape the plan

  - **Core must stay a library.** Its only dependency is js-yaml, and the browser entry is tested. The ACP runtime goes in a node-only subpath, `@brainfile/core/dispatch`, beside `./repo`. task-75 records that choice with decide.
  - **Settings need no migration.** dispatch.json, models.json and agents/ stay in the desktop's data folder. Core reads `BRAINFILE_DATA_DIR` (already honoured by agents.ts), else the platform default. The CLI and the desktop then share the settings, the installed agent servers and the model cache.
  - **The heartbeat stays out of frontmatter.** spec-16-1 put `claimedBy + heartbeat` on the task. A heartbeat there would mean a board commit and a push every few seconds. The claim (host, runner, pid, at) goes on the task, where it is committed and synced, and it stops a second machine. The heartbeat and live progress go in `.brainfile/state/runs/`, which is gitignored and per machine. All worktrees of a repository reach the same `.brainfile/`, so every runner on the machine sees them.
  - **Two locks live in memory today.** `reserved` (hand-off start) becomes the claim's compare-and-swap. `landings` (serial landing) becomes `state/landing.lock`.
  - **Roles replace the desk's token.** Once dispatch is a `brainfile mcp` tool, a worker must not see it (decision-15: only a lead dispatches). The process that starts an agent sets `BRAINFILE_AGENT_ROLE` and `BRAINFILE_LEAD_SCOPE` for its MCP server. This is a rule, not a security boundary: the CLI is open to anyone on the machine, which is also true of the desk today.
  - **MCP dispatch queues; a runner runs.** An MCP server is its client's child, and agents started from it would die with the client's session. So `dispatch` writes the request, and a runner (`brainfile run`, the desktop, or `brainfile dispatch --now`) claims it and starts it. That is spec-16 Phase 3 as written: "Close it and the queue waits on the board." The tool says when no runner is up.

  ## 3. How the desktop sees headless runs: recommendation

  Options weighed:
  - **The board and worktree files alone:** they are seen already (host.ts `fs.watch`), but they carry no live state. Without a heartbeat, `codex · editing` and a crashed run are invisible.
  - **The ledger:** completions only.
  - **A local socket:** the desk's socket already exists. But it needs the desktop up and a way to find a runner, it loses everything on a crash, and the TUI would need a client.
  - **Run and runner files under `.brainfile/state/`:** written atomically on every change and beaten every 10 s.

  **Recommended: the files.** The host's watcher already sees `.brainfile/`; it only has to stop ignoring `state/runs` and `state/runners`. Files survive a restart, so a desktop opened later finds runs already going. The TUI reads them the same way. Durable facts (request, claim, outcome, notes, landing) stay on the board, and the existing board watcher shows them. Git (review, Ready to merge) is read again when a run file ends. An ask from a terminal runner is answered by an answer file the runner watches. Live progress is per machine, which matches spec-16's "not in scope: remote runners". Another machine's work shows through its claim and its board changes once they sync.

  ## 4. Fit with spec-16 and spec-13

  - spec-16-1 (record) → task-74, with the heartbeat moved to state/ as above.
  - spec-16-2/3 (Phase 1, the desk) are done. task-81 and task-84 replace the desk with `brainfile mcp` tools and remove desk.ts and desk-mcp.ts.
  - spec-16-4/5/6 (the lead) → task-83, built in the core Runner and not first in the desktop, so headless and desktop leads are one implementation.
  - spec-16-7 (`brainfile dispatch`, `dispatch status`, MCP `dispatch`, `dispatch_status`) → task-81, with these names kept. Added beside them: `dispatch_stop`, `review` (show, ready, land, discard) and `agents`.
  - spec-16-8 (`brainfile run`, the TUI) → task-82.
  - spec-16-9 (docs) stays with spec-16.
  - spec-13: each new command is mapped in cli/src/__tests__/mcp-parity.test.ts. `run` goes on EXCLUDED as an interface, as `tui` and `mcp` are. Discuss is served as an MCP prompt and a tool. Issues and Fix get tools. Tool names keep the `noun` / `noun_verb` style.
  - task-51 (model and effort per hand-off) becomes the request record's `model` and `effort` (task-74).

  ## 5. Decisions

  - decision-11, 12, 14 and 15: `check` answers use for moving their rules into core. The rules hold; where they say "the app", they now mean the shared Runner.
  - **decision-6 (Discuss is a thread in the board's chat):** `check` answers review. Its source predicate (desktop/src/agents/discuss.ts) has changed since it was recorded, and a discussion in a terminal or an MCP client is not a chat thread. Nothing here goes against it yet. task-79 asks the person whether to supersede it, and records the answer with decide, before it builds.
status: draft
tags:
  - research
  - desktop
  - mcp
  - cli
  - dispatch
  - parity
relatedFiles:
  - desktop/src/agents/agents.ts
  - desktop/src/agents/worktree.ts
  - desktop/src/agents/desk.ts
  - desktop/src/agents/desk-mcp.ts
  - desktop/src/agents/discuss.ts
  - desktop/src/host/host.ts
  - desktop/src/host/fix.ts
  - desktop/src/main/main.ts
  - desktop/src/main/github.ts
  - desktop/src/shared/api.ts
parentId: epic-6
decisions:
  - decision-6
  - decision-11
  - decision-12
  - decision-14
  - decision-15
  - decision-17
createdAt: "2026-10-14T22:17:37.522Z"
updatedAt: "2026-10-15T21:48:30.802Z"
completedAt: "2026-10-15T21:48:30.802Z"
---

## Description
Written by task-73, from main at a3106a3. Read only; nothing was changed in the code.

## 1. Inventory

The desktop has three processes. **main** handles IPC, projects, issues, editors, updates and the phone link. **host** (a utility process) does every board read, write and git call. **agents** (a utility process) handles ACP agents, hand-offs, review and landing, and the desk. The IPC surface is `Api` in desktop/src/shared/api.ts: `HOST_METHODS` go to the host and `AGENT_METHODS` go to agents. The agents process reaches the board only through `AGENT_HOST_METHODS`, which are `recordDispatch` and `noteTask`.

Key: **S** already shared · **M** desktop-only, should move to core · **R** needs a new record so another process sees the same state · **U** UI-only, stays.

| Capability | Where it is | Core / CLI / MCP today | State lives in | Class |
|---|---|---|---|---|
| Board reads and writes: add, move, patch, subtasks, complete, delete, note, decide | host.ts over core ops | yes, every one (spec-13) | board files | S |
| Undo a delete (`restoreTask`) | host.ts | no | window memory | U |
| Commits, autosync, sync now | host.ts over core/repo | `brainfile sync`, MCP `sync` | board branch | S |
| Where the board lives; settling two boards | host.ts, integrity.ts | `where`, `adopt`, `merge-boards`, `backups` | board branch, backup refs | S (the words are U) |
| Lossless Fix and Undo (untrack, adopt, prune) | host/fix.ts | no | undo record in host memory for 20 s | M+R → task-78 |
| `brainfile init` | main.ts runs the CLI | CLI | board | S |
| Projects list | main/projects.ts | no | app settings | U |
| Forge detection; GitHub issues list and auth | main/forge.ts, main/github.ts | the CLI has separate GitHub auth (device flow) and no issue list | Keychain token, an ETag cache in memory | M → task-77 |
| Task from an issue (`source:`) and the sources map | shared/issues.ts, host `sourcesOf` | `source` is not a core field; add and task_add cannot set it | board files (unknown key) | M → task-77 |
| Known agents and how they start (npm install, Antigravity download, real node) | agents.ts 98–330 | no | ~/Library/Application Support/Brainfile/agents | M → task-75 |
| Custom agents (`agentServers`) | custom.ts, shared/agentServers.ts | no | dispatch.json | M → task-75 |
| ACP registry | registry.ts | no | registry cache in the data folder | M → task-75 |
| Settings: bypass, modes, each repository's permissions | settings.ts | no | dispatch.json | M → task-75 (same file) |
| Models, modes, effort probing | agents.ts 355–540, effort.ts | no | models.json | M → task-75 |
| ACP session: open, turn, steps, reply, idle close, startups | agents.ts 576–930, startup.ts | no | process memory (`sessions`) | M → task-75 |
| Permission policy and asks | agents.ts `requestPermission`, discuss.ts `chatPermission` | no | `asks` map in memory | M (policy) + R (pending ask in the run file) → task-75, task-80, task-84 |
| Hand-off brief, standing decisions | agents.ts `brief` | core `brief` is a different brief (the session brief) | — | M → task-75 |
| Hand to…: reserve, waits on dependsOn, start | agents.ts `reserve`, `startDispatch` | no | `reserved` set, `runs` map | M+R → task-74, task-80 |
| Dispatch record (`dispatch: {agent, model, effort, by: chat, at}`) | host.ts `recordDispatch`; only the desk writes it | core keeps it as an unknown key; no lint | board files | R → task-74 |
| Run registry, `live()`, the 30-minute tail | agents.ts `runs`, live.ts | no | memory only | R → task-74 (state/runs) |
| Stop | agents.ts `stopRun` | no | memory | M+R → task-80 (works across processes) |
| Worktree per hand-off, trunk, read-only checkouts | worktree.ts | no | git: worktrees, `dispatch/<id>`, branch config | M → task-76 (state is already in git) |
| Review, Ready to merge, conflicts | worktree.ts `reviewOf`, `readyToMerge` | no | git | M → task-76 |
| Landing by compare-and-swap, checks | worktree.ts `landReview`, `runChecks` | no | git; one landing at a time kept by the in-process `landings` map | M+R → task-76 (state/landing.lock) |
| Send-back on a conflict or failed check | agents.ts `sendBackLanding` | no | the task's log (counts "Landing sent back") | M → task-76 (the note), task-80 (re-dispatch) |
| Discard | worktree.ts `discardReview` | no | git | M → task-76 |
| The chat (ask): preamble, threads, what you have open | agents.ts `ask`, renderer threads in localStorage (30) | any MCP client is a chat already | renderer localStorage | U (its rules become MCP server instructions → task-81) |
| Discuss | discuss.ts, agents.ts `discuss` | no | thread in renderer localStorage; agreements in the task log | M → task-79 |
| The desk: dispatch, runs, stop over a socket and a token | desk.ts, desk-mcp.ts | no | memory (grants) | M → task-81, retired in task-84 |
| Epic lead (spec-16 Phase 2) | not built | no | — | R → task-83 (epic request record and notes) |
| Dock tabs, the chat pane, the review pane, editors, updater, window state, the dev busy file | renderer, main/* | — | localStorage, app settings | U |
| Phone link | link/* | — | link store | U (relays external runs → task-84) |

## 2. Findings that shape the plan

- **Core must stay a library.** Its only dependency is js-yaml, and the browser entry is tested. The ACP runtime goes in a node-only subpath, `@brainfile/core/dispatch`, beside `./repo`. task-75 records that choice with decide.
- **Settings need no migration.** dispatch.json, models.json and agents/ stay in the desktop's data folder. Core reads `BRAINFILE_DATA_DIR` (already honoured by agents.ts), else the platform default. The CLI and the desktop then share the settings, the installed agent servers and the model cache.
- **The heartbeat stays out of frontmatter.** spec-16-1 put `claimedBy + heartbeat` on the task. A heartbeat there would mean a board commit and a push every few seconds. The claim (host, runner, pid, at) goes on the task, where it is committed and synced, and it stops a second machine. The heartbeat and live progress go in `.brainfile/state/runs/`, which is gitignored and per machine. All worktrees of a repository reach the same `.brainfile/`, so every runner on the machine sees them.
- **Two locks live in memory today.** `reserved` (hand-off start) becomes the claim's compare-and-swap. `landings` (serial landing) becomes `state/landing.lock`.
- **Roles replace the desk's token.** Once dispatch is a `brainfile mcp` tool, a worker must not see it (decision-15: only a lead dispatches). The process that starts an agent sets `BRAINFILE_AGENT_ROLE` and `BRAINFILE_LEAD_SCOPE` for its MCP server. This is a rule, not a security boundary: the CLI is open to anyone on the machine, which is also true of the desk today.
- **MCP dispatch queues; a runner runs.** An MCP server is its client's child, and agents started from it would die with the client's session. So `dispatch` writes the request, and a runner (`brainfile run`, the desktop, or `brainfile dispatch --now`) claims it and starts it. That is spec-16 Phase 3 as written: "Close it and the queue waits on the board." The tool says when no runner is up.

## 3. How the desktop sees headless runs: recommendation

Options weighed:
- **The board and worktree files alone:** they are seen already (host.ts `fs.watch`), but they carry no live state. Without a heartbeat, `codex · editing` and a crashed run are invisible.
- **The ledger:** completions only.
- **A local socket:** the desk's socket already exists. But it needs the desktop up and a way to find a runner, it loses everything on a crash, and the TUI would need a client.
- **Run and runner files under `.brainfile/state/`:** written atomically on every change and beaten every 10 s.

**Recommended: the files.** The host's watcher already sees `.brainfile/`; it only has to stop ignoring `state/runs` and `state/runners`. Files survive a restart, so a desktop opened later finds runs already going. The TUI reads them the same way. Durable facts (request, claim, outcome, notes, landing) stay on the board, and the existing board watcher shows them. Git (review, Ready to merge) is read again when a run file ends. An ask from a terminal runner is answered by an answer file the runner watches. Live progress is per machine, which matches spec-16's "not in scope: remote runners". Another machine's work shows through its claim and its board changes once they sync.

## 4. Fit with spec-16 and spec-13

- spec-16-1 (record) → task-74, with the heartbeat moved to state/ as above.
- spec-16-2/3 (Phase 1, the desk) are done. task-81 and task-84 replace the desk with `brainfile mcp` tools and remove desk.ts and desk-mcp.ts.
- spec-16-4/5/6 (the lead) → task-83, built in the core Runner and not first in the desktop, so headless and desktop leads are one implementation.
- spec-16-7 (`brainfile dispatch`, `dispatch status`, MCP `dispatch`, `dispatch_status`) → task-81, with these names kept. Added beside them: `dispatch_stop`, `review` (show, ready, land, discard) and `agents`.
- spec-16-8 (`brainfile run`, the TUI) → task-82.
- spec-16-9 (docs) stays with spec-16.
- spec-13: each new command is mapped in cli/src/__tests__/mcp-parity.test.ts. `run` goes on EXCLUDED as an interface, as `tui` and `mcp` are. Discuss is served as an MCP prompt and a tool. Issues and Fix get tools. Tool names keep the `noun` / `noun_verb` style.
- task-51 (model and effort per hand-off) becomes the request record's `model` and `effort` (task-74).

## 5. Decisions

- decision-11, 12, 14 and 15: `check` answers use for moving their rules into core. The rules hold; where they say "the app", they now mean the shared Runner.
- **decision-6 (Discuss is a thread in the board's chat):** `check` answers review. Its source predicate (desktop/src/agents/discuss.ts) has changed since it was recorded, and a discussion in a terminal or an MCP client is not a chat thread. Nothing here goes against it yet. task-79 asks the person whether to supersede it, and records the answer with decide, before it builds.
