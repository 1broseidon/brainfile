---
id: task-19
title: "TUI: parity with the decision framework"
column: review
position: 3
tags:
  - tui
  - decisions
parentId: epic-2
createdAt: "2026-10-12T15:35:49.043Z"
subtasks:
  - id: task-19-1
    title: Decisions leave the column list (no column, no longer fall into one)
    completed: true
  - id: task-19-2
    title: "Decisions view: standing decisions by claim-key family, history folded; t decision stop + direct key"
    completed: true
  - id: task-19-3
    title: "Decision detail: claim key, kind, stance+subject, holds while, recheck, valid until, replaces/replaced by and resting work (navigable); no complete/move"
    completed: true
  - id: task-19-4
    title: Work detail shows Rests on (retired marked); rows on a retired decision say 'decision changed'
    completed: true
  - id: task-19-5
    title: Help overlay, footer hints, NO_COLOR, narrow widths; TUI tests for each; MANUAL + CHANGELOG
    completed: true
updatedAt: "2026-10-12T16:12:04.205Z"
---

## Description
The desktop got a Decisions view and decision details overnight (spec-11/12); the TUI only learned the ● glyph and the type cycle. Bring it level, in the TUI's own idiom (keys, footer, help overlay), reading the same core API (groupDecisionsByPrefix, summarizeDecision, buildDocGraph).

- Decisions leave the column list: they have no column, so today they fall into the first one.
- A decisions view: standing decisions grouped by claim-key family, history (superseded, rejected, stale) folded below; reached from the type cycle's decision stop and a direct key (not d, which deletes).
- A decision's detail: claim key, kind, stance and subject, holds while, recheck, valid until (review once past), replaces / replaced by (navigable), and the open work resting on it.
- Work's detail shows the decisions it rests on; a row resting on a replaced decision says so.
- Help overlay, footer hints, NO_COLOR and narrow widths covered; TUI tests for each.

## Log
- 2026-10-12T16:03:04.792Z: [claude] Landed on feat/tui-decisions (0a0b16d, b6131e3, bf36055): decisions lifted out of columns and the done list by the loader; decisions view on D and the type cycle's decision stop (families via groupDecisionsByPrefix, history folded, L folds it); decision detail (fields, chain, work resting on it, all on the flat cursor); work's 'rests on'; 'decision changed' row chip. TUI 179/179 (129 baseline + 50 new; 6 existing suites updated for adr-1 leaving To Do). Smoked the real binary in a pty (pyte) on a copy of /tmp/bf-demo at 130x30 and 60x22 NO_COLOR.
- 2026-10-12T16:12:03.630Z: [claude] Done on feat/tui-decisions (0a0b16d..9fb4cb6, 6 commits, not pushed): pieces, wiring, tests, docs (MANUAL TUI section, CHANGELOG Unreleased), then two fixes: the decision stop keeps spec-12's adr name on adr-only boards (CLI utils.test caught my rename), and help sizes each column's keys to its longest (contract:ready no longer runs into its description). Final: npm run build OK; core 857/857, CLI 595 pass / 9 fail (same brainfile-finder, command-lint, hook-settings), TUI 179/179 (129 + 50). Only cli/src/tui/, MANUAL.md, CHANGELOG.md touched; no core change.
- 2026-10-12T16:12:03.911Z: [claude] Decision: judgement calls for task-19. (1) Key: D for the decisions view (d deletes; capital like L for done; same letter as the desktop's band key). D again returns to the stop it left; t continues the cycle from the decision stop. The stop is the type cycle's decision stop (named adr on a board that only configures adr, as spec-12 had it), present when the board holds decisions or a like: decision type; D works even with none (empty state names brainfile decide). (2) The loader lifts decisions out of the columns AND the done list (retired decisions are not completed work, as the desktop does); like: decision custom types count and get no stop of their own. (3) History folds by L inside the view (L opens done on the board), a separate flag from done so leaving the view never lands you in done; folded history keeps its heading and count; the / filter honours the fold (heading count shows matches) rather than auto-opening. (4) Families use core's groupDecisionsByPrefix order (alphabetical, unfiled last), not the desktop's largest-first; a legacy adr with no status reads proposed and stands under 'unfiled'. (5) Rows keep the TUI's id column (desktop rows have none); at rest only kind != decision, proposed, review past validUntil (no future date, per the brief); retired rows say 'superseded → decision-2' / rejected / stale. The claim key is revealed on the selected row only when the whole title still fits, so selecting never cuts a title. (6) The decisions view and a decision's detail are read-only except e (and y, enter): a/n/N/m/c/d/p/A/space answer with how decisions change (decide, supersede, retire); delete is not offered there even though the CLI can delete a decision. (7) Decision detail: fields one per line (claim key, kind always when set, stance+subject, holds while and recheck wrapped to 3 lines, valid until + review, replaces/replaced by as cursor stops, created); state chip = status; no priority. Stops: refs, resting work, children, subtasks. Work detail: 'rests on (n)' after the description with ● / ○, retired marked in the warning colour, not-on-board refs say so and enter explains. (8) 'decision changed' = open work resting on a superseded, rejected or stale decision (proposed never stood, so it does not count); chip leads the precedence so the 3-chip cap never drops it; done rows not flagged. (9) Detail cursor stops now also draw the ▌ bar (inverse alone vanishes under NO_COLOR); loadLogs gives archived docs their description (retired decisions had none). (10) Existing suites changed only where adr-1 leaving To Do moved counts/rows (board-list, collapse, detail, esc-mash, interactions, type-cycle). Smoke: real binary in a pty (pyte) on a COPY of /tmp/bf-demo (/tmp/bf-demo-tui19); /tmp/bf-demo itself untouched. Uncertain: whether George wants delete on decisions in the TUI, and the desktop's largest-family-first order vs core's alphabetical.
