---
id: epic-9
title: "QA drill: an epic with a branch of its own, led to the end and merged once (epic-8)"
type: epic
column: todo
position: 11
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
updatedAt: "2026-10-15T20:31:13.439Z"
---

## Description
A practice epic for epic-8's epic-branch check; see that task under epic-8 for the steps. It lands on `qa/parity` (landsOn), never main. Once you turn on its `epicBranch`, its lead makes `dispatch/<this epic>` from qa/parity, its two children fork from and land on that branch, and when the second has landed the epic is one item in Ready to merge.

**For the lead:** hand off the two children in order (the second depends on the first). There is no code to plan: each child appends one line to `qa/parity-wave-1.md`. Do not add children or change their descriptions.
