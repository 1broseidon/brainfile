# Command Mode Design Specification

## 1. Overview

Command mode adds a vim-style `:` command prompt to the Brainfile Supervisor TUI. It provides a discoverable, keyboard-driven interface for actions that don't warrant dedicated keybindings: dispatching specific tasks, managing jobs, adjusting settings, and querying state.

**Design principles** (grounded in research findings):
- Bottom-anchored prompt preserves context (Research §Tier 1: "Lost Context")
- Fuzzy autocomplete prevents the "flow killer" of strict matching (Research §Tier 1: "Fuzzy Search Strictness")
- Populated initial state eliminates empty-prompt frustration (Research §Tier 1: "Empty States are Useless")
- Strong visual modality signal prevents misfired keystrokes (Research §Tier 1: "Modality Confusion")

## 2. State Model

### 2.1 New State Fields

Add to the `DashboardState` interface (tui.ts line ~258):

```typescript
commandModeActive: boolean;        // Whether command prompt is visible and capturing input
commandBuffer: string;             // Current typed text in the command prompt
commandCursorPos: number;          // Cursor position within commandBuffer
commandHistory: string[];          // Previously executed commands (most recent last)
commandHistoryIndex: number;       // -1 = not browsing history; 0..N = browsing
commandSelectedSuggestion: number; // Index into filtered suggestion list; 0 = top
commandError: string | null;       // Error message to display; null = no error
commandSuccess: string | null;     // Success message to display; null = no success
commandFeedbackExpiry: number;     // Timestamp (ms) when feedback message expires
```

Initial values:

```typescript
commandModeActive: false,
commandBuffer: '',
commandCursorPos: 0,
commandHistory: [],
commandHistoryIndex: -1,
commandSelectedSuggestion: 0,
commandError: null,
commandSuccess: null,
commandFeedbackExpiry: 0,
```

### 2.2 State Machine Integration

Command mode is orthogonal to `viewMode`. It activates as an overlay from any `viewMode` (`'overview'`, `'detail'`, `'help'`). The underlying view remains visible but dimmed.

State transitions:

```
[any viewMode] --(:)--> commandModeActive=true
commandModeActive=true --(Esc)--> commandModeActive=false
commandModeActive=true --(Enter)--> execute → commandModeActive=false
commandModeActive=true --(Enter, error)--> commandError set, commandModeActive remains true
```

When `commandModeActive` is true, the global keypress handler (tui.ts line ~962) routes ALL keystrokes to the command mode handler BEFORE any other mode handler. This is the same pattern used by `state.boardFilterActive` (tui.ts line ~981).

## 3. Command Grammar

### 3.1 Syntax

```
:<verb> [<arg1>] [<arg2>] ...
```

All commands use lowercase. Arguments are space-separated. Task IDs are matched by prefix (e.g., `task-3` matches `task-30` if unambiguous; if ambiguous, return an error listing matches).

### 3.2 Command Table

| Command | Arguments | Validation | Effect |
|---|---|---|---|
| `dispatch <task-id>` | Required: task ID (prefix match) | Task must exist and have status `ready` | Sets `dispatchNow: true` on the task, same as Shift+Enter (tui.ts line ~1953) |
| `pause` | None | — | Pauses the supervisor. Equivalent to `p` key (tui.ts line ~1870) |
| `resume` | None | — | Resumes the supervisor. Equivalent to `p` key when paused |
| `dryrun` | Optional: `on` or `off` | If arg given, must be `on` or `off` | Toggles dry-run mode, or sets explicitly. Equivalent to `d` key (tui.ts line ~1879) |
| `retry <task-id>` | Required: task ID (prefix match) | Task must exist and have status `failed` | Resets task status to `ready` and clears error state |
| `focus <task-id>` | Required: task ID (prefix match) | Task must exist | Navigates board selection to the task; if task has an active job, enters detail view |
| `log <level>` | Required: `1`, `2`, or `3` | Must be 1, 2, or 3 | Sets log severity filter. Equivalent to `1`/`2`/`3` keys (tui.ts line ~1885) |
| `filter <text>` | Required: search text | — | Sets board filter to `<text>`. Equivalent to typing `/` then text |
| `filter` | None | — | Clears the board filter |
| `concurrency <n>` | Required: integer 1–10 | Must be integer in range | Updates supervisor concurrency setting |
| `interval <ms>` | Required: integer ≥ 1000 | Must be integer ≥ 1000 | Updates supervisor tick interval in milliseconds |
| `tick` | None | — | Triggers an immediate supervisor tick |
| `help` | None | — | Opens help overlay. Equivalent to `?` key |
| `quit` | None | — | Exits the TUI. Equivalent to `q` key |

