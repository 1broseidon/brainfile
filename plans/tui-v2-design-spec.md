# TUI v2 — Design Specification

## Document Purpose

This is an implementer-ready spec. Every change traces to a specific finding in `tui-v2-research.md`. No generic improvements. This document tells you exactly what to delete, what to add, and where.

**Source material**: `.brainfile/plans/tui-v2-research.md` (research brief)
**Target file**: `supervisor/tui.ts` (1291 lines)

---

## Table of Contents

1. [Change 1: Activity Heat + Elapsed Time (replaces progress bar & spinner)](#change-1)
2. [Change 2: `/` Search Filter for Board](#change-2)
3. [Change 3: Enter Drills Down from Anywhere](#change-3)
4. [Change 4: Event Severity Filtering](#change-4)
5. [Change 5: Context-Sensitive Footer](#change-5)
6. [Change 6: Rich Detail View Header](#change-6)
7. [Change 7: Status Icons Instead of Strings](#change-7)
8. [Change 8: Log Truncation Indicator](#change-8)
9. [Before/After ASCII Mockups](#mockups)
10. [Interaction Model Summary](#interaction-model)
11. [Implementation Sequence](#implementation-sequence)

---

<a id="change-1"></a>
## Change 1: Replace Progress Bar + Spinner with Activity Heat + Elapsed Time

### Research Reference
- Research §Tier1: "Progress bar shows timeout %, not actual progress. '80% of timeout' ≠ '80% done'. Misleading."
- Research §Tier1: "Token spinner — Zero information value. Classic cargo-cult TUI."
- Research §Tier3 Pattern 2: Activity heat indicator based on recency of tool calls.
- Research §Synthesis #1: "Real information vs fake progress."

### What to DELETE

**Spinner constants and state** (lines 76–78):
```typescript
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const;
// ...
const SPINNER_IDLE_MS = 3000;
```

**SpinnerState interface** (lines 100–104):
```typescript
interface SpinnerState {
  lastTokens: number;
  lastTokenAt: number;
  frame: number;
}
```

**Spinner state map** (line 508):
```typescript
const spinnerState = new Map<string, SpinnerState>();
```

**Spinner computation in buildActive** (lines 845–853):
```typescript
const s = spinnerState.get(job.id) ?? { lastTokens: job.tokenCount ?? 0, lastTokenAt: now, frame: 0 };
if ((job.tokenCount ?? 0) > s.lastTokens) {
  s.frame = (s.frame + 1) % SPINNER_FRAMES.length;
  s.lastTokenAt = now;
}
s.lastTokens = job.tokenCount ?? 0;
spinnerState.set(job.id, s);
const spinner = (now - s.lastTokenAt > SPINNER_IDLE_MS) ? ' ' : SPINNER_FRAMES[s.frame];
```

**Progress bar construction in buildActive** (lines 858–861):
```typescript
const fill = Math.round(clampedRatio * c.progress);
const bar = `[${'#'.repeat(fill)}${'-'.repeat(Math.max(0, c.progress - fill))}]`;
const barChunk: TextChunk = ratio >= 0.8 ? red(bar) : ratio >= 0.6 ? yellow(bar) : { __isChunk: true, text: bar };
```

**Progress bar in buildDetailContextLine** (lines 747–751):
```typescript
const ratio = timeoutMs > 0 ? Math.min(1, Math.max(0, elapsedMs / timeoutMs)) : 0;
const barW = 12;
const fill = Math.round(barW * ratio);
const bar = `[${'#'.repeat(fill)}${'-'.repeat(Math.max(0, barW - fill))}]`;
// ...
const barStyled = ratio >= 0.8 ? red(bar) : ratio >= 0.6 ? yellow(bar) : bar;
```

**`progress` column from ColumnCache and computeColumns** — remove the `progress` field from `active` column specs.

**`spinner` column from ColumnCache and computeColumns** — remove the `spinner` field.

### What to ADD

**Activity heat function** — new utility:
```typescript
/**
 * Returns a 1-char heat indicator based on time since last tool activity.
 * Uses Unicode block characters graded by recency.
 */
function activityHeat(lastToolAt: number | undefined, now: number): TextChunk {
  if (!lastToolAt) return dim('·');
  const elapsed = now - lastToolAt;
  if (elapsed < 5_000)  return green('▍');  // active < 5s
  if (elapsed < 15_000) return yellow('▎'); // some activity 5-15s
  if (elapsed < 30_000) return dim('▏');    // idle 15-30s
  return dim('·');                           // no activity 30s+
}
```

**Where `lastToolAt` comes from**: The `Job` type should expose `lastToolAt` (timestamp of most recent `tool_start` or `tool_end`). If not available on Job, track it in a `Map<string, number>` keyed by job ID, updated in the `onUpdate` handler when `sessionUpdate === 'tool_start'` or `'tool_end'`.

**New active row layout** — replaces spinner + progress bar:
```
▸ task-auth  codex       2m 03s ▍ edit       implement
  task-db-2  claude      0m 12s ▎ bash       implement
  task-api   codex       5m 41s · -          review
```

Columns: `indicator(2) + task(10) + 2sp + agent(12) + 2sp + elapsed(7) + 1sp + heat(1) + 1sp + tool(10) + 2sp + phase(10)`

The elapsed time uses color thresholds (same as current):
- `< 60%` of timeout → dim
- `60–80%` → yellow
- `> 80%` → red

### Active column spec (replaces current)

```typescript
// Updated active column computation — no spinner, no progress bar
const task = 10;
const agent = 12;
const elapsed = 7;
const heat = 1;    // replaces spinner
const tool = compact ? 0 : 10;  // replaces progress bar — show current tool name
const phase = 10;
const used = 2 + task + 2 + agent + 2 + elapsed + 1 + heat + 1 +
  (tool ? (tool + 2) : 0) + phase + 2;
// No progress column at all
```

### Detail context line replacement

Replace the `[###----]` progress bar in detail header (line 3) with elapsed time + heat:
```
 task-auth-1 · codex · implement · 2m 03s ▍
```
No bar. Just facts.

---

<a id="change-2"></a>
## Change 2: `/` Search Filter for Board

### Research Reference
- Research §Tier1: "Zero filtering. 50 tasks = scroll through all 50. No `:` command mode, no `/` search."
- Research §Tier2 k9s: "`:pod app=auth` jumps to filtered view"
- Research §Synthesis #2: "Unusable at 50+ tasks without filtering. Every TUI tool has this."

### New State Fields

```typescript
// Add to DashboardState interface
boardFilter: string;        // current filter text, '' = no filter
boardFilterActive: boolean; // true when user is typing in filter input
```

### New UI Element

A 1-line filter input that appears at the top of the board area when activated:

```
 /auth█                                          2/14 matching
```

When filter is empty and inactive, this line is NOT shown — the board uses the full space.

### Interaction Model

| Key | Context | Action |
|-----|---------|--------|
| `/` | Overview mode, board focused, filter not active | Activate filter input. Show filter line. Cursor at end. |
| any printable char | Filter active | Append to filter string. Re-filter board rows. |
| `Backspace` | Filter active | Delete last char. If filter empty, deactivate. |
| `Escape` | Filter active | Clear filter, deactivate, show all rows. |
| `Enter` | Filter active | Deactivate input (keep filter applied). Return to normal board navigation. |
| `Escape` | Filter inactive, filter non-empty | Clear filter, show all rows. |

### Filter Logic

Match against: `task.id`, `task.title`, `task.contract?.status`, `task.assignee`. Case-insensitive substring match. All fields tested — match any.

```typescript
function filterBoardRows(rows: TaskDocument[], filter: string): TaskDocument[] {
  if (!filter) return rows;
  const lower = filter.toLowerCase();
  return rows.filter(doc => {
    const id = doc.task.id.toLowerCase();
    const title = doc.task.title.toLowerCase();
    const status = (doc.task.contract?.status ?? '').toLowerCase();
    const assignee = (doc.task.assignee ?? '').toLowerCase();
    return id.includes(lower) || title.includes(lower) ||
           status.includes(lower) || assignee.includes(lower);
  });
}
```

### Visual Treatment

- Filter line: ` /` prefix (bold cyan), filter text (white), cursor indicator (block `█`), right-aligned `N/M matching` (dim)
- When filter is active, board header row shows matching count
- Filtered-out rows are simply not rendered (not dimmed — that's too busy)
- Selection index resets to 0 when filter changes

### Where to Integrate

**buildBoard()** — Apply `filterBoardRows()` after `sortedBoardRows()`. Prepend filter line if `boardFilterActive || boardFilter !== ''`.

**Input handler** — Add `/` key handler in overview+board context. When `boardFilterActive`, intercept all printable keys before normal keybinding processing.

---

<a id="change-3"></a>
## Change 3: Enter Drills Down from Anywhere

### Research Reference
- Research §Tier1: "Enter on board → switches focus to active, doesn't drill into task. Unintuitive 2-step drill-down."
- Research §Synthesis #3: "Every user's instinct. Currently requires knowing Tab → arrow → Enter sequence."

### What to DELETE

**Current Enter-on-board behavior** (lines 1171–1175):
```typescript
} else if (key.name === 'enter' || key.name === 'return') {
  // §3.3 — Enter on board: if active jobs exist, switch to active and enter detail
  if (jobs.length > 0) {
    state.overviewFocus = 'active';
    enterDetail();
  }
  return;
}
```

### What to REPLACE

**New Enter-on-board behavior:**
```typescript
} else if (key.name === 'enter' || key.name === 'return') {
  if (boardRows.length === 0) return;
  const selectedDoc = filteredRows[state.selectedBoardIndex];
  if (!selectedDoc) return;

  // Find active job for this task
  const matchingJob = jobs.find(j => j.taskId === selectedDoc.task.id);
  if (matchingJob) {
    // Direct drill-down to this specific job's detail view
    state.detailJobId = matchingJob.id;
    state.detailOutputBuffer = '';
    state.detailToolLog = [];
    state.detailToolStarts.clear();
    state.detailFocus = 'output';
    state.detailOutputStickyBottom = true;
    state.detailToolsStickyBottom = true;
    state.viewMode = 'detail';
    refreshDetailOnly();
  } else {
    // No active job — show task summary (contract, deliverables, status)
    // For now: enter detail view with static task info
    enterTaskSummary(selectedDoc);
  }
  return;
}
```

### New Function: `enterTaskSummary(doc: TaskDocument)`

When Enter is pressed on a board task with no active job, show a read-only summary in the detail view:

```typescript
function enterTaskSummary(doc: TaskDocument): void {
  state.detailJobId = doc.task.id; // use task ID, not job ID
  const contract = doc.task.contract;
  const lines: string[] = [
    `# ${doc.task.id}: ${doc.task.title}`,
    '',
    `**Status**: ${contract?.status ?? 'unknown'}`,
    `**Assignee**: ${doc.task.assignee ?? '-'}`,
    `**Column**: ${doc.task.column ?? '-'}`,
    '',
  ];
  if (contract?.description) {
    lines.push('## Description', '', contract.description, '');
  }
  if (contract?.deliverables?.length) {
    lines.push('## Deliverables', '');
    for (const d of contract.deliverables) {
      const check = d.type === 'file' ? '📄' : d.type === 'command' ? '⚙️' : '·';
      lines.push(`${check} \`${d.path ?? d.command ?? '?'}\``);
    }
    lines.push('');
  }
  if (contract?.constraints?.length) {
    lines.push('## Constraints', '');
    for (const c of contract.constraints) {
      lines.push(`- ${c}`);
    }
  }
  state.detailOutputBuffer = lines.join('\n');
  state.detailToolLog = [];
  state.detailToolStarts.clear();
  state.detailFocus = 'output';
  state.viewMode = 'detail';
  refreshDetailOnly();
}
```

### Key Principle

Enter always drills deeper. Esc always goes back. This is the universal TUI navigation contract.

- Board row has active job → Enter → Detail view (streaming output + tools)
- Board row has no active job → Enter → Task summary (contract/deliverables)
- Active row → Enter → Detail view (same as current)
- Detail view → Esc → Back to overview

---

<a id="change-4"></a>
## Change 4: Event Severity Filtering

### Research Reference
- Research §Tier1: "Log shows every action including routine advances. No severity filtering."
- Research §Tier3 Pattern 3: "Error/warning/info severity levels with `1`/`2`/`3` toggle."
- Research §Synthesis #4: "Log is noise. Users only care about failures, retries, escalations."

### New State Fields

```typescript
// Add to DashboardState
logSeverityFilter: 1 | 2 | 3;  // 1=errors only, 2=errors+warnings, 3=all (default: 2)
```

### Severity Classification

```typescript
type LogSeverity = 'error' | 'warning' | 'info';

function actionSeverity(action: TickAction): LogSeverity {
  switch (action.type) {
    case 'fail':
    case 'escalate':
      return 'error';
    case 'retry':
    case 'stale':
      return 'warning';
    case 'dispatch':
    case 'advance':
    case 'auto_complete':
    case 'validation':
    default:
      return 'info';
  }
}
```

### LoggedAction Extension

```typescript
interface LoggedAction {
  timestamp: number;
  action: TickAction;
  severity: LogSeverity;  // NEW — computed at push time
}
```

Set severity when pushing to `state.logs`:
```typescript
state.logs.push({ timestamp: report.timestamp, action, severity: actionSeverity(action) });
```

### Visual Treatment

Each log line gets a severity prefix:

```
 !! 14:23:01  fail           task-auth-1   ERROR: npm test exit 1
  ! 14:23:05  retry          task-api-3    attempt 2
  · 14:23:08  dispatch       task-db-5     agent=codex
```

- `!!` = error → red, always visible
- ` !` = warning → yellow
- ` ·` = info → dim

### Filter Keybindings

| Key | Action |
|-----|--------|
| `1` | Log filter = errors only. Show `(errors only)` in log area header. |
| `2` | Log filter = errors + warnings. Show `(errors+warnings)` in header. |
| `3` | Log filter = all events (default). No indicator. |

These keys work in overview mode regardless of panel focus (they're not navigational — they're filter toggles).

### Hidden Event Indicator

When filter hides events, show count at bottom of log:
```
 ⋯ 23 info events hidden (press 3 to show all)
```
This is a dim line appended to the log output.

### Where to Integrate

**buildLog()** — Filter `state.logs` by severity before rendering. Add prefix indicators.

**Input handler** — Add `1`/`2`/`3` handlers in overview mode (both board and active focus).

---

<a id="change-5"></a>
## Change 5: Context-Sensitive Footer

### Research Reference
- Research §Tier1: "Footer shows bindings but they're static text, not contextual."
- Research §Tier2 lazygit: "Focused item determines available keybindings, shown in footer."
- Research §Synthesis #5: "lazygit's best UX pattern. Teaches users through progressive disclosure."

### What to DELETE

**Static footer strings** (lines 1017, 1044):
```typescript
footerText.content = t`${dim(' ↑↓ select · enter detail · p pause · d dry-run · q quit')}`;
// ...
footerText.content = t`${dim(' esc back · ↑↓ scroll output · p pause · q quit')}`;
```

### What to REPLACE

**New function: `buildFooter()`**

```typescript
function buildFooter(): StyledText {
  const parts: string[] = [];

  if (state.viewMode === 'overview') {
    if (state.boardFilterActive) {
      // Filter input mode
      parts.push('enter apply', 'esc clear', 'type to filter');
    } else if (state.overviewFocus === 'board') {
      parts.push('↑↓ navigate', 'enter drill-down', '/ filter', 'tab → active');
      parts.push('1-3 log filter');
      parts.push('p pause', 'q quit');
    } else if (state.overviewFocus === 'active') {
      parts.push('↑↓ navigate', 'enter detail', 'tab → board');
      parts.push('p pause', 'q quit');
    }
  } else if (state.viewMode === 'detail') {
    if (state.detailFocus === 'output') {
      parts.push('↑↓ scroll', 'g/G top/bottom', 'tab → tools', 'esc back');
    } else {
      parts.push('↑↓ scroll', 'g/G top/bottom', 'tab → output', 'esc back');
    }
  }

  parts.push('? help');
  return t`${dim(` ${parts.join(' · ')}`)}`;
}
```

### Key Principle

The footer should **teach** the user what they can do right now. Never show all keybindings — only the ones relevant to the current context. The `?` help key is always shown as an escape hatch to the full reference.

Maximum 6–7 items in the footer. If it would overflow the terminal width, truncate from the right (keeping `? help` and `q quit`).

---

<a id="change-6"></a>
## Change 6: Rich Detail View Header

### Research Reference
- Research §Tier1: "Decision reasoning hidden — users can't debug pipeline decisions."
- Research §Tier3 Pattern 5: "Summary stats at top (phase, files, tools count) give instant context before diving into raw output."
- Research §Synthesis #6: "Users need context before diving into raw output."

### What to DELETE

**Current detail context line** — the single line 3 in header that shows `task-id · agent · phase · elapsed [###----]` (lines 739–755, `buildDetailContextLine()`). This function is replaced entirely.

### What to REPLACE

**Replace header line 3 with a 2-line detail context block**, stealing 1 line from the output panel:

The header grows from 3 lines to 4 lines when in detail view. Alternatively, line 2 (counters) can be repurposed in detail view since the user doesn't need board counters while looking at a specific task.

**Approach: Repurpose header lines 2 and 3 in detail view:**

```
 brainfile supervisor                                            DRY-RUN
 task-auth-1 · codex · implement · 2m 03s ▍
 tools: 14 (bash:6 edit:4 read:3 write:1) · current: edit supervisor.ts
```

Line 2 becomes: task identity + agent + phase + elapsed + heat
Line 3 becomes: tool call summary + current tool with target

### Implementation

```typescript
function buildDetailContextLines(job: Job): [StyledText, StyledText] {
  const elapsedMs = job.dispatchedAt ? Date.now() - job.dispatchedAt : 0;
  const tasksById = new Map(state.boardDocs.map(d => [d.task.id, d]));
  const phase = derivePhase(job, tasksById);
  const heat = activityHeat(getLastToolAt(job.id), Date.now());

  const line2 = t` ${bold(job.taskId)} · ${job.agent?.name ?? '-'} · ${phase} · ${formatElapsedCompact(elapsedMs)} ${heat}`;

  // Tool call summary from detailToolLog
  const toolCounts = new Map<string, number>();
  for (const entry of state.detailToolLog) {
    toolCounts.set(entry.tool, (toolCounts.get(entry.tool) ?? 0) + 1);
  }
  const total = state.detailToolLog.length;
  const breakdown = [...toolCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => `${name}:${count}`)
    .join(' ');

  const currentTool = state.detailToolLog.find(e => e.durationMs === undefined);
  const currentStr = currentTool
    ? `current: ${currentTool.tool} ${truncate(currentTool.target, 30)}`
    : '';

  const toolSummary = total > 0
    ? `tools: ${total} (${breakdown})`
    : 'tools: 0';

  const line3Parts = [toolSummary];
  if (currentStr) line3Parts.push(currentStr);

  const line3 = t` ${dim(line3Parts.join(' · '))}`;
  return [line2, line3];
}
```

### Modify `buildHeader()` to branch on view mode:

```typescript
function buildHeader(activeSlots: number): StyledText {
  // Line 1: always the same (title + badges)
  // ...existing line 1 code...

  if (state.viewMode === 'detail' && state.detailJobId) {
    const jobs = getDispatchedJobs(supervisor);
    const job = jobs.find(j => j.id === state.detailJobId || j.taskId === state.detailJobId);
    if (job) {
      const [line2, line3] = buildDetailContextLines(job);
      return joinLines([line1, line2, line3]);
    }
    // Job completed — show completion message
    return joinLines([line1, t` ${dim('job completed')}`, t``]);
  }

  // Overview mode: lines 2+3 stay as current (counters + uptime)
  // ...existing line 2, line 3 code...
}
```

---

<a id="change-7"></a>
## Change 7: Status Icons Instead of Strings

### Research Reference
- Research §Tier1: "Status uses 11-char enum strings ('in_progress') instead of 1-char icons."
- Research §Synthesis #7: "Saves ~9 chars per row. Instantly scannable. Board table gains space for titles."

### New Utility Function

```typescript
function statusIcon(status: string): TextChunk {
  switch (status) {
    case 'ready':       return dim('○');       // open circle
    case 'in_progress': return cyan('◉');      // filled circle, cyan
    case 'delivered':   return green('◉');     // filled circle, green
    case 'done':        return green('✓');      // checkmark
    case 'failed':      return red('✗');        // x mark
    case 'blocked':     return yellow('⊘');    // blocked symbol
    default:            return dim('?');
  }
}
```

### Column Width Change

The `status` column changes from 11 chars to 2 chars (icon + space). This frees **9 characters** per row for the title column.

**Updated board column computation:**
```typescript
if (compact) {
  // 80-wide: id(10) + 3sp + title(flex) + 2sp + status(2)
  const id = 10;
  const status = 2;  // was 11
  const used = id + 3 + status + 2;
  const title = Math.max(8, bw - used);
  state.columns.board = { compact: true, id, title, status, assignee: 0, age: 0 };
} else {
  // 120-wide: id(12) + 3sp + title(flex) + 2sp + status(2) + 3sp + assignee(12) + 3sp + age(6)
  const id = 12, status = 2, assignee = 12, age = 6;  // status was 11
  const used = id + 3 + status + 2 + assignee + 3 + age + 3;
  const title = Math.max(10, bw - used);
  state.columns.board = { compact: false, id, title, status, assignee, age };
}
```

### Board Row Update

In `buildBoard()`, replace `pad(truncate(status, c.status), c.status)` with the icon:

```typescript
// Before (current)
const body = `${pad(truncate(doc.task.id, c.id), c.id)}   ${pad(truncate(status, c.status), c.status)}   ...`;

// After
// The status icon is rendered separately as a TextChunk for color
// The row string uses a placeholder approach, or build with StyledText directly
```

Since status icons are colored TextChunks, the row building needs to use `t` template literals instead of plain strings for the status portion. This means each row becomes a StyledText composition:

```typescript
const idStr = pad(truncate(doc.task.id, c.id), c.id);
const titleStr = pad(truncate(doc.task.title, c.title), c.title);
const icon = statusIcon(status);
const assigneeStr = c.compact ? '' : `   ${pad(truncate(doc.task.assignee ?? '-', c.assignee), c.assignee)}`;
const ageStr = c.compact ? '' : `   ${pad(formatAge(doc.task.createdAt ?? doc.task.updatedAt, now), c.age)}`;

if (isSelected) {
  lines.push(t`${cyan(bold(`▸ ${idStr}   ${titleStr}`))}  ${icon}${assigneeStr}${ageStr}`);
} else {
  lines.push(t`  ${idStr}   ${titleStr}  ${icon}${dim(`${assigneeStr}${ageStr}`)}`);
}
```

### Impact on `styleBoardRow()`

The `styleBoardRow()` function (lines 278–285) can be simplified or removed. The status color is now carried by the icon, not the entire row. Unselected rows use default text color with dim metadata. This makes the board much more scannable — the status icon pops as a colored dot in a sea of neutral text.

---

<a id="change-8"></a>
## Change 8: Log Truncation Indicator

### Research Reference
- Research §Tier1: "Buffer cap at 120 silently discards with no indicator."
- Research §Synthesis #8: "Users must know history is truncated. Silent data loss destroys trust."

### New State Field

```typescript
// Add to DashboardState
logTruncatedCount: number;  // how many events have been dropped, 0 = none
```

### Track Truncation

In `onTick`, when capping the buffer:
```typescript
if (state.logs.length > MAX_LOG_BUFFER) {
  const overflow = state.logs.length - MAX_LOG_BUFFER;
  state.logTruncatedCount += overflow;
  state.logs = state.logs.slice(overflow);
}
```

### Visual Treatment

In `buildLog()`, if `state.logTruncatedCount > 0`, prepend a dim indicator line:
```typescript
if (state.logTruncatedCount > 0) {
  lines.unshift(t`${dim(` ⋯ ${state.logTruncatedCount} older events truncated`)}`);
}
```

This line appears at the top of the log scroll area. It scrolls away as new events push it up, but if the user scrolls to the top, they see it.

### Minimal Code Change

This is approximately 5 lines of new code. No deletions required.

---

<a id="mockups"></a>
## Before/After ASCII Mockups

### Current TUI at 80×24 (BEFORE)

```
 brainfile supervisor                                            DRY-RUN·····
 3 ready · 2 in_progress · 1 delivered · 0 blocked · 1 failed   2/3 slots···
 last tick 14:23:01 · 10s interval · uptime 5m 30s··························
 id          title                          status·····                     ·
▸ task-auth  Implement auth module          in_progress                     ·
  task-api   Build API endpoints            in_progress                     ·
  task-db    Database migrations            ready······                     ·
  task-ui    Frontend dashboard             ready······                     ·
  task-test  Integration tests              ready······                     ·
  task-dep   Deploy pipeline                delivered··                     ·
  task-sec   Security audit                 failed·····                     ·
·                                                                           ·
·                                                                           ·
·                                                                           ·
┌ Active ──────────────────────────────────────────────────────────────────┐··
│▸ task-auth  codex       2m 03s  [########----]  implement               │··
│  task-api   claude      0m 12s  [#-----------]  implement               │··
└──────────────────────────────────────────────────────────────────────────┘··
 14:22:45  dispatch       task-auth-1   agent=codex·························
 14:22:50  dispatch       task-api-3    agent=claude························
 14:23:01  advance        task-dep-1    delivered -> done···················
 14:23:01  fail           task-sec-1    ERROR: npm test exit 1··············
·                                                                           ·
 ↑↓ select · enter detail · p pause · d dry-run · q quit···················
```

### Redesigned TUI at 80×24 (AFTER)

```
 brainfile supervisor                                            DRY-RUN·····
 3 ready · 2 active · 1 delivered · 0 blocked · 1 failed        2/3 slots···
 last tick 14:23:01 · 10s interval · uptime 5m 30s··························
 /auth█                                                   2/7 matching·····
 id          title                                         ··               ·
▸ task-auth  Implement auth module                         ◉·               ·
  task-api   Build API endpoints                           ◉·               ·
·                                                                           ·
·                                                                           ·
·                                                                           ·
·                                                                           ·
·                                                                           ·
·                                                                           ·
┌ Active ──────────────────────────────────────────────────────────────────┐··
│▸ task-auth  codex       2m 03s ▍ edit       implement                   │··
│  task-api   claude      0m 12s ▎ bash       implement                   │··
└──────────────────────────────────────────────────────────────────────────┘··
 !! 14:23:01  fail           task-sec-1    ERROR: npm test exit 1···········
  · 14:23:01  advance        task-dep-1    delivered -> done················
 ⋯ 2 info events hidden (press 3 to show all)······························
 ↑↓ navigate · enter drill-down · / filter · tab → active · 1-3 log · ? ··
```

**Key differences visible:**
1. Status icons (`◉ ◉`) instead of 11-char strings → title column expanded by ~9 chars
2. Filter bar active (`/auth█`) with match count (`2/7 matching`)
3. Activity heat (`▍ ▎`) + current tool name instead of `[########----]` progress bars
4. Log shows severity prefixes (`!!` for error, `·` for info)
5. Truncation indicator at bottom of log
6. Footer is context-sensitive (shows filter-relevant bindings)

### Current TUI at 120×40 (BEFORE)

```
 brainfile supervisor                                                                                    DRY-RUN·····
 3 ready · 2 in_progress · 1 delivered · 0 blocked · 1 failed                                           2/3 slots···
 last tick 14:23:01 · 10s interval · uptime 5m 30s··············································································
 id            title                                         status        assignee        age···                           ·
▸ task-auth-1  Implement auth module                         in_progress   implement       2m·····                          ·
  task-api-3   Build API endpoints                           in_progress   implement       1m·····                          ·
  task-db-5    Database schema migrations                    ready         implement       15m····                           ·
  task-ui-2    Frontend dashboard components                 ready         implement       12m····                           ·
  task-test-1  Integration test suite                        ready         review          10m····                           ·
  task-dep-4   Deploy pipeline configuration                 delivered     implement       25m····                           ·
  task-sec-7   Security audit and hardening                  failed        review          30m····                           ·
·                                                                                                                           ·
·                                                                                                                           ·
·                                                                                                                           ·
·                                                                                                                           ·
·                                                                                                                           ·
·                                                                                                                           ·
·                                                                                                                           ·
·                                                                                                                           ·
·                                                                                                                           ·
·                                                                                                                           ·
·                                                                                                                           ·
·                                                                                                                           ·
·                                                                                                                           ·
·                                                                                                                           ·
·                                                                                                                           ·
┌ Active ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐··
│▸ task-auth  codex       2m 03s  ⠹ edit     [########----]  implement                                                   │··
│  task-api   claude      0m 12s  ⠋ bash     [#-----------]  implement                                                   │··
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘··
 14:22:30  dispatch       task-auth-1   agent=codex·····································································
 14:22:35  dispatch       task-api-3    agent=claude····································································
 14:22:50  advance        task-dep-4    in_progress -> delivered························································
 14:23:01  advance        task-dep-4    delivered -> done································································
 14:23:01  fail           task-sec-7    ERROR: npm test exit 1··························································
 14:23:01  retry          task-sec-7    attempt 2·······································································
·                                                                                                                        ·
·                                                                                                                        ·
·                                                                                                                        ·
 ↑↓ select · enter detail · p pause · d dry-run · q quit···································································
```

### Redesigned TUI at 120×40 (AFTER)

```
 brainfile supervisor                                                                                    DRY-RUN·····
 3 ready · 2 active · 1 delivered · 0 blocked · 1 failed                                                2/3 slots···
 last tick 14:23:01 · 10s interval · uptime 5m 30s··············································································
 id            title                                                  ··  assignee        age···                            ·
▸ task-auth-1  Implement auth module                                  ◉   implement       2m·····                           ·
  task-api-3   Build API endpoints                                    ◉   implement       1m·····                           ·
  task-db-5    Database schema migrations                             ○   implement       15m····                           ·
  task-ui-2    Frontend dashboard components                          ○   implement       12m····                           ·
  task-test-1  Integration test suite                                 ○   review          10m····                           ·
  task-dep-4   Deploy pipeline configuration                          ✓   implement       25m····                           ·
  task-sec-7   Security audit and hardening                           ✗   review          30m····                           ·
·                                                                                                                           ·
·                                                                                                                           ·
·                                                                                                                           ·
·                                                                                                                           ·
·                                                                                                                           ·
·                                                                                                                           ·
·                                                                                                                           ·
·                                                                                                                           ·
·                                                                                                                           ·
·                                                                                                                           ·
·                                                                                                                           ·
·                                                                                                                           ·
·                                                                                                                           ·
·                                                                                                                           ·
·                                                                                                                           ·
┌ Active ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐··
│▸ task-auth  codex       2m 03s ▍ edit       implement                                                                  │··
│  task-api   claude      0m 12s ▎ bash       implement                                                                  │··
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘··
 !! 14:23:01  fail           task-sec-7    ERROR: npm test exit 1···················································
  ! 14:23:01  retry          task-sec-7    attempt 2····································································
  · 14:23:01  advance        task-dep-4    delivered -> done····························································
  · 14:22:50  advance        task-dep-4    in_progress -> delivered·····················································
  · 14:22:35  dispatch       task-api-3    agent=claude·································································
  · 14:22:30  dispatch       task-auth-1   agent=codex··································································
·                                                                                                                        ·
 ⋯ 12 older events truncated···················································································
·                                                                                                                        ·
 ↑↓ navigate · enter drill-down · / filter · tab → active · 1-3 log filter · p pause · ? help · q quit····················
```

**Key differences at 120-wide:**
1. Title column gained ~9 chars from status icon change (compare title lengths)
2. Status column: icons with color (`◉ ○ ✓ ✗`) scan instantly vs text strings
3. Active panel: clean `heat + tool` replaces `spinner + progress bar`
4. Log: severity prefixes (`!!`, `!`, `·`) with errors sorted to top visually
5. Truncation indicator visible at log top
6. Footer: context-sensitive, includes new bindings (`/`, `1-3`)

### Detail View at 80×24 (AFTER)

```
 brainfile supervisor                                            DRY-RUN·····
 task-auth-1 · codex · implement · 2m 03s ▍·································
 tools: 14 (bash:6 edit:4 read:3 write:1) · current: edit supervisor.ts····
┌ Output ──────────────────────────────────────────────────────────────────┐··
│                                                                          │··
│  I'll implement the auth module by first reading the existing            │··
│  configuration...                                                        │··
│                                                                          │··
│  ```typescript                                                           │··
│  import { verify } from 'jsonwebtoken';                                  │··
│  ```                                                                     │··
│                                                                          │··
│  Now let me update the middleware...                                      │··
│                                                                          │··
│                                                                          │··
│                                                                          │··
│                                                                          │··
│                                                                          │··
┌ Tools ───────────────────────────────────────────────────────────────────┐··
│  edit          supervisor.ts:71-83               1200ms                  │··
│  bash          npm run build                     3100ms                  │··
│  read          tick.ts                           100ms                   │··
└──────────────────────────────────────────────────────────────────────────┘··
 ↑↓ scroll · g/G top/bottom · tab → tools · esc back · ? help·············
```

**Key differences from current detail view:**
1. Header line 2: task identity + agent + phase + elapsed + heat (was counters)
2. Header line 3: tool summary with breakdown + current tool (was generic uptime)
3. No `[###----]` progress bar anywhere
4. Footer: context-sensitive (output-focused bindings)

---

<a id="interaction-model"></a>
## Interaction Model Summary

### New Keybindings

| Key | Context | Action |
|-----|---------|--------|
| `/` | Overview, board focused | Activate board filter input |
| `1` | Overview (any focus) | Set log filter to errors only |
| `2` | Overview (any focus) | Set log filter to errors + warnings |
| `3` | Overview (any focus) | Set log filter to all events |
| `Enter` | Overview, board focused, task has active job | Direct drill-down to that job's detail view |
| `Enter` | Overview, board focused, task has no active job | Show task summary (contract/deliverables) |

### Changed Keybindings

| Key | Old Behavior | New Behavior |
|-----|-------------|-------------|
| `Enter` (on board) | Switch focus to active panel | Drill down to task detail / summary |

### Removed Features

| Feature | Why |
|---------|-----|
| Token spinner animation | Zero information value (research §Tier1) |
| Timeout progress bar | Misleading — shows timeout %, not actual progress (research §Tier1) |
| Full-row status coloring | Replaced by status icon — less visual noise |

### Preserved Keybindings (no change)

`↑/k`, `↓/j`, `g`, `G`, `^d`, `^u` — all navigation
`Tab` / `Shift+Tab` — panel focus switching
`Esc` — back / dismiss
`p` — pause toggle
`d` — dry-run toggle
`?` — help overlay
`q` / `^c` — quit

---

<a id="implementation-sequence"></a>
## Implementation Sequence

Order matters. Dependencies flow downward.

### Phase 1: Foundation (no visual changes yet)
1. Add `LogSeverity` type and `actionSeverity()` function
2. Add `boardFilter`, `boardFilterActive`, `logSeverityFilter`, `logTruncatedCount` to state
3. Add `activityHeat()` utility function
4. Add `statusIcon()` utility function
5. Add `filterBoardRows()` utility function

### Phase 2: Delete Old, Add New (board + active panels)
6. **Delete** `SpinnerState` interface, `SPINNER_FRAMES`, `SPINNER_IDLE_MS`, `spinnerState` map
7. **Delete** spinner computation in `buildActive()` (lines 845–853)
8. **Delete** progress bar construction in `buildActive()` (lines 858–861)
9. **Replace** active row rendering with heat + tool layout
10. **Replace** board column widths (status: 11 → 2)
11. **Replace** board row rendering to use `statusIcon()` + wider title
12. **Simplify** `styleBoardRow()` — rows are no longer full-row colored

### Phase 3: New Features (filter, severity, footer)
13. **Add** `/` search filter input mode + keybindings
14. **Add** filter rendering in `buildBoard()`
15. **Add** severity filtering in `buildLog()` with `!!`/`!`/`·` prefixes
16. **Add** `1`/`2`/`3` keybindings for log severity
17. **Add** truncation indicator in `buildLog()`
18. **Replace** static footer with `buildFooter()`

### Phase 4: Navigation + Detail (Enter behavior, detail header)
19. **Replace** Enter-on-board handler with direct drill-down
20. **Add** `enterTaskSummary()` function
21. **Replace** `buildDetailContextLine()` with `buildDetailContextLines()`
22. **Update** `buildHeader()` to use detail-specific lines 2+3

### Phase 5: Polish
23. Update help overlay to document new keybindings (`/`, `1-3`)
24. Test at 80×24 and 120×40
25. Test edge cases: 0 tasks, 0 active jobs, filter with no matches, all events filtered

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Filter matches 0 tasks | Show `(no matching tasks)` in board area. Footer shows `esc clear filter`. |
| Enter on board with 0 tasks | No-op. |
| Detail view, job completes | Keep showing last output. Append `--- job completed (done) ---`. Heat shows `·`. |
| Log has only info events, filter=2 | Show `(no errors or warnings)` + `⋯ N info events hidden (press 3 to show all)`. |
| Terminal at 60×16 | Hide log panel entirely. Board + Active only. Footer shows `(log hidden — expand terminal)`. |
| Terminal at 40×12 | Show "too small" overlay (existing behavior, unchanged). |
| Unicode icon rendering issues | Fallback: `○ → o`, `◉ → *`, `✓ → +`, `✗ → x`, `⊘ → !`. Detect via env var `BRAINFILE_ASCII=1`. |

---

## Summary of Lines to Touch

| Lines (approx) | Action | What |
|----------------|--------|------|
| 76–78 | DELETE | `SPINNER_FRAMES`, `SPINNER_IDLE_MS` constants |
| 100–104 | DELETE | `SpinnerState` interface |
| 108–127 | MODIFY | `ColumnCache.active` — remove `spinner`, `progress` fields |
| 132–155 | MODIFY | `DashboardState` — add filter, severity, truncation fields |
| 278–285 | MODIFY | `styleBoardRow()` — simplify or remove |
| 508 | DELETE | `spinnerState` map |
| 657–695 | MODIFY | `computeColumns()` — new board/active column widths |
| 719–755 | MODIFY | `buildHeader()` — branch on view mode, detail context lines |
| 757–807 | MODIFY | `buildBoard()` — status icons, filter, filter line |
| 810–893 | MODIFY | `buildActive()` — heat + tool replaces spinner + bar |
| 901–920 | MODIFY | `buildLog()` — severity prefixes, filtering, truncation |
| 965–991 | MODIFY | `buildHelp()` — add new keybindings to reference |
| 1017 | MODIFY | Footer in overview → `buildFooter()` |
| 1044 | MODIFY | Footer in detail → `buildFooter()` |
| 1077–1099 | MODIFY | Input handler — add `/` filter mode |
| 1100–1180 | MODIFY | Board navigation — new Enter behavior |
| 1171–1175 | REPLACE | Enter-on-board → direct drill-down |

**Total new code**: ~150 lines
**Total deleted code**: ~60 lines
**Total modified code**: ~200 lines
**Net change**: +90 lines (from 1291 to ~1381)
