---
id: task-60
title: "One trunk for this repository: the release fixes in main, merged branches gone"
column: todo
position: 3
priority: medium
tags:
  - git
  - process
parentId: epic-4
decisions:
  - decision-13
contract:
  status: draft
  deliverables:
    - type: docs
      path: CHANGELOG.md
      description: 0.22.0 and 0.22.1 entries in main's changelog
  validation:
    commands:
      - npm test && cd desktop && npm run typecheck && npm test
  constraints:
    - Ask before pushing or deleting any branch or folder
createdAt: "2026-10-14T15:15:56.199Z"
updatedAt: "2026-10-14T19:11:56.174Z"
---

## Description
decision-13. Merge origin/main (0.22.0 and 0.22.1, shipped from release/0.22 and fix/board-state) into main, settling CHANGELOG.md, MANUAL.md, core/src/repo/consolidate.ts and core/src/__tests__/repo-consolidate.test.ts. The main folder checks out main and feat/desktop-app is retired (both are a82f644 today). Push main once the person says so. Delete the 14 merged branches, the sibling folders brainfile-fix-state, brainfile-package-app and brainfile-phone-link, and the clean task-58 worktree. Leave task-43 (Cursor uses it) and the unmerged dispatch/task-45 and dispatch/task-48. The push and every deletion wait for the person's yes.
