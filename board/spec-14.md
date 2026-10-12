---
id: spec-14
title: "Dispatch into a worktree: each hand-off on its own branch"
type: spec
column: todo
position: 3
tags:
  - desktop
  - dispatch
  - git
createdAt: "2026-10-12T18:47:59.412Z"
updatedAt: "2026-10-12T23:05:34.199Z"
assignee: claude
---

## Description
Hand to… runs the agent in the person's working copy (Codex's task-15 fix landed uncommitted on feat/desktop-app), so two dispatches, or an agent and the person, share one checkout. Learned from Orca: give each dispatch its own git worktree and branch (task-15 → brainfile/task-15), with the board still shared through the brainfile branch.

- The agent commits its work on that branch; the brief says so.
- A review moment in the task pane when it lands in Review: the branch, a diff summary, open in your editor, merge, send back with a note.
- Clean up the worktree on merge or discard.
- Not an IDE: no diff authoring, no terminals.

## Log
- 2026-10-12T19:03:44.732Z: [claude] From 2026-10-12: a dispatched agent fixing the desktop app edited desktop/src/host/host.ts in the running app's own checkout; the dev loop restarted Electron and the ACP session died mid-task (task-20). A worktree per dispatch also fixes this: the agent edits a different checkout than the running app.
