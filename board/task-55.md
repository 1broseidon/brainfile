---
id: task-55
title: "Mobile: calm list parity — list-only, working tasks never behind More"
column: review
position: 0
description: "Match desktop's current list (task-49 list-only, decision-9; task-43/task-52 calm list, decision-7) on the phone: one list grouped by column, no board view; calm rows with only signals at rest; the glance (first three roots, rest under N more) holds except a task an agent is working — starting, working or waiting — and its family, which never sit behind More. Applies in both linked and GitHub modes where the data exists (live run signal only when linked). Same wording and counts as desktop."
priority: medium
tags:
  - mobile
  - list
  - calm
parentId: epic-3
createdAt: "2026-10-14T01:26:20.116Z"
updatedAt: "2026-10-14T01:50:32.897Z"
---

## Description
Match desktop's current list (task-49 list-only, decision-9; task-43/task-52 calm list, decision-7) on the phone: one list grouped by column, no board view; calm rows with only signals at rest; the glance (first three roots, rest under N more) holds except a task an agent is working — starting, working or waiting — and its family, which never sit behind More. Applies in both linked and GitHub modes where the data exists (live run signal only when linked). Same wording and counts as desktop.

## Log
- 2026-10-14T01:50:32.499Z: [claude] Done on brainfile-mobile branch epic-3 (uncommitted). glance takes a holds test: a family with a task an agent is working (linked) stays past the three-root glance, as desktop format.ts glance; Board.tsx passes the run marks. Rows gain the blocked signal (TaskView.blockedOn from the desk's task, below decision changed, above a contract), muted, read as 'waits on …'. Run words now the desktop's: 'codex · Editing…', 'codex · Needs you…' (runWords), runSaid for VoiceOver. Tests ported from desktop calm.test.ts; 119/119 pass, tsc and prettier clean. Not changed: the phone has no parent collapse, so rootsHeld is not needed; the phone's Decisions view still glances families, which the desktop's does not (outside this task).
- 2026-10-14T02:52:01.755Z: [claude] Validation (task-58): PASS. Evidence: outline.ts glance(rows, isRoot, roots, holds) keeps any family where a member holds past the three-root glance, Board.tsx passes working=(row)=>marks.has(task.id) from runMarks (live dispatch runs only, so GitHub mode has no marks and the plain glance holds); tests/board.test.ts ports the desktop calm tests including 'a task an agent is working stays past the glance, its family with it' and the glance still holds for other families; restingSignal order matches desktop format.ts (run, decision changed, blocked, contract, priority, subtasks) with blocked read as 'waits on …' and run words 'codex · Editing…'/'Needs you…' via runWords/runSaid; list-only holds (Board modes are List/Decisions, no board view) and calmOrder/restsFolded match decision-7/decision-9 reading. Phone 125/125 re-run green. Non-blocking residual already noted by the implementer and confirmed: the phone's Decisions families still glance while the desktop shows them whole — outside this task's list spec; file as a follow-up under epic-3 only if parity there is wanted.
