# Brainfile Pi Extension (Canonical Example Integration)

This directory contains the canonical public Pi extension integration for Brainfile.

## Orchestration hardening highlights

- Event-sourced coordination using `.brainfile/state/pi-events.jsonl`
- Explicit run lifecycle events:
  - `run.started`
  - `run.blocked`
  - `run.closed`
- Delegation and handoff events:
  - `contract.delegated`, `contract.picked_up`, `contract.delivered`, `contract.validated`
- Stale detection for delegated `in_progress` contracts
- Worker presence + readiness tracking (`worker.online`, `worker.heartbeat`, `worker.ready`, best-effort `worker.offline`)

## PM notification policy (quiet orchestration mode)

For multi-agent PM runs, routine progress updates are suppressed from chat.

PM chat is notified only when:

- the run is blocked (`run.blocked`)
- the run is closed (`run.closed`)

Non-terminal progress stays visible in the footer and widget.

## Stale timeout configuration

Default stale timeout is **3600 seconds** (1 hour).

Override per workspace in `.pi/settings.json`:

```json
{
  "brainfileExtension": {
    "staleTimeoutSeconds": 1800
  }
}
```

The PM `/listen status` output shows the active stale timeout and available workers.

## Slot-based worker pool

Worker identity is **model-agnostic**. Workers are assigned numbered slots (`worker-1`, `worker-2`, etc.) regardless of which model is running. This means you can swap models mid-session (e.g. due to rate limits) without breaking task assignment or delivery.

### Identity model

| Identity | Meaning |
|----------|---------|
| `worker-1`, `worker-2`, ... | Slot-based worker identity |
| `pm` | Project manager session |
| `pool` | Any available worker (for task assignment) |

### Task assignment semantics

| Assignee on task | Who picks it up |
|------------------|-----------------|
| `pool` | Any idle worker |
| (empty / null) | Any idle worker (same as pool) |
| `worker-2` | Only worker-2 |
| `codex`, `claude`, `gemini` | Any idle worker (legacy compat → treated as pool) |
| `pm` | No worker pickup (PM handles it) |

### Slot claiming

Assignment is coordinated through filesystem lease locks under `.brainfile/state/worker-claims/` so concurrent workers don't collide on the same identity. Slots are claimed as `worker-1.lock/`, `worker-2.lock/`, etc.

### Model metadata in heartbeats

Model information is included as metadata in `worker.heartbeat` and `worker.ready` events, but is **never used for routing or identity**. The PM can display `worker-1 (sonnet-4)` for observability but routes based on slot number only.

## Operating mode detection

Operating mode defaults to `worker` unless:

- The session successfully acquires the PM lock → defaults to `pm`
- The user explicitly sets `/listen role pm` or `/listen role worker`

Model name is **not** used to infer operating mode. Swapping from claude to gemini mid-session does not change the session's role.

## PM conflict avoidance on startup

On session startup, if no explicit role override is set, the extension attempts to acquire the PM lock. If another PM already holds the lock, the session stays in worker mode.

User explicit role overrides still win (`/listen role pm`).

## Worker availability awareness

Worker sessions emit presence/readiness events while listener is active:

- `worker.online` on first heartbeat (includes model metadata)
- `worker.heartbeat` periodically (includes model metadata)
- `worker.ready` alongside online/heartbeat with `{ model, maxConcurrency, activeCount, idle }`
- `worker.offline` best-effort on listener disable, role switch, or session shutdown

PM projection applies heartbeat TTL and surfaces currently available workers (including load and model) in `/listen status`.

## Footer and widget

The extension uses `setFooter` for a clean single-line status bar and a minimal contextual widget.

### Footer (bottom bar)

Single line with left/right layout:

```
🟢 PM  task-112 [delivering]              2↑ workers · sonnet-4 · main
```

| Element | Meaning |
|---------|---------|
| 🟢 | Listener active |
| 🟡 | Listener paused for user input |
| ⏸ | Listener off |
| `PM` / `worker-1` | Session role and identity |
| `task-112 [delivering]` | Active task and contract status |
| `📋 plan` | Plan mode active (only shown when on) |
| Right side (dim) | Worker count, model, git branch |

### Widget (above editor)

2 lines max. Hidden when no active task.

**PM mode:**
```
task-112: Core identity...  In Progress → in_progress
⬡ worker-1 (sonnet) idle  ⬡ worker-2 (gemini) task-116
```

**Worker mode:**
```
task-115: Extension wiring  [working]
☑ 3/5 subtasks
```

Only-deviations principle: plan:off, listen:on, stale timeout, mode label, and run ID are **not** shown in the footer or widget. They remain available via `/listen status`.

## Delivery behavior

- `contract.deliver` enforces deliverable file existence.
- Delivery captures evidence into contract metrics:
  - git HEAD (when available)
  - file timestamp/size snapshot
  - self-check command results

## Backwards compatibility

Existing controls remain intact:

- `/listen on|off|status|now`
- `/listen role <pm|worker|auto>`
- `/listen assignee <name>` / `/listen auto`
- `/listen mode <start|wait>`
- `/bf contract pickup <task-id>`
- `/bf contract deliver <task-id>`
- `/bf contract validate <task-id>`

Legacy model-family assignees (`codex`, `claude`, `gemini`, `cursor`) are treated as pool assignees for backward compatibility — any idle worker can pick them up.
