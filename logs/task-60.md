---
id: task-60
title: "One trunk for this repository: the release fixes in main, merged branches gone"
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
updatedAt: "2026-10-14T21:16:23.268Z"
completedAt: "2026-10-14T21:16:23.268Z"
---

## Description
decision-13. Merge origin/main (0.22.0 and 0.22.1, shipped from release/0.22 and fix/board-state) into main, settling CHANGELOG.md, MANUAL.md, core/src/repo/consolidate.ts and core/src/__tests__/repo-consolidate.test.ts. The main folder checks out main and feat/desktop-app is retired (both are a82f644 today). Push main once the person says so. Delete the 14 merged branches, the sibling folders brainfile-fix-state, brainfile-package-app and brainfile-phone-link, and the clean task-58 worktree. Leave task-43 (Cursor uses it) and the unmerged dispatch/task-45 and dispatch/task-48. The push and every deletion wait for the person's yes.

## Log
- 2026-10-14T21:16:22.854Z: [claude] Done 2026-10-14 on the person's word. Merged origin/main (the 0.22.0 and 0.22.1 releases, shipped as squashed PRs #4 and #5) into main as b18cb9f: CHANGELOG.md took the published 0.22.0 and 0.22.1 sections, MANUAL.md and core consolidate.ts with its test kept main's (a superset). Core 888/888, desktop 198/198; the CLI's 9 failures are the same before the merge (macOS /var vs /private/var temp paths). Pushed main (ddc7c42..b18cb9f); only the docs workflow runs on it. Removed the five merged, clean worktrees (dispatch task-43 and task-58, brainfile-fix-state, brainfile-package-app, brainfile-phone-link) and 16 merged local branches; deleted origin's fix/board-state, fix/description-headings and release/0.22. Kept: main, the board's brainfile branch, and origin/cursor/docs-first-project-walkthrough-12ee (one commit not in main).
