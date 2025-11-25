# Board Schema

The board schema defines Kanban-style task boards with columns and tasks. This is the original and most mature brainfile type.

## Schema URL

```
https://brainfile.md/v1/board.json
```

## Overview

Board files organize tasks into columns, typically representing workflow stages (To Do, In Progress, Done). They're ideal for:

- Sprint planning
- Feature development tracking
- Bug triage boards
- Personal task management
- Team project coordination

## Extends

[Base Schema](./base.md) - Inherits all base fields

## Type Identifier

```yaml
type: board
```

## Required Fields

### `columns`

**Type**: `array` of `column` objects
**Min Items**: 1
**Description**: Task columns representing workflow stages

```yaml
columns:
  - id: todo
    title: To Do
    order: 1
    tasks: []
  - id: in-progress
    title: In Progress
    order: 2
    tasks: []
  - id: done
    title: Done
    order: 3
    tasks: []
```

## Optional Fields

### `statsConfig`

**Type**: `object`
**Description**: Configuration for progress statistics

```yaml
statsConfig:
  columns:
    - todo
    - in-progress
    - done
```

The `columns` array specifies which column IDs to include in progress calculations. Typically excludes archive or backlog columns.

### `archive`

**Type**: `array` of `task` objects
**Description**: Archived tasks removed from active columns

```yaml
archive:
  - id: task-100
    title: Old completed task
    ...
```

Use for:
- Keeping completed work history
- Reducing active task clutter
- Historical reference
- Reporting and analytics

## Column Structure

### Required Column Fields

#### `id`

**Type**: `string`
**Pattern**: `^[a-z]+(-[a-z]+)*$` (kebab-case)
**Description**: Unique column identifier

```yaml
id: in-progress
```

Rules:
- Lowercase only
- Hyphen-separated words
- No spaces or special characters
- Must be unique across columns

#### `title`

**Type**: `string`
**Description**: Display title for the column

```yaml
title: In Progress
```

#### `tasks`

**Type**: `array` of `task` objects
**Description**: Tasks in this column

```yaml
tasks:
  - id: task-1
    title: First task
```

### Optional Column Fields

#### `order`

**Type**: `integer`
**Minimum**: 0
**Description**: Display order (lower numbers first)

```yaml
order: 2
```

Columns without `order` appear after ordered columns, in definition order.

## Task Structure

### Required Task Fields

#### `id`

**Type**: `string`
**Pattern**: `^task-[0-9]+$`
**Description**: Unique task identifier

```yaml
id: task-42
```

Format: `task-` followed by numbers. IDs must be unique across all columns and archive.

#### `title`

**Type**: `string`
**Description**: Task title

```yaml
title: Implement user authentication
```

### Optional Task Fields

#### `description`

**Type**: `string`
**Supports**: Markdown
**Description**: Detailed task description

```yaml
description: |
  ## Requirements
  - JWT-based authentication
  - Login/logout endpoints
  - Token refresh mechanism

  ## Acceptance Criteria
  - [ ] User can log in
  - [ ] User can log out
  - [ ] Tokens expire after 1 hour
```

#### `assignee`

**Type**: `string`
**Description**: Person assigned to the task

```yaml
assignee: alice
```

#### `tags`

**Type**: `array` of `string`
**Description**: Task categorization tags

```yaml
tags:
  - backend
  - security
  - urgent
```

#### `priority`

**Type**: `string`
**Enum**: `low`, `medium`, `high`, `critical`
**Description**: Task priority level

```yaml
priority: high
```

Visual representation:
- `low`: 🔵 Blue
- `medium`: 🟡 Yellow
- `high`: 🟠 Orange
- `critical`: 🔴 Red

#### `effort`

**Type**: `string`
**Enum**: `trivial`, `small`, `medium`, `large`, `xlarge`
**Description**: Estimated effort for AI planning

```yaml
effort: medium
```

Use for:
- Sprint planning
- Resource allocation
- AI-assisted task breakdown
- Velocity tracking

#### `blockedBy`

**Type**: `array` of task IDs
**Pattern**: `^task-[0-9]+$`
**Description**: Tasks that must complete first

```yaml
blockedBy:
  - task-10
  - task-15
```

#### `dueDate`

**Type**: `string` (ISO 8601 date)
**Format**: `date` (YYYY-MM-DD)
**Description**: Task deadline

```yaml
dueDate: "2025-12-31"
```

#### `createdAt`

**Type**: `string` (ISO 8601 timestamp)
**Format**: `date-time`
**Description**: When the task was created

```yaml
createdAt: "2025-11-24T10:30:00Z"
```

**New in v0.5.0**: Enables creation time tracking and analytics.

#### `updatedAt`

**Type**: `string` (ISO 8601 timestamp)
**Format**: `date-time`
**Description**: When the task was last modified

```yaml
updatedAt: "2025-11-24T16:45:00Z"
```

**New in v0.5.0**: Tracks last modification for staleness detection.

#### `relatedFiles`

**Type**: `array` of `string`
**Description**: File paths or code locations

```yaml
relatedFiles:
  - src/auth/jwt.ts
  - src/middleware/auth.ts
  - tests/auth.test.ts
```

