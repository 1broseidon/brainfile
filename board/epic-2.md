---
id: epic-2
title: Memory and the graph
type: epic
column: in-progress
position: 0
tags:
  - memory
  - graph
  - types
  - recoil
createdAt: "2026-10-12T05:52:24.425Z"
updatedAt: "2026-10-12T05:53:10.076Z"
---

## Description
Fold recoil's memory into Brainfile on top of opinionated default types that form a graph. spec-12 (default types and the graph) comes first: it defines the decision type that spec-11 (memory: decisions on the board, a local index, one brief) builds on.

## Log
- 2026-10-12T07:51:48.261Z: [claude] Overnight build done and merged into feat/desktop-app (4d52e43, from feat/memory-graph; not pushed). spec-12, spec-11 and spec-13 are in Review. Verified: root build; core 857/857, CLI 595 pass / 9 fail (the same 9 pre-existing: brainfile-finder, command-lint, hook-settings), TUI 129/129; desktop svelte-check/tsc/vite clean; the app on this board and bf-demo. Open for George: engines >=20 vs >=22.13 (index always-on), types.adr entry on this board now inert, recoil's last release, the Decision: notes on each spec.