### 3.3 Validation Rules

1. **Empty submit**: If the user presses Enter with an empty buffer, command mode closes silently. No error, no action.
2. **Unknown command**: Display error: `unknown command: <verb>`. Command mode stays open so the user can correct.
3. **Missing required argument**: Display error: `<verb> requires <arg-name>`. Command mode stays open.
4. **Invalid argument**: Display error with specifics (e.g., `concurrency must be 1–10, got 15`). Command mode stays open.
5. **Ambiguous task ID prefix**: Display error: `ambiguous: <prefix> matches <id1>, <id2>, ...` (list up to 5 matches). Command mode stays open.
6. **Task not in expected state**: Display error: `dispatch: task-5 status is in_progress, expected ready`. Command mode stays open.

### 3.4 Argument Autocompletion

After a recognized verb followed by a space:
- **`dispatch`**: Suggest task IDs with status `ready`
- **`retry`**: Suggest task IDs with status `failed`
- **`focus`**: Suggest all task IDs
- **`filter`**: No argument suggestions (free text)
- **`dryrun`**: Suggest `on`, `off`
- **`log`**: Suggest `1`, `2`, `3`
- **`concurrency`**: No suggestions (numeric input)
- **`interval`**: No suggestions (numeric input)

Argument suggestions use the same fuzzy matching as verb suggestions.

## 4. Interaction Model

### 4.1 Entering Command Mode

**Trigger**: Press `:` (colon) when `commandModeActive` is false AND `boardFilterActive` is false.

**Hook point**: Add a check in the global keypress handler (tui.ts line ~962), immediately after the `boardFilterActive` block (line ~1042) and before the help toggle (line ~1044). The `:` key is currently unbound in all modes.

**On activation**:
1. Set `commandModeActive = true`
2. Set `commandBuffer = ''`
3. Set `commandCursorPos = 0`
4. Set `commandHistoryIndex = -1`
5. Set `commandSelectedSuggestion = 0`
6. Clear `commandError` and `commandSuccess`
7. Populate suggestion list with all commands (the "no empty state" principle — Research §Tier 1)
8. Call `refreshAll()`

### 4.2 Typing

All printable characters (single-byte, non-ctrl, non-meta sequences) append at `commandCursorPos` and advance the cursor. This mirrors the `boardFilterActive` character handling (tui.ts line ~1020).

On every keystroke that modifies `commandBuffer`:
1. Recompute the suggestion list using fuzzy matching against the command table
2. Reset `commandSelectedSuggestion = 0`
3. Clear `commandError` (typing dismisses errors)
4. Call `refreshAll()`

### 4.3 Backspace

Deletes the character before `commandCursorPos`. If `commandBuffer` is empty, close command mode (same pattern as board filter — tui.ts line ~1007).

### 4.4 Tab Completion

**Tab**: Accept the currently highlighted suggestion.
- If in verb position (no space in buffer): replace entire buffer with the selected command verb, append a space.
- If in argument position (space present): replace the argument portion with the selected argument value.
- After accepting, recompute suggestions for the new buffer state.

**Shift+Tab**: Move `commandSelectedSuggestion` up by 1 (wrapping to bottom).

This follows the Helix pattern (Research §Tier 2: "Tab/S-Tab to navigate, Enter to accept").

### 4.5 Arrow Keys

**Up**: Browse command history.
- If `commandHistoryIndex` is -1, save current buffer as draft, set index to `commandHistory.length - 1` (most recent).
- If index > 0, decrement index.
- Replace buffer with `commandHistory[commandHistoryIndex]`.