Supports:
- File paths: `src/components/Button.tsx`
- Line numbers: `src/utils/helpers.ts:42`
- Line ranges: `src/api/users.ts:10-25`

#### `subtasks`

**Type**: `array` of `subtask` objects
**Description**: Granular progress tracking

```yaml
subtasks:
  - id: task-1-1
    title: Design authentication flow
    completed: true
  - id: task-1-2
    title: Implement JWT generation
    completed: false
  - id: task-1-3
    title: Write tests
    completed: false
```

#### `template`

**Type**: `string`
**Enum**: `bug`, `feature`, `refactor`
**Description**: Task template type

```yaml
template: feature
```

Templates provide default structures:
- **bug**: Reproduction steps, environment, fix verification
- **feature**: Requirements, design, implementation, testing
- **refactor**: Analysis, design, implementation, performance

## Subtask Structure

### Required Subtask Fields

#### `id`

**Type**: `string`
**Pattern**: Typically `task-N-M`
**Description**: Unique subtask identifier

```yaml
id: task-1-3
```

#### `title`

**Type**: `string`
**Description**: Subtask title

```yaml
title: Write integration tests
```

#### `completed`

**Type**: `boolean`
**Description**: Whether subtask is done

```yaml
completed: false
```

## Complete Example

```yaml
---
type: board
schema: https://brainfile.md/v1/board.json
title: Product Development
protocolVersion: 1.0.0
agent:
  instructions:
    - Modify only the YAML frontmatter
    - Update task status as work progresses
    - Preserve all task IDs
rules:
  always:
    - id: 1
      rule: test all features before moving to done
    - id: 2
      rule: link related files for each task
  never:
    - id: 1
      rule: skip code review
  prefer:
    - id: 1
      rule: small focused tasks over large epics
columns:
  - id: todo
    title: To Do
    order: 1
    tasks:
      - id: task-1
        title: Add user authentication
        description: |
          Implement JWT-based authentication with:
          - Login/logout endpoints
          - Token refresh
          - Protected routes
        priority: high
        effort: large
        tags:
          - backend
          - security
        template: feature
        assignee: alice
        createdAt: "2025-11-24T10:00:00Z"
        relatedFiles:
          - src/auth/jwt.ts
          - src/middleware/auth.ts
        subtasks:
          - id: task-1-1
            title: Implement JWT generation
            completed: false
          - id: task-1-2
            title: Create login endpoint
            completed: false
          - id: task-1-3
            title: Write tests
            completed: false
  - id: in-progress
    title: In Progress
    order: 2
    tasks: []
  - id: done
    title: Done
    order: 3
    tasks:
      - id: task-2
        title: Set up CI/CD pipeline
        priority: medium
        tags:
          - devops
        createdAt: "2025-11-20T10:00:00Z"
        updatedAt: "2025-11-23T16:45:00Z"
        subtasks:
          - id: task-2-1
            title: Configure GitHub Actions
            completed: true
          - id: task-2-2
            title: Test deployment
            completed: true
statsConfig:
  columns:
    - todo
    - in-progress
    - done
---
```

## Use Cases

### Sprint Board

```yaml
columns:
  - id: backlog
    title: Backlog
    order: 1
  - id: sprint
    title: Sprint
    order: 2
  - id: in-progress
    title: In Progress
    order: 3
  - id: review
    title: Review
    order: 4
  - id: done
    title: Done
    order: 5
```

### Bug Triage

```yaml
columns:
  - id: reported
    title: Reported
    order: 1
  - id: triaged
    title: Triaged
    order: 2
  - id: in-progress
    title: In Progress
    order: 3
  - id: fixed
    title: Fixed
    order: 4
  - id: verified
    title: Verified
    order: 5
```

### Personal GTD

```yaml
columns:
  - id: inbox
    title: Inbox
    order: 1
  - id: next
    title: Next Actions
    order: 2
  - id: waiting
    title: Waiting
    order: 3
  - id: someday
    title: Someday/Maybe
    order: 4
  - id: done
    title: Done
    order: 5
```

## Best Practices

### Column Design

- **Keep it simple**: 3-5 columns is usually sufficient
- **Clear stages**: Each column should represent a distinct workflow stage
- **Use order**: Explicit `order` prevents visual inconsistency
- **Stats config**: Exclude backlog/archive from progress calculations

### Task Management

- **Atomic tasks**: Each task should be independently completable
- **Clear titles**: Task titles should be actionable (verb + object)
- **Use subtasks**: Break large tasks into trackable steps
- **Link files**: Always include `relatedFiles` for context
- **Set priorities**: Use priority for urgent or blocking tasks

### AI Agent Integration

```yaml
agent:
  instructions:
    - Move tasks to in-progress when starting work
    - Update task status before committing code
    - Mark subtasks complete as you finish them
    - Add timestamps when creating or updating tasks
```

## Migration from Legacy

Old files without `type`:
```yaml
---
title: My Project
columns: [...]
---
```

Migrate by adding `type: board`:
```yaml
---
type: board
title: My Project
columns: [...]
---
```

Optionally add timestamps to existing tasks:
```yaml
tasks:
  - id: task-1
    title: Existing task
    createdAt: "2025-11-24T10:00:00Z"  # Add creation time
```

## See Also

- [Base Schema](./base.md)
- [Example Board](../../example/board.md)
