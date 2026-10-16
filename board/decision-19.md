---
id: decision-19
title: Discuss is a task-scoped discussion under one set of rules, wherever it runs
type: decision
status: current
claimKey: core.dispatch.discuss
kind: decision
recheck: When dispatch/task-79 lands, set the source to core/src/dispatch/discuss.ts
supersedes: decision-6
createdAt: "2026-10-16T01:13:29.163Z"
---

## Description
Discuss is a task-scoped discussion: a thread in the desktop's chat (titled `Discuss <task-id>` and reopened by the task's Discuss key), a `brainfile discuss` session in the terminal, or an MCP client given the `discuss` prompt or tool. All three get their context and rules from core/src/dispatch/discuss.ts. With the person's yes it may change its task's description, subtasks and contract. It may also record, replace or retire a decision after running check, and links the task to it with forWork. What was agreed goes in the task's log as a note, where the hand-off's brief finds it. When brainfile runs the agent (the desktop or the terminal), it never runs in a bypass mode and is read-only when the agent offers that. It may use only the board's read tools plus task_patch, subtask, contract, note, decide, supersede and retire. Edits, commands, mode changes and other board tools are refused before anyone is asked. An MCP client keeps to these rules itself.
