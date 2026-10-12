# Design — the Brainfile window

The locked design system for `desktop/`. Every screen is drawn from this
file; a screen that drifts from it is a bug, and the cure is to amend this
file, never to override it locally. The values live in
`src/renderer/styles/tokens.css`, with the reasons beside them.

**Lineage.** This is Hotline's system (`hotline/ui/design.md`): the same
genre, macrostructure, planes, ink, type, shape, motion and microinteraction
stance. Two things are Brainfile's own: the colour lane and its accent
(Forge), and the mark. Where the two products need the same answer, take Hotline's; where
this file is silent, Hotline's file decides.

## Genre

Modern-minimal instrument. A desk you sit at all day, not a page you visit.
Nothing decorates; everything on screen is a thing you can read or press.

## Macrostructure

One family, **Workbench**:

- The window's top strip is the well itself, and it belongs to the whole
  desk, never to one repository: the **lockup** (the mark at 16px and the
  name written out, lowercase `brainfile` in Plex Sans 600), always leftmost;
  one **search** across every project's board, centred; and at the right,
  every board's **health**, in words and only when a board needs something
  (press for the list), and the **feed** of changes that reached any board
  from outside the window (agents, the CLI, other machines): a muted key,
  with a count beside it only when something new has arrived.
- Anything about one repository lives in its pane's **band**: the board's
  name, a folder key (hover for the path and where the board is kept, press
  to reveal it in Finder; paths are never printed in the chrome), List /
  Board as two icons, its sync line only when it has something to say, and
  a muted + for a new task.
- The **rail's key** (⌘B) lives with the rail: in the rail's head beside
  Projects and add while it is open, and at the leading edge of the board's
  band, before the title, once it is closed. Nothing ever sits left of the
  lockup.
- The **rail** stands directly in the well: Projects, one row each, the
  folder's name over one mono line (`13 open · branch`). Its edge is the
  gutter beside it, dragged between 180 and 420px, remembered, put back by a
  double-click, stepped by the arrows.
- A **pane** is a rounded canvas set 8px into the well with one hairline at
  its edge and a pixel of light along its top. Panes sit 8px apart. The
  board is a pane; an open task is a second pane beside it, sized at its own
  gutter between 380 and 680px. When the board would be left under 520px,
  the task pane lies over it on the float shadow instead of squeezing it.
- A pane's **band** is 44px and has no line under it: what scrolls fades out
  beneath it.
- Menus, the command palette and the new-task dialog are pop-plane surfaces
  on the one float shadow, and nothing else floats.

## The mark

The mark is **the box** (`assets/mark.svg`, `components/Mark.svelte`): a
filled checkbox with the tick cut out, square on the left like the Markdown
bracket and rounded on the right like the bowl of a b. On a 64 grid the box
is 44 units with a 4-unit corner on the left and an 18-unit corner on the
right; 12 reads as any app's checkbox, 22 as the letter D.

- One shape in one colour. In chrome it is ink-3, the colour of furniture,
  never the accent, and so is the name beside it; on the app tile (`assets/tile.svg`) it is the accent on
  the dark rounded square, drawn as Hotline's tile is.
- At 20px and under the tick is cut heavier (8 units instead of 6.2) so it
  stays more than two pixels wide.
- A literal `[x]` is not ours ([x]cube LABS sets it in its wordmark); the
  half-rounded box is.

## Theme

Dark is the designed theme; light re-values the same names and the window
follows the system. One hue lane, **warm graphite at 60** with a trace of
chroma, so the accent reads as a signal on the material rather than part of
it.

Depth is lightness, five steps: well 12 · canvas 16 · raised 20 · pop 24 ·
pressed 28. A raised or pop surface carries the top-light. Shadows are not
structure.

Ink is four voices: ink says it, ink-2 explains, ink-3 annotates, ink-4 is
furniture. Fills and lines are alpha. A hairline is one device pixel and is a
plane's edge, never a divider between rows.

The accent is **Forge**, ember orange: `oklch(74% 0.15 52)` in dark
(`#F38C48`) and `oklch(57% 0.17 45)` in light (`#C44C00`). It is the colour
of self-hosted developer tooling, so the window reads as something that runs
on your own machine, and it sits far from Linear's indigo and Hotline's mint.
It is on a budget well under 5% of any screen, and under Calm it is spent
almost nowhere at rest: the tick of done, and the one action inside an open
dialog (Create task). Keys at rest, New task included, are muted. It is
never a background, a decoration, or focus.

Signals that are not the accent, each a glyph and a colour, never colour
alone, all from the TUI: priority (urgent red, high yellow, moved off the TUI's
amber so it never reads as the accent, medium blue),
contract state as a mono word (ready cyan, in progress amber, delivered
magenta, done green, failed red), sync (a green dot shared, a ring local, a
breathing orange dot in flight). Warn and danger are text or a soft wash,
never a fill. Faces are seven hues at one lightness and chroma, below the
accent's; red is absent.