**Down**: Browse forward in history.
- If index is at `commandHistory.length - 1`, restore draft, set index to -1.
- If index < `commandHistory.length - 1`, increment index.
- Replace buffer with `commandHistory[commandHistoryIndex]`.

This matches Helix history behavior (Research §Tier 2: "Up/Down arrows").

**Left/Right**: Move `commandCursorPos` within the buffer. Left decrements (min 0), Right increments (max buffer length). Provides standard text editing.

### 4.6 Enter (Execute)

1. Trim whitespace from `commandBuffer`.
2. If empty after trimming: close command mode silently.
3. Parse: split on whitespace. First token is verb, rest are arguments.
4. If verb does not match any command in the table AND there is no fuzzy suggestion: set `commandError` to `unknown command: <verb>`. Stay in command mode.
5. If verb does not match exactly BUT there is exactly one fuzzy match with score ≥ threshold: execute that command (Research §Recommendation 4: "Accept Top Suggestion on Enter").
6. If verb matches but arguments fail validation: set `commandError`. Stay in command mode.
7. On successful execution:
   - Push the raw command string to `commandHistory` (dedup: skip if identical to last entry).
   - Set `commandSuccess` to a confirmation message (see §6.4).
   - Set `commandFeedbackExpiry = Date.now() + 2000`.
   - Set `commandModeActive = false`.
   - Call `refreshAll()`.

### 4.7 Escape (Cancel)

Close command mode immediately:
1. Set `commandModeActive = false`
2. Clear `commandBuffer`, `commandError`, `commandSuccess`
3. Call `refreshAll()`

### 4.8 Ctrl+C

While in command mode: same as Escape (cancel command mode). Do NOT quit the application. This prevents the common accident of pressing Ctrl+C to cancel a command and killing the TUI.

### 4.9 Ctrl+W

Delete the word before the cursor (standard terminal behavior). Split buffer on spaces, remove the last token (or partial token at cursor), update cursor position.

### 4.10 Ctrl+U

Clear the entire command buffer. Reset cursor to 0. Keep command mode open.

## 5. Keybinding Compatibility

### 5.1 Keybindings to KEEP (no conflicts)

| Key | Current Action | Conflict with Command Mode? |
|---|---|---|
| `j/k/↑/↓` | Navigate lists | NO — command mode captures all input when active |
| `g/G` | Top/bottom | NO — captured by command mode when active |
| `Tab` | Switch panel focus | NO — Tab used for completion in command mode |
| `Enter` | Drill down | NO — Enter executes command when in command mode |
| `Esc` | Go back / dismiss | NO — Esc exits command mode |
| `/` | Board filter | NO — `/` is only handled when command mode is inactive |
| `1/2/3` | Log filter | NO — captured by command mode when active |
| `p` | Pause/resume | KEEP — `p` remains a quick toggle; `pause`/`resume` commands are aliases |
| `d` | Toggle dry-run | KEEP — `d` remains a quick toggle; `dryrun` command is an alias |
| `?` | Help | KEEP — `?` remains the quick help toggle |
| `q` | Quit | KEEP — `q` remains the quick quit |
| `Ctrl+C` | Quit | MODIFIED — in command mode only, Ctrl+C cancels instead of quitting |
| `Shift+Enter` | Dispatch now | KEEP — remains for quick dispatch from board |
| `Ctrl+D/U` | Half-page scroll | NO — captured by command mode (Ctrl+U = clear line) |

### 5.2 New Keybindings

| Key | Context | Action |
|---|---|---|
| `:` | Any mode (not in filter/command) | Enter command mode |

### 5.3 Conflict Resolution

The ONLY behavioral change to existing keys: **Ctrl+C** in command mode cancels the prompt instead of quitting. This is safe because:
- The user is explicitly in a text-input modal
- Quitting is still available via `Esc` then `q`, or typing `:quit` Enter
- This matches terminal convention (Ctrl+C cancels current input)

**Ctrl+U** in command mode clears the command buffer instead of scrolling. This is safe because:
- The user is in text-input mode, not scrolling mode
- This matches readline convention

## 6. Rendering

### 6.1 Prompt Bar

The command prompt renders as an absolute-positioned `BoxRenderable` anchored to the bottom of the viewport, ABOVE the footer line.

