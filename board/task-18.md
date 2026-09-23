---
id: task-18
title: Store shared boards under refs/brainfile/ instead of a remote branch
column: review
position: 0
priority: high
tags:
  - sync
  - cli
  - ux
subtasks:
  - id: task-18-1
    title: sync uses refs/brainfile
    completed: true
  - id: task-18-2
    title: fresh-clone discovery
    completed: true
  - id: task-18-3
    title: 0.21.0 branch migration
    completed: true
  - id: task-18-4
    title: where/sync wording + GitHub link
    completed: true
  - id: task-18-5
    title: tests
    completed: true
  - id: task-18-6
    title: docs + changelog
    completed: true
  - id: task-18-7
    title: commits authored by git user; agent detected and recorded on board
    completed: true
createdAt: "2026-09-23T18:34:23.176Z"
updatedAt: "2026-09-23T19:27:42.241Z"
---

## Description
GitHub shows a 'had recent pushes / Compare & pull request' banner for every autosync push because the board is pushed to refs/heads/brainfile. Verified on a throwaway repo (1broseidon/brainfile-ref-test): a push to refs/brainfile/board is stored and fetchable but not a branch, so no banner, no branch list entry. Treat the remote as a free filestore.

Plan: push/fetch refs/brainfile/<name> (default 'board' for repo boards), tracking ref refs/brainfile/remotes/<remote>/<name> locally (not refs/remotes, so user prune never touches it), fresh-clone discovery via one guarded network lookup (timeout, no prompts, cached miss), one-time migration of 0.21.0 boards pushed as a branch (merge it in, push new ref, delete the old branch with a lease), where/sync wording, docs, changelog. Ship as 0.21.1.

## Log
- 2026-09-23T19:27:42.553Z: [claude] Board commits are now always authored by the git user. The acting agent is tagged on the commit message and on notes: --agent, else nearest agent CLI in the process tree, else env fingerprint (Codex sandbox hides the tree), else git user.name on notes.