## Typography

- Body and display: IBM Plex Sans 400 / 500 / 600, always roman.
- Instrument: IBM Plex Mono 400 / 500, at 11px with +0.04em, for anything
  measured or typed: an ID, a `#tag`, a count, a date, a path, a contract
  state, the sync line. Sentence case; nothing is shouted in caps.
- Six sizes with fixed leading: 11/14 · 12/16 · 13/18 · 14/22 (reading) ·
  15/20 · 20/26 (a task's title). Tabular figures everywhere.
- Emphasis is weight, never italic.

## Spacing and shape

A 4px grid. Radii are concentric from the OS window inward: pane 10 · card
8 · control 6 · chip 4; a circle for a face. A group in a pane column (a
task's properties) is a surface of its own, set in, and gets 14.

Controls are 26px; a field is 28px and is sunk into its surface (the well's
colour, an inset hairline); a key is raised (the pop plane, the top-light).
You press a key and type into a well.

## Icons

Linear gave the bones (a status, a priority, a kind and a dense row), not
the drawing. Every glyph comes from Brainfile's own material:

- **One root shape, the checkbox.** Boxes keep its 3px corner. Nothing is a
  circle except a face and the sync dot.
- **Drawn like type.** Interface icons (`components/Icon.svelte`) sit on a
  16 grid with 1.5 strokes, square ends and mitred corners, to match IBM Plex
  Mono rather than the rounded strokes of Lucide or Linear.
- **Status** is the mark's checkbox: dashed for backlog, open, a level rising
  inside it as the task moves right, ticked in the accent when done.
- **Priority is heat, not signal bars.** Three square pips lit from the left
  in the priority's colour. Urgent is the one shape no level shares: a
  warning diamond. No priority draws nothing.
- **Kinds** are the TUI's glyphs, so the terminal and the desktop read alike.

## Rows

The board reads like the TUI's list, calmed. A row is 36px:

```
[status box]  [◆] Title, which truncates first   task-12 #sync      ready  2/4   ▪▪▪  (face)
                  └ kind glyph, small; ▾/▸ for a     └ ID and tags:     └ signals   └ priority, assignee
                    parent with children               under the hand
```

- The status box always shows: dashed for backlog, open, a level rising as
  the task moves right, ticked in the accent when done. An open task is
  still a box.
- A typed document's TUI glyph (▸ epic · ◆ spec · ● adr · ⎘ plan) sits small
  before its title; a parent with children shows ▾ / ▸ there instead, and
  its children indent 20px beneath it.
- At rest the right side carries only signals: contract state, sub-task
  progress, urgent and high priority, an assignee. The ID, tags and an unset
  priority or assignee wait for the pointer or the selection, in space kept
  for them.
- Hover and selection are fills on the row; there are no lines between rows.

## Motion

One curve, `cubic-bezier(0.16, 1, 0.3, 1)`, three durations: 90ms answers a
press, 130ms opens something small, 220ms moves something across a pane. No
overshoot, no hover scale. A sync in flight breathes at 1800ms. Reduced
motion removes every transition and animation.

## Calm

The window says only what needs saying, for a reader who is easily pulled
off course. These rules win over every other section:

- **No indicators at rest.** No status dots, no "all synced", no counts
  that only confirm things are fine. Sync, health and the feed speak, in
  words, only when something needs you; otherwise the place is empty.
- **No big buttons.** New task is a muted + key in the board's band (C);
  there is no filled primary button at rest. The accent is left for the
  tick of done.
- **Rows wait for the hand.** At rest a row is its title, plus the signals
  that matter: urgent and high priority, contract state, sub-task progress,
  an assignee. The status box, the ID, the tags and any unset priority or
  assignee appear under the pointer or on the selected row, in space that is
  already kept for them, so nothing shifts.
- **Empty groups are not shown** in the list (the board view still has
  every column to drop into).
- The rail is one line per project: its storage icon, its name, its count.

## Microinteractions stance

- **One tooltip** (`lib/tooltip.ts`): a pop-plane label that waits 800ms for
  the pointer and shows at once for keyboard focus. Text written
  `Label  K` sets K as a key. No native `title` tooltips.
- **Undo, not "are you sure".** Deleting a task happens at once; the band
  says "Deleted task-12 · Undo" for eight seconds, and Undo writes the file
  back as its own commit.
- **Layers are named** (`--z-band` … `--z-tip` in tokens.css), never raw
  numbers.

- Silent success. The board changing is the confirmation; there are no
  toasts. A problem is said once, in the board's band, as danger text on a
  soft wash, and goes away on its own or when pressed.
- Nothing rings. Keyboard focus is the control's hover fill; a field
  brightens its own hairline. The accent is not spent on focus.
- Every state is a glyph and a colour, never colour alone.
- Destructive actions are danger ink with no fill, behind a system dialog.
