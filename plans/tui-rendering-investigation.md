# TUI Rendering Investigation Report (task-134)

Date: 2026-03-03

## Scope and Method

Files reviewed (full read): all files under `cli/src/tui/` plus `cli/src/commands/tui.tsx`, `cli/src/tui/actions.ts`, `cli/src/lib/dispatchRegistry.ts`, and `cli/src/lib/dispatchRunner.ts`.

Runtime profiling performed:
- Instrumented Ink runtime with component render counters and `process.stdout.write` counters.
- Measured idle redraw behavior per panel (tasks, rules, logs, agents).
- Measured dispatch-log read frequency/time.
- Measured chokidar event behavior with the exact watcher options in `useBrainfileLoader`.
- Compared tmux behavior with and without alternate-screen mode.
- Triggered editor flow (`N`) with `EDITOR=true` to test direct `process.stdout.write` escape sequences.

## Render Cycle Profile (Measured)

Measured redraw cadence (steady state):

- Tasks panel idle: ~0 redraws/sec after initial paint.
- Rules panel idle: ~0 redraws/sec after initial paint.
- Logs panel idle: ~0 redraws/sec after initial paint.
- Agents panel with 1 running dispatch: typically 1-2 redraws/sec, with periodic spikes to 3-4 redraws/sec.

Evidence:
- Agents redraw loop from local tick: `cli/src/tui/components/AgentsPanel.tsx:102-108`.
- Additional poll-driven redraws in agent detail: `cli/src/tui/components/AgentDetail.tsx:183-209`.
- Session history burst updates every 15s: `cli/src/tui/components/AgentsPanel.tsx:115-155`.

Observed profiler windows:
- Repeated seconds with `render.agents=2` and `writes=1-2` (1Hz tick + 2s detail poll overlap).
- 15s boundaries showed spikes like `render.agents=6-8` and larger full-screen output bytes.

## Findings by Severity

### Critical

1. Agents panel causes continuous full-screen redraw churn while a dispatch is running.
- Location: `cli/src/tui/components/AgentsPanel.tsx:102-108`, `cli/src/tui/components/AgentsPanel.tsx:230`
- Why: `setTick` fires every second; elapsed time is recomputed during render (`computeElapsed`), forcing frequent panel re-renders.
- Impact: sustained flicker, especially visible in title/header area because Ink repaints the screen for updates.
- Recommended fix:
  - Remove 1Hz local tick and use coarser cadence (e.g. 3-5s) or derive elapsed from existing dispatch poll.
  - Optionally render elapsed only for selected row or gate update frequency by viewport focus.

### High

2. Agent detail polling adds frequent synchronous log reads and redraws.
- Location: `cli/src/tui/components/AgentDetail.tsx:183-209`
- Why: 2s interval reads full dispatch log and updates state.
- Additional issue: snapshot guard is too coarse (`eventCount`, `contractStatus`, `toolTotal`, `contextPct`) and can miss content changes with same count.
- Location (coarse guard): `cli/src/tui/components/AgentDetail.tsx:193-196`
- Impact: extra redraw pressure + potential stale detail content.
- Recommended fix:
  - Fingerprint last event `(ts,type,toolCallId,status,text hash)` instead of length/tool count.
  - Move to append-aware tailing (cursor/offset) instead of full-file reparse.

3. Session history poller causes periodic redraw spikes and expensive work.
- Location: `cli/src/tui/components/AgentsPanel.tsx:115-155`
- Why: every 15s it calls `listAgentSessions` and then potentially `readDispatchLog` per session.
- Related expensive path: `cli/src/lib/dispatchRunner.ts:903-971` and metadata scan `cli/src/lib/dispatchRunner.ts:726-737`.
- Measured: `listAgentSessions` ~5.2s per call in this workspace (5 runs avg ~5220ms), then state updates trigger UI bursts.
- Impact: periodic visible churn and slow refresh responsiveness.
- Recommended fix:
  - Cache session metadata and only refresh incrementally.
  - Add equality guard before `setSessions` / `setSessionStopReasons`.
  - Increase interval or make history refresh manual/background with stale-while-revalidate.

