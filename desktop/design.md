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

- The window's top strip is the well itself, 40px, and it belongs to the
  whole desk, never to one repository. On a Mac the traffic lights stand
  alone at its left, as in most Mac apps: the menu bar and the Dock already
  name the app. Elsewhere the **lockup** (the mark at 16px and the name
  written out, lowercase `brainfile` in Plex Sans 600) is leftmost, and the
  system draws its own window controls over the strip's right end in the
  well's colour (titleBarOverlay), the strip's keys standing clear of them.
  At the right, every board's **health**, in words and only
  when a board needs something (press for the list), the **feed** of changes
  that reached any board from outside the window (agents, the CLI, other
  machines): a muted key, with a count beside it only when something new has
  arrived, and with what waits on you pinned above the changes (Dispatch),
  and last the **chat's key** (Dispatch). The right end is inset by
  a pane band's padding, so the last key stands over the pane's corner keys.
  Search has no key in the strip: ⌘K opens the palette, where it is typed.
- Anything about one repository lives in its pane's **band**: the board's
  name, which is its folder key (hover for the path and where the board is
  kept, press to reveal it in Finder; paths are never printed in the
  chrome), its text on the list's edge; then its views as words in a well
  beside it, Work · Decisions · Issues (the last only with a forge), sunk
  as a field is: the one in front on a raised chip in full ink, the chip
  sliding to the next one pressed (130ms), the others muted until the
  pointer brightens them; and a muted + for a new task. Sync is never said
  in the band; the strip carries it.
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
  gutter between 380 and 680px, and the chat, when shown, a third at the
  window's right edge. When the board would be left under 520px, the panes
  beside it lie over it together on the float shadow instead of squeezing it.
  With the chat shown, a task opens in the board's place instead, at every
  width, its text kept to a reading measure, and a back arrow before its ID
  (and Esc) returns to the list where it was.
- A pane's **band** is 44px and has no line under it: what scrolls fades out
  beneath it.
- Menus, the command palette and the new-task dialog are pop-plane surfaces
  on the one float shadow, and nothing else floats.
- The **palette** opens on one row, its query, ended by a hairline as a
  menu's filter is: the search mark, the field, and, while a board is open,
  `every project` as a quiet mono chip at the end. The row is the pop itself,
  not a field sunk into it, and it keeps the entries' insets, so the mark,
  the text and the chip stand on their icon, label and key edges; the first
  section label stands 16 below the line. Before anything is typed, its
  first section is **Recent**: the documents last opened in the pane on any
  board, newest first (the last 8 of 12 kept, the one open now left out),
  each with its status box (● for a decision) and its ID, or its board and ID
  when it is on another (decision-8).

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
- **A child stays under its parent, whatever its column.** The outline is
  drawn in the parent's group: an epic in In Progress carries its specs in
  Review and its tasks in Todo beneath it, and they are not shown again in
  their own groups. Each child keeps its own box, the level its column gives
  it (the box's tooltip names the column), so the outline reads as progress.
  Children run as the groups do: by column, then the completed ones.
- **Completed children stay until the parent is done.** A child completed
  into logs/ stays under its open parent, ticked, its title in ink-3, however
  long ago; when the parent is done they go into Done together, nested there
  as they were. An open child of a completed parent is a root in its own
  group.
- **A group counts what it shows**: its own roots and everything under
  them, children from other columns and completed ones included, collapsed or
  not. Done counts what is left in it. j / k walk the rows as drawn, folded
  groups and collapsed parents left out.
- At rest the right side carries only signals: contract state, sub-task
  progress, urgent and high priority, an assignee. The ID, tags and an unset
  priority or assignee wait for the pointer or the selection, in space kept
  for them.
- Hover and selection are fills on the row; there are no lines between rows.

## Calm list

The list has a second reading, quieter than the rows above, for a reader
who scans every signal on every row and loses the thread (task-43). It is
brainfile-mobile's board (`src/components/rows.tsx`, `src/data/outline.ts`)
brought to the desk: the same row, the same order, the same glance. It is a
mode of the list, not a view of its own, and it belongs to the reader, not
to a board: one switch for the window (Settings › List › Calm list, ⇧V from
the list, or the palette), remembered. It is how the list first reads: on
until it is turned off, and the full rows are a press of ⇧V away.

```
[status box]  [◆] Title, on one line, which truncates first          one signal
```

- **A row is its box, its title and at most one signal**, the loudest it
  has: an agent at work on it (`claude · Editing…`, still, or `Needs you`),
  then `decision changed`, then `blocked`, then a contract that asks for
  you (`delivered`, `failed`, `blocked`, in its colour), then urgent or high
  priority, then a checklist part done (`2/4`). Done work has none. The ID
  is the one thing the pointer brings, or the selected row: small, mono and
  faint, just after the title, in space kept for it, so a task can be named
  without opening it. Tags, assignee, a `ready` or `in progress` contract,
  an untouched or finished checklist and dates wait for the task pane. S, P,
  A and L still reach the pickers from the keyboard, anchored on the row.
- **The row breathes a step more**: 40px, its title at the reading size
  (14px). The box keeps its 26px cell, and one outline step is that cell and
  its gap (34px), so a child's box sits exactly under its parent's title. A
  typed document keeps its glyph small before the title. A parent's ▾ hangs
  in the gutter only under the hand; ▸, which hides something, always shows.
- **The outline is unchanged.** Children stay under their parent, whatever
  their column, and completed children stay until the parent is done
  (Rows).
- **Nearest done first.** Ready to merge, when anything is (Dispatch),
  then the groups run Review, In Progress, To Do, so the
  top of the list is what can be finished, then what can wait: the backlog,
  then a completion column still holding work, then Done. The backlog and a
  completion column rest folded; a fold the hand has made, in either
  reading, is kept.
- **A group at a glance.** An open group shows its first three roots, each
  with everything under it (a family is never cut), and the rest under one
  quiet line on the titles' edge, `N more`; one row left over is shown
  instead. A task an agent is working — starting, working, or waiting —
  stays in the drawn list, never behind `N more`, even when it is past
  that glance. Its family stays with it, the same way a family is never
  cut. The glance still holds for every other row. Pressing it shows the
  whole group until the group is folded, which puts it back to a glance.
- **A group's head is quieter than its rows**: its name in ink-3 at 500 and
  its count, no box (each row carries its own), the name on the boxes'
  edge. Open groups stand 20px apart; folded ones sit together, a short list
  of what waits.
- **j / k walk the list as drawn**, folded groups, collapsed parents and
  what waits past a glance left out. `N more` is a stop of its own: Enter
  opens the group and selects the first row that was waiting.
- **Switching keeps your place.** Turning the list calm, the selected task
  stays on screen: its group opens if it rests folded, whole if the task
  waits past the glance. Turning it full, a selected `N more` gives way to
  the first row that was waiting. Either way the selected row is scrolled
  into view.
- Pressing and selection are fills, as in Rows; there are no lines between
  rows.

## Motion

One curve, `cubic-bezier(0.16, 1, 0.3, 1)`, three durations: 90ms answers a
press, 130ms opens something small, 220ms moves something across a pane. No
overshoot, no hover scale. Reduced motion removes every transition and
animation.

One thing moves on its own, because something is happening: an agent at
work shows a muted status line
(`claude · Thinking…`, `components/Working.svelte`) with a slow band of light
crossing the word every 1800ms. In the chat the word turns over every 2.6s
among honest names for the kind of work under way (Thinking, Considering,
Working it out), on the line just above the composer, with anything the
agent asks of you above it; on a row, in the task pane and in the chat key
it holds still, so a list of busy tasks stays quiet. An agent waiting on you stops shimmering and says
"Needs you" in the warn colour.

## Calm

The window says only what needs saying, for a reader who is easily pulled
off course. These rules win over every other section:

- **No indicators at rest.** No status dots, no "all synced", no counts
  that only confirm things are fine. Sync says nothing while it works,
  which is almost always: autosync sends a change in seconds. The strip's
  sync key (an icon, no words) appears only when a board needs a look or
  changes have waited longer than a minute to be sent or brought in; its
  tip says what in a person's words ("runprism.ai: old copy in main",
  "runprism.ai: 3 unsent", "2 boards to sync"), its list names each board
  with Sync now, and it takes the warn colour only for a real problem. The
  feed is the bolt and a count (`⚡ 10`), its tip "outside changes". At
  rest the corner is empty but for the bolt.
