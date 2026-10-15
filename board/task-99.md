---
id: task-99
title: "QA: the MCP tools from an agent — issues, pull_request, where fix and undo, task_patch landsOn and epicBranch, and the dispatch lint"
column: todo
position: 16
description: |-
  Not a hand-off. Tests the MCP half of task-74, task-77, task-78 and spec-18, through the integration build's server.
  1. Attach it to a Claude Code session in this repository: `claude mcp add brainfile-qa -- node ~/.brainfile-worktrees/parity/integration/cli/dist/cli.js mcp`, start a new session, and check `/mcp` lists brainfile-qa with 28 tools.
  2. Ask it to list the open issues with the `issues` tool (`action: list`): the same as `bfq issues`.
  3. `pull_request` with `{task: "task-92", action: "status"}`: hand-off 3's pull request state and link.
  4. `where`: its result carries `fix: { problems, plan }`. On this board the plan is null. (`action: fix` needs the plan's `expected` words; `action: undo` says there is nothing to undo.)
  5. `task_patch` on any QA task with `landsOn: "qa/parity"`, then `landsOn: null`; `get_task` shows it, then not. The same with `epicBranch: true` / `null` on epic-9 once the drill is done.
  6. `lint`: a task whose `dispatch:` says `by: robot` is a `MALFORMED_DISPATCH` warning. Try it on a throwaway task (`dispatch: {agent: codex, by: robot, at: "2026-10-15T10:00:00Z"}` set by hand in a scratch copy, or trust the test in cli/src/__tests__/lint.test.ts and skip).
  7. Detach afterwards: `claude mcp remove brainfile-qa`.
tags:
  - qa
  - mcp
  - epic-6
parentId: epic-8
dependsOn:
  - task-89
subtasks:
  - id: task-99-1
    title: brainfile-qa attaches with 28 tools
    completed: false
  - id: task-99-2
    title: issues list matches bfq issues
    completed: false
  - id: task-99-3
    title: pull_request status gives state and link
    completed: false
  - id: task-99-4
    title: where carries a fix section; undo with nothing to undo says so
    completed: false
  - id: task-99-5
    title: task_patch sets and clears landsOn and epicBranch
    completed: false
  - id: task-99-6
    title: lint warns MALFORMED_DISPATCH (or skipped, trusting the test)
    completed: false
  - id: task-99-7
    title: brainfile-qa detached
    completed: false
createdAt: "2026-10-15T18:21:50.701Z"
---

## Description
Not a hand-off. Tests the MCP half of task-74, task-77, task-78 and spec-18, through the integration build's server.
1. Attach it to a Claude Code session in this repository: `claude mcp add brainfile-qa -- node ~/.brainfile-worktrees/parity/integration/cli/dist/cli.js mcp`, start a new session, and check `/mcp` lists brainfile-qa with 28 tools.
2. Ask it to list the open issues with the `issues` tool (`action: list`): the same as `bfq issues`.
3. `pull_request` with `{task: "task-92", action: "status"}`: hand-off 3's pull request state and link.
4. `where`: its result carries `fix: { problems, plan }`. On this board the plan is null. (`action: fix` needs the plan's `expected` words; `action: undo` says there is nothing to undo.)
5. `task_patch` on any QA task with `landsOn: "qa/parity"`, then `landsOn: null`; `get_task` shows it, then not. The same with `epicBranch: true` / `null` on epic-9 once the drill is done.
6. `lint`: a task whose `dispatch:` says `by: robot` is a `MALFORMED_DISPATCH` warning. Try it on a throwaway task (`dispatch: {agent: codex, by: robot, at: "2026-10-15T10:00:00Z"}` set by hand in a scratch copy, or trust the test in cli/src/__tests__/lint.test.ts and skip).
7. Detach afterwards: `claude mcp remove brainfile-qa`.
