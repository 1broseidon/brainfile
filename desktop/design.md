# Design — the Brainfile window

The locked design system for `desktop/`. Every screen is drawn from this file;
a screen that drifts from it is a bug, and the cure is to amend this file,
never to override it locally. The values live in
`src/renderer/styles/tokens.css`, with the reasons beside them.

The first pass borrowed Linear's frame: a sidebar, an inset pane, grouped
rows. This system keeps the frame and gives it Brainfile's own voice, which
already exists in two places: the TUI (`cli/src/tui/theme.ts`) and the
manual's violet (`site/inkcap.config.mjs`). The desktop is the TUI's graphic
sibling, not a different product.

## Genre

A board that is a document. Every task is a Markdown file; the window should
read like a well-set file, not a dashboard. Calm, typographic, dense where it
counts, empty where emptiness says something.

## Five rules

1. **Colour is signal only.** The TUI's first rule. The accent marks focus,
   selection, the primary action and done. Priority and contract state get
   their own colours because they are signals. Nothing else is coloured: not
   tags, not projects, not columns, not chrome.
2. **Structure comes from typography.** A document's kind is a glyph in the
   first column, blank for a plain task, so typed documents stand out by
   contrast. Children indent beneath their parent. Separation is whitespace,
   not rules between rows.
3. **Two voices.** Inter says things: titles, prose, labels. JetBrains Mono
   is the voice of anything that is a file or a value: IDs, counts, `#tags`,
   dates, paths, the sync line. If you could grep for it, it is mono.
4. **Depth is lightness.** Planes step lighter as they come toward you. One
   thing floats on a shadow at a time: a menu, the command palette, the
   composer. Cards and panes do not cast shadows; they catch one pixel of
   light along their top edge.
5. **The checkbox is the mark.** The logo is a brain wired with `[ ]` and
   `[x]`. Status is drawn as that checkbox: dashed for backlog, open for not
   started, filling from the bottom as a task moves right, and ticked in the
   accent when done. The brand mark is the same bracketed `[x]`.

## Colour

All colours are OKLCH. Planes and ink sit in one lane: hue 285, a trace of
chroma, so the greys lean faintly toward the accent and the window reads as
one material.

- **Planes** (dark): well 12% → canvas 15.5% → raised 19% → pop 22.5% →
  pressed 26%. The well is the window's ground and the sidebar stands in it;
  the canvas is the pane you work in.
- **Ink**, four voices: `ink` says it, `ink-2` explains, `ink-3` annotates,
  `ink-4` is furniture you read only when you look for it.
- **Accent**, Brainfile violet: `oklch(74% 0.115 290)` in dark (the site's
  `#A796E3`), `oklch(48% 0.14 290)` as ink in light (the site's `#5B47A6`).
- **Priority** (from the TUI): urgent red, high amber, medium blue, low ink-3.
  No priority draws nothing.
- **Contract state** (from the TUI): draft ink-3, ready cyan, in progress
  amber, delivered magenta, done green, failed and blocked red. Always as
  mono text, never as a fill.
- **People**: an avatar is one of seven hues at one lightness and chroma, so
  nobody is louder than anybody else.

Light re-values the same names; nothing else in the tree knows there are two
themes. The window follows the system.

## Type

| Token | Size / leading | Use |
| --- | --- | --- |
| `--t-micro` | 11 / 16 | section labels, keycaps |
| `--t-meta` | 12 / 16 | mono meta: IDs, `#tags`, dates, counts |
| `--t-body` | 13 / 20 | rows, controls, menus |
| `--t-read` | 15 / 24 | descriptions, the composer |
| `--t-title` | 20 / 28 | a dialog's title field |
| `--t-display` | 26 / 32 | a task's title in detail |

The wordmark is lowercase `brainfile`, Inter at 700 with tight tracking, as on
the OG banner.

## Space and shape

A 4px grid. Radii are concentric from the window inward: pane 10, card 8,
control 6, chip 4. Nothing inside is rounder than what holds it, except a
circle.

The window is a 44px well strip (traffic lights, then the pane's own bar), a
232px sidebar standing in the well, and one canvas pane set 8px into the well
on three sides.

## Rows

A row is 36px and reads left to right like the TUI's:

```
▌ ◆  spec-2    Board sync over refs/brainfile         ready  2/4  #sync   ●
  │  │         │                                      └ signal chips      └ assignee
  │  │         └ title, truncates before any chip is dropped
  │  └ mono ID, ink-4, fixed width
  └ kind glyph: ▸ epic · ◆ spec · ● adr · ⎘ plan · blank for a task
```

The status checkbox and the priority mark sit before the glyph. At most three
signal chips, in the TUI's order: contract state, then sub-task progress, then
tags. A selected row gets a 2px accent rail at its left edge, which is the
TUI's `▌` cursor, and the selected fill. There are no lines between rows.

## Motion

Three durations and one curve, no overshoot: 90ms answers a press, 140ms
opens something small, 220ms moves something across the pane. Nothing moves
unasked except a sync in flight.
