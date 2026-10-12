---
id: task-35
title: "Discuss: talk a task over with an agent, and update its spec, before handing it off"
column: todo
position: 4
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
    completed: false
  - id: task-35-2
    title: Start a planning-only agent session with the task as context
    completed: false
  - id: task-35-3
    title: Agent can edit the task's description, subtasks and contract, and not code
    completed: false
  - id: task-35-4
    title: Keep the discussion with the task so the hand-off can see it
    completed: false
  - id: task-35-5
    title: Tests
    completed: false
createdAt: "2026-10-12T22:24:00.756Z"
---

## Description
A "Discuss" key next to the hand-off key (HandTo) in the task detail. It opens a conversation with an agent about this task, with the task loaded as context, before any work is dispatched.

The agent can read the task, its parent, its decisions and the code it touches. It can ask questions, push back and suggest changes. With the person's agreement it updates the task's description, subtasks or contract on the board. It does not write code or start the work.

When the discussion is done, the person hands the task off as usual and the agent gets the revised spec.

Open questions:
- Should this reuse the chat pane (ChatPop) scoped to the task, or open its own thread?
- Should the thread be kept, as a note on the task or a link to the transcript, so the agent doing the work can see what was agreed?
- Which agent does it use: the default agent, or one picked from the same list as hand-off?