4. `readDispatchLog` does full-file read/parse even when only last N events are requested.
- Location: `cli/src/lib/dispatchRegistry.ts:296-310`
- Why: reads full file, parses all lines, then slices at the end.
- Measured: ~1.7-2.0ms per call for ~150KB logs; scales linearly with dispatch count.
- Impact: synchronous main-thread I/O/JSON parse in render-adjacent paths.
- Recommended fix:
  - Implement tail reader (seek/backward scan) for `last`.
  - Cache parsed offsets and only parse appended bytes.

5. Direct terminal writes in editor flows bypass Ink output coordination.
- Location: `cli/src/tui/actions.ts:737-738`, `cli/src/tui/actions.ts:893-894`
- Why: raw `process.stdout.write` escape codes are emitted directly.
- Measured: triggering `N` (`EDITOR=true`) produced raw escape churn and a redraw burst (`writes=5` in one second) plus clear-line artifacts.
- Impact: can desync cursor/paint expectations and amplify flicker around editor return.
- Recommended fix:
  - Avoid direct stdout escape writes in action handlers.
  - Prefer controlled unmount/remount around external editor or route through Ink-managed output lifecycle.

### Medium

6. Boundary navigation paths still allocate new state objects even when value is unchanged.
- Location examples: `cli/src/tui/hooks/useKeyboardNavigation.ts:626-633`, `cli/src/tui/hooks/useKeyboardNavigation.ts:641-648`, `cli/src/tui/hooks/useKeyboardNavigation.ts:960-971`
- Why: `Math.min/Math.max` can yield previous index, but code still returns `{...prev, ...}`.
- Impact: unnecessary rerenders under key-repeat at bounds.
- Recommended fix:
  - Guard each setter: if computed index equals current, return `prev`.

7. Agents panel refresh on entry is unconditional.
- Location: `cli/src/tui/BrainfileTUI.tsx:262-265`
- Why: initial `setState` writes `dispatches` without equality check.
- Impact: avoidable redraw when switching panels.
- Recommended fix:
  - Reuse fingerprint guard for initial load (same as interval path).

8. Agent log viewer change detection is length-only.
- Location: `cli/src/tui/components/AgentLogViewer.tsx:44-46`
- Why: if event content changes without length change, update is skipped.
- Impact: stale content risk (less about flicker, more correctness).
- Recommended fix:
  - Track last event signature (`ts+type+id`) instead of length only.

9. `collectDispatchStatuses` does synchronous log reads on dispatch-list changes.
- Location: `cli/src/tui/components/AgentsPanel.tsx:44-46`, `cli/src/tui/components/AgentsPanel.tsx:73-79`, `cli/src/tui/components/AgentsPanel.tsx:163-165`
- Measured: low with 1 dispatch now, but synthetic scaling to 40 reads took ~67ms.
- Impact: can block render on larger concurrent dispatch sets.
- Recommended fix:
  - Precompute status in poller, cache by `taskId/sessionId`, and pass pre-resolved status into render.

### Low

10. Resize listener sets dimensions without equality guard.
- Location: `cli/src/tui/BrainfileTUI.tsx:82-86`
- Why: every resize event writes state even if dimensions are unchanged.
- Impact: minor potential rerender noise during terminal resize storms.
- Recommended fix:
  - Compare old/new dimensions and return previous state when unchanged.

## Chokidar Watcher Validation

Code validated:
- Watch options: `cli/src/tui/hooks/useBrainfileLoader.ts:191-199`
- Event handlers: `cli/src/tui/hooks/useBrainfileLoader.ts:201-203`
- No `usePolling` flag present (good).

Probe results with logical operations (single write, rapid double write, atomic rename, config write):
- `awaitWriteFinish {stabilityThreshold:300,pollInterval:200}`: 4 `change` events for 4 logical operations.
- `awaitWriteFinish false`: also 4 `change` events for 4 logical operations.
- `awaitWriteFinish {stabilityThreshold:800,pollInterval:200}`: same event count, higher latency.

