---
id: decision-3
title: Discuss is a task-scoped thread in the board's chat, kept as a note on the task
type: decision
status: superseded
claimKey: desktop.dispatch.discuss
kind: decision
stance: requires
subject: task-scoped chat thread for Discuss
recheck: When the branch dispatch/task-35 merges, add desktop/src/agents/discuss.ts as its source
tags:
  - desktop
  - dispatch
  - chat
createdAt: "2026-10-12T23:45:33.858Z"
supersededBy: decision-6
updatedAt: "2026-10-13T17:03:25.889Z"
---

## Description
Discuss is a task-scoped thread in the board's chat, kept as a note on the task

Discuss (task-35) reuses the board's chat (ChatPop) rather than opening a pane of its own: a thread with a taskId, titled `Discuss <task-id>`, kept in the chat's history, and reopened by the task's Discuss key. Its agent is the one Hand to… offers first (the project's last used), and the chat's picker changes it. What was agreed is kept on the board, not as a transcript: the agent adds a note to the task's log when it changes the spec, and the hand-off's brief carries the task body, log included, so the agent doing the work sees it. A discussion has no desk, never runs in a bypass mode (read-only when the agent offers it), and may use only the board's read tools plus task_patch, subtask, contract and note; edits, commands, mode changes and other board tools are refused before anyone is asked. Rules live in desktop/src/agents/discuss.ts.
