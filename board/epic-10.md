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
epicBranch: true
updatedAt: "2026-10-16T06:11:07.307Z"
dispatch:
  agent: claude
  model: opus
  effort: high
  by: mcp
  at: "2026-10-16T06:11:05.769Z"
  until: done
  role: lead
  claim:
    host: Georges-Mac-Studio
    runner: desktop
    pid: 20499
    at: "2026-10-16T06:11:07.307Z"
assignee: claude
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

## Log
- 2026-10-16T06:13:18.371Z: [claude] Lead's plan (claude/opus), 2026-10-16. Order: wave 1 task-120 ∥ task-122; wave 2 task-123; wave 3 task-121. Why: task-120 as written also built the queue, but "what each hand-off waits on" lives in the CLI's statusReport/waitsOn (cli/src/commands/dispatch.ts ≈307, a copy of runner.ts ≈866) where the desktop cannot reach it, and task-122 rewrites exactly that filter for alias deps. So the queue's real-desk side is split into task-123 (depends on 120 and 122): it moves dispatch status into core (decision-17) on 122's alias-aware waits, adds api queue(), bridges it and only then offers `queue` in hello. task-120 keeps target, pull-request, merge-to, bridges unpushed, and still writes the queue call's shape in desktop/link.md so the phone can build against the contract after task-120 lands. task-122 widened: one exported core waits function used by runner and the CLI (dispatch/status), and TaskDetail's Hand to… counts alias waits. task-121 is last and is the epic's integration child: parity test plus an end-to-end link test (all six features, a queue alias wait with its board named); depends on 120 and 123. Agents: 120 claude/opus, 122 codex/gpt-6.1-sol, 123 claude/opus, 121 claude/opus.
- 2026-10-16T06:43:29.027Z: [claude] task-123 (b68ddf9 on dispatch/task-123) changed desktop/link.md › The queue, for the phone: QueueView.queued[] gains optional `waitMessage` (the board-named reason, set when a wait is on a related board, e.g. "the mobile board is missing"); `running` holds hand-offs only (kind dispatch; chat and lead turns stay in `live`); `runners` includes the desk's own window. `queue` is now in the hello's features and link:dev answers it (task-2 queued, task-4 waiting on task-2 and mobile:task-12, task-1 run in a terminal, two runners, main 2 ahead).
- 2026-10-16T07:02:07.161Z: [claude] task-121 (on dispatch/task-121): the parity test and an end-to-end test of the epic pass against the real desk, and nothing between the children failed. Seams fixed there were all in the docs: link.md's hello example lacked `queue`, `effort` had no section, and design.md still named the phone's copy as the contract. Left for later: task-124 (backlog, under spec-17) covers the api methods the phone does not reach yet (leads, Discuss, issues, delete/restore/reopen, board fixes), and the parity test names it. A hand-off from the phone is recorded `by: person`, because the link's dispatch is the window's call; core's DispatchBy has `phone` but no desk writes it. This is older than this epic and was left as is. The window's renderer does not show the queue (phone only).
