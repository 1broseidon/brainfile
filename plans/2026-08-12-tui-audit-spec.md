# TUI audit spec — rules removal (adr-2), panel collapse, rubric fixes (binding)

Yardstick: `.brainfile/plans/2026-08-12-tui-rubric.md`. Decisions locked: kill rules (adr-2), collapse the 1/2/3 panels, $EDITOR handoff, keybind consolidation. Scope agent binds only what §Bind delegates.

## A. Rules removal (adr-2) — the one round where core removals are authorized
1. Schema: drop `rules` from the v2 board schema (`cli/src/schemas/board.json` canonical + `docs/public/v2/board.json` served copy). Parser TOLERATES a legacy `rules:` field (no crash, preserved on round-trip write? No — preserved read, dropped on config rewrite is acceptable pre-1.0; bind whichever the serializer makes safe, document it).
2. Lint: legacy `rules:` present → warning "rules is removed (adr-2); fold into agent.instructions"; `lint --fix` appends each rule text (with its category as a prefix, e.g. "never: …") to `agent.instructions` and removes the block.
3. CLI: delete `commands/rules.ts` + its cli.ts registration + help text. `adr promote` simplifies: marks the ADR accepted/promoted and archives per current flow, WITHOUT extracting a rule into config.
4. Core: remove rule operations (`addRule`, `deleteRule`, and any rule-specific types/exports — enumerate exactly in scope pass). This is a deliberate breaking export removal authorized by adr-2 — list every removed export in the report.
5. brief: the board lane shows `agent.instructions` + accepted ADRs (id + title). No rules lane.
6. Docs: sweep `rules` as a feature from docs/ (board-format reference table, guides, README if present) — mention only in a migration note.
7. TUI: RulesPanel dies (also §B).

## B. Panel collapse — one list, one mental model
1. Delete the 1/2/3 panel system: `RulesPanel`, `LogsPanel`, their keybinds, tab UI, and types.
2. Completed history joins the `t` type-cycle as a `done` stop: reads `logs/` (readTasksDir on logsDir / findV2Task searchLogs path), renders in the same DocumentList (dim styling), same detail view (archived banner in header, e.g. `· completed 08-12`). Read-mostly gating: no move/complete on archived docs; footer reflects (restore stays a CLI verb this round).
3. Help overlay stays keys-only.

## C. Rubric fixes
1. **$EDITOR handoff (P8)**: `e` on a document suspends the TUI (ink raw-mode release + alt-screen exit — bind the exact ink 7 mechanics), spawns `$EDITOR` (fallback `$VISUAL`, then `vi`) on the task's `.md` file, and on exit reloads + re-renders preserving selection. Delete ALL inline-edit paths and their overlay/input machinery (three `e` handlers today). No $EDITOR set and not a TTY → status-line error, no crash.
2. **NO_COLOR (P4)**: honor `NO_COLOR` (bind: chalk may already handle it — verify through the esbuild bundle; if ink's own color output needs gating, gate it). Render test: NO_COLOR frame still carries glyphs/indentation/selection legibly (selection must use a non-color mechanism under NO_COLOR — bind: inverse video is fine if it survives, else a marker char).
3. **Resume view (P1+P9)**: `state/tui.json` gains `lastColumn` and `lastTypeFilter`; TUI launches into them; both already have visible indicators (tabs, `· type` label) satisfying P9.
4. **Live-refresh cursor survival (P3)**: add the missing guarantee test — mutate the board externally (direct core call or spawned CLI) while mounted; assert the frame updates AND selection + detail drill state survive when the selected doc still exists; selection clamps sanely when it was deleted.
5. **Cold-start guard (P1)**: a spawn test asserting `tui --help` and first-frame render stay under a generous CI-safe budget (bind number; goal is catching order-of-magnitude regressions like eager-loading the TUI chunk, not micro-benchmarking).
6. **Keybinds (P2)**: `h/l` = column prev/next; `tab` kept as alias; `[ ]` retired. Footer/help updated.

## D. Hygiene
Unused imports flagged across `actions.ts`, `DetailView.tsx`, `useKeyboardNavigation.ts`; dead `giga` palette entry + `getPriorityColor` case; orphaned theme entries; any component now orphaned by §B.

## Bind (scope pass)
ink 7 suspend/resume mechanics for $EDITOR; NO_COLOR path through the bundle; exact core exports removed by §A4; logs-reading approach for the `done` stop; the cold-start budget number; how selection-preservation hooks into useBrainfileLoader's chokidar refresh.

## Constraints
Core changes: ONLY the §A removals + anything §Bind explicitly adds; everything else additive. zod 4.3.6. MCP: 11 tools, both eras, untouched behavior (rules never had a tool). migrate.ts keeps working (it writes configs — must not emit `rules`). actions.ts: signature changes only where §B/§C force them, each recorded.

## Gauntlet (unchanged shape)
typecheck seconds · root build · full tests (baselines core 639 / cli 417 / tui 69 — tui grows, cli may shrink only by deleted rules tests, itemized) · bundle smoke (list, brief, tui --help) · mcp-smoke 11 tools both eras. Plus new empirical tests: Esc-mash (P5), NO_COLOR frame (P4), refresh-survival (P3), editor handoff with a scripted fake $EDITOR (P8), resume (P9), cold-start guard (P1).
