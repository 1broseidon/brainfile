# Contract Schema

The contract schema defines an optional `contract` object that can be attached to a task. Contracts are designed for PM-to-agent workflows: they specify what must be produced, how it can be validated, and any constraints to follow.

## Schema URL

```
https://brainfile.md/v1/contract.json
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
**Enum**: `draft`, `ready`, `in_progress`, `delivered`, `done`, `failed`
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

### `context`

**Type**: `object`
**Description**: Optional additional context

```yaml
contract:
  status: ready
  context:
    background: This work is part of the v1 protocol stabilization effort.
    relevantFiles:
      - protocol/v1/board.json
      - protocol/docs/types/board.md
    outOfScope:
      - Redesigning unrelated schemas
```

#### `context.background`

**Type**: `string`
**Description**: Background notes for the agent

#### `context.relevantFiles`

**Type**: `array` of `string`
**Description**: Additional file paths or code locations relevant to the contract

#### `context.outOfScope`

**Type**: `array` of `string`
**Description**: Explicitly out-of-scope items

## See Also

- [Agent Contracts Guide](/guides/contracts)
- [Board Schema](./board.md)

