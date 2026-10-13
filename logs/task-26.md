---
id: task-26
title: "GitHub integration: track a repo's issues and offer to turn them into tasks"
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
    completed: true
  - id: task-26-2
    title: Authenticate (gh CLI credentials first, token fallback)
    completed: true
  - id: task-26-3
    title: Fetch and show open issues for the repo in desktop
    completed: true
  - id: task-26-4
    title: Offer to create a task from an issue, linking back to it
    completed: true
  - id: task-26-5
    title: Mark issues that already have a linked task
    completed: true
createdAt: "2026-10-12T20:34:18.677Z"
updatedAt: "2026-10-13T19:57:33.510Z"
assignee: claude
decisions:
  - decision-4
completedAt: "2026-10-13T19:57:33.510Z"
---

## Description
When a repo's git origin points at GitHub, the desktop app detects it and shows that repo's open issues next to the board. For an issue with no linked task, offer to create a Brainfile task from it (title, body, labels as tags) and keep a link back to the issue so it isn't offered twice.

Open questions:
- Auth: reuse `gh` CLI credentials when present, otherwise a token or OAuth device flow.
- Where the issue link lives on the task (e.g. a source/issue URL field) and whether closing the task should offer to close the issue.
- Refresh: poll on focus/interval vs. on demand; rate limits.
- Non-GitHub remotes (GitLab etc.) out of scope for now, but keep the detection pluggable.

## Log
- 2026-10-12T23:47:24.847Z: [claude] Built on branch dispatch/task-26 (commit 0178fbd): desktop detects GitHub from origin (pluggable src/main/forge.ts), reads open issues with gh login → GH_TOKEN/GITHUB_TOKEN → Keychain-saved token from Settings (anonymous for public repos), once a minute at most plus ETag 304s; Issues view (key I) offers Make task (title, body, labels as tags, `source:` = issue URL, per decision-4) and lists issues already on the board by their task; task pane shows the Source link. 15 new tests, all 63 pass, build clean, verified in the app against 1broseidon/brainfile. Not done: offering to close the issue when its task completes, OAuth device flow.
