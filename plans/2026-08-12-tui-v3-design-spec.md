# TUI v3 — Design Specification (binding design authority)

Approved direction (George, 2026-08-12): condensed, clarity-focused redesign **and** the ink 7 platform jump, done together. This document is the design authority; the scope agent binds the technical details it explicitly delegates, and must not alter the visual/interaction design without recording a deviation.

## 1. Goals

- **Density**: one row per document. A 30-row terminal shows ~25 documents, not 6 cards.
- **Clarity**: color is *signal only* (priority, contract state, selection). Structure comes from typography — dim IDs, bright titles, indentation for hierarchy. No decorative color.
- **No chrome**: no box borders around content (delete `ManualBorder` usage in list/detail). Horizontal rules for header/footer only. Whitespace and alignment do the work.
- **Every document type is a citizen**: tasks, epics, specs, adrs, plans render distinctly and participate in nav/search/detail equally.

## 2. Platform (decided)

- **ink 7 + react 19**, consumed via an **esbuild-bundled CLI**: the bundle swallows ESM-only deps while the published package keeps working as a normal `bin`. This resolves task-7's dilemma for the TUI path without converting the package to ESM.
- Scope agent binds (verify against real package metadata, don't assume):
  - ink 7's react peer range; ink-testing-library compatibility.
  - esbuild config: entry `cli/src/cli.ts`, platform node, target node20, single-file bundle to `dist/cli.js` (keep `copy-schemas`); how to handle ink's yoga **wasm** asset (inline loader vs file copy) — this is the known sharp edge.
  - **Test strategy for ESM-only ink under jest** — pick one: jest ESM mode for TUI suites, transformIgnorePatterns carve-out, or a dedicated tui test config; non-TUI suites must keep running exactly as today. Do not migrate the repo's test runner this round.
  - Whether `react-devtools-core`/ink dev overlays need excluding from the bundle.
- Non-goals this round: unpinning chalk/commander/open (they ride a later bundle-wide cleanup), any core changes, ESM-converting core or cli source style.

## 3. Design system

- **Type glyphs** (column 1): `▸` epic · `◆` spec · `●` adr · `⎘` plan · (blank) task.
- **Color roles**: selection = inverse bar; priority `critical` red / `high` yellow (dot or title tint, one mechanism only); contract states — `draft` dim, `ready` cyan, `in_progress` yellow, `delivered` magenta, `done` green, `failed`/`blocked` red; IDs/metadata dim gray; everything else default foreground.
- **Hierarchy**: children (via `parentId`) indent two spaces under their parent when the parent is visible in the same column view; orphan reference (`← epic-1`) when parent lives elsewhere.
- **Right-aligned signal chips**, max 3 per row, priority order: contract state, subtask progress (`2/5`), first tag. Truncate title with `…` before chips ever wrap.

## 4. Views

### 4.1 Board list (default)

```
 brainfile ▸ Backlog 1 │ To Do 9* │ In Progress 0 │ Review 0        / filter  ? help
 ─────────────────────────────────────────────────────────────────────────────────
 ▸ epic-1  Post-migration cleanup                              0/3            #cleanup
     task-1  Triage marketing board                                           #marketing
     task-2  Prune supervisor remnants from docs                              #docs
     task-3  Delete migration leftovers after soak                            #cleanup
   task-4  Revisit @modelcontextprotocol/sdk pin                              #deps
   task-6  js-yaml 5 migration + output stability                             #deps
   task-7  ESM/toolchain decision                                             #architecture
   task-8  CLIError renders raw stack trace              ⚠ high               #cli
   task-9  Remove fetch() from core schemaHints                               #core
 ● adr-1   Drop V1 board-format support                                       #v1
 ─────────────────────────────────────────────────────────────────────────────────
 10 items · ↵ detail · m move · c complete · a add · tab column · q quit      todo
```

- Header: board title + column tabs with live counts; active column marked (`*` or inverse). `/ filter` and `? help` affordances right-aligned.
- Footer: context-sensitive — shows the actions valid for the *selected* document type/state (e.g. an adr never shows `c complete`).
- Selection: full-width inverse bar, j/k or arrows.

### 4.2 Detail

- **Wide (≥110 cols)**: persistent right pane, 45% width, list stays interactive left. **Narrow**: Enter replaces list full-screen, Esc returns.

```
 task-8  CLIError renders raw stack trace                          todo · high
 ─────────────────────────────────────────────────────────────────────────────
 tags #cli #ux        assignee —        created 2026-08-11        parent —

 Repro: run 'brainfile complete task-5' (missing --task flag).
 Expected: one-line error + usage. Actual: full CLIError stack trace
 thrown through yoga-layout nbind.js. …

 subtasks                                                        contract
   ◻ add top-level catch in cli.ts                                 (none)
   ◻ regression test

 files  cli/src/cli.ts · cli/src/utils/errorHandler.ts
 ─────────────────────────────────────────────────────────────────────────────
 space toggle subtask · e edit · m move · c complete · esc back
```

- Body renders markdown minimally: headings bold, code dim-boxed, lists indented. No syntax highlighting this round.
- Subtasks toggle with space directly in detail (uses core `toggleSubtasksInFile` via existing actions).

### 4.3 Filter

- `/` opens inline filter in the header rule line; incremental; backed by **core `searchTasksRanked`** (dogfood — including `p:`, `@`, `#`, and `type:` tokens). Esc clears. Filtered count shown: `7/23 match "p:high"`.

### 4.4 Help

- `?` overlay: single condensed pane grouped by nav/actions/filter, dismiss any key. Kill multi-page help if present.

## 5. Interactions (delta-oriented)

Preserve existing keybinds where they exist (j/k, tab, enter, q). Required set: j/k move · tab / [ ] column cycle · ↵ detail · esc back/clear · / filter · m move (column picker overlay) · c complete (with confirm if subtasks incomplete — core epic-safety surfaces here) · a add (title-only quick add into current column) · space toggle subtask (detail) · ? help · q quit.

## 6. Out of scope

Inbox (epic-2, backlogged). Plan-body rendering beyond standard detail. Editing full bodies in-TUI. Mouse. Themes/config.

## 7. Acceptance

- Frontend-parity + all existing suites stay green (the TUI keeps delegating to the same `actions.ts` — this is a **view-layer swap**, actions API unchanged unless a signature genuinely must move).
- New ink-testing-library render tests: board list (wide+narrow), detail, filter state, help — asserting on rendered text frames (glyphs, indentation, chips, footer context).
- `node dist/cli.js tui` boots in a real terminal against the repo board (manual smoke by verifier via render-to-string; interactive smoke by George after merge).
- Bundle: `npm pack` tarball stays sane (no node_modules leakage); `brainfile --help` and MCP smoke unaffected.
- tsc stays seconds; 935+ tests; test count grows.