**Implementation**: Create a new `BoxRenderable`:
```typescript
const commandOverlay = new BoxRenderable(renderer, {
  border: false,
  flexDirection: 'column',
});
commandOverlay.visible = false;
commandOverlay.position = 'absolute';
commandOverlay.bottom = 1;  // Above footer
commandOverlay.left = 0;
commandOverlay.width = '100%';
commandOverlay.height = 1;  // Grows when autocomplete is shown
commandOverlay.zIndex = 25; // Below tooSmallOverlay(20→30), above helpOverlay(10)
root.add(commandOverlay);
```

**Note**: Adjust `tooSmallOverlay.zIndex` from 20 to 30 so it always covers command mode.

The prompt line content:

```
:<buffer>█
```

Where `█` is a block cursor at `commandCursorPos`. The `:` prefix is rendered in `cyan(bold(':'))` to match the filter prefix styling (tui.ts line ~652, `cyan(bold('/'))`).

### 6.2 Autocomplete Dropdown

The autocomplete list renders ABOVE the prompt line, growing upward. This is the same `commandOverlay` box — its `height` increases to `1 + min(suggestionCount, MAX_VISIBLE_SUGGESTIONS)` where `MAX_VISIBLE_SUGGESTIONS = 8`.

Each suggestion row:

```
  <icon>  <command-name>          <description>
```

- **Icon**: Dimmed category icon (see §6.5 for icons per command)
- **Command name**: Plain text for unselected; `cyan(bold(...))` for selected row
- **Description**: `dim(...)` right-aligned summary of what the command does
- **Selected row**: Highlighted with `cyan(bold('▸'))` prefix, matching the board selection pattern (tui.ts line ~677)
- **Unselected rows**: Indented with 2 spaces

Fuzzy match highlighting: The characters in the command name that match the typed input are rendered in `bold()`. Non-matching characters remain plain. This provides real-time visual feedback of what the fuzzy matcher is connecting.

When in argument position (verb recognized + space typed), the autocomplete switches to show argument suggestions (task IDs, options) using the same visual treatment.

### 6.3 Autocomplete Layout (ASCII Mockup)

The overlay height is computed dynamically: `1 (prompt) + min(numSuggestions, 8) (list)`.

At 80 columns wide:

**Empty prompt (just opened, all commands shown):**
```
  ·  pause                              Pause the supervisor
  ·  resume                             Resume the supervisor
  ·  dryrun [on|off]                    Toggle or set dry-run mode
  ·  dispatch <task-id>                 Dispatch a ready task now
  ·  retry <task-id>                    Retry a failed task
  ·  focus <task-id>                    Navigate to a task
  ·  filter [text]                      Set or clear board filter
  ·  tick                               Trigger immediate tick
:█
```

**Mid-typing "dis" with fuzzy match:**
```
  ▸  dispatch <task-id>                 Dispatch a ready task now
:dis█
```

**After typing "dispatch " — argument autocomplete shows ready tasks:**
```
  ▸  task-12                            @architect · ready
     task-30                            @coder · ready
     task-7                             @designer · ready
:dispatch █
```

**Error state (unknown command):**
```
  ✗ unknown command: foobar
:foobar█
```

**Error state (validation failure):**
```
  ✗ dispatch: task-5 status is in_progress, expected ready
:dispatch task-5█
```

**Success feedback (fades after 2s, command mode closed):**
The success message appears in the footer area for 2 seconds after command mode closes:

```
 ✓ dispatched task-12                                    ↑↓ navigate · enter drill-down · / filter
```

The `✓` is `green(bold('✓'))`. The message replaces the left side of the footer for `commandFeedbackExpiry - Date.now()` milliseconds, then the footer reverts to normal. The 1-second refresh interval (tui.ts line ~2105) naturally clears expired feedback.

### 6.4 Success Messages

