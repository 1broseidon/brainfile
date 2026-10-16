---
id: task-124
title: "Link: what the phone does not reach yet: leads, Discuss, issues, delete and reopen, and board fixes"
column: backlog
position: 11
description: |-
  The link parity test (desktop/test/link-parity.test.ts, task-121) excludes these api methods with the reason "the phone gets it later (task-N)", naming this task. Each is something the desktop does that the phone cannot yet even start:

  - Leads (decision-15): `leads`, `pauseLead`, `resumeLead`, `stopLead`: the Lead block and its pause, resume and stop.
  - Discuss (decision-19): `discuss`, a turn in a task's discussion.
  - Issues: `forgeRepo` and `listIssues`, the Issues view and making a task from one (decision-4).
  - Delete with Undo and reopen: `deleteTask`, `restoreTask`, `reopenTask`.
  - Board fixes: `planFix`, `fixBoard`, `undoFix`, `settleBoards`.

  For each one taken on: a feature named in the hello (server.ts LINK_FEATURES), the call in bridge.ts CALLS with its argument checks, a section in desktop/link.md, an answer in link:dev (dev.ts), and the entry moved out of the parity test's EXCLUDED. The phone half goes on the mobile board. Those that should stay desk-only get a lasting reason in EXCLUDED instead.
tags:
  - link
  - mobile
  - desktop
  - parity
relatedFiles:
  - desktop/test/link-parity.test.ts
  - desktop/src/link/bridge.ts
  - desktop/link.md
parentId: spec-17
createdAt: "2026-10-16T06:53:15.148Z"
---

## Description
The link parity test (desktop/test/link-parity.test.ts, task-121) excludes these api methods with the reason "the phone gets it later (task-N)", naming this task. Each is something the desktop does that the phone cannot yet even start:

- Leads (decision-15): `leads`, `pauseLead`, `resumeLead`, `stopLead`: the Lead block and its pause, resume and stop.
- Discuss (decision-19): `discuss`, a turn in a task's discussion.
- Issues: `forgeRepo` and `listIssues`, the Issues view and making a task from one (decision-4).
- Delete with Undo and reopen: `deleteTask`, `restoreTask`, `reopenTask`.
- Board fixes: `planFix`, `fixBoard`, `undoFix`, `settleBoards`.

For each one taken on: a feature named in the hello (server.ts LINK_FEATURES), the call in bridge.ts CALLS with its argument checks, a section in desktop/link.md, an answer in link:dev (dev.ts), and the entry moved out of the parity test's EXCLUDED. The phone half goes on the mobile board. Those that should stay desk-only get a lasting reason in EXCLUDED instead.
