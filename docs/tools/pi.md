---
title: Pi Extension
description: Agent-native orchestration for Brainfile in Pi
---

<!-- Validation compatibility: Pi|pi extension|run.closed|stale|worker -->

# Pi Extension <Badge type="warning" text="beta" />

The Brainfile extension for [Pi](https://pi.dev/) is the primary way to run multi-agent orchestration against a Brainfile board.

[Source code on GitHub](https://github.com/brainfile/protocol/tree/main/example/integrations/pi/brainfile-extension)

## Features

### PM and Worker Roles

Every Pi session runs as either a **PM** (project manager) or a **Worker**:

| Role | Listener default | Responsibility |
|------|-----------------|---------------|
| PM | Off | Creates contracts, delegates work, validates deliveries |
| Worker | On | Picks up assigned contracts, implements, delivers |

Set the role with `/listen role <pm|worker|auto>`. In `auto` mode the extension checks for an existing open PM run on startup — if one exists, the session demotes itself to worker to avoid conflicts. The same check runs on model switch.

### Event-Sourced Coordination

All orchestration state is recorded as an append-only event log at `.brainfile/state/pi-events.jsonl`. Each PM run gets a unique `runId`, and events are scoped to that run.

| Category | Events |
|----------|--------|
| Run lifecycle | `run.started`, `run.blocked`, `run.closed` |
| Contracts | `contract.delegated`, `contract.picked_up`, `contract.delivered`, `contract.validated` |
| Tasks | `task.stale`, `task.completed` |
| Workers | `worker.online`, `worker.heartbeat`, `worker.offline` |

`worker.offline` is best-effort — it fires on shutdown, listener disable, or role switch, but a crashed session won't emit it. The heartbeat TTL handles that case.

### Run Lifecycle

1. PM enables listener → `run.started` is emitted.
2. PM creates contracts and assigns workers → `contract.delegated` for each.
3. Workers claim and complete contracts → `contract.picked_up`, `contract.delivered`, `contract.validated`.
4. The PM tracks all delegated tasks by `runId`.
5. The run ends with `run.closed`, which includes:
   - `result` — `success`, `blocked`, etc.
   - `counts` — how many tasks were delegated, completed, failed
   - `openTasks` — any unresolved tasks (required when result is not `success`)

### PM Notifications

During multi-agent runs the PM chat stays quiet. The PM is only interrupted for:

- **Deliveries ready** — all open tasks in the run have been delivered and are awaiting validation
- **Blocked** — a worker hit an external dependency (`run.blocked`)
- **Run complete** — all delegated work is validated and finished (`run.closed`)

Routine progress is visible via `/listen status`.

### Stale Task Detection

If an `in_progress` contract shows no activity for too long, the extension flags it as stale:

1. `task.stale` is emitted for each affected task.
2. `run.blocked` is emitted with the reason and counts.
3. If the run cannot continue, `run.closed` is emitted with remaining `openTasks`.

The default timeout is **1 hour**. Override per workspace in `.pi/settings.json`:

```json
{
  "brainfileExtension": {
    "staleTimeoutSeconds": 1800
  }
}
```

### Worker Presence and Identity

Workers are auto-assigned numbered identities based on their model family — `claude-1`, `codex-2`, `gemini-1`, etc. Slot assignment uses filesystem lease locks under `.brainfile/state/worker-claims/` so that multiple workers starting at the same time never collide on the same identity.

Presence is tracked via periodic heartbeats:

| Event | When |
|-------|------|
| `worker.online` | First heartbeat after listener starts |
| `worker.heartbeat` | Every 20 seconds while active |
| `worker.offline` | Listener stops, role changes, or session exits |

A worker is considered unavailable if no heartbeat arrives within the 45-second TTL. From the PM session, `/listen status` shows the current run ID, online workers, and stale timeout.

**Assignee matching:** Numbered identities match exactly — `codex-1` only picks up tasks assigned to `codex-1`. Bare family names like `codex` act as wildcards for backward compatibility.

### Delivery Verification

`/bf contract deliver` checks that all declared deliverable files exist before accepting. It also records evidence in contract metrics: git HEAD, file sizes, and validation output.

## Commands

### Listener

| Command | Description |
|---------|-------------|
| `/listen` | Toggle listener on/off |
| `/listen on` | Start the background listener |
| `/listen off` | Stop the listener |
| `/listen status` | Show run state, active workers, stale timeout |
| `/listen now` | Run one poll cycle immediately |
| `/listen role <pm\|worker\|auto>` | Set session role |
| `/listen assignee <name>` | Override worker identity |
| `/listen auto` | Reset to auto-assigned identity |
| `/listen mode <start\|wait>` | Start working immediately or wait for assignment |

Role aliases: `main`, `planner`, `orchestrator` → pm; `agent` → worker.

### Board

| Command | Description |
|---------|-------------|
| `/bf pick` | Interactively select an active task |
| `/bf <task-id>` | Set active task directly (shortcut) |
| `/bf status` | Show current task and contract state |
| `/bf board` | Print the board summary |
| `/bf clear` | Clear the active task |
| `/bf move <id> <column>` | Move a task to a column |
| `/bf contract pickup <id>` | Claim a specific contract |
| `/bf contract deliver <id>` | Mark a contract as delivered |
| `/bf contract validate <id>` | Validate deliverables and run checks |
| `/bf plan` | Toggle plan mode (mutations disabled) |

### Top-Level

| Command | Description |
|---------|-------------|
| `/plan` | Toggle plan mode (mutations disabled) |

## Setup

1. Clone the extension into your workspace:

```bash
git clone https://github.com/brainfile/protocol.git /tmp/brainfile-protocol
cp -r /tmp/brainfile-protocol/example/integrations/pi/brainfile-extension/ .pi/extensions/brainfile-extension/
```

2. Install dependencies:

```bash
cd .pi/extensions/brainfile-extension && npm install
```

3. In Pi, run `/reload` to activate.

## Typical Workflow

1. **PM session** — `/listen role pm` → `/listen on`
2. **Worker sessions** — `/listen role worker` → `/listen on`
3. PM creates tasks with contracts and assigns them to workers
4. Workers automatically pick up `ready` contracts matching their identity
5. Workers implement deliverables and run `/bf contract deliver`
6. PM receives a notification when work is blocked or the run is complete, then validates

## Backward Compatibility

Existing `/listen`, `/bf`, and `brainfile_*` tool workflows continue to work unchanged.

## See Also

- [Orchestration Guide](/guides/orchestration) — General orchestration patterns
- [AI Agent Integration](/agents/integration) — MCP, hooks, and manual setup
- [MCP Server](/tools/mcp) — Tool-based integration for other agents
