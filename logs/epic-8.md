---
id: epic-8
title: "QA: the core groundwork (task-74 to task-78) and where a hand-off lands (spec-18), run on this repository before parity/integration lands on main"
type: epic
description: |-
  The QA guide for everything built on 2026-10-15: task-74 (dispatch record, run files), task-75 (ACP agents in @brainfile/core/dispatch), task-76 (worktrees and landing in core, the shared landing lock), task-77 (issues from the CLI and MCP), task-78 (board Fix and Undo in core), and spec-18 (landsOn and the Lands on picker, pull requests as a landing, the trunk-ahead line, the opt-in epic branch). It all sits on the local branch `parity/integration`, not on main. The last child, sign-off, lands it.

  **Before you start**
  - The dev app runs from the integration worktree, not your checkout: `~/.brainfile-worktrees/parity/integration/desktop` (`npm run dev` there). If it is not running, quit any other dev app and start it there. The window shows your projects as usual; only its code differs.
  - The CLI under test is that worktree's build. In a terminal at this repository: `alias bfq="node ~/.brainfile-worktrees/parity/integration/cli/dist/cli.js"`. The `brainfile` on your PATH is the published one and lacks the new commands.
  - The MCP server under test is `bfq mcp`. Claude Code's attached brainfile server is the published one; the MCP checks say how to attach the new one.
  - Hand-off agents use the published brainfile for the board. That is fine: these tasks need only the old tools.

  **Safe by construction.** This epic has `landsOn: qa/parity`, so every hand-off under it forks from and lands on `qa/parity`, never main. The setup task makes that branch. Only the pull-request tasks push anything, and only `qa/parity` and `dispatch/<task>` branches. The work each hand-off does is one line appended to `qa/parity-wave-1.md`, which only ever exists on `qa/parity`.

  **How to run it**
  - In order: each task depends on the setup, and the hand-off tasks say which to do first.
  - Each task's subtasks are its checks. Tick each one as it passes. Add a note saying what you saw when it differs from what the check says, even if you let it pass.
  - A failure: add a task under this epic tagged `qa-bug`, with the steps, what you expected and what happened. Hand it to Claude, or leave it for the session.
  - A hand-off task passes by being merged (or its pull request merged): that completes it. The others: complete them when every check is ticked.
  - Sign-off is last: it lands parity/integration on main and tidies up.

  **Where each piece is documented:** MANUAL.md (landsOn, epicBranch, pullRequest and source in the field table; `patch --lands-on/--epic-branch`, `pr`, `issues`, `fix`, `add --source`; the MCP tools `pull_request`, `issues`, and `where` action fix | undo), desktop/README.md and desktop/design.md (targets, Ready to merge, pull requests), core/README.md (dispatch, forge), and the changelog fragments in changes/.
tags:
  - qa
  - documentation
  - spec-18
  - epic-6
relatedFiles:
  - core/src/repo/worktree.ts
  - core/src/repo/target.ts
  - core/src/forge/handOffPullRequest.ts
  - desktop/src/agents/agents.ts
  - desktop/src/agents/pullRequests.ts
  - MANUAL.md
decisions:
  - decision-16
  - decision-17
  - decision-18
createdAt: "2026-10-15T18:19:44.057Z"
landsOn: qa/parity
updatedAt: "2026-10-15T21:19:21.451Z"
completedAt: "2026-10-15T21:19:21.451Z"
---

## Description
The QA guide for everything built on 2026-10-15: task-74 (dispatch record, run files), task-75 (ACP agents in @brainfile/core/dispatch), task-76 (worktrees and landing in core, the shared landing lock), task-77 (issues from the CLI and MCP), task-78 (board Fix and Undo in core), and spec-18 (landsOn and the Lands on picker, pull requests as a landing, the trunk-ahead line, the opt-in epic branch). It all sits on the local branch `parity/integration`, not on main. The last child, sign-off, lands it.

**Before you start**
- The dev app runs from the integration worktree, not your checkout: `~/.brainfile-worktrees/parity/integration/desktop` (`npm run dev` there). If it is not running, quit any other dev app and start it there. The window shows your projects as usual; only its code differs.
- The CLI under test is that worktree's build. In a terminal at this repository: `alias bfq="node ~/.brainfile-worktrees/parity/integration/cli/dist/cli.js"`. The `brainfile` on your PATH is the published one and lacks the new commands.
- The MCP server under test is `bfq mcp`. Claude Code's attached brainfile server is the published one; the MCP checks say how to attach the new one.
- Hand-off agents use the published brainfile for the board. That is fine: these tasks need only the old tools.

**Safe by construction.** This epic has `landsOn: qa/parity`, so every hand-off under it forks from and lands on `qa/parity`, never main. The setup task makes that branch. Only the pull-request tasks push anything, and only `qa/parity` and `dispatch/<task>` branches. The work each hand-off does is one line appended to `qa/parity-wave-1.md`, which only ever exists on `qa/parity`.

**How to run it**
- In order: each task depends on the setup, and the hand-off tasks say which to do first.
- Each task's subtasks are its checks. Tick each one as it passes. Add a note saying what you saw when it differs from what the check says, even if you let it pass.
- A failure: add a task under this epic tagged `qa-bug`, with the steps, what you expected and what happened. Hand it to Claude, or leave it for the session.
- A hand-off task passes by being merged (or its pull request merged): that completes it. The others: complete them when every check is ticked.
- Sign-off is last: it lands parity/integration on main and tidies up.

**Where each piece is documented:** MANUAL.md (landsOn, epicBranch, pullRequest and source in the field table; `patch --lands-on/--epic-branch`, `pr`, `issues`, `fix`, `add --source`; the MCP tools `pull_request`, `issues`, and `where` action fix | undo), desktop/README.md and desktop/design.md (targets, Ready to merge, pull requests), core/README.md (dispatch, forge), and the changelog fragments in changes/.

## Child Tasks
Summary: 12/12 children completed.
- task-100: QA: the desktop behaves as before where nothing new is set — agents, models and effort, settings, permissions, Discuss, the chat, issues, Fix and the phone (completed)
- task-101: QA sign-off: land parity/integration on main, move the app back, and tidy what QA made (completed)
- task-102: QA bug: a pull request carries every local landing its base has not pushed, and once squash-merged the local base and origin's diverge (completed)
- task-89: QA setup: the qa/parity branch, the app and CLI under test, and landsOn on the board (lint, patch) (completed)
- task-90: QA hand-off 1: Lands on, inherited from the epic, and Merge onto qa/parity with main untouched (completed)
- task-91: QA hand-off 2: it waits until hand-off 1 has landed, its brief carries what hand-off 1 left, and two landings at once go one at a time (completed)
- task-92: QA hand-off 3: Open pull request, followed until GitHub merges it, which completes the task (completed)
- task-93: QA hand-off 4: a pull request closed without merging puts the work back in Ready to merge, where Discard lets it go (completed)
- task-94: QA: the trunk said when it is ahead of origin, in Ready to merge and the feed (completed)
- task-97: QA: the epic branch, run on epic-9 — its lead makes the branch, brings the target in, and the epic is merged once from a four-way Merge menu (completed)
- task-98: QA: the CLI without the desktop — fix, issues, add --source, pr, patch --lands-on and lint (completed)
- task-99: QA: the MCP tools from an agent — issues, pull_request, where fix and undo, task_patch landsOn and epicBranch, and the dispatch lint (completed)
