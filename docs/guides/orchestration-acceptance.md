---
title: Orchestration Acceptance Harness
description: Lightweight operator checklist and failure-mode guide for Direct 1:1, Pipeline DAG, and Fan-Out/Fan-In barrier demos.
---

# Orchestration Acceptance Harness

Use this guide to validate the Phase 5 orchestration showcase for epic-7.

Scope:
1. Direct 1:1 dispatch exclusion
2. Pipeline DAG unlock behavior
3. Fan-out / fan-in barrier behavior

Companion files:
- Runbook: `/example/integrations/pi/brainfile-extension/SHOWCASE.md`
- Scenario definitions: `/example/integrations/pi/brainfile-extension/examples/showcase-scenarios.md`

---

## Harness Inputs

- Audit log: `.brainfile/state/pi-events.jsonl`
- Scenario task IDs:
  - direct: `demo-direct-1`
  - pipeline: `demo-pipe-a|b|c|d`
  - fan-in: `demo-fan-source`, `demo-fan-branch-x|y|z`, `demo-fan-join`

Canonical reason codes expected in this harness:
- `dispatch_target_mismatch`
- `dependency_unmet`
- `join_waiting`

---

## Quick Evidence Commands

### Minimal (grep)

```bash
rg "demo-direct-1|demo-pipe-|demo-fan-" .brainfile/state/pi-events.jsonl
rg "dispatch_target_mismatch|dependency_unmet|join_waiting" .brainfile/state/pi-events.jsonl
```

### Structured (jq, optional)

```bash
# Direct rejection
jq -e 'select(.taskId=="demo-direct-1" and .kind=="message.decision" and .data.orchestration.reasonCode=="dispatch_target_mismatch")' .brainfile/state/pi-events.jsonl >/dev/null

# Pipeline wait evidence
jq -e 'select(.taskId=="demo-pipe-c" and .data.orchestration.reasonCode=="dependency_unmet")' .brainfile/state/pi-events.jsonl >/dev/null

# Fan-in join barrier evidence
jq -e 'select(.taskId=="demo-fan-join" and .data.orchestration.reasonCode=="join_waiting")' .brainfile/state/pi-events.jsonl >/dev/null
```

---

## Acceptance Checklist

## A) Direct 1:1 Dispatch Exclusion

- [ ] Non-target worker claim is rejected.
- [ ] Rejection is auditable with `reasonCode=dispatch_target_mismatch`.
- [ ] Target worker claim is accepted (`contract.picked_up`).
- [ ] Task follows normal path to `contract.delivered` and PM `contract.validated`.

**Required event outputs**

| Kind | Required payload |
|---|---|
| `message.decision` | `taskId=demo-direct-1`, `decision=rejected`, `reasonCode=dispatch_target_mismatch` |
| `contract.picked_up` | claimant matches `worker-2` |
| `contract.delivered` + `contract.validated` | terminal proof path |

## B) Pipeline DAG Unlock (Parallel Prereqs)

- [ ] `demo-pipe-c` does **not** run when only one prerequisite is complete.
- [ ] Waiting state is auditable via `reasonCode=dependency_unmet`.
- [ ] `demo-pipe-c` unlocks only after both A and B are terminal success.
- [ ] `demo-pipe-d` remains blocked until `demo-pipe-c` succeeds.

**Required event outputs**

| Kind | Required payload |
|---|---|
| waiting/block signal | `taskId=demo-pipe-c`, `reasonCode=dependency_unmet` |
| `contract.delegated` | emitted for C only after A+B satisfy readiness policy |
| waiting/block signal | `taskId=demo-pipe-d`, `reasonCode=dependency_unmet` before C success |

## C) Fan-Out / Fan-In Barrier

- [ ] Join task (`demo-fan-join`) remains waiting while any branch is incomplete.
- [ ] Waiting reason is auditable as `join_waiting`.
- [ ] Join is not delegated early.
- [ ] Join is delegated only after all required branches succeed.
- [ ] (Optional negative) branch failure under `all_success` keeps join blocked.

**Required event outputs**

| Kind | Required payload |
|---|---|
| waiting/block signal | `taskId=demo-fan-join`, `reasonCode=join_waiting` |
| `contract.delegated` | absent before all branches terminal success; present after all pass |
| waiting/block signal (negative test) | `taskId=demo-fan-join`, `reasonCode=dependency_failed` |

---

## Failure Modes and Triage

| Symptom | Likely issue | What to check first |
|---|---|---|
| worker-1 can pick direct worker-2 task | dispatch exclusion not enforced | direct task `orchestration.dispatch.target`, claim decision path, reason-code emission |
| direct rejection happens but no audit row | audit mapping gap | JSONL append path and `message.decision` write |
| pipeline C unlocks before both A/B complete | dependency gating bug | `dependsOn` parser + readiness evaluator |
| pipeline C never unlocks after A/B done | stale projection / dependency resolution mismatch | dependency IDs and terminal-state policy (`done` vs `delivered`) |
| fan-in join starts before all branches complete | barrier evaluator bug | `join.requires`, `join.policy`, join eligibility logic |
| fan-in join never starts despite all branches done | join membership mismatch or stale state | branch IDs, run-scoped projection, terminal states in audit |
| PM synthesis task routed to worker | authority/assignee misconfiguration | `assignee=pm`, scheduler authority checks |

---

## Sign-Off Template

Use this when closing the showcase validation:

```text
[orchestration-acceptance] PASS
Date:
Run ID:
Operator:

Direct 1:1:
- rejection evidence: <event id / timestamp>
- acceptance evidence: <event id / timestamp>

Pipeline DAG:
- dependency_unmet evidence: <event id / timestamp>
- C unlock evidence: <event id / timestamp>

Fan-in barrier:
- join_waiting evidence: <event id / timestamp>
- join delegation evidence: <event id / timestamp>

Notes:
```

---

## Related

- [Orchestration Showcase Plan](/guides/orchestration-showcase-plan)
- [Orchestration Event Contract](/specs/orchestration-events)
- [Orchestration Schema](/specs/orchestration-schema)
