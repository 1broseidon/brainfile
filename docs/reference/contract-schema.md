---
title: Contract Schema Reference
description: Formal specification of the Brainfile Contract object
---

# Contract Schema Reference

The Contract object is an optional extension to a Brainfile task. It defines the formal agreement between a requester (PM) and a worker (Agent).

**Source of Truth**: [contract.json](https://brainfile.md/v1/contract.json)

## Object Structure

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| `status` | `string` | Current lifecycle state (see below) | Yes |
| `deliverables` | `Array<Deliverable>` | List of items to be produced | No |
| `validation` | `Validation` | How to verify the work | No |
| `constraints` | `Array<string>` | Implementation rules to follow | No |
| `context` | `Context` | Additional background information | No |

## Lifecycle Status (`status`)

Contracts follow a strict state machine to coordinate between different agents.

- `draft`: Contract is being defined.
- `ready`: Work is defined and available for an agent to pick up.
- `in_progress`: An agent has claimed the task and is working on it.
- `delivered`: Work is completed and submitted for validation.
- `done`: Work has passed validation and is finalized.
- `failed`: Work failed validation or was abandoned.

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

## Context Object

Used to provide deeper understanding to the worker agent.

| Field | Type | Description |
|-------|------|-------------|
| `background` | `string` | High-level "why" and architectural context |
| `relevantFiles`| `Array<string>`| Paths to existing code for reference |
| `outOfScope` | `Array<string>`| Explicitly forbidden changes |

---

## Example (YAML)

When stored in `brainfile.md`, a contract looks like this:

```yaml
id: task-63
title: "Update API documentation"
contract:
  status: ready
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
  context:
    background: "Preparing for the Q3 mobile app release"
    relevantFiles:
      - src/routes/api.ts
    outOfScope:
      - Changing the authentication logic
```
