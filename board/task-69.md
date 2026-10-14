---
id: task-69
title: A Ready to merge group at the top of the list, with Merge on the row
column: review
position: 9
priority: high
tags:
  - desktop
  - dispatch
  - git
relatedFiles:
  - desktop/src/agents/worktree.ts
  - desktop/src/agents/agents.ts
  - desktop/src/renderer/lib/state.svelte.ts
  - desktop/src/renderer/components/ListView.svelte
  - desktop/src/renderer/components/CalmRow.svelte
  - desktop/src/renderer/components/TaskRow.svelte
parentId: epic-4
contract:
  status: delivered
  deliverables:
    - type: file
      path: desktop/src/agents/worktree.ts
      description: readyToMerge across a repository's hand-off worktrees
    - type: test
      path: desktop/test/worktree.test.ts
      description: Ready, conflicting, uncommitted and merged branches
  validation:
    commands:
      - cd desktop && npm run typecheck && npm test
  metrics:
    readyAt: "2026-10-14T20:02:35.672Z"
    pickedUpAt: "2026-10-14T20:02:36.070Z"
    reworkCount: 0
    deliveredAt: "2026-10-14T20:07:39.474Z"
    duration: 303
createdAt: "2026-10-14T20:02:32.484Z"
updatedAt: "2026-10-14T20:07:39.474Z"
---

## Description
In both list modes it is hard to tell what can merge: the list knows a task's column, and only the task pane asks git about its branch. A group above Review, 'Ready to merge', holds exactly the tasks whose hand-off branch can merge now: commits not in its branch-to-go-into, nothing uncommitted, no live run, not merged already, and git merge-tree finds no conflict. The task is drawn there instead of its column (a completed task with an unmerged branch included); the row shows lines added and removed, and Merge under the pointer, the same Merge as the task pane's. A branch that would conflict stays in its column with 'conflicts' as its signal. One call per board (the agents process, every dispatch worktree at once), refreshed when the board changes, when a run ends and after a merge. The group goes when empty. With task-62 it becomes Ready to land.

## Log
- 2026-10-14T20:07:39.877Z: [claude] Built on main (uncommitted). worktree.ts readyToMerge(projectId): every dispatch worktree whose branch has commits not in its into, nothing uncommitted, not merged; conflicts from git merge-tree --write-tree (exit 1), which writes nothing; with the checkout. agents.ts leaves out a task with a live hand-off; IPC readyToMerge. state: mergeable per board, refreshed on open, on each snapshot (400 ms debounce), when a hand-off ends and after merge or discard. listGroups pulls ready tasks (open or completed) out of the outline into ':ready', first in both modes, never glanced, foldable; ready children leave their family. MergeSignal on CalmRow and TaskRow: +added −removed, Merge under the pointer (disabled with a tip when the checkout is not on into), or 'conflicts' in the warning colour. design.md (Dispatch, Calm list). 2 new tests; 184/184, typecheck clean. Seen offscreen on /private/tmp/bf-demo with one ready and one conflicting hand-off in both list modes; the demo repo restored after. Not done: the count on a window-level key (the chat key's badge means a reply is waiting; mixing them would blur it).
