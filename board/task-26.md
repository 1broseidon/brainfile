---
id: task-26
title: "GitHub integration: track a repo's issues and offer to turn them into tasks"
column: backlog
position: 5
description: |-
  When a repo's git origin points at GitHub, the desktop app detects it and shows that repo's open issues next to the board. For an issue with no linked task, offer to create a Brainfile task from it (title, body, labels as tags) and keep a link back to the issue so it isn't offered twice.

  Open questions:
  - Auth: reuse `gh` CLI credentials when present, otherwise a token or OAuth device flow.
  - Where the issue link lives on the task (e.g. a source/issue URL field) and whether closing the task should offer to close the issue.
  - Refresh: poll on focus/interval vs. on demand; rate limits.
  - Non-GitHub remotes (GitLab etc.) out of scope for now, but keep the detection pluggable.
tags:
  - desktop
  - github
  - integration
  - git
subtasks:
  - id: task-26-1
    title: Detect GitHub from the repo's origin remote (https and ssh forms)
    completed: false
  - id: task-26-2
    title: Authenticate (gh CLI credentials first, token fallback)
    completed: false
  - id: task-26-3
    title: Fetch and show open issues for the repo in desktop
    completed: false
  - id: task-26-4
    title: Offer to create a task from an issue, linking back to it
    completed: false
  - id: task-26-5
    title: Mark issues that already have a linked task
    completed: false
createdAt: "2026-10-12T20:34:18.677Z"
---

## Description
When a repo's git origin points at GitHub, the desktop app detects it and shows that repo's open issues next to the board. For an issue with no linked task, offer to create a Brainfile task from it (title, body, labels as tags) and keep a link back to the issue so it isn't offered twice.

Open questions:
- Auth: reuse `gh` CLI credentials when present, otherwise a token or OAuth device flow.
- Where the issue link lives on the task (e.g. a source/issue URL field) and whether closing the task should offer to close the issue.
- Refresh: poll on focus/interval vs. on demand; rate limits.
- Non-GitHub remotes (GitLab etc.) out of scope for now, but keep the detection pluggable.
