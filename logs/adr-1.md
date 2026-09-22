---
id: adr-1
title: Drop V1 board-format support from cli and core
type: adr
tags:
  - architecture
  - v1
createdAt: "2026-08-12T01:16:15.740Z"
status: promoted
completedAt: "2026-09-21T18:10:45.441Z"
---

## Description
Decision (George, 2026-08-11): kill the V1 embedded-board format entirely rather than porting dual code paths through the thin-frontend refactor. Rationale: all published versions are pre-1.0.0 (API changes expected); library adoption is minimal; anyone on V1 can pin an old version or reach out. Consequences: (1) V1 branches in cli commands and MCP tools are removed — they are already unreachable at runtime via rejectLegacyRuntimePath except through 'brainfile migrate', which stays as the V1→V2 converter and keeps read-only V1 parsing in core; (2) core's V2 file-mutation layer (spec-2 Phase 2) is built V2-only, roughly halving its API surface; (3) in-memory Board model stays where it serves as the V2 view model (buildBoardFromV2, TUI).
