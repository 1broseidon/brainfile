---
id: adr-2
title: Remove the rules system from schema, core, and CLI
type: adr
tags:
  - architecture
  - rules
createdAt: "2026-08-12T19:40:09.325Z"
status: promoted
completedAt: "2026-09-21T18:10:45.650Z"
---

## Description
Decision (George, 2026-08-12): rules do not earn their place. Rationale: (1) redundant three ways — agent.instructions covers behavioral one-liners in the same schema, CLAUDE.md/AGENTS.md won harness-level law because harnesses inject instruction files automatically while board rules require an optional fetch agents skip, and durable decisions live better in ADRs (board) and recoil (lifecycle, supersession); (2) zero adoption — our own heavily-dogfooded board never used rules; the always/never/prefer/context taxonomy is v1-era speculative structure; (3) no enforcement — an unenforced rule is documentation with worse surfaces. Same disease as v1 embedded tasks: policy embedded in config. Config configures (columns, types, instructions); everything with lifecycle is a document. Consequences: rules: schema block removed (parser tolerates legacy field, lint warns and --fix folds into agent.instructions), commands/rules.ts removed, core rule operations removed (pre-1.0 breaking change authorized), ADR promote simplifies to status marking, RulesPanel dies with the panel system, brief's board lane shows agent.instructions + accepted ADRs. If enforcement ever matters, structured rules return AS an enforcement feature, not a prose list.
