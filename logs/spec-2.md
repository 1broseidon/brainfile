---
id: spec-2
type: task
title: "Thin-frontend refactor: move V2 domain logic from cli to core"
tags:
  - architecture
  - core
  - cli
relatedFiles:
  - .brainfile/plans/2026-08-11-cli-core-boundary-spec.md
createdAt: "2026-08-12T00:27:18.540Z"
completedAt: "2026-08-12T02:39:39.349Z"
---

## Description
Discovery complete (single-agent Sonnet workflow). Core is rich for the dead V1 architecture but thin for live V2 — every V2 mutation (move/patch/subtask/complete orchestration, ranked search) is hand-rolled independently in CLI commands, MCP tools, and TUI actions, producing real behavioral drift: TUI move skips auto-complete-on-completionColumn (CLI+MCP do it); MCP subtask tool uses a different ID algorithm than the CLI; 4-5 inconsistent search rankers. 67 modules classified: 14 move-to-core, 12 split, 2 dead, 39 stay. 14 duplications (some verbatim copies of existing core exports). Full spec with 6 implementation phases: .brainfile/plans/2026-08-11-cli-core-boundary-spec.md — Phase 0 (dead code) and Phase 1 (boilerplate consolidation) are near-zero risk; Phase 2 (V2 file-mutation core layer) is the structural fix that also kills the drift bugs.

## Log
- 2026-08-12T02:39:39.349Z: [reconstructed] Archived body lost to migrate --logs-to-ledger (destructive pre-fix); frontmatter and description restored from ledger record.
