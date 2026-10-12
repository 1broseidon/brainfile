---
id: task-36
title: "Test dispatch: add a \"Hand-offs\" note to the desktop README"
column: todo
position: 4
description: |-
  A throwaway task to try spec-14 end to end in the dev window: hand it to an agent, let it work in its worktree on dispatch/<task-id>, then merge it from the Review section.

  Change: in desktop/README.md, add a short "## Hand-offs" section after "## Run" with two or three sentences: Hand to… runs the agent in its own git worktree on the branch dispatch/<task-id>; the agent commits there; when the task reaches Review you can see the diff, open it in your editor, merge it or send it back, and the worktree is removed on merge or discard.

  Touch only desktop/README.md. Commit the change on the dispatch branch, then move the task to Review.
priority: low
tags:
  - desktop
  - dispatch
  - test
relatedFiles:
  - desktop/README.md
parentId: spec-14
decisions:
  - decision-2
subtasks:
  - id: task-36-1
    title: Add the Hand-offs section to desktop/README.md
    completed: false
  - id: task-36-2
    title: Commit on the dispatch branch
    completed: false
  - id: task-36-3
    title: Move the task to Review
    completed: false
createdAt: "2026-10-12T23:14:13.926Z"
---

## Description
A throwaway task to try spec-14 end to end in the dev window: hand it to an agent, let it work in its worktree on dispatch/<task-id>, then merge it from the Review section.

Change: in desktop/README.md, add a short "## Hand-offs" section after "## Run" with two or three sentences: Hand to… runs the agent in its own git worktree on the branch dispatch/<task-id>; the agent commits there; when the task reaches Review you can see the diff, open it in your editor, merge it or send it back, and the worktree is removed on merge or discard.

Touch only desktop/README.md. Commit the change on the dispatch branch, then move the task to Review.
