---
id: spec-16
title: Dispatch from the chat, queues, and a shared dispatch surface
type: spec
column: todo
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
    completed: true
  - id: spec-16-4
    title: "Phase 2: a lead for an epic (decision-15): no worktree, no code; the desk scoped to its tree; woken with a turn when a child lands, fails, conflicts or asks; its plan in notes on the epic, so a new lead resumes from the board"
    completed: false
  - id: spec-16-5
    title: "Phase 2: the rules the lead cannot bend: dependsOn landed first, N at once per repo (default 3), retries to maxRetries then park in Review, only a lead dispatches, one lead per tree, new children wait as drafts unless until-done on bypass; epic done with its last child"
    completed: false
  - id: spec-16-6
    title: "Phase 2: pause, resume and stop the lead from chat, dock and runner"
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
updatedAt: "2026-10-14T18:48:08.404Z"
decisions:
  - decision-15
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

**Phase 2: a lead runs the epic (decision-15).** Handing off an epic, or any parent, starts a lead: an agent with no worktree that writes no code, as the board chat (decision-14). It gets the desk scoped to its own tree and decides the order (which ready child next, with which agent, model and effort), splits a child that proves too large into new draft children, re-dispatches after a failed validation with a better brief or a rewritten contract, sends a conflict back to its child's agent (decision-12), and stops with a note on the epic when the plan is wrong. The app holds the rules it cannot bend: no child before its dependsOn have landed, at most N at once per repo (default 3, set in repo settings), retries to the contract's maxRetries then the child parks in Review, landings serial. Only a lead dispatches; workers never do, and one lead runs a tree. A child the lead creates waits as a draft for the person, unless the epic was handed off until done on a bypass repo. The lead is woken with a new turn when a child lands, fails, conflicts or asks, never polls, and reads status from the board, not transcripts. The board is its memory (the plan in notes on the epic, a dispatch record on each child), so a lead lost to a restart is replaced by one that reads the board and goes on. Through completion: a child is done when its validation passes (auto-completed when the repo's policy is bypass, otherwise it stops in Review for the person); the epic is done with its last child. Pause, resume and stop the lead from the chat, the dock or the runner. Before landing (task-62) a child ends in Review and the person merges; the lead is woken all the same.

**Phase 3: the shared surface.** `brainfile dispatch <ids|--column|--parent> --agent --model --until done|review` and `brainfile dispatch status` in the CLI, the same as MCP tools (`dispatch`, `dispatch_status`), so any agent can queue work. `brainfile run`: a foreground runner (not a daemon) left open in a terminal split: works the queue until empty, prints one quiet line per task, asks permission there, and the TUI shows the same `codex · editing` on rows. Close it and the queue waits on the board. The desktop runs the same queue when it is open.

**Not in scope.** A background server or daemon, remote runners, scheduling by time, cost budgets (later).

## Log
- 2026-10-12T23:31:00.177Z: [claude] Phase 1 built on feat/chat-dispatch (e7280cc, from feat/desktop-app a35416a; not pushed or merged). The chat's agents get the desk, a second MCP server from the app: dispatch, runs, stop. dispatch is Hand to…'s path (worktree, dock tab, asks in the pane, Review); the reply lists 'task-N handed to codex' from the run events the turn started (AgentRun.from), and the step reads 'desk · dispatch'. Decision: transport is a dependency-free stdio MCP server (desktop/src/agents/desk-mcp.ts, 7 kB, no @modelcontextprotocol/sdk) run by the app's own binary as node (ELECTRON_RUN_AS_NODE=1), which reads it straight out of app.asar, so no asarUnpack and no node needed; it calls the agents process over a Unix socket made per launch (TMPDIR, mode 600) with a token minted per chat session, and the board comes from the token, never the caller, so a chat dispatches on its own board only. Decision: with no agent named, the chat's own agent and model; another agent named takes the model the person chose for it on this board (as Hand to… would), else its default. Decision: desk tools are auto-allowed like the board tools (the dispatched agent still asks in its pane); dispatched agents get no desk (no recursive dispatch). Decision: board record minimal for now: assignee plus dispatch: {agent, model, by: chat, at} written through the host (one commit, kept by core as an unknown key); Hand to… itself writes no record yet, and until/claimedBy/heartbeat/lint stay with spec-16-1. The 'more than three at once' rule is in the preamble, not enforced. Checked end to end offscreen with a scratch user-data, dev and packaged: 'Create a follow-up task titled Write a hello file and hand it to codex' from a Claude Code chat added the task, recorded the dispatch, started codex in ~/.brainfile-worktrees/<repo>/task-N, and the reply listed 'task-N added' and 'task-N handed to codex'. 13 new tests; 48/48 desktop tests, tsc, svelte-check 0/0, vite build, build-electron pass.