Conclusion:
- No spurious duplicate events reproduced with current watcher configuration.
- Increasing `stabilityThreshold` increases latency but did not reduce event count in this scenario.

## Alternate Screen Buffer and tmux

Implementation:
- Enter alt-screen: `cli/src/commands/tui.tsx:44`
- Exit alt-screen: `cli/src/commands/tui.tsx:51`

tmux verification:
- With alt-screen (`tui.tsx` path): tmux capture after exit contained only shell-context lines (`BEFORE_ALT`, `AFTER_ALT`), no persisted TUI frame.
- Without alt-screen (direct Ink render): tmux capture retained full TUI content in scrollback.

Conclusion:
- Alternate-screen behavior is functioning correctly in tmux for scrollback isolation.
- It does not reduce redraw frequency/flicker; redraw cadence is driven by component state updates (primarily agents panel timers/pollers).

## Ink Optimization Options Check

Using installed Ink docs (`ink@3.2.0`, local `cli/node_modules/ink/readme.md`):
- Available: `render(..., { patchConsole, debug })` (`readme.md:1617`, `readme.md:1628`).
- Available component: `<Static>` for immutable output (`readme.md:926-998`).
- No documented `maxFps` or `incrementalRendering` options in installed v3.2 docs.

Project status:
- No `React.memo` usage in `cli/src/tui/`.

Recommendation:
- Use `React.memo` for stable subtrees (especially agents detail/list rows).
- Consider `<Static>` for immutable history sections to reduce rerendered text volume.

## Verification of Recent Fixes

Verified as present and correct:
- `usePolling` removed from watcher: `cli/src/tui/hooks/useBrainfileLoader.ts:191-199`.
- Dispatch fingerprint guard in agents poller: `cli/src/tui/BrainfileTUI.tsx:251-273`.
- Guarded keep-in-bounds effect: `cli/src/tui/BrainfileTUI.tsx:169-178`.
- Guarded reload flash timeout clear: `cli/src/tui/hooks/useBrainfileLoader.ts:150`.
- Guarded update checks in `AgentDetail` and `AgentLogViewer`: `cli/src/tui/components/AgentDetail.tsx:193-196`, `cli/src/tui/components/AgentLogViewer.tsx:44-46`.
- Alternate-screen mode wired: `cli/src/commands/tui.tsx:44`, `cli/src/commands/tui.tsx:51`.

Sufficiency:
- These fixes reduce some redundant updates, but are not sufficient for agents-panel flicker because 1s/2s/15s pollers still drive frequent redraws.

## Direct Answers to Requested Investigation Points

1. Render cycle profile per panel:
- Tasks/rules/logs idle at ~0 redraws/sec.
- Agents with running dispatch: ~1-2 redraws/sec baseline, periodic spikes to ~3-4 redraws/sec.

2. Remaining `setState` without data change:
- Yes, notably boundary navigation setters and some agents panel updates without equality guards.

3. Chokidar spurious reloads without `usePolling`:
- Not reproduced in probe; event counts aligned with logical file operations.

4. Direct `process.stdout.write` corruption risk:
- Yes, reproduces terminal-control churn and redraw artifacts around editor return.

5. Alternate screen buffer correctness with Ink:
- Works for scrollback isolation; does not fix redraw-rate flicker.

6. React reconciliation/object reference churn:
- Limited in tasks/rules/logs (idle stable). Significant churn remains in agents panel due periodic state updates/new arrays/maps.

7. `collectDispatchStatuses` sync read blocking risk:
- Current impact small with few dispatches; linear scaling can become noticeable.

8. Session history poller + `readDispatchLog` impact:
- Yes, periodic heavy refresh path causes visible redraw spikes.

9. tmux test result:
- Alternate-screen helps scrollback cleanliness in tmux; no evidence it reduces redraw cadence.

10. Ink optimization options missed:
- In installed Ink v3.2, relevant options are `patchConsole`, `debug`, and `<Static>`; no `maxFps`/`incrementalRendering` documented.
