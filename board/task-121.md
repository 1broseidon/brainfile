---
id: task-121
title: "Link parity test: every api method is bridged for the phone or excluded with a reason, and link:dev answers every bridged call"
column: todo
position: 18
description: |-
  What keeps the phone from drifting behind the desktop again. cli/src/__tests__/mcp-parity.test.ts maps every CLI command to an MCP tool or an exclusion with a reason; do the same for the link.

  - New desktop/test/link-parity.test.ts: reads the api surface (`AGENT_METHODS`, the host methods and the main-process methods in desktop/src/shared/api.ts; find the lists the preload uses) and asserts each name is either a key of bridge.ts's CALLS or in an `EXCLUDED` map with a reason string. Reasons today: window-only (openInEditor, openWorktree, revealProject, listEditors, the updater's four, linkCode/setLink/forgetPhone/linkState), settings the person changes at the desk (getSettings, setSettings, setGitHubToken, githubAuth, agentRegistry, prepareRegistryAgent), board plumbing the phone reaches another way (openBoard/closeBoard are bridged; addProject/removeProject/refreshProject are the desk's), and anything the phone should get later (name the task). The test fails when a new api method is added without a decision.
  - The same test checks link:dev: every bridged call has an answer in dev.ts (or devReviews.ts), so the phone can be tried against the fake with no real desk.
  - The bridge's `features` and desktop/link.md agree: each feature named in LINK_FEATURES has a section in link.md, and each call link.md documents is bridged.
  - Document the rule in desktop/design.md (one paragraph under the phone link) and in desktop/link.md's head.

  Depends on the contract child (the lists it adds).
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
  status: ready
  deliverables:
    - type: test
      path: desktop/test/link-parity.test.ts
      description: Every api method bridged or excluded with a reason; link:dev answers every bridged call; features and link.md agree
    - type: docs
      path: desktop/design.md
      description: The parity rule under the phone link
  validation:
    commands:
      - npm install --prefer-offline --no-audit --no-fund && npm run build && npm test
      - cd desktop && npm install --prefer-offline --no-audit --no-fund && npm run typecheck && npm test && node scripts/build-electron.mjs
  metrics:
    readyAt: "2026-10-16T06:09:34.477Z"
createdAt: "2026-10-16T06:09:34.484Z"
dependsOn:
  - task-120
updatedAt: "2026-10-16T06:10:40.040Z"
---

## Description
What keeps the phone from drifting behind the desktop again. cli/src/__tests__/mcp-parity.test.ts maps every CLI command to an MCP tool or an exclusion with a reason; do the same for the link.

- New desktop/test/link-parity.test.ts: reads the api surface (`AGENT_METHODS`, the host methods and the main-process methods in desktop/src/shared/api.ts; find the lists the preload uses) and asserts each name is either a key of bridge.ts's CALLS or in an `EXCLUDED` map with a reason string. Reasons today: window-only (openInEditor, openWorktree, revealProject, listEditors, the updater's four, linkCode/setLink/forgetPhone/linkState), settings the person changes at the desk (getSettings, setSettings, setGitHubToken, githubAuth, agentRegistry, prepareRegistryAgent), board plumbing the phone reaches another way (openBoard/closeBoard are bridged; addProject/removeProject/refreshProject are the desk's), and anything the phone should get later (name the task). The test fails when a new api method is added without a decision.
- The same test checks link:dev: every bridged call has an answer in dev.ts (or devReviews.ts), so the phone can be tried against the fake with no real desk.
- The bridge's `features` and desktop/link.md agree: each feature named in LINK_FEATURES has a section in link.md, and each call link.md documents is bridged.
- Document the rule in desktop/design.md (one paragraph under the phone link) and in desktop/link.md's head.

Depends on the contract child (the lists it adds).
