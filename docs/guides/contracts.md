---
title: Agent-to-Agent Contracts
description: A system for reliable coordination between PM and worker agents
---

# Agent-to-Agent Contracts

The Brainfile contract system provides a structured way for AI agents to coordinate work. It moves beyond simple task assignments by defining clear deliverables, implementation constraints, and validation procedures.

## Core Principles

1.  **Agent-First Design**: Optimized for the unique needs of AI-to-AI coordination.
2.  **Explicit Expectations**: Contracts define exactly what must be produced (`deliverables`) and how it will be verified (`validation`).
3.  **Autonomous Execution**: Once a contract is picked up, the worker agent has the autonomy to complete the task within the defined constraints.
4.  **Trust + Verify**: PM agents validate the results against the contract before closing the task.
5.  **Single Source of Truth**: Contracts are embedded directly in the `brainfile.md` task, keeping context and status in one place.

## The Contract Schema

A contract is an optional property of a task. When present, it formalizes the "handshake" between agents.

**Task metadata:**

```yaml
---
id: task-101
title: Implement rate limiter
description: |
  Implement token bucket rate limiting to prevent API quota exhaustion.
assignee: codex
relatedFiles:
  - src/api/middleware.ts
```

::: info Task fields provide context
The `description` and `relatedFiles` are the single source of truth for the agent. Write clear, specific requirements here — this is what the worker agent reads first to understand the job.
:::

**Contract definition:**

```yaml
contract:
  status: ready
  deliverables:
    - type: file
      path: src/rateLimiter.ts
      description: Token bucket implementation
    - type: test
      path: src/__tests__/rateLimiter.test.ts
      description: Unit tests
```

::: tip Deliverables define "done"
Each deliverable specifies an exact file path. The agent knows exactly what to produce, and the PM knows exactly what to check.
:::

**Validation rules:**

```yaml
  validation:
    commands:
      - "npm test -- rateLimiter"
```

::: tip Automated verification
Validation commands run sequentially during `contract validate`. If any command exits non-zero, the contract is marked `failed` and the output is captured as feedback.
:::

**Implementation constraints:**

```yaml
  constraints:
    - "Use token bucket algorithm"
    - "Must be non-blocking (async)"
---
```

::: info Constraints guide, not restrict
Keep constraints focused — 3–5 key requirements, not an exhaustive spec. The agent has autonomy within these guardrails.
:::

### Key Fields

- **`status`**: The current state of the contract (`ready`, `in_progress`, `delivered`, `done`, `failed`, `blocked`).
- **`deliverables`**: A list of specific files or artifacts the agent must produce.
- **`validation.commands`**: Optional shell commands that the PM can run to automatically verify the work.
- **`constraints`**: Guidelines or rules the agent must follow during implementation.
- **`outOfScope`**: Explicitly defines what the agent should *not* do.
- **`feedback`**: Used by the PM to provide guidance if a contract is rejected (status `failed`).

---

## Contract Lifecycle

The lifecycle ensures that work is properly claimed, implemented, and verified.

<StateMachine />

| State | Meaning | Next Action |
|-------|---------|-------------|
| 🔵 `ready` | Contract is available for an agent to claim. | Agent: `contract pickup` |
| 🟡 `in_progress` | Agent is currently working on the deliverables. | Agent: `contract deliver` |
| 🟣 `delivered` | Work is complete and awaiting PM review. | PM: `contract validate` |
| 🟢 `done` | PM has verified and accepted the work. | PM: `brainfile complete` to append to `ledger.jsonl` and archive. |
| 🔴 `failed` | Validation failed. Feedback is provided. | PM: Add feedback, reset to `ready` for rework. |
| ⚠️ `blocked` | Agent is stuck and needs human/PM intervention. | PM: Resolve blocker and reset status to `ready`. Either party can set this status via manual YAML edit; there is no dedicated CLI command for it. |

---

## Working with Contracts

### Creating Contracts
Contracts can be created alongside a task or attached to an existing one.

```bash
# Create task with contract
brainfile add --with-contract --deliverable "file:src/auth.ts:Implementation" --validation "npm test"

# Attach contract to existing task
brainfile contract attach -t task-42 --deliverable "docs:docs/api.md:API documentation"
```

### For Worker Agents
Worker agents follow a claim-implement-deliver workflow:

1.  **List**: Find assigned contracts with `brainfile list --contract ready`.
2.  **Pickup**: Claim the task with `brainfile contract pickup -t task-X`.
3.  **Implement**: Follow the instructions in `description` and `contract.constraints`.
4.  **Self-Verify**: Run `validation.commands` manually to ensure quality.
5.  **Deliver**: Submit the work with `brainfile contract deliver -t task-X`.

### For PM Agents
PM agents (usually humans or advanced LLMs) manage the lifecycle:

1.  **Define**: Create tasks with clear contracts.
2.  **Assign**: Set the `assignee` to the appropriate worker agent.
3.  **Validate**: Once delivered, run `brainfile contract validate -t task-X`.
4.  **Result**:
    - If successful: Status becomes `done`. Run `brainfile complete` to append to `ledger.jsonl` and archive.
    - If issues found: Status becomes `failed`. Edit task to add feedback and reset status to `ready`.

::: tip Quick Reference
| Action | Command |
|--------|---------|
| Create with contract | `brainfile add --with-contract --deliverable "file:path" --validation "cmd"` |
| Attach to existing | `brainfile contract attach -t task-42 --deliverable "path"` |
| Pick up | `brainfile contract pickup -t task-X` |
| Deliver | `brainfile contract deliver -t task-X` |
| Validate | `brainfile contract validate -t task-X` |
:::

### State Tracking
Contract metrics are tracked directly within the contract object in each task file:

### Metrics and Performance
The system automatically tracks metrics to help evaluate agent performance and task complexity:
- **Timestamps**: Records when work was picked up, delivered, and validated.
- **Duration**: Calculates the total time spent in the `in_progress` state.
- **Rework Count**: Tracks how many times a contract was rejected and re-picked up.

These metrics are stored within the contract object in your `brainfile.md`.

---

## Benefits of the System

-   **Reduces Ambiguity**: "Done" is clearly defined by deliverables and validation commands.
-   **Enables Parallelism**: Multiple agents can work on different contracts simultaneously without overlapping.
-   **Automated Verification**: Integration tests can be part of the contract, ensuring that agents don't break existing functionality.
-   **Traceability**: Each state transition is tracked, providing a clear history of how a feature was implemented.

## Related Pages

- [Agent Workflows](/guides/agent-workflows) — PM and worker coordination patterns
- [Contract Commands](/cli/contract-commands) — Full CLI reference for contract operations
- [Contract Schema](/reference/contract-schema) — Formal field-by-field specification
- [Getting Started](/guides/getting-started-with-contracts) — 2-minute intro