| Command | Success Message |
|---|---|
| `dispatch <id>` | `dispatched <full-id>` |
| `pause` | `supervisor paused` |
| `resume` | `supervisor resumed` |
| `dryrun on` | `dry-run enabled` |
| `dryrun off` | `dry-run disabled` |
| `dryrun` (toggle) | `dry-run <enabled\|disabled>` |
| `retry <id>` | `retrying <full-id>` |
| `focus <id>` | (no message — the navigation IS the feedback) |
| `log <n>` | `log filter: <level-name>` |
| `filter <text>` | (no message — the filter IS the feedback) |
| `filter` (clear) | `filter cleared` |
| `concurrency <n>` | `concurrency set to <n>` |
| `interval <ms>` | `tick interval set to <ms>ms` |
| `tick` | `tick triggered` |
| `help` | (no message — help opens) |
| `quit` | (no message — TUI exits) |

### 6.5 Command Icons

| Command | Icon | Rationale |
|---|---|---|
| `dispatch` | `▶` (cyan) | Matches the "in_progress" status icon (tui.ts line ~309) |
| `pause` | `‖` (yellow) | Standard pause icon |
| `resume` | `▶` (green) | Play/resume |
| `dryrun` | `◇` (yellow) | Diamond = synthetic/dry |
| `retry` | `↻` (yellow) | Retry/refresh |
| `focus` | `◎` (dim) | Target/focus |
| `log` | `≡` (dim) | List/filter |
| `filter` | `/` (cyan) | Matches existing filter prefix |
| `concurrency` | `∥` (dim) | Parallel lines |
| `interval` | `⏱` (dim) | Timer |
| `tick` | `⟳` (cyan) | Cycle |
| `help` | `?` (dim) | Standard help |
| `quit` | `×` (red) | Exit/close |

### 6.6 Visual Modality Signal

When `commandModeActive` is true, the `outerFrame` border style changes from `'rounded'` to `'rounded'` with a cyan tint applied to the title. The footer text changes to show command-mode-specific hints:

```
 esc cancel · tab complete · ↑↓ history · enter execute
```

This provides a clear visual break from normal mode (Research §Tier 1: "Modality Confusion", Research §Recommendation 9).

The existing TUI content (board, active, events, detail) remains fully visible behind the command prompt — no dimming overlay. The prompt occupies only the bottom 1–9 lines, preserving maximum context (Research §Tier 1: "Lost Context").

### 6.7 Layout Impact

The command prompt overlay uses absolute positioning and does not participate in flex layout. It visually overlaps the bottom of the log box (in overview) or the detail tools box (in detail view). This is acceptable because:
- The prompt is transient (open for seconds, not minutes)
- The log box has `stickyScroll: true` so the newest content is visible above the overlay
- The prompt disappears completely when command mode exits

No existing layout heights or flex properties change.

## 7. Fuzzy Matching

### 7.1 Algorithm

Use a simple sequential character match with scoring:
1. For each character in the query, find the next occurrence in the candidate (case-insensitive).
2. Score bonuses: +3 for match at start of word, +2 for consecutive matches, +1 for each match.
3. Score penalties: -1 for each gap between matches.
4. If all query characters are found in order, the candidate is a match. Otherwise, it is not.

### 7.2 Threshold

A command matches if ALL query characters appear in order in the candidate. There is no minimum score threshold for inclusion — any sequential match is shown. Score is used only for ORDERING the suggestion list (highest score first).

### 7.3 Examples

| Query | Matches | Top Result |
|---|---|---|
| `d` | dispatch, dryrun | dispatch (shorter, earlier in alphabet) |
| `dis` | dispatch | dispatch |
| `dr` | dryrun | dryrun |
| `p` | pause | pause |
| `re` | resume, retry | resume (earlier match position) |
| `foc` | focus | focus |
| `q` | quit | quit |
| `xyz` | (none) | — |

## 8. Edge Cases

### 8.1 Command While in Detail View

Command mode activates normally. The detail view remains visible behind the command prompt. All commands execute with full effect. The `focus` command switches to overview mode after navigation.

### 8.2 Command While Help Overlay is Open

Command mode activates on top of the help overlay. The help overlay remains visible (zIndex 10, command is zIndex 25). On command execution that returns to normal view, help closes. On Esc from command mode, help remains open.

### 8.3 Command While Filter is Active

The `:` key does NOT activate command mode when `boardFilterActive` is true (it types a literal colon into the filter). This is enforced by the guard condition in §4.1.

