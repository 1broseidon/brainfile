---
id: task-7
title: "ESM/toolchain decision: unlock chalk/commander/open/chokidar/ink majors"
tags:
  - deps
  - cli
  - architecture
createdAt: "2026-08-11T22:07:36.009Z"
description: "Partially resolved by TUI v3: the esbuild bundle now swallows ESM-only deps for the TUI path (ink 7 + react 19 shipped). Remaining: ride the same bundle to unpin chalk (4→6), commander (14→15), open (10→11), chokidar (4→5) — and evaluate TypeScript 7 (tsgo) while touching the toolchain. Low urgency; all current pins are healthy."
updatedAt: "2026-09-21T18:10:46.053Z"
completedAt: "2026-09-21T18:10:46.053Z"
---

## Description
chalk 6, chokidar 5, commander 15, open 11, ink 4+ (and react 18+) are all ESM-only; cli is CommonJS (module: commonjs). Decide: full ESM migration, or bundle (tsup/esbuild) and keep CJS entry. Unlocking ink 4+ matters most (TUI is on ink 3 + react 17). Also evaluate TypeScript 7 (native tsgo) while touching the toolchain.
