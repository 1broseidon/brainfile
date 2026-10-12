---
id: epic-2
title: Memory and the graph
type: epic
tags:
  - memory
  - graph
  - types
  - recoil
createdAt: "2026-10-12T05:52:24.425Z"
updatedAt: "2026-10-12T18:47:41.429Z"
completedAt: "2026-10-12T18:47:41.429Z"
---

## Description
Fold recoil's memory into Brainfile on top of opinionated default types that form a graph. spec-12 (default types and the graph) comes first: it defines the decision type that spec-11 (memory: decisions on the board, a local index, one brief) builds on.

## Log
- 2026-10-12T07:51:48.261Z: [claude] Overnight build done and merged into feat/desktop-app (4d52e43, from feat/memory-graph; not pushed). spec-12, spec-11 and spec-13 are in Review. Verified: root build; core 857/857, CLI 595 pass / 9 fail (the same 9 pre-existing: brainfile-finder, command-lint, hook-settings), TUI 129/129; desktop svelte-check/tsc/vite clean; the app on this board and bf-demo. Open for George: engines >=20 vs >=22.13 (index always-on), types.adr entry on this board now inert, recoil's last release, the Decision: notes on each spec.
- 2026-10-12T18:47:41.136Z: [claude] Closed by George 2026-10-12 after a walkthrough in the dev app: spec-12, spec-11, spec-13 and task-19 merged into feat/desktop-app.

## Child Tasks
Summary: 4/4 children completed.
- spec-11: Memory: fold recoil into Brainfile (decisions on the board, a local index, one brief) (completed)
- spec-12: Default types and the graph: epic, spec, plan, task, decision (completed)
- spec-13: MCP parity: every CLI capability has an MCP tool (completed)
- task-19: TUI: parity with the decision framework (completed)