### 8.4 Command While Board Filter Has Text

If `boardFilter` is non-empty but `boardFilterActive` is false, `:` activates command mode normally. The filter remains applied to the board.

### 8.5 Unknown Command Handling

Error message displayed inline above the prompt (see §6.3 error mockup). The prompt stays open. The buffer is preserved so the user can correct the typo without retyping.

### 8.6 Empty Submit

Close command mode silently. No error. No history entry. This allows `:` then immediate Enter as a no-op dismiss (matching vim behavior).

### 8.7 Very Long Command Buffer

The command buffer display truncates visually at `contentWidth() - 2` characters (reserving space for `:` prefix and cursor). The full buffer is maintained in state. The cursor scrolls the visible window — characters before the visible window are hidden.

### 8.8 Terminal Resize During Command Mode

On resize (tui.ts line ~1734), `refreshAll()` is called. The command overlay width recomputes to `100%`. The autocomplete dropdown recomputes max visible rows based on available terminal height: `min(8, floor(renderer.height * 0.4))`. If the terminal becomes too small (below MIN_WIDTH × MIN_HEIGHT), the `tooSmallOverlay` (zIndex 30) covers everything including the command prompt.

### 8.9 Rapid Typing

Each keystroke triggers a synchronous fuzzy match against the command table (13 entries). This is O(13 × commandLength) per keystroke — negligible. No debouncing is needed.

### 8.10 History Overflow

Command history stores up to 50 entries. When exceeded, the oldest entry is dropped. History is in-memory only (not persisted across TUI restarts).

### 8.11 Concurrent State Changes

If the supervisor dispatches a task while the user is typing `dispatch task-12`, and that task's status changes to `in_progress` before Enter is pressed, the validation catches it and shows: `dispatch: task-12 status is in_progress, expected ready`.

### 8.12 Command Mode + Periodic Refresh

The 1-second periodic refresh (tui.ts line ~2105) continues while command mode is open. This keeps the board, active jobs, and events updating behind the command overlay. The command overlay re-renders on each refresh to keep the autocomplete suggestions current (e.g., a task that finishes becomes available for `retry` if it fails).

## 9. Rendering Implementation Sketch

### 9.1 New Renderables

```typescript
// Command prompt overlay
const commandOverlay = new BoxRenderable(renderer, {
  flexDirection: 'column',
});
commandOverlay.visible = false;
commandOverlay.position = 'absolute';
commandOverlay.bottom = 1;
commandOverlay.left = 0;
commandOverlay.width = '100%';
commandOverlay.zIndex = 25;
root.add(commandOverlay);

// Autocomplete list (renders above prompt line)
const commandSuggestionsText = new TextRenderable(renderer, {});
commandOverlay.add(commandSuggestionsText);

// Prompt line
const commandPromptText = new TextRenderable(renderer, { height: 1 });
commandOverlay.add(commandPromptText);
```

### 9.2 refreshAll() Changes

In `refreshAll()` (tui.ts line ~780), add after existing visibility logic:

```typescript
commandOverlay.visible = state.commandModeActive;
if (state.commandModeActive) {
  buildCommandPrompt();
  buildCommandSuggestions();
}
```

### 9.3 buildCommandPrompt()

```typescript
function buildCommandPrompt(): void {
  const cw = contentWidth();
  const bufferDisplay = state.commandBuffer;
  const cursorChar = '\u2588'; // █

  // Insert cursor into display string
  const before = bufferDisplay.slice(0, state.commandCursorPos);
  const after = bufferDisplay.slice(state.commandCursorPos);

  commandPromptText.content = makeStyledText([
    cyan(bold(':')),
    { __isChunk: true, text: before },
    cyan(cursorChar),
    { __isChunk: true, text: after },
  ]);
}
```

### 9.4 buildCommandSuggestions()

