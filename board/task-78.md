---
id: task-78
title: "Board fixes from the CLI and MCP: the desktop's Fix and Undo move to core"
column: backlog
position: 14
description: |-
  The CLI already has `where`, `adopt`, `merge-boards` and `backups`, so settling two boards is shared. The health list's Fix is not: desktop/src/host/fix.ts plans and applies untrack, adopt and prune only when nothing would be lost, backs up every copy first and allows Undo for 20 seconds.

  - Move `planFix`, `applyFix` and `undoFix` to core/src/repo/fix.ts. The undo record goes in `.brainfile/state/last-fix.json` instead of the host's memory, so `brainfile fix --undo` works from another process.
  - CLI: `brainfile fix [--dry-run] [--undo]`. It prints the plan in the words the desktop shows (integrity.ts) and applies it only when the plan has not changed since it was shown (`expected`).
  - MCP: `where` gains action fix | undo, or a `fix` tool. Map it in the parity test.
  - The host calls core, and the desktop's Fix and Undo are unchanged.
tags:
  - core
  - cli
  - mcp
  - board-integrity
relatedFiles:
  - desktop/src/host/fix.ts
  - desktop/src/host/integrity.ts
  - desktop/src/host/host.ts
  - desktop/test/fix.test.ts
  - core/src/repo/consolidate.ts
  - cli/src/commands/boards.ts
  - cli/src/commands/where.ts
  - cli/src/mcp/tools/where_tool.ts
parentId: epic-6
decisions:
  - decision-1
contract:
  status: draft
  deliverables:
    - type: file
      path: core/src/repo/fix.ts
      description: Plan, apply and undo a lossless board fix, with the undo record in state/
    - type: file
      path: cli/src/commands/fix.ts
      description: brainfile fix, with --dry-run and --undo
    - type: test
      path: core/src/__tests__/repo-fix.test.ts
      description: desktop/test/fix.test.ts, ported, plus undo from a second process
    - type: file
      path: cli/src/__tests__/mcp-parity.test.ts
      description: fix mapped
  validation:
    commands:
      - npm run build && npm test
      - cd desktop && npm run typecheck && npm test
createdAt: "2026-10-14T22:15:30.571Z"
---

## Description
The CLI already has `where`, `adopt`, `merge-boards` and `backups`, so settling two boards is shared. The health list's Fix is not: desktop/src/host/fix.ts plans and applies untrack, adopt and prune only when nothing would be lost, backs up every copy first and allows Undo for 20 seconds.

- Move `planFix`, `applyFix` and `undoFix` to core/src/repo/fix.ts. The undo record goes in `.brainfile/state/last-fix.json` instead of the host's memory, so `brainfile fix --undo` works from another process.
- CLI: `brainfile fix [--dry-run] [--undo]`. It prints the plan in the words the desktop shows (integrity.ts) and applies it only when the plan has not changed since it was shown (`expected`).
- MCP: `where` gains action fix | undo, or a `fix` tool. Map it in the parity test.
- The host calls core, and the desktop's Fix and Undo are unchanged.
