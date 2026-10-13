---
id: task-44
title: "Discuss: record and update decisions from the chat, with the person's yes"
column: todo
position: 0
description: |-
  Discuss can only suggest decisions. Its instructions forbid recording them, and its allowed tool list (`DISCUSS_TOOLS` in desktop/src/agents/discuss.ts) leaves out `decide`, `supersede` and `retire`. In task-43's discussion, the person decided to make calm mode the default, against decision-5. The agent could only give them wording to record by hand.

  Let Discuss record a new decision, or replace or retire an existing one, with the same rule it has for editing its task:
  1. Run `check` first.
  2. Show the claim key, title, text and which decision it replaces or retires.
  3. Wait for a yes.
  4. Then record it, add it to the task's decisions (task_patch), and leave a note on the task.

  Update discuss.ts (the instructions in `discussPreamble` and `DISCUSS_TOOLS`), desktop/design.md › Dispatch (Discuss), and the tests for `discussPermission`. The other limits stay as they are: no other tasks changed, no moves, completions or deletions, no code.
priority: medium
tags:
  - desktop
  - dispatch
  - chat
  - decisions
relatedFiles:
  - desktop/src/agents/discuss.ts
  - desktop/design.md
decisions:
  - decision-3
  - decision-6
createdAt: "2026-10-13T16:56:44.812Z"
updatedAt: "2026-10-13T17:03:25.892Z"
---

## Description
Discuss can only suggest decisions. Its instructions forbid recording them, and its allowed tool list (`DISCUSS_TOOLS` in desktop/src/agents/discuss.ts) leaves out `decide`, `supersede` and `retire`. In task-43's discussion, the person decided to make calm mode the default, against decision-5. The agent could only give them wording to record by hand.

Let Discuss record a new decision, or replace or retire an existing one, with the same rule it has for editing its task:
1. Run `check` first.
2. Show the claim key, title, text and which decision it replaces or retires.
3. Wait for a yes.
4. Then record it, add it to the task's decisions (task_patch), and leave a note on the task.

Update discuss.ts (the instructions in `discussPreamble` and `DISCUSS_TOOLS`), desktop/design.md › Dispatch (Discuss), and the tests for `discussPermission`. The other limits stay as they are: no other tasks changed, no moves, completions or deletions, no code.

## Log
- 2026-10-13T17:03:34.535Z: [claude] Done on feat/desktop-app (uncommitted): DISCUSS_TOOLS allows decide, supersede and retire; the preamble says check first, show claim key, title, text and what it replaces, wait for a yes, then record with the task in forWork and note it. design.md › Discuss and discuss.test.ts updated; tests and typecheck pass. decision-6 replaces decision-3.
