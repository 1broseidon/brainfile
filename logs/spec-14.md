---
id: spec-14
title: "Dispatch into a worktree: each hand-off on its own branch"
type: spec
tags:
  - desktop
  - dispatch
  - git
createdAt: "2026-10-12T18:47:59.412Z"
updatedAt: "2026-10-12T23:17:02.854Z"
assignee: claude
decisions:
  - decision-2
completedAt: "2026-10-12T23:17:02.854Z"
---

## Description
Hand to… runs the agent in the person's working copy (Codex's task-15 fix landed uncommitted on feat/desktop-app), so two dispatches, or an agent and the person, share one checkout. Learned from Orca: give each dispatch its own git worktree and branch (task-15 → brainfile/task-15), with the board still shared through the brainfile branch.

- The agent commits its work on that branch; the brief says so.
- A review moment in the task pane when it lands in Review: the branch, a diff summary, open in your editor, merge, send back with a note.
- Clean up the worktree on merge or discard.
- Not an IDE: no diff authoring, no terminals.

## Log
- 2026-10-12T19:03:44.732Z: [claude] From 2026-10-12: a dispatched agent fixing the desktop app edited desktop/src/host/host.ts in the running app's own checkout; the dev loop restarted Electron and the ACP session died mid-task (task-20). A worktree per dispatch also fixes this: the agent edits a different checkout than the running app.
- 2026-10-12T23:12:11.753Z: [claude] Hand to… now runs each dispatch in its own worktree on dispatch/<task-id> under ~/.brainfile-worktrees/ when the board is on the board branch. It isn't brainfile/<id> because git can't create that beside the brainfile branch; see decision-2. The brief says to commit there. A Review block in the task pane shows the branch, commits, files with lines added and removed, and anything uncommitted, with Open in editor, Merge into the checkout's branch, Send back with a note (logged, same agent, same branch) and Discard; merge and discard remove the worktree and branch. New files: desktop/src/agents/worktree.ts and components/Review.svelte, plus noteTask in the host and openWorktree in main. 9 new tests in desktop/test/worktree.test.ts; 35/35 tests and the typecheck pass. Not committed and not checked visually in the running app. main.ts also holds the person's uncommitted window-state changes.

## Child Tasks
Summary: 1/1 children completed.
- task-36: Test dispatch: add a "Hand-offs" note to the desktop README (completed)
