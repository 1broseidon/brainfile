---
title: Contract Schema Reference
description: Formal specification of the Brainfile Contract object
---

# Contract Schema Reference

The Contract object is an optional extension to a Brainfile task. It defines the formal agreement between a requester (PM) and a worker (Agent).

**Source of Truth**: [contract.json](https://brainfile.md/v2/contract.json)

::: tip See also
For a field-by-field walkthrough with examples, see [Types → Contract](/types/contract).
:::

## Object Structure

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| `status` | `string` | Current lifecycle state (see below) | Yes |
| `deliverables` | `Array<Deliverable>` | List of items to be produced | No |
| `validation` | `Validation` | How to verify the work | No |
| `constraints` | `Array<string>` | Implementation rules to follow | No |
| `outOfScope` | `Array<string>` | Explicitly out-of-scope items | No |
| `feedback` | `string` | PM feedback after failed validation | No |
| `version` | `integer` | Contract version (incremented on amendment) | No |
| `metrics` | `Metrics` | Auto-tracked timing and rework data | No |

## Lifecycle Status (`status`)

Contracts follow a strict state machine to coordinate between different agents.

- `ready`: Work is defined and available for an agent to pick up.
- `in_progress`: An agent has claimed the task and is working on it.
- `delivered`: Work is completed and submitted for validation.
- `done`: Work has passed validation and is finalized.
- `failed`: Work failed validation or was abandoned.
- `blocked`: Agent is stuck on an external dependency.

## Deliverable Object

Each item in the `deliverables` array defines a specific output.

| Field | Type | Description |
|-------|------|-------------|
| `type` | `string` | Category (e.g., `file`, `test`, `docs`, `refactor`) |
| `path` | `string` | Path to the file or identifier for the deliverable |
| `description`| `string` | (Optional) Human-readable explanation |

## Validation Object

| Field | Type | Description |
|-------|------|-------------|
| `commands` | `Array<string>` | Shell commands to execute for validation |

## Metrics Object

Auto-tracked by the CLI. Do not manually edit.

| Field | Type | Description |
|-------|------|-------------|
| `pickedUpAt` | `string` | ISO 8601 timestamp when agent picked up |
| `deliveredAt` | `string` | ISO 8601 timestamp when agent delivered |
| `duration` | `number` | Seconds between pickup and delivery |
| `reworkCount` | `number` | Times contract was re-picked up after failure |

---

## Example (YAML)

In a v2 task file (`.brainfile/board/task-63.md`):

```yaml
---
id: task-63
type: task
title: "Update API documentation"
column: todo
assignee: codex
relatedFiles:
  - src/routes/api.ts
contract:
  status: ready
  version: 1
  deliverables:
    - type: docs
      path: docs/api-v2.md
      description: "Updated REST endpoints"
  validation:
    commands:
      - npm run docs:verify
  constraints:
    - Use Swagger/OpenAPI 3.0 format
    - Document all error codes
  outOfScope:
    - Changing the authentication logic
---

## Description
Preparing for the Q3 mobile app release.
```

::: info v2 changes
In v2, `context.background` moved to `task.description` and `context.relevantFiles` moved to `task.relatedFiles`. The `context` object is deprecated.
:::
