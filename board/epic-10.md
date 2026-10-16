---
id: epic-10
title: "One system, desk side: the link carries everything the desktop gained since epic-7 (targets, pull requests, the queue), a parity test keeps it that way, and dependencies across boards are honoured"
type: epic
column: todo
position: 17
description: |-
  The desk half of bringing the phone level with the desktop, so the two feel like one system: the same words, the same signals, the same actions in the same places, and nothing on the desktop that the phone cannot at least see. The phone half is the epic on the related board `mobile` (../brainfile-mobile), whose children wait on this epic's first child.

  Since epic-7 the desktop gained: a target branch per task (landsOn, the Lands on picker, epic branches with a four-way Merge menu: decision-16), pull requests as a landing (Open pull request, the PR on the row and in the feed, followed until merged or closed), the trunk-ahead-of-origin line, runs started outside the window (state/runs), a queue of hand-offs with claims and what each waits on, Discuss from the terminal, and roles. The link (desktop/src/link, features `effort` and `merge`) carries none of it; the phone's Hand to… has no Lands on, cannot open or see a pull request, and sees no queue.

  **Children, in order**
  1. The link contract, version 3: new features `target`, `pull-request`, `merge-to` and `queue`, each a call the phone can make and a shape it can read; desktop/link.md becomes the full contract (today it is 16 lines pointing at the phone's copy); the dev fake (link:dev) answers every new call so the phone can be tried without a real desk.
  2. A link parity test: every method in shared/api.ts is either bridged for the phone or on an exclusion list with a reason, the same way mcp-parity.test.ts keeps the MCP surface honest.
  3. Dependencies across boards: a hand-off, a lead and a brief treat `alias:task-id` as a real dependency (open until complete and landed on the related board), instead of ignoring it.

  **Rules for the lead and the children.** This epic has its own branch (`dispatch/epic-N`): children land there, and Claude reviews the branch before it is merged to main in the morning. Change nothing in the phone's repository from here; the phone's children read desktop/link.md as the contract. Keep the phone's older desks working: a feature a desk does not offer in `hello` means the phone shows what it did before (task-57's rule). Plain copy, decision-10. Validation on every child: the root build and tests, and the desktop's typecheck, tests and bundle.

  Not in scope: chat history sync (task-59), the feed redesign (task-103), the mode selector (task-106), shared words from core/browser (the phone takes @brainfile/core from npm, so that waits for the next release: filed on the mobile epic).
priority: high
tags:
  - mobile
  - link
  - parity
  - desktop
  - core
relatedFiles:
  - desktop/src/link/bridge.ts
  - desktop/src/link/server.ts
  - desktop/src/link/dev.ts
  - desktop/src/link/devReviews.ts
  - desktop/link.md
  - desktop/src/shared/api.ts
  - core/src/dispatch/lead.ts
  - core/src/dispatch/runner.ts
  - core/src/dispatch/brief.ts
decisions:
  - decision-17
  - decision-16
  - decision-10
  - decision-8
createdAt: "2026-10-16T06:08:18.930Z"
---

## Description
The desk half of bringing the phone level with the desktop, so the two feel like one system: the same words, the same signals, the same actions in the same places, and nothing on the desktop that the phone cannot at least see. The phone half is the epic on the related board `mobile` (../brainfile-mobile), whose children wait on this epic's first child.

Since epic-7 the desktop gained: a target branch per task (landsOn, the Lands on picker, epic branches with a four-way Merge menu: decision-16), pull requests as a landing (Open pull request, the PR on the row and in the feed, followed until merged or closed), the trunk-ahead-of-origin line, runs started outside the window (state/runs), a queue of hand-offs with claims and what each waits on, Discuss from the terminal, and roles. The link (desktop/src/link, features `effort` and `merge`) carries none of it; the phone's Hand to… has no Lands on, cannot open or see a pull request, and sees no queue.

**Children, in order**
1. The link contract, version 3: new features `target`, `pull-request`, `merge-to` and `queue`, each a call the phone can make and a shape it can read; desktop/link.md becomes the full contract (today it is 16 lines pointing at the phone's copy); the dev fake (link:dev) answers every new call so the phone can be tried without a real desk.
2. A link parity test: every method in shared/api.ts is either bridged for the phone or on an exclusion list with a reason, the same way mcp-parity.test.ts keeps the MCP surface honest.
3. Dependencies across boards: a hand-off, a lead and a brief treat `alias:task-id` as a real dependency (open until complete and landed on the related board), instead of ignoring it.

**Rules for the lead and the children.** This epic has its own branch (`dispatch/epic-N`): children land there, and Claude reviews the branch before it is merged to main in the morning. Change nothing in the phone's repository from here; the phone's children read desktop/link.md as the contract. Keep the phone's older desks working: a feature a desk does not offer in `hello` means the phone shows what it did before (task-57's rule). Plain copy, decision-10. Validation on every child: the root build and tests, and the desktop's typecheck, tests and bundle.

Not in scope: chat history sync (task-59), the feed redesign (task-103), the mode selector (task-106), shared words from core/browser (the phone takes @brainfile/core from npm, so that waits for the next release: filed on the mobile epic).
