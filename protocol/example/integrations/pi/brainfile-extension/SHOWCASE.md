# Orchestration Showcase Runbook

This runbook demonstrates three orchestration workflows for epic-7:

1. **Direct 1:1 dispatch exclusion**
2. **Pipeline DAG unlock with parallel prerequisites**
3. **Fan-out / fan-in barrier with PM synthesis gating**

Companion artifacts:
- Scenario definitions: `examples/showcase-scenarios.md`
- Acceptance checklist: `protocol/docs/guides/orchestration-acceptance.md`

---

## Preconditions

- PM session and at least two worker sessions are running the Brainfile Pi extension.
- Listener commands are available (`/listen ...`, `/bf ...`).
- Orchestration schema/event behavior from Phase 3/4 is present.
- You can inspect `.brainfile/state/pi-events.jsonl`.

Recommended sessions:
- Session A: PM (`/listen role pm`)
- Session B: worker-1 (`/listen role worker`)
- Session C: worker-2 (`/listen role worker`)

---

## Environment Setup (per demo run)

1. Start listeners:
   - PM: `/listen on`
   - Workers: `/listen on`
2. Ensure workers are visible from PM:
   - PM: `/listen status` (expect worker-1 and worker-2 online)
3. Optional clean audit baseline:
   - backup or rotate `.brainfile/state/pi-events.jsonl`
4. Load scenario templates from `examples/showcase-scenarios.md` into board tasks (copy/adapt IDs as needed).

---

## Scenario 1 — Direct 1:1 Dispatch Exclusion

### Objective
Show that a direct-targeted task cannot be picked up by non-target workers.

### Setup
Use `demo-direct-1` from `examples/showcase-scenarios.md`:
- `dispatch.mode=direct`
- `dispatch.target=worker-2`

### Demo flow
1. PM delegates `demo-direct-1` (contract status `ready`).
2. worker-1 attempts pickup (`/bf contract pickup demo-direct-1`) -> must be rejected.
3. worker-2 attempts pickup -> must be accepted.
4. worker-2 delivers.
5. PM validates.

### Expected audit signature

| Expected event | Required fields |
|---|---|
| claim rejection | `kind=message.decision`, `taskId=demo-direct-1`, `reasonCode=dispatch_target_mismatch`, `to=worker-1` |
| accepted pickup | `kind=contract.picked_up`, `taskId=demo-direct-1`, claimant is worker-2 |
| completion path | `contract.delivered` then PM `contract.validated` |

Quick evidence:
```bash
rg "demo-direct-1" .brainfile/state/pi-events.jsonl
rg "dispatch_target_mismatch" .brainfile/state/pi-events.jsonl
```

---

## Scenario 2 — Pipeline DAG (Parallel Prereqs Unlock Downstream)

### Objective
Show that downstream stages are gated until *all* required upstream stages succeed.

### Setup
Use pipeline tasks from `examples/showcase-scenarios.md`:
- `demo-pipe-a` and `demo-pipe-b` in parallel
- `demo-pipe-c` depends on `[demo-pipe-a, demo-pipe-b]`
- `demo-pipe-d` depends on `[demo-pipe-c]`

### Demo flow
1. PM delegates A/B/C/D.
2. Complete only A first.
3. Verify C stays non-runnable.
4. Complete B.
5. Verify C unlocks and can be delegated/picked up.
6. Complete C; verify D unlocks only after C terminal success.

### Expected audit signature

| Expected event | Required fields |
|---|---|
| blocked C before A+B done | waiting state with `reasonCode=dependency_unmet`, `taskId=demo-pipe-c` |
| C unlock | `contract.delegated` for `demo-pipe-c` appears only after A and B success |
| D blocked until C done | `reasonCode=dependency_unmet` for `demo-pipe-d` prior to C completion |

Quick evidence:
```bash
rg "demo-pipe-" .brainfile/state/pi-events.jsonl
rg "dependency_unmet" .brainfile/state/pi-events.jsonl
```

---

## Scenario 3 — Fan-Out / Fan-In Barrier (PM Synthesis Waits)

### Objective
Show barrier behavior: PM synthesis stage does not start until all fan-out branches complete.

### Setup
Use fan-out/fan-in tasks from `examples/showcase-scenarios.md`:
- source: `demo-fan-source`
- branches: `demo-fan-branch-x`, `demo-fan-branch-y`, `demo-fan-branch-z`
- join: `demo-fan-join` with `join.mode=barrier`, `policy=all_success`, `assignee=pm`

### Demo flow
1. Complete source task.
2. Execute branches X/Y/Z in parallel.
3. While one or more branches are unfinished, verify join remains waiting.
4. After all branches are terminal success, verify join becomes schedulable for PM.
5. Optional negative test: fail one branch and verify join remains blocked.

### Expected audit signature

| Expected event | Required fields |
|---|---|
| barrier waiting | waiting state with `reasonCode=join_waiting`, `taskId=demo-fan-join` |
| no early join delegation | absence of `contract.delegated` for join before all branches complete |
| barrier release | `contract.delegated` for join only after X+Y+Z success |
| negative case | `dependency_failed` when a required branch fails under `all_success` |

Quick evidence:
```bash
rg "demo-fan-" .brainfile/state/pi-events.jsonl
rg "join_waiting|dependency_failed" .brainfile/state/pi-events.jsonl
```

---

## Operator Demo Notes

- Keep task IDs stable (`demo-*`) so log filtering is easy.
- Use one PM + two workers to make direct-vs-pool behavior obvious.
- Capture a short event excerpt per scenario for replay evidence.
- If a scenario fails, record the first unexpected reason code and timestamp.

---

## Done Criteria (Showcase)

The showcase is successful when all are true:

- Direct task rejected non-target pickup and accepted target pickup.
- Pipeline downstream stages did not unlock early.
- Fan-in join stayed behind barrier until all required branches succeeded.
- Audit log contains replayable evidence for each decision.

For final sign-off use:
- `protocol/docs/guides/orchestration-acceptance.md`
