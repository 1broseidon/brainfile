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

## Required Fields

### `status`

**Type**: `string`
**Enum**: `ready`, `in_progress`, `delivered`, `done`, `failed`, `blocked`
**Description**: Contract lifecycle status

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
    - type: file
      path: src/rateLimiter.ts
      description: Token bucket implementation
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
    commands:
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
  constraints:
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
    pickedUpAt: "2026-02-18T10:00:00Z"
    deliveredAt: "2026-02-18T12:30:00Z"
    duration: 9000
    reworkCount: 0
```

::: info v2 migration note
In v2, `context.background` moved to `task.description` and `context.relevantFiles` moved to `task.relatedFiles`. The `context` object is deprecated.
:::

## See Also

- [Agent Contracts Guide](/guides/contracts)
- [Board Schema](./board.md)

