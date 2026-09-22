# Supervisor TUI v2 — Targeted Research Brief

## How To Read This

Three tiers of research, synthesized against our actual `supervisor/tui.ts` (1291 lines). Each finding maps to specific lines in our code and a concrete action.

---

## Tier 1: Social Pain Points (from HN, GitHub Issues, Forums)

Real complaints from developers, ranked by impact. Source links included.

### Critical: Visibility Gaps (our TUI has ALL of these)

| Pain Point | Source | Our Code | Impact |
|-----------|--------|----------|--------|
| Can't see if agent tools actually executed | [Cursor Forum](https://forum.cursor.com/t/visibility-of-agent-skills-usage-execution-logs-in-chat-context/149685) | Detail view shows tools AFTER completion only (line 607). No "running now" indicator. | Users think agents are frozen |
| No status indication during operations | [lazygit #1488](https://github.com/jesseduffield/lazygit/issues/1488) | Progress bar shows timeout %, not actual progress (line 858-861). "80% of timeout" ≠ "80% done". Misleading. | Users don't trust the dashboard |
| Decision reasoning hidden | [CSA Report](https://cloudsecurityalliance.org/blog/2026/02/24/the-visibility-gap-in-autonomous-ai-agents) | Log shows "dispatch task-auth-1 → implement" but not WHY this agent was chosen, what gates passed/failed, or what the agent is attempting | Users can't debug pipeline decisions |
| Multi-step workflows can't be traced end-to-end | Same report: 72% of orgs have agent blind spots | Our board shows status but no workflow trail. Can't see: ready → dispatched → tool calls → gates → done chain for a single task | Users must mentally reconstruct flow |

### Critical: Navigation Friction

| Pain Point | Source | Our Code | Impact |
|-----------|--------|----------|--------|
| No discoverability — must memorize commands | [HN: 100+ replies](https://news.ycombinator.com/item?id=23329723) "You can't look around a CLI" | Help overlay (line 965-991) requires ? key. Footer shows bindings but they're static text, not contextual. | New users lost immediately |
| Enter-on-board doesn't drill down | Our own UX audit | Enter on board → switches focus to active (line 1171-1175), doesn't drill into task. Unintuitive 2-step drill-down. | Every user will try Enter expecting detail |
| No search/filter | Every TUI complaint thread | Zero filtering. 50 tasks = scroll through all 50. No `:` command mode, no `/` search. | Unusable at scale |

### High: Information Density Problems

| Pain Point | Source | Our Code | Impact |
|-----------|--------|----------|--------|
| Everything shown at equal weight | [k9s #3030](https://github.com/derailed/k9s/issues/3030) | Board (flex 3) and log (flex 2) have equal visual importance. No focal point. Status uses 11-char enum strings ("in_progress") instead of 1-char icons. | Eyes don't know where to look |
| Log floods hide errors | [logdy blog](https://logdy.dev) | Log shows every action including routine advances. No severity filtering. Buffer cap at 120 silently discards (line 573) with no indicator. | Users miss important events |

### High: Responsiveness & Trust

| Pain Point | Source | Our Code | Impact |
|-----------|--------|----------|--------|
| UI freezes destroy trust | [lazygit #4581](https://github.com/jesseduffield/lazygit/issues/4581) | Full rebuild on every tick (refreshAll, line 1005). No debouncing on resize (line 1249). Keystroke queue during lag. | Dashboard feels unreliable |
| Token spinner is noise | Our own audit | Lines 845-853: animation advances on token events, idles after 3s. Zero information value. Classic cargo-cult TUI. | Visual clutter, no user benefit |

### Medium: Visual Readability

| Pain Point | Source | Our Code | Impact |
|-----------|--------|----------|--------|
| Hard-coded colors clash with themes | [lazygit #3811](https://github.com/jesseduffield/lazygit/issues/3811) | Uses ANSI named colors (cyan, red, green) which should be theme-safe, but dim text on light backgrounds may be invisible | Unreadable for some users |
| Focus indicator invisible | Our audit | ▸ indicator (line 792) with cyan bold on selected. Unselected rows have no indicator at all — user can't see selection state at a glance. | Lost selection context |

---

## Tier 2: Our Code vs Best-in-Class TUI Examples

Direct comparison of our patterns against proven tools.

### k9s Patterns We're Missing

| k9s Pattern | What They Do | What We Do | Gap |
|------------|-------------|-----------|-----|
| Command mode (`:`) | `:pod app=auth` jumps to filtered view | No command mode. No filtering at all. | **Critical** |
| Breadcrumb navigation | `[cluster] > [namespace] > [pod]` with history (`[`, `]`, `-`) | No breadcrumbs. View mode stored internally, not shown. | **High** |
| Context header | Shows cluster, namespace, filter, user, versions | Shows counters only (line 723). No scope context. | **High** |
| Per-column sorting | `shift-o` sorts by selected column | Fixed sort: status → ID. No user control. | **Medium** |

### lazygit Patterns We're Missing

| lazygit Pattern | What They Do | What We Do | Gap |
|----------------|-------------|-----------|-----|
| Persistent multi-panel | 5+ panels visible simultaneously, focus determines actions | 3 panels but board + active + log are independent — no cross-panel interaction | **High** |
| Context-sensitive actions | Focused item determines available keybindings, shown in footer | Footer is static (line 1271-1285). Same bindings regardless of selection. | **High** |
| Progressive disclosure via focus | Focus on file → staging appears. Focus on branch → commits show. | Focus switches panel but content doesn't adapt. Board focus = same view as active focus. | **Medium** |

### btop Patterns We're Missing

| btop Pattern | What They Do | What We Do | Gap |
|-------------|-------------|-----------|-----|
| Modular responsive layout | Boxes reflow based on terminal size. Graph fallback chain. | Fixed flex ratios (3:2). Compact mode cuts columns but doesn't reflow layout. | **High** |
| Process tree with rollup | Parent shows total child resource usage | Epic shows children exist but no rollup of status/progress | **Medium** |
| Configurable layout | Single keystroke cycles layouts | One fixed layout. No customization. | **Low** |

---

## Tier 3: Observability TUI Patterns

Patterns specifically for monitoring agent/pipeline systems.

### Pattern 1: Workflow Timeline (not just status)
Instead of showing a static board table, show the workflow as a timeline:
```
task-auth-1: ready ─── dispatched ──── [bash 3s] [edit 1s] [bash 12s] ── delivered ── gates ── done
                       2m03s ago        └── tool calls ──┘              23s ago       now
```
This replaces the progress bar (which shows timeout %, meaningless) with actual activity history.

### Pattern 2: Activity Heat Indicator
Replace the token spinner with a meaningful activity indicator:
```
▍▎▏  = recent tool call (< 5s ago)
▎▏   = some activity (5-15s ago)
▏    = idle (15-30s ago)
·    = no activity (30s+)
```
One character, graded by recency. No animation. Information-dense.

### Pattern 3: Event Severity Levels
Replace flat log with severity-tagged events:
```
 !! task-auth-1  gate failed: npm test exit 1     ← error (red, always visible)
  ! task-api-3   retry #2 after timeout            ← warning (yellow)
  · task-db-5    dispatched → implement            ← info (dim, filterable)
```
Filter with `1` (errors only), `2` (errors + warnings), `3` (all).

### Pattern 4: Agent Decision Trail
Show WHY the supervisor made decisions:
```
 dispatch  task-auth-1 → implement (codex)
           reason: assignee=implement, agent=codex scored 3/5 (capability:code, tag:supervisor)
           gates: disk-existence ✓, build ✓, test pending
```
This is the "decision reasoning" that the CSA report says 72% of orgs lack.

### Pattern 5: Drill-Down That Shows Context
Current detail view shows raw markdown output. Better approach:
```
┌─ task-auth-1 · implement (codex) · 2m03s ─────────────────────┐
│                                                                 │
│  Phase: implementing (tool call #14)                           │
│  Files touched: 3 (supervisor.ts, tick.ts, registry.ts)        │
│  Tools: 14 calls (bash:6, edit:4, read:3, write:1)            │
│                                                                 │
│  ┌ Live Output ─────────────────────────────────────────────┐  │
│  │  ... streaming markdown ...                               │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌ Recent Tools ────────────────────────────────────────────┐  │
│  │  14:23:45  edit  supervisor.ts:71-83           1.2s  ✓   │  │
│  │  14:23:42  bash  npm run build                 3.1s  ✓   │  │
│  │  14:23:38  read  tick.ts                       0.1s      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  esc: back · tab: output/tools · /: search                     │
╰─────────────────────────────────────────────────────────────────╯
```
Note: summary stats at top (phase, files, tools count) give instant context before diving into raw output.

---

## Synthesis: Top 10 Changes for Our TUI

Ordered by impact × feasibility. Each maps to specific code changes.

### 1. Replace progress bar with activity heat + elapsed time
**Kill**: Timeout-based progress bar (lines 858-861) and token spinner (lines 845-853)
**Add**: Activity heat indicator (▍▎▏·) based on `job.lastToolAt` recency + elapsed time with color thresholds
**Why**: Real information vs fake progress. One char instead of `[###----]`.

### 2. Add `/` search filter for board
**Kill**: Fixed sort-only board (lines 757-807)
**Add**: `/` activates inline search. Filters board rows by ID, title, status, assignee. Esc clears filter. Show "N/M matching" in header.
**Why**: Unusable at 50+ tasks without filtering. Every TUI tool has this.

### 3. Make Enter drill down from ANYWHERE
**Kill**: Two-step drill-down (board → active focus → detail) (lines 1171-1175)
**Add**: Enter on board row → if task has active job, go to detail. If no active job, show task summary modal with contract, deliverables, feedback.
**Why**: Every user's instinct. Currently requires knowing Tab → arrow → Enter sequence.

### 4. Add event severity filtering
**Kill**: Flat log showing every action (line 901-920)
**Add**: Severity levels (error/warning/info). Default shows errors + warnings. `1`/`2`/`3` keys toggle. Show "(3 hidden)" when filtered.
**Why**: Log is noise. Users only care about failures, retries, escalations.

### 5. Context-sensitive footer
**Kill**: Static footer (line 1271-1285) showing all keybindings always
**Add**: Footer changes based on: (a) current view mode, (b) focused panel, (c) selected item type. Show only relevant 5-6 bindings.
**Why**: lazygit's best UX pattern. Teaches users through progressive disclosure.

### 6. Add summary stats to detail view header
**Kill**: Raw detail context line (lines 739-755) showing only ID + agent + elapsed + bar
**Add**: Phase, files touched count, tool calls count, current tool name. Like a commit summary before the diff.
**Why**: Users need context before diving into raw output.

### 7. Status icons instead of strings
**Kill**: 11-char enum strings "in_progress", "delivered" (line 787-788)
**Add**: 1-2 char icons: `⏳` ready, `▶` in_progress, `📦` delivered, `✓` done, `✗` failed, `⛔` blocked
**Why**: Saves ~9 chars per row. Instantly scannable. Board table gains space for titles.

### 8. Show "+N older events hidden" in log
**Kill**: Silent buffer cap (line 573)
**Add**: When log exceeds MAX_LOG_BUFFER, show dim `⋯ 47 older events` at top of log panel
**Why**: Users must know history is truncated. Silent data loss destroys trust.

### 9. Add breadcrumb / context line
**Kill**: Generic header with just "brainfile supervisor" (line 719)
**Add**: Contextual breadcrumb: `supervisor > overview > board` or `supervisor > task-auth-1 > output`
**Why**: Always know where you are. Esc behavior becomes predictable.

### 10. Debounce resize + defend against small terminals
**Kill**: Full rebuild on every resize event (line 1249-1256)
**Add**: 100ms debounce on resize. Graceful degradation at 60x16 (hide log panel). Show useful content at 40x12 (status line only).
**Why**: Resize storms cause visible lag. Current MIN check (40x10) is too aggressive.

---

## What NOT To Change

- **Vim keybindings** — Working well, consistent, expected by target users
- **OpenTUI imperative API** — Correct choice, no framework switch needed
- **onTick/onUpdate callback architecture** — Clean separation of concerns
- **Two-tier refresh strategy** — Sound optimization, just needs debouncing
- **Task priority sorting** — Domain-correct ordering
