---
id: task-121
title: "Link parity test and the epic's whole: every api method is bridged for the phone or excluded with a reason, link:dev answers every bridged call, and the four features work end to end"
column: review
position: 18
tags:
  - link
  - desktop
  - test
  - parity
relatedFiles:
  - desktop/src/shared/api.ts
  - desktop/src/link/bridge.ts
  - desktop/src/link/dev.ts
  - desktop/test/link-parity.test.ts
  - cli/src/__tests__/mcp-parity.test.ts
parentId: epic-10
decisions:
  - decision-17
contract:
  status: delivered
  deliverables:
    - type: test
      path: desktop/test/link-parity.test.ts
      description: Every api method bridged or excluded with a reason; link:dev answers every bridged call; features and link.md agree
    - type: test
      path: desktop/test/link-epic.test.ts
      description: "End to end through the link: the six features, Lands on, a pull request, Merge with to, and the queue showing an alias wait with its board named"
    - type: docs
      path: desktop/design.md
      description: The parity rule under the phone link
  validation:
    commands:
      - npm install --prefer-offline --no-audit --no-fund && npm run build && npm test
      - cd desktop && npm install --prefer-offline --no-audit --no-fund && npm run typecheck && npm test && node scripts/build-electron.mjs
      - cd desktop && test -f test/link-parity.test.ts && test -f test/link-epic.test.ts
  metrics:
    readyAt: "2026-10-16T06:13:26.616Z"
    pickedUpAt: "2026-10-16T06:48:17.586Z"
    reworkCount: 0
    deliveredAt: "2026-10-16T07:01:58.560Z"
    duration: 821
createdAt: "2026-10-16T06:09:34.484Z"
dependsOn:
  - task-120
  - task-123
updatedAt: "2026-10-16T07:01:58.560Z"
dispatch:
  agent: claude
  model: opus
  effort: high
  by: lead
  at: "2026-10-16T06:31:57.665Z"
  until: done
  tries: 1
  claim:
    host: Georges-Mac-Studio
    runner: desktop
    pid: 20499
    at: "2026-10-16T06:48:02.419Z"
assignee: claude
---

## Description
What keeps the phone from drifting behind the desktop again, and the epic's last child: it wires and tests the whole. cli/src/__tests__/mcp-parity.test.ts maps every CLI command to an MCP tool or an exclusion with a reason; do the same for the link.

- New desktop/test/link-parity.test.ts: reads the api surface (`AGENT_METHODS`, the host methods and the main-process methods in desktop/src/shared/api.ts; find the lists the preload uses) and asserts each name is either a key of bridge.ts's CALLS or in an `EXCLUDED` map with a reason string. Reasons today: window-only (openInEditor, openWorktree, revealProject, listEditors, the updater's four, linkCode/setLink/forgetPhone/linkState), settings the person changes at the desk (getSettings, setSettings, setGitHubToken, githubAuth, agentRegistry, prepareRegistryAgent), board plumbing the phone reaches another way (openBoard/closeBoard are bridged; addProject/removeProject/refreshProject are the desk's), and anything the phone should get later (name the task). The test fails when a new api method is added without a decision.
- The same test checks link:dev: every bridged call has an answer in dev.ts (or devReviews.ts, or devQueue.ts), so the phone can be tried against the fake with no real desk.
- The bridge's `features` and desktop/link.md agree: each feature named in LINK_FEATURES has a section in link.md, and each call link.md documents is bridged.
- **The whole (lead's addition, epic-10 plan):** an end-to-end test through the link server and bridge (the in-process host with a scratch board, as link.test.ts does) against the epic's description of done: hello offers effort, merge, target, pull-request, merge-to and queue; a phone sets a task's Lands on, opens a pull request and sees it on the row, merges an epic-branch child with `to`, and reads the queue, where a hand-off waiting on an `alias:task-id` dependency on a related scratch board shows that wait with the board named (task-122's waits through task-123's queue). Fix any seam you find between the children's work; leave a note on epic-10 for anything you could not.
- Document the rule in desktop/design.md (one paragraph under the phone link) and in desktop/link.md's head.

Depends on task-120 (target, pull-request, merge-to, the contract) and task-123 (queue, on task-122's alias waits).

**Left by task-123 (b68ddf9, landed on dispatch/epic-10 as 5056541):**
- Core: `@brainfile/core/dispatch` status.ts exports dispatchStatus(runner, brainfilePath, projectId, {visible, ownEpic, withSelf}), queuedWaits (waitsOn + waitMessage via handOffWaits) and statusLeads; CLI and MCP dispatch status call them.
- Desktop: Api.queue(projectId) → QueueView (shared/api.ts, with QueuedHandOff), answered in the agents process by src/agents/queue.ts deskQueue; preload, AGENT_METHODS, bridge CALLS and LINK_FEATURES include queue. link:dev answers through the same queueView in src/link/devQueue.ts (count it as a dev answer source in the parity test).
- link.md › The queue: queued[] has optional `waitMessage` (board-named reason for a related-board wait); `running` holds hand-offs only (chat and lead turns stay in `live`); `runners` includes the desk's own window. link:dev fixtures: task-2 queued, task-4 waiting on task-2 and mobile:task-12, task-1 run in a terminal, two runners, main 2 ahead.
- For the end-to-end test: link.test.ts already has a real-desk queue test with a core Runner, a terminal runner and an alias wait; reuse its setup rather than building another.
- Not wired: the window's renderer does not show the queue (phone only). Out of scope here; leave it as a note on epic-10 if the parity test needs an exclusion reason for it.

## Log
- 2026-10-16T06:48:45.683Z: [claude] Lead: task-123 landed on dispatch/epic-10 (5056541) before this run started. Its hand-over is now in this task's description under "Left by task-123": count src/link/devQueue.ts as a link:dev answer source, reuse link.test.ts's real-desk queue setup for the end-to-end alias wait, and expect queued[].waitMessage to be in link.md.
