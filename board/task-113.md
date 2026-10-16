---
id: task-113
title: "Hand-off worktrees that wait in Review keep their build artifacts: 87 GB of Rust target/ folders under ~/.brainfile-worktrees today; show the size and offer to clean"
column: todo
position: 12
description: |-
  Found in the final pass (2026-10-16): `~/.brainfile-worktrees/hotline-e23ecf/task-{60,61,62,63,66}` hold 11–29 GB each, all in `target/` (Rust builds), 87 GB in all, for five hand-offs that have sat in Ready to merge for a day. Nothing in Brainfile shows this or limits it; Discard and landing remove the worktree, but work that waits for a person keeps it.

  - Show each hand-off's worktree size in Review and on the Ready to merge row when it is large (say, over 1 GB), and the total in Settings or the strip.
  - Offer "Clean build artifacts": remove ignored files (`git clean -fdX` in the worktree) without touching the work; the branch and tracked changes stay.
  - Consider cleaning ignored files automatically when a hand-off has waited in Review for more than a day, with a note on the task.
  - `brainfile review --ready` prints the same size, and `brainfile review clean <task>` does the same from a terminal.
  Hotline's five are another agent's to settle; the person decides on those.
tags:
  - desktop
  - worktree
  - disk
  - design
relatedFiles:
  - core/src/repo/worktree.ts
  - desktop/src/renderer/components/Review.svelte
  - desktop/src/renderer/components/MergeSignal.svelte
createdAt: "2026-10-16T04:50:09.670Z"
---

## Description
Found in the final pass (2026-10-16): `~/.brainfile-worktrees/hotline-e23ecf/task-{60,61,62,63,66}` hold 11–29 GB each, all in `target/` (Rust builds), 87 GB in all, for five hand-offs that have sat in Ready to merge for a day. Nothing in Brainfile shows this or limits it; Discard and landing remove the worktree, but work that waits for a person keeps it.

- Show each hand-off's worktree size in Review and on the Ready to merge row when it is large (say, over 1 GB), and the total in Settings or the strip.
- Offer "Clean build artifacts": remove ignored files (`git clean -fdX` in the worktree) without touching the work; the branch and tracked changes stay.
- Consider cleaning ignored files automatically when a hand-off has waited in Review for more than a day, with a note on the task.
- `brainfile review --ready` prints the same size, and `brainfile review clean <task>` does the same from a terminal.
Hotline's five are another agent's to settle; the person decides on those.