```typescript
function buildCommandSuggestions(): void {
  // If there's an error, show error line instead of suggestions
  if (state.commandError) {
    const lines = [
      makeStyledText([
        { __isChunk: true, text: '  ' },
        red(bold('✗ ')),
        red(state.commandError),
      ]),
    ];
    commandSuggestionsText.content = joinStyledLines(lines);
    commandOverlay.height = 2; // error + prompt
    return;
  }

  const suggestions = computeSuggestions(state.commandBuffer);
  const maxVisible = Math.min(8, Math.floor(renderer.height * 0.4));
  const visible = suggestions.slice(0, maxVisible);

  if (visible.length === 0) {
    commandSuggestionsText.content = makeStyledText([]);
    commandOverlay.height = 1; // prompt only
    return;
  }

  // Build suggestion lines
  const lines: StyledText[] = [];
  for (let i = 0; i < visible.length; i++) {
    const s = visible[i];
    const isSelected = i === state.commandSelectedSuggestion;
    const prefix = isSelected ? cyan(bold('▸ ')) : dim('  ');
    const icon = s.icon; // TextChunk
    const name = isSelected ? cyan(bold(s.label)) : { __isChunk: true, text: s.label };
    const desc = dim(s.description);

    lines.push(makeStyledText([prefix, icon, { __isChunk: true, text: '  ' }, name, dim('  '), desc]));
  }

  commandSuggestionsText.content = joinStyledLines(lines);
  commandOverlay.height = visible.length + 1; // suggestions + prompt
}
```

### 9.5 Footer Modification

In `buildFooter()` (tui.ts line ~730):

```typescript
// At the top of buildFooter():
if (state.commandModeActive) {
  return makeStyledText([dim(' esc cancel · tab complete · ↑↓ history · enter execute')]);
}

// Feedback display (after command mode closes):
if (state.commandSuccess && Date.now() < state.commandFeedbackExpiry) {
  const successPart = makeStyledText([
    { __isChunk: true, text: ' ' },
    green(bold('✓')),
    { __isChunk: true, text: ` ${state.commandSuccess}` },
  ]);
  // Append normal footer hints after the success message
  // ...
}
```

## 10. ASCII Mockups at Representative Sizes

### 10.1 Overview with Command Mode Open (80×24)

```
╭─ supervisor  tick #4 · 10s · up 2m 15s ───────────────────────────────────╮
│                                                                            │
│  · 3         ▶ 2         ▪ 1         ✓ 5         ✗ 0                      │
│  ready       active      delivered   done        failed                    │
│                                                                            │
│ ─ Board ─────────────────────────────────────────────────────── 11 ──      │
│  task-12      Architect command mode    ▶   @architect     2d              │
│▸ task-30      Research patterns          ·   @researcher   1d              │
│  task-7       Design landing page       ✓   @designer      5d              │
│  task-5       Implement auth flow       ▶   @coder         3h              │
│                                                                            │
│ ─ Active ────────────────────────────────────────────────── 2/3 slots ──   │
│  task-12    @architect  4m 22s ▍  Read        implement                    │
│  task-5     @coder      1m 08s ▎  Write       implement                    │
│                                                                            │
│ ─ Events ──────────────────────────────────────────── errors+warnings ──   │
│  · 14:22:01  dispatch       task-12   agent=@architect                     │
│  · 14:22:01  dispatch       task-5    agent=@coder                         │
│  · 14:22:31  advance        task-7    in_progress -> delivered             │
│  ▸  dispatch <task-id>                 Dispatch a ready task now           │
│     retry <task-id>                    Retry a failed task                 │
│     dryrun [on|off]                    Toggle or set dry-run mode          │
│ :d█                                                                        │
│ esc cancel · tab complete · ↑↓ history · enter execute               ? help│
╰────────────────────────────────────────────────────────────────────────────╯
```

### 10.2 Detail View with Command Error (120×40)

