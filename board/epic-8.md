---
id: epic-8
title: "QA: the core groundwork (task-74 to task-78) and where a hand-off lands (spec-18), run on this repository before parity/integration lands on main"
type: epic
column: todo
position: 4
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
