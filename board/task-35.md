---
id: task-35
title: "Discuss: talk a task over with an agent, and update its spec, before handing it off"
column: review
position: 1
description: |-
  A "Discuss" key next to the hand-off key (HandTo) in the task detail. It opens a conversation with an agent about this task, with the task loaded as context, before any work is dispatched.

  The agent can read the task, its parent, its decisions and the code it touches. It can ask questions, push back and suggest changes. With the person's agreement it updates the task's description, subtasks or contract on the board. It does not write code or start the work.

  When the discussion is done, the person hands the task off as usual and the agent gets the revised spec.

  Open questions:
  - Should this reuse the chat pane (ChatPop) scoped to the task, or open its own thread?
  - Should the thread be kept, as a note on the task or a link to the transcript, so the agent doing the work can see what was agreed?
  - Which agent does it use: the default agent, or one picked from the same list as hand-off?
priority: medium
tags:
  - desktop
  - dispatch
  - chat
relatedFiles:
  - desktop/src/renderer/components/HandTo.svelte
  - desktop/src/renderer/components/TaskDetail.svelte
  - desktop/src/renderer/components/ChatPop.svelte
  - desktop/src/renderer/lib/state.svelte.ts
  - desktop/src/agents/agents.ts
subtasks:
  - id: task-35-1
    title: Discuss key beside HandTo in TaskDetail
    completed: true
  - id: task-35-2
    title: Start a planning-only agent session with the task as context
    completed: true
  - id: task-35-3
    title: Agent can edit the task's description, subtasks and contract, and not code
    completed: true
  - id: task-35-4
    title: Keep the discussion with the task so the hand-off can see it
    completed: true
  - id: task-35-5
    title: Tests
    completed: true
createdAt: "2026-10-12T22:24:00.756Z"
assignee: claude
updatedAt: "2026-10-12T23:45:43.484Z"
decisions:
  - decision-3
---

## Description
A "Discuss" key next to the hand-off key (HandTo) in the task detail. It opens a conversation with an agent about this task, with the task loaded as context, before any work is dispatched.

The agent can read the task, its parent, its decisions and the code it touches. It can ask questions, push back and suggest changes. With the person's agreement it updates the task's description, subtasks or contract on the board. It does not write code or start the work.

When the discussion is done, the person hands the task off as usual and the agent gets the revised spec.

Open questions:
- Should this reuse the chat pane (ChatPop) scoped to the task, or open its own thread?
- Should the thread be kept, as a note on the task or a link to the transcript, so the agent doing the work can see what was agreed?
- Which agent does it use: the default agent, or one picked from the same list as hand-off?

## Log
- 2026-10-12T23:45:43.179Z: [claude] Built Discuss on branch dispatch/task-35 (commit 044ffa6). A Discuss key beside Hand to… opens the chat on a "Discuss task-35" thread, using the agent Hand to… offers first. The agent gets the task, its parent, decisions, contract and related files, and changes the description, subtasks or contract only with the person's agreement, noting what was agreed in the log so the hand-off brief carries it. Discussions get no desk and never run in bypass mode (read-only where offered). Edits, commands and other board tools are refused automatically, but this only holds for agents that ask permission before acting; agents that don't ask are held back by the prompt alone. New code is in desktop/src/agents/discuss.ts, with 6 tests in test/discuss.test.ts. Typecheck, build and 54/54 tests pass. Not tried in the running app. Open questions settled in decision-3.
