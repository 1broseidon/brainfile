---
title: Orchestration Schema
description: Optional task-level orchestration fields for direct dispatch, DAG dependencies, fan-in barriers, resource-touch safety, and PM authority boundaries.
---

# Orchestration Schema

This document defines an **implementation-ready schema extension** for orchestration workflows in Brainfile:

- Direct 1:1 dispatch
- Pipeline/DAG execution
- Fan-out/fan-in barriers
- Safe parallel file-write coordination
- PM-authoritative scheduler boundaries

The design is intentionally **backward-compatible** with current task files and event envelopes.

---

## Compatibility Contract

1. All new fields are optional.
2. Existing tasks without orchestration fields keep current behavior.
3. Existing `assignee` semantics remain valid.
4. Existing envelope/event structure remains valid.
5. No migration is required for boards that do not use orchestration features.

---

## Proposed Task Frontmatter Extension

Add an optional top-level `orchestration` object to task files:

```yaml
orchestration:
  dispatch:
    mode: direct         # direct | pool
    target: worker-2     # required when mode=direct

  dependsOn:
    - task-210
    - task-211

  readiness:
    successState: done         # done | delivered
    onDependencyFailure: blocked # blocked | failed

  join:
    mode: barrier              # none | barrier
    requires:
      - task-220
      - task-221
    policy: all_success        # all_success | all_delivered | quorum
    quorum: 2                  # required only for policy=quorum

  resources:
    reads:
      - protocol/docs/**
    writes:
      - path: protocol/docs/specs/orchestration-events.md
        mode: exclusive        # exclusive | shared
    conflictPolicy: block      # block | reject

  scheduler:
    authority: pm              # reserved: pm
```

### Field Semantics

#### `dispatch`
- `mode: pool`
  - any eligible worker can claim.
- `mode: direct`
  - only `target` may claim.
  - non-target claims must be rejected with explicit reason code.

**Compatibility mapping (when `dispatch` omitted):**
- `assignee` empty / `pool` / legacy model-family assignee (`codex`, `claude`, `gemini`, `cursor`) => `mode=pool`
- `assignee=worker-N` => `mode=direct`, `target=worker-N`

#### `dependsOn`
- Defines DAG prerequisites by task id.
- A task is not schedulable until dependency conditions are met.
- Cycles are invalid and must be rejected at validation/scheduler ingest time.

**Compatibility mapping:**
- If `dependsOn` is absent and legacy `blockedBy` exists, scheduler may treat `blockedBy` as a fallback dependency list.

#### `readiness`
- `successState`:
  - `done` (default): dependencies must be PM-validated terminal success.
  - `delivered`: dependencies may unlock downstream work after worker delivery.
- `onDependencyFailure`:
  - `blocked` (default): hold task as blocked.
  - `failed`: PM may transition task contract to `failed`.

#### `join`
- `mode=barrier` enables fan-in gating.
- `requires` defaults to `dependsOn` when omitted.
- `policy`:
  - `all_success`: all required tasks must satisfy success criteria.
  - `all_delivered`: all required tasks must be delivered or done.
  - `quorum`: at least `quorum` required tasks satisfy criteria.

#### `resources`
- `reads`: advisory read set.
- `writes`: write-intent set for conflict safety.
- `writes[].mode`:
  - `exclusive`: no concurrent overlapping writer allowed.
  - `shared`: concurrent shared writers allowed.
- `conflictPolicy`:
  - `block`: hold task until conflicting writer exits.
  - `reject`: deny claim immediately with reason code.

#### `scheduler.authority`
- Reserved to `pm` for now.
- Documents that terminal orchestration decisions are PM-owned.

---

## Readiness Resolution Algorithm

A task is **scheduler-eligible** when all of the following are true:

1. `contract.status == ready`
2. Dispatch can resolve to a valid claimant (`direct` target or `pool`)
3. Dependencies satisfy `readiness.successState`
4. Join condition (if any) is satisfied
5. Resource conflict check passes for active in-progress set

Pseudo-logic:

```text
eligible(task) =
  contractReady(task)
  AND dispatchSatisfied(task)
  AND dependenciesSatisfied(task)
  AND joinSatisfied(task)
  AND resourcesSatisfied(task)
```

If any check fails, scheduler emits explicit reason codes and keeps task non-runnable.

---

## Scheduler Authority Boundaries

### PM-only transitions

- `contract.delegated` emission for orchestration scheduling decisions
- `delivered -> done` (`contract.validated` result=done)
- `delivered -> failed` (`contract.validated` result=failed)
- `run.started`, `run.blocked`, `run.closed`
- Orchestration-level claim approval/rejection decisions

### Worker-owned transitions

- `ready -> in_progress` via successful claim/pickup
- `in_progress -> delivered` via delivery path
- conversational updates (`message.status`, `message.blocker`, etc.)

### Shared/manual safety transitions

- `blocked` may be set by either party via explicit operator action/manual edit, but PM remains final authority for reopening strategy.

---

## JSON Schema Addendum (Task-Level)

Suggested `task.json` extension shape (additive):

```json
{
  "properties": {
    "orchestration": {
      "type": "object",
      "properties": {
        "dispatch": {
          "type": "object",
          "properties": {
            "mode": { "enum": ["direct", "pool"] },
            "target": { "type": "string" }
          },
          "additionalProperties": false
        },
        "dependsOn": {
          "type": "array",
          "items": { "type": "string", "pattern": "^[a-z][a-z0-9]*-[0-9]+$" }
        },
        "readiness": {
          "type": "object",
          "properties": {
            "successState": { "enum": ["done", "delivered"] },
            "onDependencyFailure": { "enum": ["blocked", "failed"] }
          },
          "additionalProperties": false
        },
        "join": {
          "type": "object",
          "properties": {
            "mode": { "enum": ["none", "barrier"] },
            "requires": {
              "type": "array",
              "items": { "type": "string", "pattern": "^[a-z][a-z0-9]*-[0-9]+$" }
            },
            "policy": { "enum": ["all_success", "all_delivered", "quorum"] },
            "quorum": { "type": "integer", "minimum": 1 }
          },
          "additionalProperties": false
        },
        "resources": {
          "type": "object",
          "properties": {
            "reads": { "type": "array", "items": { "type": "string" } },
            "writes": {
              "type": "array",
              "items": {
                "type": "object",
                "required": ["path"],
                "properties": {
                  "path": { "type": "string" },
                  "mode": { "enum": ["exclusive", "shared"] }
                },
                "additionalProperties": false
              }
            },
            "conflictPolicy": { "enum": ["block", "reject"] }
          },
          "additionalProperties": false
        },
        "scheduler": {
          "type": "object",
          "properties": {
            "authority": { "enum": ["pm"] }
          },
          "additionalProperties": false
        }
      },
      "additionalProperties": false
    }
  }
}
```

---

## Minimal Workflow Examples

### Direct 1:1

```yaml
assignee: worker-2
orchestration:
  dispatch:
    mode: direct
    target: worker-2
```

### Pipeline (A -> B -> C)

```yaml
# task-B
orchestration:
  dependsOn: [task-A]

# task-C
orchestration:
  dependsOn: [task-B]
```

### Fan-out / Fan-in

```yaml
# task-merge
orchestration:
  join:
    mode: barrier
    requires: [task-branch-1, task-branch-2, task-branch-3]
    policy: all_success
```

---

## Migration Notes

- No mandatory migration step.
- Teams can adopt orchestration fields incrementally per task.
- Existing non-orchestrated boards continue unchanged.
- If desired, `blockedBy` can be read as compatibility fallback for `dependsOn` during transition.
