# TUI rubric — first principles for a single-operator developer TUI

Root facts: a TUI is a session, not a transaction (its only edge over CLI verbs is persistent context with instant iteration); the operator is singular (total authority, frequent short sessions between real work).

| # | Principle | Test |
|---|-----------|------|
| 1 | Time-to-truth | Cold launch to readable board fast (order-of-magnitude guard in CI); most decision-relevant info in the first rows; no ceremony |
| 2 | Keyboard-complete, muscle-memory stable | Every common action ≤2 keystrokes from main view; keys never silently change meaning; footer announces context |
| 3 | Viewport onto truth, not a copy | External mutation (MCP/CLI/git) appears in the open TUI ~instantly; selection and scroll survive the refresh |
| 4 | Density with typographic hierarchy | 30-row terminal shows 25+ documents; NO_COLOR still reads (glyphs/indent carry the layout) |
| 5 | Shallow announced modes; Esc always retreats | Esc-mashing from anywhere reaches the main list without side effects |
| 6 | Every keystroke acknowledges | No action whose only confirmation is re-querying; <100ms perceived feedback |
| 7 | Safety proportional to irreversibility | Nothing irreversible from one keystroke; nothing reversible needing more than one |
| 8 | Respect the terminal contract | Resize reflows; exit restores shell; $EDITOR for long text; ssh/tmux; NO_COLOR/TERM honored |
| 9 | Remembered state, visibly | Any non-default view state has an on-screen indicator |
| 10 | Composable, never a trap | Everything visible has an ID on screen; quit-act-relaunch costs nothing |

Anti-principle: no dashboards-for-show, no notification system (P3 makes truth ambient), no theming beyond terminal inheritance, no feature whose demo beats its dailiness.