- **Two exceptions.** A reply you have not read: the chat key may carry a
  small muted badge for a reply that landed while the chat was closed,
  because a missed reply is worse than the noise of one muted badge. It is
  muted ink, never the accent or warn, and opening the chat clears it. And
  work waiting on you (task-69): while any board has a hand-off that can
  merge, the bolt counts those instead of the changes, in the accent, its
  tip `2 ready to merge · 5 outside changes`. Opening the feed shows them
  first, under `Waiting on you`, every board's, each with its board, ID and
  lines added and removed, and Merge (the task pane's, with its rules and
  tips), or `conflicts with main` in the warning colour and Send back. They are
  state, not news: a row goes when it merges, never when it is seen, and the
  count is only what can merge now. The changes follow under `Changes`.
  And an update that is out (task-71): a small dot in the accent on the
  settings key, its tip `Update to 0.2.0`; Settings › Updates, the first
  section, says the version, what it brings and Update to 0.2.0, then its
  progress with Cancel, `Restarts when the agent at work finishes` with
  Restart now, and Restarting. Nothing else gets a status indicator.
- **Tips are two or three words, five at most.** Anything longer is an
  explanation, and explanations live in the list or the line, never the tip.
  A menu explains nothing either: it is its head, its entries and their
  notes, with no paragraph under them.
- **Words say what they do** (decision-10). A label, button, tip, line or
  message names the action or the fact in the person's words: what pressing
  it will do, or what is true now (`Merged · remove worktree`, `Commit or
  send back first`, `Deleted task-12 · Undo`). Never casual, cute or vague
  (`Done, let it go`), never a joke or a reassurance: a reader who is
  easily pulled off course stops to work out what a phrase means, and an
  agent reads the window's words back.
- **No big buttons.** New task is a muted + key in the board's band (C);
  there is no filled primary button at rest. The accent is left for the
  tick of done.
- **Rows wait for the hand.** At rest a row is its status box and title,
  plus the signals that matter: urgent and high priority, contract state,
  sub-task progress, an assignee. The ID, the tags and any unset priority or
  assignee appear under the pointer or on the selected row, in space that is
  already kept for them, so nothing shifts. The calm list goes further: one
  signal a row, and only the ID under the pointer (Calm list).
- **Empty groups are not shown** in the list. The status box moves a task
  to a column that has no group.
- The rail is one line per project: its storage icon, its name, its count.

## Dock

The top strip stays what it is (the lockup, the desk's news, the chat's
key), so what you keep at hand lives in its twin at the window's foot: a
40px bottom strip, the well itself, taking the panes' bottom gap, with the
dock at its right and then the settings key, under the chat's key (the
same inset), so the strip is never empty. Nothing lies over the board.