```
╭─ supervisor > job-abc123 ──────────────────────────────────────────────────────────────────────────────────────────╮
│                                                                                                                    │
│  task-12 · @architect · implement · 4m 22s ▍                                                                       │
│  tools: 12 (Read:6 Write:4 Bash:2) · current: Read .brainfile/plans/comman...                                      │
│                                                                                                                    │
│ ## Analysis                                                                                                        │
│                                                                                                                    │
│ Based on the research findings, the command mode should use a bottom-anchored                                      │
│ prompt with fuzzy autocomplete...                                                                                  │
│                                                                                                                    │
│ (agent output continues...)                                                                                        │
│                                                                                                                    │
│                                                                                                                    │
│                                                                                                                    │
│                                                                                                                    │
│                                                                                                                    │
│                                                                                                                    │
│                                                                                                                    │
│                                                                                                                    │
│                                                                                                                    │
│                                                                                                                    │
│ ─ Tools ───────────────────────────────────────────────────────────────────────────────────────────────────────── │
│   Read            .brainfile/plans/command-mode-research  142ms                                                     │
│   Read            supervisor/tui.ts                       89ms                                                      │
│   Write           .brainfile/plans/command-mode-design-s  running...                                                │
│                                                                                                                    │
│                                                                                                                    │
│                                                                                                                    │
│                                                                                                                    │
│                                                                                                                    │
│                                                                                                                    │
│                                                                                                                    │
│                                                                                                                    │
│                                                                                                                    │
│                                                                                                                    │
│                                                                                                                    │
│   ✗ dispatch: task-5 status is in_progress, expected ready                                                         │
│ :dispatch task-5█                                                                                                  │
│ esc cancel · tab complete · ↑↓ history · enter execute                                                        ? help│
╰────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
```

### 10.3 Successful Execution Feedback (80×24)

After executing `:dispatch task-30`, command mode closes and the footer shows:

```
│  · 14:23:15  dispatch       task-30   agent=@coder                         │
│ ✓ dispatched task-30                   ↑↓ navigate · enter drill-down · ? help│
╰────────────────────────────────────────────────────────────────────────────╯
```

After 2 seconds, the footer reverts to normal:

```
│  · 14:23:15  dispatch       task-30   agent=@coder                         │
│ ↑↓ navigate · enter drill-down · / filter · tab → active · 1-3 log · ? help│
╰────────────────────────────────────────────────────────────────────────────╯
```

### 10.4 Minimal Terminal (40×12) — Graceful Degradation

At minimum terminal size, the autocomplete dropdown shows at most `floor(12 * 0.4) = 4` suggestions:

```
╭─ supervisor  tick #1 ──────────╮
│ · 3   ▶ 2   ▪ 1   ✓ 5   ✗ 0  │
│ ready active dlvd done  fail   │
│ ─ Board ─────────────── 11 ── │
│▸ task-12  Architect co ▶      │
│  task-30  Research pat ·      │
│  ▸  dispatch                   │
│     pause                      │
│     resume                     │
│     dryrun                     │
│ :█                             │
│ esc · tab · ↑↓ · enter        │
╰────────────────────────────────╯
```

Note: descriptions are omitted when width < 60 to fit commands in available space. The footer text shortens to essential keywords.

## 11. Implementation Checklist

This section lists every discrete change required, in dependency order:

1. **State fields**: Add all fields from §2.1 to the `DashboardState` interface and initial state object.
2. **Command registry**: Create a `COMMANDS` array defining `{ verb, args, description, icon, validate, execute }` for each command in §3.2.
3. **Fuzzy matcher**: Implement the algorithm from §7 as a pure function `fuzzyMatch(query: string, candidate: string): { score: number; indices: number[] } | null`.
4. **Suggestion computer**: Implement `computeSuggestions(buffer: string)` that returns sorted suggestions based on buffer state (verb vs argument position).
5. **Renderables**: Add `commandOverlay`, `commandSuggestionsText`, `commandPromptText` per §9.1.
6. **Build functions**: Implement `buildCommandPrompt()` and `buildCommandSuggestions()` per §9.3–9.4.
7. **refreshAll() integration**: Add command overlay visibility and build calls per §9.2.
8. **Footer integration**: Add command mode footer and success feedback display per §9.5.
9. **Input handler**: Add command mode keypress block in the global handler, positioned after `boardFilterActive` and before help toggle, handling all keys from §4.
10. **Command execution**: Implement the parse-validate-execute pipeline from §4.6 for each command in §3.2.
11. **History management**: Implement Up/Down history browsing from §4.5 with 50-entry cap from §8.10.
12. **zIndex adjustment**: Change `tooSmallOverlay.zIndex` from 20 to 30.
13. **Help text update**: Add `:` to the help overlay keyboard reference.
