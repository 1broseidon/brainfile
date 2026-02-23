---
title: Orchestration Event Contract
description: Realtime bus signal contract and JSONL audit mapping for dispatch, dependency gating, fan-in barriers, resource conflicts, and PM authority enforcement.
---

# Orchestration Event Contract

This document defines how orchestration decisions are represented across:

1. **Realtime bus signals** (fast local coordination)
2. **Audit log envelopes** (`.brainfile/state/pi-events.jsonl`)

The contract is designed to be **backward-compatible** with the current Envelope format and listener behavior.

---

## Compatibility Rules

1. Keep the existing envelope top-level shape (`id`, `at`, `kind`, `runId`, `taskId`, `data`, etc.).
2. Do not introduce required top-level fields.
3. Put new orchestration metadata under `data.orchestration`.
4. Unknown `data.orchestration.*` fields must be safely ignored by older consumers.
5. Existing event kinds remain valid and unchanged.

---

## Envelope Extension Namespace

### `data.orchestration`

```json
{
  "orchestration": {
    "action": "string",
    "decision": "accepted|rejected|deferred",
    "reasonCode": "string",
    "reasonDetails": "string",
    "dispatch": {
      "mode": "direct|pool",
      "target": "worker-2"
    },
    "dependencies": {
      "required": ["task-201", "task-202"],
      "satisfied": ["task-201"],
      "policy": "all_success|all_delivered|quorum",
      "quorum": 2
    },
    "join": {
      "mode": "none|barrier",
      "required": ["task-301", "task-302"],
      "satisfied": ["task-301"],
      "policy": "all_success"
    },
    "resources": {
      "writes": ["protocol/docs/specs/orchestration-events.md"],
      "conflictsWith": ["task-333"],
      "conflictPolicy": "block|reject"
    },
    "authority": {
      "required": "pm",
      "enforced": true,
      "actor": "pm|worker-2"
    },
    "lease": {
      "id": "lease-...",
      "owner": "worker-2",
      "expiresAt": "2026-02-23T20:00:00.000Z"
    }
  }
}
```

All fields are optional unless the specific event mapping below requires them.

---

## Canonical Reason Codes

Use stable machine-readable reason codes for scheduling outcomes:

- `dispatch_target_mismatch`
- `lease_conflict`
- `dependency_unmet`
- `dependency_failed`
- `join_waiting`
- `resource_conflict`
- `task_not_ready`
- `authority_violation`
- `run_not_active`

These codes should appear in `data.orchestration.reasonCode` and may also be included in `run.blocked.data.reasons`.

---

## Realtime Bus -> Audit Mapping

To avoid breaking consumers, realtime signals map to existing audit kinds.

| Realtime signal | Audit envelope kind | Required audit payload |
|---|---|---|
| `scheduler.run.started` | `run.started` | `runId`, `data.orchestration.action=run_started` |
| `scheduler.dispatch.delegated` | `contract.delegated` | `taskId`, `dispatch`, `dependencies/join/resources snapshot` |
| `scheduler.claim.accepted` | `contract.picked_up` | `taskId`, `lease`, `decision=accepted` |
| `scheduler.claim.rejected` | `message.decision` | `taskId`, `to=<worker>`, `decision=rejected`, `reasonCode` |
| `worker.delivery.submitted` | `contract.delivered` | `taskId`, delivery metadata |
| `scheduler.validation.result` | `contract.validated` | `taskId`, `result=done|failed`, `authority.actor=pm` |
| `scheduler.task.waiting` | `run.blocked` (or batched status message) | `reasonCode`, affected task ids |
| `scheduler.run.closed` | `run.closed` | `result`, `counts`, `openTasks` |

Notes:
- `scheduler.claim.rejected` uses `message.decision` for audit compatibility without introducing a new top-level kind.
- Realtime-only ephemeral notifications are allowed, but externally meaningful decisions should be auditable.

---

## Authority Model in Events

### PM-only event authorities

These must originate from PM authority context:

- `run.started`
- `contract.delegated`
- `contract.validated`
- `run.blocked` (scheduler-level)
- `run.closed`

### Worker-origin events

Workers may originate:

- `contract.picked_up` (after successful claim path)
- `contract.delivered`
- conversational `message.*`

### Authority violation handling

If a non-PM actor attempts a PM-only transition:

1. Reject action.
2. Emit audit row with:
   - `kind: message.blocker` or `message.decision`
   - `data.orchestration.reasonCode: authority_violation`
3. Keep task status unchanged.

---

## Required Fields by Key Audit Event

### `contract.delegated`

Must include:
- `taskId`
- `runId`
- `data.orchestration.dispatch`
- `data.orchestration.dependencies` snapshot (if applicable)
- `data.orchestration.join` snapshot (if applicable)

### `contract.picked_up`

Must include:
- `taskId`
- claimant identity (`actorAssignee` or `from`)
- `data.orchestration.lease.id`
- `data.orchestration.decision=accepted`

### `message.decision` (claim rejection)

Must include:
- `taskId`
- `to` (target worker)
- `threadId` (`task:<taskId>` recommended)
- `data.orchestration.decision=rejected`
- `data.orchestration.reasonCode`

### `run.blocked`

Must include:
- `runId`
- `data.reasons` (human-readable)
- `data.orchestration.reasonCode` (machine-readable primary)
- optionally `data.orchestration.blockedTasks`

### `run.closed`

Must include:
- `runId`
- `data.result`
- `data.counts`
- `data.openTasks` when result is not success

---

## Idempotency and Ordering

- `messageId` remains the primary dedup key.
- Consumers should treat duplicate `messageId` as no-op.
- Ordering is append-order within JSONL; consumers should not assume global wall-clock ordering across processes.

---

## Example: Delegation Decision (Audit)

```json
{
  "id": "1772000000000-abcd12",
  "at": "2026-02-23T20:10:00.000Z",
  "kind": "contract.delegated",
  "runId": "run-20260223201000-xyzt1234",
  "taskId": "task-310",
  "actorMode": "pm",
  "from": "pm",
  "source": "scheduler",
  "data": {
    "contractStatus": "ready",
    "orchestration": {
      "action": "dispatch",
      "dispatch": {
        "mode": "direct",
        "target": "worker-2"
      },
      "dependencies": {
        "required": ["task-305"],
        "satisfied": ["task-305"],
        "policy": "all_success"
      },
      "authority": {
        "required": "pm",
        "enforced": true,
        "actor": "pm"
      }
    }
  }
}
```

## Example: Rejected Claim (Audit-Compatible)

```json
{
  "id": "1772000000100-efgh34",
  "at": "2026-02-23T20:10:01.000Z",
  "kind": "message.decision",
  "runId": "run-20260223201000-xyzt1234",
  "taskId": "task-310",
  "from": "pm",
  "to": "worker-1",
  "threadId": "task:task-310",
  "source": "scheduler",
  "data": {
    "body": "Claim rejected for task-310",
    "orchestration": {
      "action": "claim_decision",
      "decision": "rejected",
      "reasonCode": "dispatch_target_mismatch",
      "reasonDetails": "Task is direct-targeted to worker-2"
    }
  }
}
```

---

## Implementation Checklist

- [ ] Emit orchestration metadata under `data.orchestration` only
- [ ] Preserve existing top-level envelope compatibility
- [ ] Use canonical reason codes
- [ ] Enforce PM authority on PM-only transitions
- [ ] Ensure claim rejections are audit-visible
- [ ] Keep dedup behavior keyed on `messageId`
