# Contract Schema

The contract schema defines an optional `contract` object that can be attached to a task. Contracts are designed for PM-to-agent workflows: they specify what must be produced, how it can be validated, and any constraints to follow.

::: tip See also
For the formal field table and object structure, see [Reference → Contract Schema](/reference/contract-schema).
:::

## Schema URL

```
https://brainfile.md/v2/contract.json
```


## Used In

- [Board Schema](./board.md) — `task.contract`

## Overview

A contract is a structured, machine-friendly agreement attached to a task. It supports:

- Contract lifecycle status tracking (`ready` → `in_progress` → `delivered` → `done` / `failed`)
- Explicit deliverables (files, docs, tests, links, etc.)
- Optional validation commands that can be run by a PM or tool
- Optional implementation constraints and context

::: tip Quick Reference — CLI Commands
| Action | Command |
|--------|---------|
| Create task with contract | `brainfile add --title "..." --with-contract --deliverable "file:path:desc"` |
| Pick up contract | `brainfile contract pickup -t task-123` |
| Deliver work | `brainfile contract deliver -t task-123` |
| Validate delivery | `brainfile contract validate -t task-123` |
| List by status | `brainfile list --contract ready` |
:::

## Required Fields

### `status`

**Type**: `string`
**Enum**: `ready`, `in_progress`, `delivered`, `done`, `failed`, `blocked`
**Description**: Contract lifecycle status

- 🔵 `ready` — Available for pickup
- 🟡 `in_progress` — Agent is working
- 📦 `delivered` — Submitted for review
- ✅ `done` — Validated and approved
- ❌ `failed` — Rejected, needs rework
- 🚫 `blocked` — Waiting on external dependency

```yaml
contract:
  status: ready
```

## Optional Fields

### `deliverables`

**Type**: `array` of `deliverable` objects
**Description**: Specific artifacts that must be produced

```yaml
contract:
  status: in_progress
  deliverables:
    - type: file                    # Optional — category for tooling
      path: src/rateLimiter.ts      # Required — file path or identifier
      description: Token bucket implementation  # Optional — human-readable
    - type: test
      path: src/__tests__/rateLimiter.test.ts
      description: Unit tests
```

#### `deliverable.type`

**Type**: `string`
**Description**: Deliverable category (tooling may use this for checks)

Common values include: `file`, `test`, `docs`, `design`, `research`.

#### `deliverable.path`

**Type**: `string`
**Description**: Path or identifier for the deliverable

#### `deliverable.description`

**Type**: `string`
**Description**: Optional human-readable description

### `validation`

**Type**: `object`
**Description**: Optional validation configuration

```yaml
contract:
  status: delivered
  validation:
    commands:                       # Run sequentially during validate
      - npm test
      - npm run build
```

#### `validation.commands`

**Type**: `array` of `string`
**Description**: Shell commands to run for automated verification

### `constraints`

**Type**: `array` of `string`
**Description**: Rules or constraints to follow during implementation

```yaml
contract:
  status: in_progress
  constraints:                      # Not validated automatically
    - Make minimal changes
    - Keep backwards compatibility
```

### `outOfScope`

**Type**: `array` of `string`
**Description**: Explicitly out-of-scope items

```yaml
contract:
  status: ready
  outOfScope:
    - Redesigning unrelated schemas
```

### `feedback`

**Type**: `string`
**Description**: PM feedback after failed validation. Used for rework guidance.

### `version`

**Type**: `integer`
**Description**: Contract version number. Increment when amending a contract.

### `metrics`

**Type**: `object`
**Description**: Auto-tracked timing and rework data (managed by CLI).

```yaml
contract:
  metrics:
    pickedUpAt: "2026-02-18T10:00:00Z"   # Auto-set on pickup
    deliveredAt: "2026-02-18T12:30:00Z"  # Auto-set on deliver
    duration: 9000                        # Seconds (auto-calculated)
    reworkCount: 0                        # Incremented on re-pickup
```

::: info v2 migration note
In v2, `context.background` moved to `task.description` and `context.relevantFiles` moved to `task.relatedFiles`. The `context` object is deprecated.
:::

## See Also

- [Agent Contracts Guide](/guides/contracts)
- [Board Schema](./board.md)

