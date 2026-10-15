---
id: epic-9
title: "QA drill: an epic with a branch of its own, led to the end and merged once (epic-8)"
type: epic
description: |-
  A practice epic for epic-8's epic-branch check; see that task under epic-8 for the steps. It lands on `qa/parity` (landsOn), never main. Once you turn on its `epicBranch`, its lead makes `dispatch/<this epic>` from qa/parity, its two children fork from and land on that branch, and when the second has landed the epic is one item in Ready to merge.

  **For the lead:** hand off the two children in order (the second depends on the first). There is no code to plan: each child appends one line to `qa/parity-wave-1.md`. Do not add children or change their descriptions.
tags:
  - qa
  - spec-18
  - epic-branch
decisions:
  - decision-16
  - decision-15
createdAt: "2026-10-15T18:20:49.911Z"
landsOn: qa/parity
updatedAt: "2026-10-15T20:58:19.083Z"
epicBranch: true
assignee: claude
completedAt: "2026-10-15T20:58:19.083Z"
---

## Description
A practice epic for epic-8's epic-branch check; see that task under epic-8 for the steps. It lands on `qa/parity` (landsOn), never main. Once you turn on its `epicBranch`, its lead makes `dispatch/<this epic>` from qa/parity, its two children fork from and land on that branch, and when the second has landed the epic is one item in Ready to merge.

**For the lead:** hand off the two children in order (the second depends on the first). There is no code to plan: each child appends one line to `qa/parity-wave-1.md`. Do not add children or change their descriptions.

## Log
- 2026-10-15T20:55:51.067Z: [claude] Lead plan: task-95 then task-96 (task-96 dependsOn task-95; both append to qa/parity-wave-1.md, so they must not run together). No code to wire: the epic's whole is the file holding the existing QA lines plus both drill lines on dispatch/epic-9, which task-96's contract checks, so no extra child (the epic also forbids adding one). Gave both children contracts with grep validation for their line, the branch name, and that qa/parity's existing lines survive. Hand off task-95 now (claude/opus); task-96 once task-95 lands on dispatch/epic-9.

## Child Tasks
Summary: 2/2 children completed.
- task-95: Drill child 1: a line on the epic's branch (completed)
- task-96: Drill child 2: a line on the epic's branch, after the target was brought in (completed)
