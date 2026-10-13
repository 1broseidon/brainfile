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
  Board as two icons, and a muted + for a new task. Sync is never said in
  the band; the strip carries it.
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
- The **palette** opens on one row, its query, ended by a hairline as a
  menu's filter is: the search mark, the field, and, while a board is open,
  `every project` as a quiet mono chip at the end. The row is the pop itself,
  not a field sunk into it, and it keeps the entries' insets, so the mark,
  the text and the chip stand on their icon, label and key edges; the first
  section label stands 16 below the line.

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
  priority, then a checklist part done (`2/4`). Done work has none. The ID,
  tags, assignee, a `ready` or `in progress` contract, an untouched or
  finished checklist and dates wait for the task pane; they do not come
  under the pointer. S, P, A and L still reach the pickers from the
  keyboard, anchored on the row.
- **The row breathes a step more**: 40px, its title at the reading size
  (14px). The box keeps its 26px cell, and one outline step is that cell and
  its gap (34px), so a child's box sits exactly under its parent's title. A
  typed document keeps its glyph small before the title. A parent's ▾ hangs
  in the gutter only under the hand; ▸, which hides something, always shows.
- **The outline is unchanged.** Children stay under their parent, whatever
  their column, and completed children stay until the parent is done
  (Rows).
- **Nearest done first.** The groups run Review, In Progress, To Do, so the
  top of the list is what can be finished, then what can wait: the backlog,
  then a completion column still holding work, then Done. The backlog and a
  completion column rest folded; a fold the hand has made, in either
  reading, is kept.
- **A group at a glance.** An open group shows its first three roots, each
  with everything under it (a family is never cut), and the rest under one
  quiet line on the titles' edge, `N more`; one row left over is shown
  instead. Pressing it shows the whole group until the group is folded,
  which puts it back to a glance.
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
Working it out); on a row, in the task pane and in the chat key it holds
still, so a list of busy tasks stays quiet. An agent waiting on you stops shimmering and says
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
- **One exception: a reply you have not read.** The chat key may carry a
  small muted badge for a reply that landed while the chat was closed,
  because a missed reply is worse than the noise of one muted badge. It is
  muted ink, never the accent or warn, and opening the chat clears it.
  Nothing else gets a status indicator.
- **Tips are two or three words, five at most.** Anything longer is an
  explanation, and explanations live in the list or the line, never the tip.
- **No big buttons.** New task is a muted + key in the board's band (C);
  there is no filled primary button at rest. The accent is left for the
  tick of done.
- **Rows wait for the hand.** At rest a row is its status box and title,
  plus the signals that matter: urgent and high priority, contract state,
  sub-task progress, an assignee. The ID, the tags and any unset priority or
  assignee appear under the pointer or on the selected row, in space that is
  already kept for them, so nothing shifts. The calm list goes further: one
  signal a row, and nothing more under the pointer (Calm list).
- **Empty groups are not shown** in the list. The status box moves a task
  to a column that has no group.
- The rail is one line per project: its storage icon, its name, its count.

## Dock

