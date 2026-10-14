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
  - id: task-45-1
    title: "Phase 1: the <task-information> block from the board, rules for any stage, and the visible line \"Let's discuss task-N.\""
    completed: true
  - id: task-45-2
    title: "Phase 2: the <work> section: branch, worktree, commits ahead, uncommitted files, and whether an agent is working on it now"
    completed: false
createdAt: "2026-10-13T18:34:31.310Z"
updatedAt: "2026-10-14T04:45:49.781Z"
---

## Description
A discussion can happen at any stage of a task's life, not only before hand-off. The person sees only "Let's discuss task-N."; ahead of it the agent gets a <task-information> block (stage among the columns, priority, assignee, tags, description, subtasks, contract, parent, the decisions it rests on in full with claim key, stance and recheck, files, the last 10 notes, the board's other current decisions, as-of time) and then <discussion-rules>, so it need not call get_task. Phase 2 adds <work>: the branch, worktree, commits ahead, uncommitted files and whether an agent is working on it now, because in Review the code that matters is on the branch, not the main checkout. The person QAs each phase live in the dev app.

## Log
- 2026-10-13T18:34:46.162Z: [claude] Phase 1 built, not committed: discuss.ts writes <task-information> (taskInformation) and <discussion-rules> (discussRules); discussContext reads stage, priority, assignee, tags, decisions in full, the last 10 notes and the board's other current decisions itself, and finds done tasks in logs/. The visible line is "Let's discuss task-N." and the Discuss tooltip is "Talk it over with an agent". design.md › Discuss updated. 95/95 desktop tests pass, typecheck clean. Waiting for the person's QA in the dev app.
- 2026-10-14T04:21:20.348Z: [xena] Checkpoint reconciliation: Phase 1 committed in a82f644 (discuss.ts taskInformation/discussRules, state.svelte.ts). Corrects 2026-10-13T18:34 log 'built, not committed'. Phase 2 (<work>) still open; stays in-progress.
- 2026-10-14T04:27:20.231Z: [claude] Phase 1 committed in a82f644 on feat/desktop-app (supersedes the earlier "built, not committed" note); Phase 2 (<work>) still open.
- 2026-10-14T04:47:57.501Z: [claude] Phase 2 built and committed in 5b508f2 on dispatch/task-45: <work> closes <task-information> (branch, worktree, commits ahead, files changed, uncommitted files named, live agent with model/effort); with a branch the rules send the agent to the worktree's files (it runs no git). worktree.ts gains uncommittedIn; design.md updated. 164/164 desktop tests, typecheck clean. Needs the person's QA in the dev app.
