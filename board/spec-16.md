---
id: spec-16
title: Dispatch from the chat, queues, and a shared dispatch surface
type: spec
column: in-progress
position: 0
priority: high
tags:
  - desktop
  - dispatch
  - agents
  - mcp
  - cli
dependsOn:
  - spec-14
createdAt: "2026-10-12T23:16:17.527Z"
subtasks:
  - id: spec-16-1
    title: "Board record: dispatch request and runner claim in frontmatter (agent, model, by, at, until, claimedBy + heartbeat); core read/write + lint"
    completed: false
  - id: spec-16-2
    title: "Phase 1: desktop MCP server for its own chat agents: dispatch, runs, stop; through Hand to… (worktree, dock tab, asks, Review)"
    completed: true
  - id: spec-16-3
    title: "Phase 1: chat shows 'handed to codex' under the reply; dispatch from the task-in-context"
    completed: false
  - id: spec-16-4
    title: "Phase 2: queues: tasks, a column, an epic; waves by dependsOn; N at once per repo (default 3)"
    completed: false
  - id: spec-16-5
    title: "Phase 2: through completion: validation passes → done (bypass) or Review; retries to maxRetries then park; epic done with its last child"
    completed: false
  - id: spec-16-6
    title: "Phase 2: pause, resume, stop the queue from chat, dock and runner"
    completed: false
  - id: spec-16-7
    title: "Phase 3: brainfile dispatch / dispatch status (CLI) and MCP dispatch, dispatch_status"
    completed: false
  - id: spec-16-8
    title: "Phase 3: brainfile run, a foreground runner; TUI shows live runs"
    completed: false
  - id: spec-16-9
    title: "Docs: the why-not-subagents case in MANUAL and the desktop design"
    completed: false
updatedAt: "2026-10-12T23:30:59.371Z"
---

## Description
Hand-offs today are one at a time, from Hand to… on a task. The most useful place to start work is the desktop chat while you're in a project: "create a follow-up for the sync bug and hand it to Codex", "dispatch all todos", "take epic-24 through to the end". The desktop is the nice way to do it; the same tools are shared so a developer can orchestrate from a Claude Code terminal without the desktop at all. Builds on spec-14 (dispatch into a worktree).

**Why not subagents, or shelling out to codex.** For one task in one session those are simpler, and that's fine. Brainfile earns its place when work outlives a conversation:
- It survives the session: a dispatch is board state, committed and synced, so "continue epic-24" works tomorrow, from another terminal, harness or machine. Subagent orchestration dies with its conversation.
- Across harnesses: each task picks its agent and model (Codex, Claude Code, Cursor, Grok, Antigravity) through one protocol, one permission policy, the same brief and standing decisions.
- Isolation: a worktree and branch per hand-off (spec-14), with a review moment; subagents and shell-outs share one checkout.
- Done means done: a task completes when its contract's validation passes, retries up to maxRetries, then parks in Review with its notes; not "the subagent said so".
- The orchestrator's context stays clean: workers report to the board (notes, ledger), and the orchestrator reads status, not transcripts.
- A record: who did what, which files, how long, in the ledger and the board's history.
A lighter mode stays open: an agent that prefers its own subagents can still use Brainfile as the shared tracker (pickup and deliver over MCP) without the runner.

**The record on the board.** A dispatch request is written on the task (or the epic) in frontmatter: the agent and model, who asked, when, the stopping rule (until done, until review), and a claim by the runner that starts it (machine and runner, with a heartbeat) so two runners never start the same task. It commits and syncs like any change. Default: it runs on the machine that queued it.

**Phase 1: dispatch from the desktop chat.** The desktop gives its own chat agents a small second MCP server, in the app, with `dispatch` (task, optional agent and model), `runs` (what is running on this Mac) and `stop`. `dispatch` goes through Hand to…'s path: its own worktree, a tab in the dock, asks in the pane, and the task lands in Review. The chat shows it under the reply like any board change ("task-35 added", "task-35 handed to codex"). No CLI release needed.

**Phase 2: queues.** "All todos", "these five", "epic-24 through completion": the tasks are queued in waves that follow dependsOn, at most N at once per repo (default 3, set in repo settings), each in its own worktree. Through completion: a task is done when its validation passes (auto-completed when the repo's policy is bypass, otherwise it stops in Review for the person); an epic is done when its last child is. A failed validation retries up to the contract's maxRetries, then parks in Review; the queue never loops. Pause, resume and stop the queue from the chat, the dock or the runner.

**Phase 3: the shared surface.** `brainfile dispatch <ids|--column|--parent> --agent --model --until done|review` and `brainfile dispatch status` in the CLI, the same as MCP tools (`dispatch`, `dispatch_status`), so any agent can queue work. `brainfile run`: a foreground runner (not a daemon) left open in a terminal split: works the queue until empty, prints one quiet line per task, asks permission there, and the TUI shows the same `codex · editing` on rows. Close it and the queue waits on the board. The desktop runs the same queue when it is open.

**Not in scope.** A background server or daemon, remote runners, scheduling by time, cost budgets (later).
