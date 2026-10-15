---
id: task-91
title: "QA hand-off 2: it waits until hand-off 1 has landed, its brief carries what hand-off 1 left, and two landings at once go one at a time"
column: review
position: 5
description: |-
  **For the agent this is handed to:** in your brief, find what the task you depend on said when it finished, and append one line to `qa/parity-wave-1.md`: `- QA hand-off 2 (<task id>): built on <that task's id>, which said "<the first few words of its last note>", <the time now, ISO>`. Commit it on your branch. Change nothing else, and do not tick this task's subtasks: they are the person's checks. Then do as your brief says when you finish.

  **For the person (QA).** Tests the dependency rule (2cff04e: a dependency counts only once its branch has landed), the brief carrying a dependency's notes, and task-76's landing lock.
  1. Do this while hand-off 1 is still in Review, before you merge it: hand this task off. It does not start: it says it waits, and that it will be handed off once its dependency has landed.
  2. Merge hand-off 1. Hand this one off again (or let it go if it was queued). It starts.
  3. In its conversation, its first prompt includes "It builds on work already landed" with hand-off 1's last notes.
  4. Its line on `qa/parity` quotes hand-off 1's note.
  5. The lock, optional: when this one and another task under epic-8 are both in Ready to merge, merge them back to back without waiting. Both land, one after the other. `qa/parity` has two `Merge` commits, and `.brainfile/state/landing.lock` is gone afterwards. From a terminal, `bfq`-side landings share the same lock.
tags:
  - qa
  - landing
  - hand-off
relatedFiles:
  - qa/parity-wave-1.md
parentId: epic-8
dependsOn:
  - task-89
  - task-90
subtasks:
  - id: task-91-1
    title: Handed off before hand-off 1 landed, it waits and says why
    completed: true
  - id: task-91-2
    title: After hand-off 1 merges, it starts
    completed: true
  - id: task-91-3
    title: Its first prompt carries hand-off 1's last notes
    completed: true
  - id: task-91-4
    title: Its line on qa/parity quotes hand-off 1
    completed: true
  - id: task-91-5
    title: "Optional: two merges back to back both land, one at a time; no landing.lock left behind"
    completed: true
createdAt: "2026-10-15T18:20:40.478Z"
updatedAt: "2026-10-15T19:27:05.717Z"
assignee: claude
dispatch:
  agent: claude
  model: opus
  effort: high
  by: person
  at: "2026-10-15T19:10:47.812Z"
---

## Description
**For the agent this is handed to:** in your brief, find what the task you depend on said when it finished, and append one line to `qa/parity-wave-1.md`: `- QA hand-off 2 (<task id>): built on <that task's id>, which said "<the first few words of its last note>", <the time now, ISO>`. Commit it on your branch. Change nothing else, and do not tick this task's subtasks: they are the person's checks. Then do as your brief says when you finish.

**For the person (QA).** Tests the dependency rule (2cff04e: a dependency counts only once its branch has landed), the brief carrying a dependency's notes, and task-76's landing lock.
1. Do this while hand-off 1 is still in Review, before you merge it: hand this task off. It does not start: it says it waits, and that it will be handed off once its dependency has landed.
2. Merge hand-off 1. Hand this one off again (or let it go if it was queued). It starts.
3. In its conversation, its first prompt includes "It builds on work already landed" with hand-off 1's last notes.
4. Its line on `qa/parity` quotes hand-off 1's note.
5. The lock, optional: when this one and another task under epic-8 are both in Ready to merge, merge them back to back without waiting. Both land, one after the other. `qa/parity` has two `Merge` commits, and `.brainfile/state/landing.lock` is gone afterwards. From a terminal, `bfq`-side landings share the same lock.

## Log
- 2026-10-15T19:11:28.271Z: [claude] Appended "- QA hand-off 2 (task-91): built on task-90, which said "QA passed (person + Claude)", 2026-10-15T19:11:01Z" to qa/parity-wave-1.md, committed as 467831c on dispatch/task-91 (forked from qa/parity at b4e24ab). Nothing else changed; subtasks left for QA. For whoever comes next: task-90's note says later appends to the tracked file commit normally, but a plain `git add qa/parity-wave-1.md` is still refused because qa/ is ignored; `git add -u` (or `git commit -a`) works. Nothing is left unwired.
- 2026-10-15T19:27:06.099Z: [claude] QA (Claude): handed off before task-90 landed it waited and could not be started (person); after task-90 merged it started, forked from qa/parity at b4e24ab (brainfileBase qa/parity); its brief carries "It builds on work already landed" with task-89's and task-90's last notes (checked by building the brief with core's brief()); its line on dispatch/task-91 quotes task-90's last note. Check 5 (two landings back to back) skipped here: the cross-process landing test in core covers it, and no second item is in Ready to merge. All checks ticked before Merge, so Merge should complete it directly.
