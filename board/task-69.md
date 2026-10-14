---
id: task-69
title: A Ready to merge group at the top of the list, with Merge on the row
column: in-progress
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
  status: in_progress
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
createdAt: "2026-10-14T20:02:32.484Z"
updatedAt: "2026-10-14T20:02:36.070Z"
---

## Description
In both list modes it is hard to tell what can merge: the list knows a task's column, and only the task pane asks git about its branch. A group above Review, 'Ready to merge', holds exactly the tasks whose hand-off branch can merge now: commits not in its branch-to-go-into, nothing uncommitted, no live run, not merged already, and git merge-tree finds no conflict. The task is drawn there instead of its column (a completed task with an unmerged branch included); the row shows lines added and removed, and Merge under the pointer, the same Merge as the task pane's. A branch that would conflict stays in its column with 'conflicts' as its signal. One call per board (the agents process, every dispatch worktree at once), refreshed when the board changes, when a run ends and after a merge. The group goes when empty. With task-62 it becomes Ready to land.