- **A tab is an agent session** on the board in front (decision-8): a
  chat, a discussion of a task, or a hand-off. Every thread shown in the
  chat is its own tab from its first line until its × closes it (it stays
  in the chat's history, and picking it there again brings its tab back); a
  hand-off gets one when it starts, from Hand to… or the chat, and keeps it
  after its agent is done, as the handle to look at the work. Tabs keep
  their order, the newest at the right end, up to 12 a board, and survive a
  restart. Another board's sessions are not in the dock; one that needs you
  shows in the strip, as asks already do. Opening a document no longer makes
  a tab: recent documents are in the palette.
- **A tab says three things:** its mark (the chat's for a chat or a
  discussion, the task's status box for a hand-off), its title (a chat's
  first question, the task's title for a discussion or a hand-off; the tip
  says which), and one signal: the agent and where it stands. At work it is
  the Working line, still (`codex · Editing…`, or `Needs you` in the warn
  colour); at rest the agent, muted, with `Reply waiting`, or how a hand-off
  ended: `Done`, `Stopped`, `Ready to merge`, or `Failed` and `Conflicts` in
  the warn colour. The one in front (the thread the chat shows, or the
  hand-off whose task is open) is on the pop plane. × waits for the hand.
- **A tab opens its session where it was left:** a chat in the chat pane,
  with its own agent; a discussion there with its task beside it; a
  hand-off, for now, as its task in the pane.
- **Width decides how many show:** up to four, as many as fit in the
  right-hand three quarters of the strip, the one in front always among them;
  the rest wait under `+N`, which opens upward. A tab is a 26px chip in the
  well: the raised plane and a hairline, no halo, since nothing lies under
  it.
- **Keys:** ⌘⇧[ and ⌘⇧] step through the board's tabs, opening each.
  (⌘W stays the window's.)

## Kinds and decisions

Every document is a file with frontmatter, and core says what each is for
(spec-12): epic, spec, plan, task (alias issue) and decision (alias adr), or
any name a board gives that borrows one of their places with `like:`. The
window takes a document's role and glyph from core, never from its own table.

- **The outline is the graph's tree.** An epic holds specs, plans and tasks;
  a spec holds plans and tasks; a plan holds tasks. The list nests by
  `parentId` across columns (Rows); each kind keeps its TUI glyph (▸ epic,
  ◆ spec, ⎘ plan, ● decision) small before the title.
- **Decisions are not work.** They have no column and never complete, so
  they leave the list for their own view, the band's Decisions word (D).
  Standing decisions are grouped by family, the claim
  key's first word, set in mono; history (superseded, rejected, stale) folds
  away below, like Done. A row leads with ● where a task has its box, ○ once
  retired, and says at rest only a kind other than decision, a legacy
  `proposed`, or a date: `review` in the warn colour once `validUntil` has
  passed. The rest of the claim key waits for the hand; the stance and the
  chain are in the task pane, so the title keeps the row.
- **In the task pane** a decision shows its claim key, kind, stance, holds
  while, recheck, valid until and the chain it sits in, and the open work
  resting on it. Work shows the decisions it rests on; one since replaced
  says so in the warn colour, and its row says `decision changed`.

## Related boards

A board names its sister repositories in `related:` (spec-10). The app
reads that and nothing else:

- A sister that is also a project sits directly under the board that names
  it in the rail, stepped in.
- A task waiting on a sister task that is not done says `blocked` in muted
  mono on its row; the reference is in its tooltip.
- The task pane lists **Depends on**: each reference, its state as a box,
  and its title, read from the sister board; pressing one opens it there.
  A sister folder not on this machine says so.

## Two boards

A repository has one board, and the window says when it has two (spec-15):
a `.brainfile/` folder in the checkout beside a board on the `brainfile`
branch or on the remote, which a folder board asks the remote about when it
opens.

- The band says it once, where the ask would be, in warn ink: "Two boards:
  this folder (7) and origin's (19, newer)", then **Use origin's · Merge ·
  Keep this one** as quiet buttons. The one that loses nothing (the board
  that already has everything, or Merge) is in full ink. The tooltips say
  what each keeps, and that the board it replaces is saved first
  (`brainfile backups`).
- Until one is pressed nothing writes: the + key leaves the band, and any
  write that reaches the host is refused with the same sentence.
- Pressing one settles it with core's `adopt` / `merge-boards`, reopens the
  board where it now lives, and stays silent: the board changing is the
  confirmation, and what changed is not news in the feed.
- **Health** says the rest in a few words in its list: `two copies`,
  `merge unfinished`, `open elsewhere`, `open twice`, `old copy in main`
  (the code branch still carries one), `sync failed`, `N unsent`, `N
  incoming`, `this Mac only`. A board with a problem says it once more under
  its name, as one plain muted sentence ("An old copy of .brainfile/ (7
  docs) is still tracked on main.", "Origin's (19) already has everything
  this folder (7) has."); the list explains, tips stay two or three words. Counts are
  taken again every ten seconds, since a push made by an agent or the CLI
  moves refs the watcher never sees. A checkout of the board branch whose
  folder is gone is forgotten when the board opens.
- **A problem's line settles it** (task-34), with two quiet keys under the
  sentence, on its left edge. **Fix** is there only when the fix loses
  nothing: the copy kept already has every document every other copy has.
  Pressed, the line says what it will do in a few words ("Back up both, then
  untrack main's copy") with Confirm (full ink) and Cancel inline, never a
  dialog. Confirmed, every copy is backed up to `brainfile backups` first,
  and nothing else runs if one fails; then core's own step: the code
  branch's old copy untracked in one commit (as `migrate --to-branch`), the
  copy that has everything adopted, a lost checkout forgotten (core's
  `applyFix`, which `brainfile fix` and the MCP `where` tool run too). The line then
  says what was done ("Untracked main's copy.", and "Push main to share
  it." when there is a remote to push to) with
  Undo for ten seconds, and the board republishes without the problem. An
  unfinished merge, two copies that each have changes, a board that is its
  own repository and a checkout with work in it get no Fix. **Ask agent**
  is on every problem: it opens the board's chat and sends the project's
  agent what Brainfile found (every copy, its count and last change) with
  one instruction, look, explain the difference in a few lines, and ask how
  to settle it, changing nothing until the person chooses. It is an ordinary
  chat turn, titled by its first line ("Board problem: old copy in main.").

## Dispatch

Brainfile is a dispatcher, not a chat app: anything long belongs in Hotline.
It starts the person's own agents over the Agent Client Protocol, in the
repository, with Brainfile's MCP server attached, so an agent changes the
board through the same tools as the CLI and its work arrives as ordinary
board changes (and in the feed).

- **Agents** are the installed ones, in this order: Claude Code
  (claude-agent-acp), Codex (codex-acp), Antigravity (the registry's ACP
  server, downloaded once), Cursor (`cursor-agent acp`) and Grok Build
  (`grok agent stdio`, in its own process rather than a shared leader). Each runs on the
  person's own login. Each project remembers its own: the agent last used
  there, and for each agent the model last chosen there, in the chat and
  Hand to… alike. A project with no history starts from the last used
  anywhere. An old chat reopened from history keeps the agent it began with.
- **Custom agents** (task-47) are any other ACP server on the Mac, added in
  Settings under Agents the way Zed's `agent_servers` are: a display name
  with a `command`, `args` and `env`, kept as `agentServers` in
  dispatch.json in Zed's own keys, so an entry pastes across either way
  (Paste from Zed takes an entry, the block or the whole settings file).
  Each follows the known agents in the pickers as `custom:<name>` and goes
  everywhere they do: Hand to…, the chat, Discuss, the chat's `dispatch`,
  and models and modes when the server reports them. It is run as given,
  nothing installed or downloaded: the command found on PATH as a shell
  finds it (or the path it is, `~/` for home), `env` set over the app's
  own, with the repository or the hand-off's worktree as its folder and
  Brainfile's MCP server. When its command is not found, the pickers offer
  it muted with `muse-acp not found`, rather than failing at start.
- **Hand to…** is a muted key on a task. The brief is the task, its body
  and its contract; the agent moves it to In Progress, does the work,
  leaves a log note, and moves it to the board's review column when there
  is one, leaving completing it to a person (it completes it only on a board
  with no review column). At rest, the row's only trace is one mono line,
  `claude · editing`.
- **Each hand-off works on its own branch** (spec-14, learned from Orca).
  Hand to… waits while the task depends on one still open on this board,
  its tip `Waits on task-62` (decision-15): the agents process refuses the
  same hand-off from the chat. Then it checks the task out into its own
  git worktree, on
  `dispatch/<task-id>` from the tip of the branch the task lands on: its
  `landsOn`, inherited from above it, else the trunk (decision-11,
  decision-16; the trunk is the branch `brainfile.trunk` names in the
  repository's git config, else origin's default branch, else main), not
  from whatever the person's checkout is on, under
  `~/.brainfile-worktrees/<repo>-<hash>/`, so two hand-offs, or an agent and
  the person, never share a checkout, and an agent never edits the running
  app's own files. (`brainfile/<task-id>` cannot exist beside the board
  branch `brainfile`.) The board is still the shared one: it lives on the
  board branch, which every worktree reaches. The brief names the branch and
  says to commit there and leave nothing uncommitted, never to merge or push.
  A board kept as plain files in the code would be copied, not shared, so
  there the agent works in the folder as before. Handing the task off again
  finds the same worktree. A hand-off that only reads (its contract's
  deliverables are all research, a review or a link) gets a detached
  checkout of the tip of the branch it lands on instead and no branch; its
  brief says to
  change nothing and put what it finds on the board, and the checkout goes
  when its run ends, unless something was left in it.
- **The review is a moment in the task pane**, not an IDE: while the task
  has a worktree, the pane says its branch, its commits and files with lines
  added and removed, and anything left uncommitted; then Open in the editor
  (the worktree as a folder), Discard (asked once, in place: it has no
  Undo), Send back… (a note in the task's log, then the same agent on the
  same branch), and Merge into the trunk (a branch made before decision-11
  goes into the branch it was started from), the accent once the task is in
  Review. Merge lands the hand-off without the person's checkout
  (decision-12): the trunk is brought into the branch inside the task's own
  worktree, the contract's validation runs there on the result (the key
  reading `Checking…`), and the landing commit, `Merge task-N: title`, moves
  the trunk only from the tip that was checked: by fast-forward when the
  person's checkout is on it, which keeps their uncommitted changes, else by
  compare-and-swap; if the trunk moved meanwhile it starts again from the
  new tip, and landings go one at a time. A landing that would overwrite a
  file the person is changing waits and names it. Before Merge is pressed
  the pane says whether the branch would conflict, `Conflicts with main in
  a.ts` in the warning colour (git's merge-tree, nothing written), and the
  key reads `Send back to settle`. A conflict, or a check that fails once
  the trunk is in, changes nothing and goes back to the agent that did the
  work (task-63), not to the person: a note in the task's log names the
  conflicting files, the trunk's commits it met and the tasks that landed
  them (`97d0e88 Notes (task-21)`), and says to merge the trunk in, keep
  what both sides meant, commit and run the checks; then the same agent and
  model, on the same branch, whose brief now lets it merge the trunk in for
  that. Up to the contract's maxRetries, else once; past that Merge says it
  was sent back already and leaves it with the person. A read-only checkout left
  with changes in it shows as `Read-only checkout`, with only Open and
  Discard. Merge waits for uncommitted work. A check that fails merges
  nothing, says its first line, and puts the end of its output in the
  task's log, where Send back… carries it to the agent. Merging is the
  person's yes: the task is completed with it (a parent with open children
  stays open, and says so), unless subtasks are left unticked: then it
  goes back to In Progress (else the first open column past the backlog),
  its log saying how many are left. A task completed too soon comes back
  with Reopen in its pane, or from its tick in the list (`Reopen into…`,
  the columns): out of logs/ and the ledger, its log saying so, as
  `brainfile restore` does. Merging or discarding
  removes the worktree and its branch. When the branch was merged elsewhere (the terminal, a
  pull request) and the worktree is still there, the same key reads
  `Merged · remove worktree`, its tip `Already in <branch>`, and does only
  that. No diff authoring, no terminals.
- **A hand-off lands on its task's target** (decision-16): `landsOn` on the
  task, else on its parent, up the tree, else the trunk. The hand-off forks
  `dispatch/<task-id>` from it (the local branch, else origin's, which is
  then made here, following it) and records it as the branch's base, so the
  review, the conflict preview, Merge (`Merge into release/0.38.0`) and
  send-back all go into it, and a dependency waits until it has landed on
  its own target. Work merged into origin's copy of the target counts as
  landed; work merged into origin's trunk does not, for another target.
  Hand to… shows where, under the agents: `Lands on main`, with where it
  comes from in the faint mono (`the trunk`, `from epic-3`, `epic-3's
  branch`), and its picker lists the trunk, the epic's branch when under
  one, the targets used lately, local branches and origin's. A choice is
  written to the task as `landsOn` (the trunk as its name when the parent
  says otherwise; what it would inherit anyway as nothing), so it outlives
  the run. An epic with `epicBranch: true` is a branch of its own:
  its lead makes `dispatch/<epic-id>` from the epic's target as it starts
  (a child handed off by the person first makes it too), with no worktree,
  as landings move it by compare-and-swap. Its children fork from it and
  land on it, each worktree going as it lands. Before each hand-off the
  epic's target is brought into it, in a checkout made for that and removed
  after, never the person's, the branch moving only from the tip that was
  merged; a conflict there goes to the agent the child is handed to, whose
  brief says to merge the target into its branch first and settle it, and a
  note on the epic says so. With the last child done the lead puts the
  epic in Ready to merge instead of completing it (nothing landed on the
  branch: it goes, and the epic completes as before), and its Merge, in the
  row and the pane, is a menu: `Merge into <target>` (the default), `Merge
  into another branch…` (the trunk, branches, origin's), and `Keep as a
  branch`, which lets the worktree go, keeps the branch and completes the
  epic, and `Open a pull request` (when origin is on GitHub), the epic's
  branch into its target as below. The choices are one list in
  shared/api.ts (`MERGE_CHOICES`).
- **A pull request is a way to land** (decision-16, spec-18-4): beside
  Merge, in Review (`Open pull request`), on a Ready to merge row under the
  pointer (`PR`) and on the feed's item (`Pull request`), when the project's
  origin is on GitHub. It pushes `dispatch/<task-id>` to origin, only that
  branch, and opens a pull request into the task's target, titled with the
  task's title, its body the task's ID, the first lines of its description
  and the hand-off's last notes. It is refused as Merge is (uncommitted work,
  nothing to land, an agent still at it); checks are the forge's. The task
  records it as `pullRequest:` (number, link, state, base, head, when), so it
  outlives the app and the phone and MCP see it. While it is open the item
  leaves Ready to merge, for the phone too, and Merge refuses it: the row's
  signal is `#12` in the faint mono, a link to it; Review says `Pull request
  #12 is open into main` and its key is the link; the feed lists it under
  `Open pull requests`, below what waits on you, since it waits on the
  forge. The agents process follows each open one at most once a minute
  (whenever Ready to merge is asked, and a board with one open asks every
  minute), through main's GitHub client with its ETag, so an unchanged one
  costs nothing. Merged, origin's target is fetched, the worktree and local
  branch go and the task completes as after a Merge (subtasks left keep it
  open); a squash or rebase git cannot see is trusted when the branch's tip
  is in what the pull request carried, and work committed after it was
  pushed, or left uncommitted, keeps the worktree, and says so. Closed
  without merging, the record says closed and the item is back in Ready to
  merge.
- **Landing never pushes**, so the app says when it matters: when the
  trunk has commits origin (as last fetched) lacks, the Ready to merge
  group's header ends with `main is 3 commits ahead of origin` in the faint
  mono, and the feed says it per board. Nothing more: no push key, nothing
  pushed for you.
- **What can merge is at the top of the list** (task-69), in both
  readings: a group above every column, `Ready to merge`, holds exactly the
  hand-offs whose branch can merge now: commits not yet in the branch it
  goes into, nothing uncommitted, no agent still at it, not merged
  already (into that branch, what it tracks, or origin's copy of it, so a pull
  request merged on the forge counts while the local branch is behind; a
  merge that would change nothing counts, for a squash), and git's
  merge-tree (which writes nothing) finds no conflict.
  The task is drawn there instead of in its column, a completed one with an
  unmerged branch included, and every one shows: it is the person's queue,
  not a glance. Its row says the lines added and removed, and under the
  pointer Merge, the task pane's own, with the same rules and tips. A branch
  that would conflict stays in its column with `conflicts` as its signal,
  in the warning colour, and Send back under the pointer. The board asks once for all its hand-offs, when
  the board changes, when a hand-off ends and after a merge. The group goes
  when it is empty; with landing (decision-12) it becomes Ready to land.
- **Ask the board** is a muted key at the strip's right end, above the chat
  pane (⌘J), that shows and hides the chat (decision-8), with a fill while
  it shows: a pane at
  the window's right edge, beside the task pane, sized at its own gutter
  between 340 and 600px (400 to start, remembered), for small things, asking
  about the board or having it managed (add, sort, split, close). It
  manages the board and never changes code (decision-14): its agent runs as
  a discussion's does, never in bypass and read-only where it can, and an
  edit, a delete, a move or a command is refused before anyone is asked,
  except `brainfile` and git commands that only read (`brainfile list`,
  `show`, `dispatch status`; never `land` or `dispatch`, which it does
  through its tools). Its `brainfile`, and every agent's the app starts, is
  the app's own CLI, not the one installed on the Mac. Asked for
  code work, it writes the task, with a contract whose validation proves it,
  and hands it off when asked to; asked to plan an epic, it adds the epic,
  its children with `dependsOn` in the order they land, and a draft contract
  on each. The composer says what it takes, `Ask, or add and change tasks`,
  and under a reply a task the turn added, edited or moved and did not hand
  off carries a small Hand to… key at the line's end. Its band
  holds the history key, the thread's title and new chat (+); the strip's
  key, Esc and ⌘J hide it. Hiding keeps the thread,
  where it was scrolled to and what you were typing, and the key brings back
  the thread last shown, across a restart too: only + gives a blank page.
  While the chat shows, the key steps aside and the dock slides into its
  corner; hiding the chat brings it back. While a turn runs with the chat
  hidden, the key widens into a small pill holding its Working line, the
  word held still and shimmering (`claude · Thinking…`, or `Needs you` in
  warn), at 130ms each way. When the turn ends the key is the square again;
  if it ended with a reply, the key keeps a small muted badge in its
  top-right corner and its tip says "Reply waiting" until the chat shows
  (Calm's one exception), on that thread. The badge is the board's: it waits
  there when you switch away and come back. The history key lists the
  board's recent chats (kept on this machine, the last 30), and any of them
  can be picked up again, its past carried along if the agent's session has
  gone; a discussion comes back with its task beside it. Replies land whole,
  and only the answer: the narration an agent writes between tool calls
  ("I'll look at the board…") is dropped, and the reply is the turn's last
  message. One that has just landed comes in from the top, a soft edge
  passing down it a line at a time (about 70ms a line, 1.6s at most), the
  thread following the edge; one read again later is simply there.
  Beside the agent, a muted model picker lists the models the agent itself
  reports (asked once a day). Hovering a model that offers effort levels
  opens them in a submenu; Medium is the one a new choice starts on, since
  it is the level most models have. Unset means the agent's default, and
  Hand to… uses the same model and effort.
- **The chat's thread learns from Linear's agent window.** The header carries
  only the thread: its title (its first line) once there is one, the board's
  name before, then new chat. Who answers and with what sits where
  you type: the composer is a two-line well with a foot holding the agent
  and model picks (their menus open upward) and the send key, muted until
  there is something to send, then the composer's one accent. The thread's start is said once, centred, in mono. Yours sits
  on the right on the raised plane; the reply is plain text on the pane,
  with a copy key under it for the hand. The task open in the pane goes
  along as context (`task-10 in context` under your line), so "this" means
  it. Above a reply, "Worked for 19 seconds ›" folds away what the agent did
  on the way: the tools it ran, in mono (`brainfile · get_task`), and what it
  said between them. Any ID the board knows in a reply (`task-12`,
  `decision-2`) is a small key with its own mark, the status box or the
  decision dot, that opens it in the pane; under the pointer it says the
  document's title. What the turn changed on the board is listed under the
  reply (`task-18 added`, `task-11 moved to Todo`), read from the board
  itself by comparing it before and after, so the agent is told not to
  report its own changes, and never says it made none.
- **Discuss** (task-35) is a muted key beside Hand to… that talks the task
  over, wherever it is in its life: before it is handed off, while it is
  worked on, in review. It is a thread in the chat, not a chat of its own:
  titled `Discuss task-35`, kept in the chat's history, and the key reopens
  the task's latest one. Its agent is the one Hand to… offers first, and the
  chat's picker changes it. A new one says only `Let's discuss task-35.`;
  the task goes to the agent ahead of it in a block you do not see
  (`<task-information>`: its stage among the columns, description, subtasks,
  contract, parent, the decisions it rests on in full, the files it names,
  its latest notes and the board's other decisions, as of when it was read),
  so it answers without looking the task up. The block ends with `<work>`:
  the task's branch and worktree, the commits on it and the files they
  change, what is uncommitted there, and whether an agent is working on it
  now; once handed off, the agent is told to read the code in the worktree,
  not the main checkout, since that is where Review's code is. It may change only that task's
  description, subtasks and contract, and record, replace or retire a
  decision (task-44), each with the person's agreement: a decision is run
  past check first and shown with its claim key, title, text and what it
  replaces, and the task is linked to it. It notes what was agreed in the
  task's log, which is where the hand-off's brief finds it. Its board lists
  no dispatch, it never runs in a bypass mode (read-only when the agent has one), and its
  edits, commands, mode changes and other board tools are refused before
  anyone is asked.
- **The chat hands work off** (spec-16, task-84) through its own board
  tools: its `brainfile mcp` is told it is the chat (role chat, task-81),
  so it lists `dispatch`, `dispatch_status`, `dispatch_stop` and
  `dispatch_lead`, as the CLI's `brainfile dispatch` has them. `dispatch`
  queues: it writes the request on the task (`dispatch: { agent, model, by,
  at }` beside the assignee, plus `effort` when one was set; `by` is
  `person` for Hand to…, `chat`, `lead`, `cli` or `mcp`), committed like
  any change, and the window's runner takes it from the queue at once, by
  Hand to…'s own path: the worktree, a tab in the dock, asks in the task
  pane, Review. Each turn the agent is told whom a hand-off goes to: itself
  and its model unless the person names another, then the model and effort
  chosen for that agent on this board, as Hand to… would. Under the reply a
  hand-off reads like a board change (`task-35 added`, `task-35 handed to
  codex`): its request says the chat asked, and the run started from it
  carries the turn under way when it was written, so one that starts after
  the reply has landed joins the reply's line then. The call shows in the
  steps as `brainfile · dispatch`. The agent is told to create follow-ups
  with the board tools, hand them off with dispatch, to hand off an epic
  itself to have it run (its lead does the rest), and otherwise to ask
  before dispatching more than three at once. A hand-off's own board lists
  no dispatch (role worker), so it never hands off again.
- **An epic is run by its lead** (decision-15, spec-16 phase 2; lead.ts).
  Handing off anything with open children, from Hand to… (its menu reads
  `Lead with`) or the chat's `dispatch`, starts a lead instead of a
  hand-off: the agent picked, read-only as the chat is (decision-14), with
  the board's tools, dispatch among them, scoped to that tree (role lead),
  and no worktree. Its
  first turn checks the plan before anything goes: it reads each child, the
  files it names and the code, makes a child wait where two would change
  the same code or one needs another's work (`task_patch` dependsOn),
  splits one too large, fixes a contract whose validation proves nothing,
  and writes the plan as a note on the epic. The app reads the plan too and
  gives the lead what it finds: children that touch the same files with
  neither waiting on the other, dependencies missing, circular, or outside
  the epic and open, children with no files or no validation, and the order
  dependsOn gives. Then it hands off what is ready. The runner (core's, the
  same one under `brainfile run`) holds the rules it cannot bend, refusing
  the dispatch that breaks one: a child only once its dependsOn are done and
  their branches landed; at most `dispatch.maxRunning` hand-offs at once in
  the repository (the board's config, else `projects[<repo>].concurrency`
  in dispatch.json, else three); a child handed off at
  most once plus its contract's maxRetries; only children under the epic
  with none of their own; one lead to a tree, above or below; and inside a
  led tree only the lead dispatches (the chat is refused; the person's
  Hand to… on a child is theirs to make). A child it adds waits for the
  person, listed in the pane, unless the repository runs in bypass. It is
  woken with a turn, never polls: when a child's hand-off ends, when one is
  merged or sent back, when the person completes one or resumes it; events
  within a second and a half make one turn. Each turn it hears what
  happened and the tree as it stands (each child's column, who is at it,
  whether it can merge, what it waits on, how often it was handed off). In
  a bypass repository the app lands each child that ends in Review, checks
  first, and the lead hears how it went; otherwise the person merges. The
  epic is completed with its last child, and the lead ends. The board is
  its memory: `dispatch: { agent, model, by, at, until, role: lead }` on
  the epic while one is meant to run (an older `lead:` is read as a lead
  waiting for a runner, listed paused until Resume), the plan in notes on
  it, and its children told in their
  brief that a lead reads their notes. The epic's pane has a Lead block
  (who, where it stands, done of all, running of the most, what it last
  said, what waits for you) with Pause (it hands off nothing; what runs
  goes on), Resume and Stop (what it handed off is yours); one left on the
  epic by a restart reads `not running`, and Resume carries on from its
  notes; one a terminal leads (`brainfile run`) says where it runs, and its
  Pause and Resume reach it through the board. Its tab in the dock says
  `Leading`, `Needs you`, `Paused` or `Done`, and opens the epic. Three
  failed turns in a row, or a turn the person stops, pause it.
- **The window works the queue, and shows every run on the Mac** (task-80,
  task-84). Its runner is core's, the one `brainfile run` and the MCP tools
  use, so a hand-off is the same wherever it was asked for. While the window
  is open it takes each open board's queue: a request the chat, `brainfile
  dispatch` or an MCP client wrote starts here, at most the repository's
  limit at once, an epic's lead included; a terminal's `brainfile run`
  works the same queue, and a claim on the task decides which of them
  starts it. A run another runner works shows as the window's own do,
  marked with where it runs, in the faint mono: the row's line `codex ·
  Editing… · in a terminal`, a tab in the dock (`Handed off: … (in a
  terminal)`), Stop (which asks that runner through
  `state/runs/<run-id>.stop.json`; the runner stops it within a second, and
  no process is ever signalled from another), and Ready to
  merge asked again when it ends. Every runner writes its runs under
  `.brainfile/state/runs/`; the host's watch lets those and
  `state/runners/` through (the rest of `state/` it ignores), says so to
  the agents process at most every quarter second, and the runner reads
  them, with a look every five seconds while one is going, so a run whose
  runner went away without a word is said as failed (`Its runner went away
  before it finished`). Its ask is in the band like any other, saying where
  it waits (`Codex wants to run make test, waiting in a terminal`): Allow
  or Deny writes `state/runs/<run-id>.answer.json`, which that runner
  applies within a second, taking its own prompt down; the answer is a file
  of its own, never a field in the run file, which only its runner writes.
  The phone hears all of it the same way: `live` and the events carry every
  run on the Mac. An update's restart waits only for the window's own.
- **When an agent asks first**, it is said where you are looking: inside the
  chat for a chat turn, in the task pane for a dispatched task, and in the
  board's band either way (a run in a terminal too, answered through its
  file, as above), with Allow once · Always · Deny in that order
  ("Antigravity wants to run `ls -a`"); a board not in front is named in the
  strip. Brainfile's own board tools are never asked about: every change
  they make is a commit on the board the agent was asked to manage.
- **Every agent is told the board's standing decisions.** Hand to… and the
  chat's first turn carry the current decisions, one line each with their
  claim keys (the first 15; the rest by `brainfile list --type decision`),
  with the rule: work within them, run `check` before going against one, and
  record a new lasting choice with `decide`.
- **Every agent gets the board tools, and the app's own `brainfile`.** The
  MCP server is the CLI shipped with the app (in its Resources when
  packaged), run by the app's binary as node, never whichever `brainfile`
  is installed: an older one has no dispatch tools, and the chat could not
  hand off. PATH and HOME are passed, because some agents (Codex) start MCP
  servers in a stripped environment where a version-manager shim never
  answers, and a shim first on the agent's PATH makes `brainfile` in its
  shell the same CLI, carrying its role (`BRAINFILE_AGENT_ROLE`). When the
  CLI cannot be found, the chat or the lead says so. The brief also says to
  fall back to the `brainfile` command line, never to edit board files by
  hand.
- **Permissions are the agent's own.** Each agent reports its permission
  modes at runtime (ACP session modes), and Settings offers exactly those,
  in the agent's words. One switch, Work without asking, puts every agent
  in its bypass mode (Claude's Bypass permissions, Codex's Full access,
  Antigravity's YOLO) and allows whatever is still asked (Grok Build has no
  modes, so for it that is the whole of it); off, each agent
  starts in its own default or the mode chosen for it. A change reaches
  sessions already open. A repository's own policy (`ask`, `allow`,
  `bypass` in `dispatch.json`) will override it once repo settings exist.

## Settings

Settings take the board's place in the pane (⌘, or the settings key, an
icon alone at the bottom strip's right end under the chat's key; Esc, the
key again or a project leaves). One column, 560px, centred: a
section's heading and its one-line lede, then its rows in a group (raised,
radius 14) with no lines between them. Headings and notes stand on the
rows' text, not the group's rim, so the column has one left edge.
Each section is its own component under `components/settings/`, gathered
by glob in the `order` it declares (task-64), so adding a section touches
no file another section is in; what they share is `styles/settings.css`,
scoped to the pane and stopping at a component a section holds.

- **A switch is a box sliding in a sunk track**, the checkbox's corner kept;
  on, the track takes the accent, the one place a setting earns it.
- **List** comes first, because it is how the window reads: one switch,
  Calm list (Calm list), whose line says what it does in either state.
- **Custom agents** sit under Agents, after each agent's modes: an entry's
  name over the command line it runs, in mono, and `not found` in warn when
  its command is not on the Mac. Add an agent and Edit open a small form in
  the group (name, command, arguments one a line, environment `KEY=value`;
  Esc leaves, ⌘↵ saves), Paste from Zed takes JSON as Zed writes it, and
  Remove has an Undo.
- **Editor** says where a file an agent names opens: the editors found on
  this Mac (apps in Applications, best first; terminal editors when Ghostty
  is here) and the file's default app. Unset, the first found. In a reply,
  inline code that names a file in the project is underlined faintly and
  opens at its line; the project is asked once per path, and a path outside
  it, or not there, stays plain code.
- **A choice is a quiet pick**, the current value in ink-2 with the agent's
  default marked `default` in mono; its menu gives each option's own
  description. When a switch overrides the choice, the value is said, not
  offered, in the same place.

## Phone

The desk can be reached from Brainfile on a phone on the same network
(task-40; the contract is brainfile-mobile's `docs/link.md`, and
`link.md` here points at it). It is one more section in Settings, Phone,
drawn like the others:

- **Phone link** is a switch, off by default. Off, nothing listens. On, the
  desk listens and says nothing more; a port it could not have is said
  under the switch in warn ink.
- **Link a phone** is a row you press, a muted + before its words, that
  opens the code in place under the switch: the QR, and beside it `Scan on
  your phone`, **Copy link** for the same text, and `Valid 5 min` in mono.
  Showing a code turns the link on. A code that runs out is replaced while
  it is open. When a phone is let in by it the line says `Linked · iPhone 16
  Pro` with a tick in the ok colour, the spent code steps back, and the
  panel closes.
- **The QR is for a camera.** Dark modules on a light plate in both themes
  (`--qr-plate`, `--qr-ink`), with its quiet zone and the card's corner,
  drawn as one SVG path. It is the one light thing in the dark window, and
  only while it is asked for.
- **Linked phones** lists each by the name it gave, with `connected` or
  `seen 5h ago` in mono. **Forget** waits for the hand, danger ink with no
  fill, and asks once, in place (`Forget phone?`); a phone forgotten while
  connected is told and let go.
- **What a phone can do** is the contract's list: read and change boards,
  hand off and chat, answer permission asks, read a hand-off's review, and
  Merge or Discard it (the `merge` feature). Merge from the phone is the
  window's Merge, by the same rules: one landing at a time, the checks
  run, a conflict goes back to the agent, and the task is completed with
  it. The window's Ready to merge follows. Settings, adding or removing
  projects, deleting tasks, board fixes, editors, GitHub tokens, discuss and
  leads stay on the desk.
- The phone's own words for what the desk says (`Code expired`, `Not linked
  · scan again`, `Forgotten on desktop`) are the contract's, not this file's.

## Microinteractions stance

- **One tooltip** (`lib/tooltip.ts`): a pop-plane label that waits 800ms for
  the pointer and shows at once for keyboard focus. Text written
  `Label  K` sets K as a key. No native `title` tooltips. A tip says what a
  thing is or does, software-plain: two or three words, five at most
  (`New task  C`, `Decision replaced`, `Backup, then merge`, `12 outside
  changes`). It never explains; explanations live in the list or pane the
  thing opens. Content is the one exception: a tab's full title, a path.
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
