---
id: task-100
title: "QA: the desktop behaves as before where nothing new is set — agents, models and effort, settings, permissions, Discuss, the chat, issues, Fix and the phone"
column: todo
position: 17
description: |-
  Not a hand-off. task-75 moved the ACP agents, sessions, settings, models and the brief into core, task-77 the issues client, task-78 Fix and Undo, task-74 the dispatch record. The desktop must behave exactly as before. Use the dev app from the integration worktree.
  1. **Agents (task-75).** Hand to… lists the same agents as before (Claude Code, Codex, Cursor, Grok, Antigravity and any custom ones), with the same availability notes. Each one's models and effort choices load as before; a choice is remembered.
  2. **Settings.** Settings shows your bypass and per-repository permissions as they were (they are read from the same dispatch.json). Change one and change it back.
  3. **Permissions.** Hand a task (any QA task's line will do) to an agent without bypass: a permission ask appears in the band, and answering it lets the agent go on. Board tools are not asked about.
  4. **The board's chat.** Ask it something about the board, and have it add a throwaway task, then delete it.
  5. **Discuss.** Discuss any task under epic-8 for one turn; it reads the task and answers.
  6. **The brief.** In any hand-off's first prompt: the standing decisions list (decision-16, decision-17 and decision-18 among them), the worktree paragraph, and "Do not complete … it is completed when its branch lands on qa/parity" on a board with no Review column (this board has one, so it says to move it to Review instead).
  7. **The dispatch record (task-74).** After any hand-off, the task file's `dispatch:` has agent, model, effort, by and at, as before.
  8. **Issues view (task-77).** The desktop's issues list for this project shows the same issues as `bfq issues`, and importing one makes the task as before (delete it afterwards).
  9. **Fix and Undo (task-78).** If the health strip shows a fixable problem, Fix it and Undo within 20 s. If none, `bfq fix --dry-run` saying "Nothing to fix" is enough here; the cross-process undo is covered by tests.
  10. **The phone (link).** If you use the phone link: Ready to merge on the phone matches the desk, an item with an open pull request is not mergeable there, and a merge from the phone lands as before.
  11. **Restart.** Quit and start the dev app again: nothing it knew is lost (asks, settings, models).
tags:
  - qa
  - desktop
  - regression
  - epic-6
parentId: epic-8
dependsOn:
  - task-89
subtasks:
  - id: task-100-1
    title: Agents, availability, models and effort as before
    completed: false
  - id: task-100-2
    title: Settings read from the same dispatch.json; a change sticks
    completed: false
  - id: task-100-3
    title: A permission ask appears in the band and works
    completed: false
  - id: task-100-4
    title: The board chat answers and edits the board
    completed: false
  - id: task-100-5
    title: Discuss answers about the task
    completed: false
  - id: task-100-6
    title: A hand-off's brief has the decisions, worktree paragraph and finishing rule
    completed: false
  - id: task-100-7
    title: "dispatch: is written on the task as before"
    completed: false
  - id: task-100-8
    title: The issues view lists and imports as before
    completed: false
  - id: task-100-9
    title: Fix and Undo (or nothing to fix)
    completed: false
  - id: task-100-10
    title: "Phone: Ready to merge matches; an open PR is not mergeable"
    completed: false
  - id: task-100-11
    title: A restart keeps settings and models
    completed: false
createdAt: "2026-10-15T18:21:50.981Z"
updatedAt: "2026-10-15T20:31:12.882Z"
---

## Description
Not a hand-off. task-75 moved the ACP agents, sessions, settings, models and the brief into core, task-77 the issues client, task-78 Fix and Undo, task-74 the dispatch record. The desktop must behave exactly as before. Use the dev app from the integration worktree.
1. **Agents (task-75).** Hand to… lists the same agents as before (Claude Code, Codex, Cursor, Grok, Antigravity and any custom ones), with the same availability notes. Each one's models and effort choices load as before; a choice is remembered.
2. **Settings.** Settings shows your bypass and per-repository permissions as they were (they are read from the same dispatch.json). Change one and change it back.
3. **Permissions.** Hand a task (any QA task's line will do) to an agent without bypass: a permission ask appears in the band, and answering it lets the agent go on. Board tools are not asked about.
4. **The board's chat.** Ask it something about the board, and have it add a throwaway task, then delete it.
5. **Discuss.** Discuss any task under epic-8 for one turn; it reads the task and answers.
6. **The brief.** In any hand-off's first prompt: the standing decisions list (decision-16, decision-17 and decision-18 among them), the worktree paragraph, and "Do not complete … it is completed when its branch lands on qa/parity" on a board with no Review column (this board has one, so it says to move it to Review instead).
7. **The dispatch record (task-74).** After any hand-off, the task file's `dispatch:` has agent, model, effort, by and at, as before.
8. **Issues view (task-77).** The desktop's issues list for this project shows the same issues as `bfq issues`, and importing one makes the task as before (delete it afterwards).
9. **Fix and Undo (task-78).** If the health strip shows a fixable problem, Fix it and Undo within 20 s. If none, `bfq fix --dry-run` saying "Nothing to fix" is enough here; the cross-process undo is covered by tests.
10. **The phone (link).** If you use the phone link: Ready to merge on the phone matches the desk, an item with an open pull request is not mergeable there, and a merge from the phone lands as before.
11. **Restart.** Quit and start the dev app again: nothing it knew is lost (asks, settings, models).
