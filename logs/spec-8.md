---
id: spec-8
type: task
title: "TUI audit: rules removal (adr-2), panel collapse, rubric fixes"
tags:
  - tui
  - architecture
  - rules
relatedFiles:
  - .brainfile/plans/2026-08-12-tui-audit-spec.md
  - .brainfile/plans/2026-08-12-tui-rubric.md
createdAt: "2026-08-12T19:41:02.929Z"
completedAt: "2026-08-12T22:23:31.412Z"
---

## Description
Final UI/UX audit pass before 0.20.0. Yardstick: plans/2026-08-12-tui-rubric.md (10 first-principles tests). Binding spec: plans/2026-08-12-tui-audit-spec.md — A: rules system removed per adr-2 (schema, lint --fix folds into agent.instructions, commands/rules.ts deleted, core rule ops removed — authorized breaking removals, adr promote simplified, brief shows instructions + accepted ADRs); B: 1/2/3 panels collapsed — completed history becomes a done stop on the t type-cycle with read-only gating; C: $EDITOR handoff replacing all inline editing, NO_COLOR, resume last column/type, live-refresh cursor-survival guarantee, cold-start guard, h/l keybinds; D: hygiene sweep.

## Log
- 2026-08-12T22:23:31.412Z: [reconstructed] Archived body lost to migrate --logs-to-ledger (destructive pre-fix); frontmatter and description restored from ledger record.
