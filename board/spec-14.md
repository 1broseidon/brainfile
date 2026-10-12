---
id: spec-14
title: "Dispatch into a worktree: each hand-off on its own branch"
type: spec
column: backlog
position: 1
tags:
  - desktop
  - dispatch
  - git
createdAt: "2026-10-12T18:47:59.412Z"
---

## Description
Hand to… runs the agent in the person's working copy (Codex's task-15 fix landed uncommitted on feat/desktop-app), so two dispatches, or an agent and the person, share one checkout. Learned from Orca: give each dispatch its own git worktree and branch (task-15 → brainfile/task-15), with the board still shared through the brainfile branch.

- The agent commits its work on that branch; the brief says so.
- A review moment in the task pane when it lands in Review: the branch, a diff summary, open in your editor, merge, send back with a note.
- Clean up the worktree on merge or discard.
- Not an IDE: no diff authoring, no terminals.