The top strip stays what it is (the lockup, search, the desk's news), so
what you keep at hand lives at the board pane's bottom edge instead: the
dock, one row with the chat key at its end, because the chat is an agent
too and agents and work are one system.

- **A tab is a document kept at hand:** one you opened in the pane, or one
  handed to an agent (it gets a tab when the hand-off starts, opened or
  not, and keeps it after the agent is done, as the handle to look at the
  work). Tabs come from every board and keep their order; the newest sits
  next to the chat key. They survive a restart.
- **A tab says three things:** its status box (● for a decision), its title,
  and one signal: the agent at work on it (`codex · Editing…`, still, or
  `Needs you` in the warn colour) or else the board it is on when that is
  not the board in front. The open one is on the pop plane. × waits for
  the hand.
- **Width decides how many show:** up to four, as many as fit in the
  right-hand three quarters of the pane beside the key (or beside the chat
  when it is open), the open one always among them; the rest wait under
  `+N`, which opens upward. A tab is the chat key's sibling: the same
  raised plane, hairline and halo.
- **Keys:** ⌘⇧[ and ⌘⇧] step through the tabs, switching board when a tab is
  on another. (⌘W stays the window's.)

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
  they leave the list and the board for their own view, the band's third
  key (a flag, D). Standing decisions are grouped by family, the claim
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
  copy that has everything adopted, a lost checkout forgotten. The line then
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
  everywhere they do: Hand to…, the chat, Discuss, the desk's `dispatch`,
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
  Hand to… checks the task out into its own git worktree, on
  `dispatch/<task-id>` from the commit the person is on, under
  `~/.brainfile-worktrees/<repo>-<hash>/`, so two hand-offs, or an agent and
  the person, never share a checkout, and an agent never edits the running
  app's own files. (`brainfile/<task-id>` cannot exist beside the board
  branch `brainfile`.) The board is still the shared one: it lives on the
  board branch, which every worktree reaches. The brief names the branch and
  says to commit there and leave nothing uncommitted, never to merge or push.
  A board kept as plain files in the code would be copied, not shared, so
  there the agent works in the folder as before. Handing the task off again
  finds the same worktree.
- **The review is a moment in the task pane**, not an IDE: while the task
  has a worktree, the pane says its branch, its commits and files with lines
  added and removed, and anything left uncommitted; then Open in the editor
  (the worktree as a folder), Discard (asked once, in place: it has no
  Undo), Send back… (a note in the task's log, then the same agent on the
  same branch), and Merge into the branch the person's checkout is on, the
  accent once the task is in Review. Merge waits for uncommitted work and
  changes nothing on a conflict; merging or discarding lets the worktree and
  its branch go. No diff authoring, no terminals.
- **Ask the board** is a muted key in the board's bottom-right corner (⌘J)
  that grows into a popover in its own corner (360 × 480 to start; its left
  and top edges and the corner between them size it, double-click puts it
  back, and the size is kept), and shrinks back into the key when closed: a popover for small things, asking about the board or having it
  managed (add, sort, split, close). While a turn runs with the chat
  closed, the key widens into a small pill holding its Working line, the
  word held still and shimmering (`claude · Thinking…`, or `Needs you` in
  warn), at 130ms each way, and the popover grows from the pill as it
  would from the square. When the turn ends the key is the square again;
  if it ended with a reply, the key keeps a small muted badge in its
  top-right corner and its tip says "Reply waiting" until the chat opens
  (Calm's one exception). The badge is the board's: it waits there when
  you switch away and come back. It opens to a blank page every time,
  unless a reply is waiting, which it opens to;
  a muted history key in its header lists the board's recent chats (kept
  on this machine, the last 30), and any of them can be picked up again,
  its past carried along if the agent's session has gone. Replies land
  whole, and only the answer: the narration an agent writes between tool
  calls ("I'll look at the board…") is dropped, and the reply is the turn's
  last message. Beside the agent, a muted model picker lists the models the agent
  itself reports (asked once a day). Hovering a model that offers effort
  levels opens them in a submenu; Medium is the one a new choice starts on,
  since it is the level most models have. Unset means the agent's default,
  and Hand to… uses the same model and effort.
- **The chat's thread learns from Linear's agent window.** The header carries
  only the thread: its title (its first line) once there is one, the board's
  name before, then new chat and close. Who answers and with what sits where
  you type: the composer is a two-line well with a foot holding the agent
  and model picks (their menus open upward) and the send key, muted until
  there is something to send, then the composer's one accent. The thread's start is said once, centred, in mono. Yours sits
  on the right on the raised plane; the reply is plain text on the popover,
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
  over before it is handed off. It is a thread in the chat, not a chat of its
  own: titled `Discuss task-35`, kept in the chat's history, and the key
  reopens the task's latest one. Its agent is the one Hand to… offers first,
  and the chat's picker changes it. The agent has the task, its parent, its
  decisions and the files it names as context; it may change only that
  task's description, subtasks and contract, with the person's agreement, and
  notes what was agreed in the task's log, which is where the hand-off's
  brief finds it. It has no desk, never runs in a bypass mode (read-only
  when the agent has one), and its edits, commands, mode changes and other
  board tools are refused before anyone is asked.
- **The chat hands work off** (spec-16). Its agents get a second, small MCP
  server from the app itself, the desk: `dispatch` (a task, and optionally an
  agent and a model), `runs` (what is running on this Mac) and `stop`.
  `dispatch` is Hand to…'s own path: the worktree, a tab in the dock, asks
  in the task pane, Review. With no agent named it is the chat's own agent
  and model; another agent named takes the model and effort chosen for it on this
  board, as Hand to… would. The task records who asked
  (`dispatch: { agent, model, by: chat, at }` beside the assignee, plus `effort`
  when one was set), committed like any change. Under the reply a hand-off reads like a board change
  (`task-35 added`, `task-35 handed to codex`), and the call shows in the
  steps as `desk · dispatch`. The agent is told to create follow-ups with the
  board tools, hand them off with dispatch, and ask before dispatching more
  than three at once. A chat's desk reaches its own board only, and a
  hand-off gets no desk, so it never hands off again.
- **When an agent asks first**, it is said where you are looking: inside the
  chat for a chat turn, in the task pane for a dispatched task, and in the
  board's band either way, with Allow once · Always · Deny in that order
  ("Antigravity wants to run `ls -a`"); a board not in front is named in the
  strip. Brainfile's own board tools are never asked about: every change
  they make is a commit on the board the agent was asked to manage.
- **Every agent is told the board's standing decisions.** Hand to… and the
  chat's first turn carry the current decisions, one line each with their
  claim keys (the first 15; the rest by `brainfile list --type decision`),
  with the rule: work within them, run `check` before going against one, and
  record a new lasting choice with `decide`.
- **Every agent gets the board tools.** The MCP server is started as the
  real `node` binary and the CLI's own file, with PATH and HOME passed,
  because some agents (Codex) start MCP servers in a stripped environment
  where a version-manager shim never answers. The brief also says to fall
  back to the `brainfile` command line, never to edit board files by hand.
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

Settings take the board's place in the pane (⌘, or the quiet row at the foot
of the rail; Esc or a project leaves). One column, 560px, centred: a
section's heading and its one-line lede, then its rows in a group (raised,
radius 14) with no lines between them. Headings and notes stand on the
rows' text, not the group's rim, so the column has one left edge.

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
