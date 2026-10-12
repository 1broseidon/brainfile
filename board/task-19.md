---
id: task-19
title: "TUI: parity with the decision framework"
column: in-progress
position: 1
tags:
  - tui
  - decisions
parentId: epic-2
createdAt: "2026-10-12T15:35:49.043Z"
subtasks:
  - id: task-19-1
    title: Decisions leave the column list (no column, no longer fall into one)
    completed: false
updatedAt: "2026-10-12T15:37:33.984Z"
---

## Description
The desktop got a Decisions view and decision details overnight (spec-11/12); the TUI only learned the ● glyph and the type cycle. Bring it level, in the TUI's own idiom (keys, footer, help overlay), reading the same core API (groupDecisionsByPrefix, summarizeDecision, buildDocGraph).

- Decisions leave the column list: they have no column, so today they fall into the first one.
- A decisions view: standing decisions grouped by claim-key family, history (superseded, rejected, stale) folded below; reached from the type cycle's decision stop and a direct key (not d, which deletes).
- A decision's detail: claim key, kind, stance and subject, holds while, recheck, valid until (review once past), replaces / replaced by (navigable), and the open work resting on it.
- Work's detail shows the decisions it rests on; a row resting on a replaced decision says so.
- Help overlay, footer hints, NO_COLOR and narrow widths covered; TUI tests for each.
