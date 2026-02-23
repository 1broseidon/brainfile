---
title: Orchestration Workflows
description: Direct dispatch, dependsOn DAG gating, and fan-out/fan-in barrier behavior in the Pi Brainfile extension scheduler.
---

# Orchestration Workflows

This guide documents the workflow operators implemented for epic-7 Phase 4:

1. **Direct 1:1 dispatch**
2. **Pipeline DAG dependency gating (`dependsOn`)**
3. **Fan-out / fan-in barrier joins (`join.mode=barrier`)**

The behavior is additive and backward-compatible: tasks without orchestration fields continue existing ready/pickup flow.

---

## Event-Driven Scheduler Model

Readiness is evaluated when a claim is requested (listener auto-pickup or manual pickup). The check is event-driven:

- listener cycles run from event notifications (`fs.watch` / bus append signals)
- dependency/join state is resolved from current board state with projection fallback
- there are **no sleep/poll wait loops** added for DAG/join logic

---

## 1) Direct 1:1 Dispatch

Direct dispatch pins a task to one worker.

```yaml
orchestration:
  dispatch:
    mode: direct
    target: worker-2
```

### Claim outcomes

- matching worker claim: accepted
- non-target worker claim: rejected with `dispatch_target_mismatch`

### Audit shape (claim rejection)

- `kind: message.decision`
- `data.orchestration.decision: rejected`
- `data.orchestration.reasonCode: dispatch_target_mismatch`

---

## 2) Pipeline DAG via `dependsOn`

`dependsOn` declares prerequisite task IDs.

```yaml
orchestration:
  dependsOn: [task-a, task-b]
  readiness:
    successState: done
```

### Readiness policy

`readiness.successState` controls dependency satisfaction:

- `done` (default): upstream must be terminal success (`done`/completed)
- `delivered`: upstream may satisfy at `delivered` or `done`

### Claim outcomes

- unmet prerequisites: rejected with `dependency_unmet`
- failed/blocked prerequisite: rejected with `dependency_failed`
- all prerequisites satisfied: claim may proceed (subject to dispatch + lease)

### Parallel release

Independent downstream tasks unlock as soon as their own prerequisites satisfy policy. There is no serial bottleneck beyond declared graph edges.

---

## 3) Fan-Out / Fan-In Barrier via `join`

Barrier joins hold a task until required branches satisfy join policy.

```yaml
orchestration:
  join:
    mode: barrier
    requires: [task-x, task-y, task-z]
    policy: all_success
```

If `join.requires` is omitted, scheduler falls back to `dependsOn` for required branch IDs.

### Supported join policies

- `all_success` (default): all required branches must be terminal success
- `all_delivered`: all required branches must be delivered or done
- `quorum`: minimum threshold must satisfy policy (`join.quorum`)

### Claim outcomes

- incomplete barrier: rejected with `join_waiting`
- failed branch violating policy: rejected with `dependency_failed`
- barrier satisfied: claim may proceed

This enforces PM synthesis queueing semantics for fan-in stages: join tasks cannot be processed early.

---

## Orchestration Metadata in Claim Decisions

Claim decisions include orchestration snapshots when available:

- `dispatch` snapshot (`mode`, `target`, source)
- `dependencies` snapshot (`required`, `satisfied`, pending/failed)
- `join` snapshot (`mode`, `required`, `satisfied`, pending/failed, policy)

This makes reject/accept outcomes auditable and replay-friendly in `.brainfile/state/pi-events.jsonl`.

---

## Non-DAG Compatibility

For tasks with no `orchestration.dependsOn` and no `orchestration.join`:

- scheduler behavior remains unchanged from existing flow
- eligibility stays based on contract `ready` + dispatch + lease

No migration is required for existing boards.

---

## Minimal Examples

## Direct

```yaml
assignee: worker-2
contract:
  status: ready
orchestration:
  dispatch:
    mode: direct
    target: worker-2
```

## Pipeline (A+B -> C)

```yaml
# task-c
contract:
  status: ready
orchestration:
  dependsOn: [task-a, task-b]
  readiness:
    successState: done
```

## Fan-in join

```yaml
# task-join
assignee: pm
contract:
  status: ready
orchestration:
  join:
    mode: barrier
    requires: [task-branch-1, task-branch-2, task-branch-3]
    policy: all_success
```

---

## Related

- [Orchestration Schema](/specs/orchestration-schema)
- [Orchestration Event Contract](/specs/orchestration-events)
- [Orchestration Showcase Plan](/guides/orchestration-showcase-plan)
- [Orchestration Acceptance Harness](/guides/orchestration-acceptance)
