---
id: decision-6
title: Discuss is a task-scoped thread in the board's chat that may change its task's spec and record decisions
type: decision
status: superseded
claimKey: desktop.dispatch.discuss
kind: decision
stance: requires
subject: task-scoped chat thread for Discuss
sourcePath: desktop/src/agents/discuss.ts
sourceHash: sha256:2c53ae92acdf0ffb6b50e2bbd79b67d47a29c27ba3216e20ac1761278333c9c1
supersedes: decision-3
tags:
  - desktop
  - dispatch
  - chat
  - decisions
createdAt: "2026-10-13T17:03:25.888Z"
supersededBy: decision-19
updatedAt: "2026-10-16T01:13:29.164Z"
---

## Description
Discuss is a task-scoped thread in the board's chat that may change its task's spec and record decisions

Discuss (task-35) reuses the board's chat (ChatPop) rather than opening a pane of its own: a thread with a taskId, titled `Discuss <task-id>`, kept in the chat's history, and reopened by the task's Discuss key. Its agent is the one Hand to… offers first (the project's last used), and the chat's picker changes it. What was agreed is kept on the board, not as a transcript: the agent adds a note to the task's log when it changes the spec or records a decision, and the hand-off's brief carries the task body, log included, so the agent doing the work sees it. With the person's yes it may change the task's description, subtasks and contract, and record, replace or retire a decision (task-44): it runs check first, shows the claim key, title, text and what it replaces, and links the task to it with forWork, because a choice made in a discussion should not have to be recorded by hand. A discussion has no desk, never runs in a bypass mode (read-only when the agent offers it), and may use only the board's read tools plus task_patch, subtask, contract, note, decide, supersede and retire; edits, commands, mode changes and other board tools (other tasks, moves, completions, deletions) are refused before anyone is asked. Rules live in desktop/src/agents/discuss.ts.
