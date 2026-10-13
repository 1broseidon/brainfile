---
id: task-45
title: "Discuss: hand the agent the task as a hidden block, at any stage of its life"
column: in-progress
position: 1
priority: medium
tags:
  - desktop
  - dispatch
  - chat
assignee: claude
relatedFiles:
  - desktop/src/agents/discuss.ts
  - desktop/src/agents/agents.ts
  - desktop/src/renderer/lib/state.svelte.ts
  - desktop/design.md
decisions:
  - decision-6
subtasks:
  - id: task-45-8
    title: agent running now)
    completed: false
createdAt: "2026-10-13T18:34:31.310Z"
updatedAt: "2026-10-13T18:34:41.011Z"
---

## Description
A discussion can happen at any stage of a task's life, not only before hand-off. The person sees only "Let's discuss task-N."; ahead of it the agent gets a <task-information> block (stage among the columns, priority, assignee, tags, description, subtasks, contract, parent, the decisions it rests on in full with claim key, stance and recheck, files, the last 10 notes, the board's other current decisions, as-of time) and then <discussion-rules>, so it need not call get_task. Phase 2 adds <work>: the branch, worktree, commits ahead, uncommitted files and whether an agent is working on it now, because in Review the code that matters is on the branch, not the main checkout. The person QAs each phase live in the dev app.
