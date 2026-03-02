---
title: Pi Extension
description: User manual for PM/worker orchestration and the Direct/Pipeline/Fan-In showcase in Pi
---

<!-- Validation compatibility: Pi|pi extension|run.closed|stale|worker -->

# Pi Extension <Badge type="warning" text="beta" />

Use the Brainfile Pi extension when you want to run multi-agent work as an operator, not as a custom integration author.

This manual is focused on **how to run orchestration reliably**:
- bring up PM + workers correctly
- execute Direct / Pipeline / Fan-In showcase workflows
- validate and close runs cleanly
- troubleshoot common operational issues

[Source code on GitHub](https://github.com/brainfile/protocol/tree/main/example/integrations/pi/brainfile-extension)

---

## Mental Model (Operator View)

You only need three concepts:

1. **Realtime notifications are bus-first**
   - the local realtime bus is the primary trigger path for listener cycles
2. **Audit/replay is JSONL**
   - `.brainfile/state/pi-events.jsonl` is the durable audit trail and replay source
3. **PM controls terminal orchestration decisions**
   - workers pick up and deliver
   - PM validates and closes

This gives fast coordination + auditable history without manual polling loops.

---

## 10-Minute Bring-Up (PM + Workers)

## 1) Install/activate the extension in your workspace

```bash
git clone https://github.com/brainfile/protocol.git /tmp/brainfile-protocol
cp -r /tmp/brainfile-protocol/example/integrations/pi/brainfile-extension/ .pi/extensions/brainfile-extension/
cd .pi/extensions/brainfile-extension && npm install
```

Then in each Pi session:

```text
/reload
```

## 2) Start one PM session

```text
/listen role pm
/listen on
```

## 3) Start worker sessions

In each worker session:

```text
/listen role worker
/listen on
```

## 4) Verify health from PM

```text
/listen status
```

You should see:
- active run ID
- available workers (`worker-1`, `worker-2`, ...)
- stale timeout

### Role hygiene checklist

- Keep exactly **one PM** active per workspace run.
- Keep all other sessions in worker mode.
- Use `auto` mode only if you understand PM lock behavior.
- Do not use sleep/manual polling loops; rely on event-driven listener flow.

---

## Session Roles and Assignment Behavior

| Role | Main responsibility |
|---|---|
| PM | create/delegate contracts, validate deliveries, close runs |
| Worker | pick up eligible contracts, implement, deliver |

Worker identity is slot-based (`worker-1`, `worker-2`, ...). Routing is identity-based, not model-name-based.

| Assignee on task | Pickup behavior |
|---|---|
| `worker-2` | only `worker-2` can pick it up |
| `pool` or empty | any eligible idle worker |
| legacy assignee (`codex`, `claude`, `gemini`) | treated as pool for compatibility |
| `pm` | worker does not auto-pick |

---

## Operator Workflow (Plan → Execute → Validate → Close)

## 1) Plan and delegate (PM)

- create task with contract deliverables/constraints
- assign to `worker-N` (direct) or `pool` (shared)
- set contract status to `ready`

## 2) Execute (workers)

- worker listener auto-picks eligible `ready` tasks
- worker implements and runs delivery checks
- worker marks `delivered`

## 3) Validate (PM)

- PM validates delivered contracts (`contract.validate` path)
- success → `done`
- failure → `failed` with feedback, then reset to `ready`

## 4) Close

- complete/archive task after PM acceptance
- run ends with `run.closed` when orchestration reaches terminal state

---

## Showcase Flows (Direct / Pipeline / Fan-In)

For reproducible scenario definitions and checklists:
- Runbook: `/example/integrations/pi/brainfile-extension/SHOWCASE.md`
- Scenario definitions: `/example/integrations/pi/brainfile-extension/examples/showcase-scenarios.md`
- Acceptance harness: [/guides/orchestration-acceptance](/guides/orchestration-acceptance)

## A) Direct 1:1 Dispatch

Goal: non-target worker cannot claim a direct-targeted task.

Expected operator evidence:
- rejection decision with `reasonCode=dispatch_target_mismatch`
- accepted pickup only for target worker

Quick audit checks:

```bash
rg "dispatch_target_mismatch" .brainfile/state/pi-events.jsonl
```

## B) Pipeline DAG (`dependsOn`)

Goal: downstream stage unlocks only when prerequisites satisfy readiness policy.

Expected operator evidence:
- blocked/waiting reason `dependency_unmet` before prerequisites complete
- downstream delegation only after prerequisites are satisfied

Quick audit checks:

```bash
rg "dependency_unmet" .brainfile/state/pi-events.jsonl
```

## C) Fan-Out / Fan-In Barrier (`join.mode=barrier`)

Goal: join/synthesis stage waits until required branches satisfy barrier policy.

Expected operator evidence:
- waiting reason `join_waiting` while branches are incomplete
- optional `dependency_failed` if barrier policy is violated by failed branches
- no early join delegation

Quick audit checks:

```bash
rg "join_waiting|dependency_failed" .brainfile/state/pi-events.jsonl
```

---

## Run Lifecycle Signals You Should Watch

| Event | Operator meaning |
|---|---|
| `run.started` | PM orchestration run is active |
| `run.blocked` | run cannot proceed (stale/failed/blocked conditions) |
| `run.closed` | run reached terminal state (`success`, `blocked`, etc.) |
| `contract.delegated` | PM delegated work |
| `contract.picked_up` | worker successfully claimed task |
| `contract.delivered` | worker submitted for PM validation |
| `contract.validated` | PM accepted/rejected delivery |

PM chat notifications are intentionally quiet and focused on meaningful orchestration events (blocked/close + delivery readiness signals), while full detail remains in JSONL audit.

---

## Commands You’ll Use Most

### Listener

| Command | Use |
|---|---|
| `/listen on` | start listener |
| `/listen off` | stop listener |
| `/listen status` | inspect run/workers/stale timeout |
| `/listen role <pm|worker|auto>` | set role |
| `/listen now` | run a single diagnostic cycle |

### Task/contract operations

| Command | Use |
|---|---|
| `/bf contract pickup <id>` | manual claim (when needed) |
| `/bf contract deliver <id>` | submit delivery |
| `/bf contract validate <id>` | PM validation |
| `/bf move <id> <column>` | move task state |
| `/bf status` | inspect active task |

---

## Troubleshooting

## Duplicate PM avoidance

**Symptom:** two sessions both try to orchestrate as PM.

**What to do:**
- keep only one explicit PM session (`/listen role pm`)
- keep others as workers (`/listen role worker`)
- if using `auto`, rely on PM lock arbitration and verify via `/listen status`

## Delayed duplicate messages / late status noise

**Symptom:** old status/decision messages appear after task completion.

**What to do:**
- treat `.brainfile/state/pi-events.jsonl` as source-of-truth audit
- use thread + `inReplyTo` for conversational clarity
- rely on PM validation state in board/log files for final authority

## Stale tasks and blocked runs

**Symptom:** task remains `in_progress` too long; run moves to blocked.

**What to do:**
- PM checks `/listen status` for worker presence and stale timeout
- inspect `task.stale` / `run.blocked` records in JSONL
- either unblock dependency or reset task to `ready` with feedback

Workspace override:

```json
{
  "brainfileExtension": {
    "staleTimeoutSeconds": 1800
  }
}
```

## Reload behavior

**Symptom:** session restart or `/reload` interrupted listener state.

**What to do:**
- run `/reload`
- re-apply role (`/listen role pm|worker`)
- run `/listen on`
- verify with `/listen status`

The listener catches up from persisted offsets + JSONL audit, so recovery is event-driven and does not require manual polling loops.

---

## A2A Messaging (Operator Essentials)

Use `brainfile_send_message` for PM↔worker coordination inside task threads:
- keep `threadId` as `task:<taskId>`
- set `inReplyTo` when responding
- use `message.blocker` for actionable blockers

This keeps orchestration decisions and conversation context auditable together.

---

## See Also

- [Orchestration Guide](/guides/orchestration)
- [AI Agent Integration](/agents/integration)
- [MCP Server](/tools/mcp)
