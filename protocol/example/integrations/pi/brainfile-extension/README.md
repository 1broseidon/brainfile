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
- Worker presence tracking (`worker.online`, `worker.heartbeat`, best-effort `worker.offline`)

## PM notification policy (quiet orchestration mode)

For multi-agent PM runs, routine progress updates are suppressed from chat.

PM chat is notified only when:

- the run is blocked (`run.blocked`)
- the run is closed (`run.closed`)

Non-terminal progress stays visible in status/widget output.

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

## Auto worker identity assignment

When listener assignee is set to auto in worker mode, the extension assigns a numbered identity per model family (for example: `codex-1`, `codex-2`, `gemini-1`) instead of using a bare family name like `codex`.

Assignment is coordinated through a lease-based claim in `.brainfile/state/worker-claims/` so concurrent workers don’t oscillate between slots.

Matching behavior:

- numbered task assignee + numbered worker assignee => exact slot match only (`codex-2` won’t match `codex-1`)
- bare family assignees remain backward-compatible wildcards (`codex` can still match `codex-1`)

This reduces worker collisions while preserving existing `/listen` and `/bf` workflows.

## PM conflict avoidance on startup

On session startup (and on role/model auto transitions), if auto role resolution would select PM but an open PM run already exists, the session is auto-switched to worker mode to avoid dual-PM conflicts.

User explicit role overrides still win (`/listen role pm`).

## Worker availability awareness

Worker sessions emit presence events while listener is active:

- `worker.online` on first heartbeat
- `worker.heartbeat` periodically
- `worker.offline` best-effort on listener disable, role/model switch away from worker mode, or session shutdown

PM projection applies heartbeat TTL and surfaces currently available workers in `/listen status`.

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
