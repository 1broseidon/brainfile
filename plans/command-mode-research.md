# Command Mode Research & Synthesis

## Tier 1: User Pain Points & Frustrations

Based on discussions across Hacker News, GitHub, and Reddit regarding terminal command modes and TUI palettes:

- **Discoverability & The "Hidden" Nature**: Command palettes are often hidden behind complex shortcuts or lack browseability. Users complain that unless they know the exact terminology, they can't find the feature (e.g., VS Code "Organize Imports" vs "Sort Members"). [GitHub]
- **Empty States are Useless**: Opening a prompt and seeing nothing (like early Sublime Text or Acorn) is a major frustration compared to showing recent or context-relevant commands. [Destiner.io]
- **Fuzzy Search Strictness**: Exact substring matching is a "flow killer". Users prefer fuzzy matching (typing "ssmd" to get "Set Syntax: Markdown") over strict prefix matching. [OpenCode.ai]
- **Modality Confusion**: Switching between navigation/view mode and command mode can be jarring if the visual distinction isn't clear, leading to misfires where users type commands into normal mode. [Hacker News]
- **Rendering & Screen Garbling**: TUI-specific palettes often struggle with terminal resizing or overlapping panels, creating "visual noise" and corrupting the display.
- **Lost Context**: Full-screen command palettes obscure the user's current context (what task they were looking at).

## Tier 2: Implementation Analysis

- **k9s (:)**: 
  - *Prompt*: Bottom left prompt.
  - *Autocomplete*: Strict. It requires exact matches or aliases.
  - *History*: Up arrow.
  - *Errors*: If you type a partial command and hit Enter instead of Tab to complete, it throws a "not found" error, a frequent user complaint.
  - *Grammar*: :[resource] or :[resource] [namespace].
- **Helix (:)**:
  - *Prompt*: Bottom command line.
  - *Autocomplete*: As-you-type substring matching. Tab/S-Tab to navigate, Enter to accept. Typing "-" suggests command flags.
  - *History*: Up/Down arrows.
  - *Errors*: "Invalid Argument Count" shown concisely at the bottom if parameters are missing.
  - *Grammar*: :[command] [args...].
- **fzf**:
  - *Prompt*: Highly configurable, often bottom-anchored (--height 40%).
  - *Autocomplete*: Real-time, extremely forgiving fuzzy search.
  - *History*: Used often *for* history.
  - *Errors*: N/A (filters list to empty).
- **lazygit & neovim**:
  - Lazygit uses contextual command menus (like a palette popup) over inline typing.
  - Neovim uses the bottom : command line, with wildmenu for autocomplete, though history requires entering a dedicated window (q:).

## Tier 3: Mapping to Brainfile Supervisor (supervisor/tui.ts)

The existing Brainfile supervisor TUI uses the OpenTUI imperative API. 

- **Input Infrastructure**: Global keypress events are handled via `renderer.keyInput.on("keypress", ...)` starting around **Line 962**.
- **Existing "Modes"**: The TUI already has a text input mode for the board filter (`state.boardFilterActive`, toggled with `/` at **Line 1058**). It captures sequences character-by-character (**Line 981**).
- **Hook Point**: A command mode would hook into the global keypress handler. We would add a `state.commandModeActive = boolean`, a `state.commandBuffer = string`, and intercept keypresses just like the filter mode.
- **Rendering Hook**: The UI uses absolute positioned `BoxRenderable` components for overlays (e.g., `helpOverlay` at **Line 475**, `tooSmallOverlay` at **Line 488**). A command palette would be a new `BoxRenderable` added to the `root`, with `position = "absolute"`, `zIndex = 30`, and anchored to `bottom = 1`.

## Synthesis: Top 10 Recommendations

1. **Trigger and Input Hook (Tier 3)**: Bind the `:` key to activate command mode in `supervisor/tui.ts` (Line 1058 alongside `/`). Introduce `state.commandModeActive` to cleanly intercept keystrokes without conflicting with navigation keys (Tier 1: Modality Confusion).
2. **Bottom-Anchored Rendering (Tier 2: fzf/helix)**: Render the command prompt as an absolute-positioned `BoxRenderable` at the bottom of the screen (`bottom = 1`) with a fixed height. This preserves the user's context (board/detail view) while typing (Tier 1: Lost Context).
3. **Fuzzy Autocomplete by Default (Tier 1: UX Complaints)**: Implement fuzzy matching for command discovery instead of strict prefix matching. If a user types "dsptch", it should match "dispatch".
4. **Accept Top Suggestion on Enter (Tier 2: k9s)**: Avoid the k9s "Ruroh? command not found" error trap. If the user types a partial command and hits Enter, immediately execute the highest-ranked fuzzy autocomplete suggestion rather than requiring an explicit Tab confirmation.
5. *>No Empty States (Tier 1: GitHub)**: When the user presses `:`, immediately populate the autocomplete list with the 5 most frequently used commands or context-relevant commands (e.g., if focused on a specific task in overview, show task actions) instead of an empty box.
6. **Command Grammar**: Use a standard `[verb] [target] [options]` grammar (e.g., `dispatch <task-id>`, `pause`, `log filter 1`).
7. **Inline Argument & Flag Hints (Tier 2: helix)**: Once a command verb is recognized (followed by a space), update the autocomplete pane to show expected arguments or available flags (similar to Helix `-` expansion) to prevent execution errors.
8. **Command History (Tier 2: helix)**: Implement command history accessible via Up and Down arrows while the command prompt is active. Save this to an in-memory array `state.commandHistory` in `tui.ts`.
9. **Visual Modality Distinction (Tier 1: Input Modality)**: When command mode is active, visually dim the surrounding components or apply a bright border to the command palette `BoxRenderable` so the user is never confused about where their keystrokes are going.
10. **Graceful Error Feedback**: If a command fails (e.g., invalid syntax), do not freeze the prompt or garble the screen. Append a red error action to the existing `state.logs` array (which renders in the `logBox` event stream) and briefly flash the command palette border red.