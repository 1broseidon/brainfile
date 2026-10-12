---
id: task-29
title: "spec-15 phase 3: one home for the board branch; migrate --to-branch finishes the job"
column: todo
position: 4
priority: high
tags:
  - sync
  - git
  - integrity
assignee: claude
parentId: spec-15
createdAt: "2026-10-12T20:39:19.176Z"
---

## Description
where/lint report board-branch worktrees outside .brainfile/, prune ones whose folder is gone; migrate --to-branch untracks .brainfile/ on the code branch and adds it to .gitignore in one commit; end-to-end runprism.ai reproduction on scratch repos. Covers spec-15-5, spec-15-6, spec-15-8.
