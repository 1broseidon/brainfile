# Checklist Schema (Design Preview)

**Status**: 🔜 Design Phase - Implementation planned for Phase 4

The checklist schema will define flat, ordered lists of items for procedural tasks, routines, and step-by-step guides.

## Schema URL

```
https://brainfile.md/v1/checklist.json
```

## Overview

Checklist files organize items in a single flat list, ideal for:

- Procedural checklists (deployment, onboarding)
- Daily routines and habits
- Pre-flight checks
- Quality assurance lists
- Code review checklists
- Meeting agendas

## Extends

[Base Schema](./base.md) - Inherits all base fields

## Type Identifier

```yaml
type: checklist
```

## Proposed Structure

### Required Fields

#### `items`

**Type**: `array` of `item` objects
**Description**: Flat list of checklist items

```yaml
items:
  - id: item-1
    title: Run unit tests
    completed: false
  - id: item-2
    title: Check code coverage
    completed: false
```

### Optional Fields

#### `sequential`

**Type**: `boolean`
**Default**: `false`
**Description**: Whether items must be completed in order

```yaml
sequential: true
```

When `true`, items cannot be completed until previous items are done.

#### `allowSkip`

**Type**: `boolean`
**Default**: `true`
**Description**: Whether items can be skipped in sequential mode

```yaml
sequential: true
allowSkip: false  # All items must be completed
```

#### `resetOnComplete`

**Type**: `boolean`
**Default**: `false`
**Description**: Whether to reset all items when last item is completed

```yaml
resetOnComplete: true  # For recurring checklists
```

## Item Structure

### Required Item Fields

```yaml
id: string           # Unique identifier
title: string        # Item description
completed: boolean   # Completion status
```

### Optional Item Fields

```yaml
description: string      # Detailed description (markdown)
order: integer          # Explicit ordering
required: boolean       # Cannot be skipped (default: true)
tags: array<string>     # Categorization
assignee: string        # Person responsible
dueDate: timestamp      # Item deadline
completedAt: timestamp  # When completed
completedBy: string     # Who completed it
notes: string           # Additional notes (markdown)
url: string             # Related resource link
```

## Proposed Example

```yaml
---
type: checklist
schema: https://brainfile.md/v1/checklist.json
title: Production Deployment Checklist
protocolVersion: 0.5.0
sequential: true
allowSkip: false
agent:
  instructions:
    - Mark items as completed in order
    - Do not skip required items
    - Add completion timestamps
rules:
  always:
    - id: 1
      rule: complete all items before deploying
  never:
    - id: 1
      rule: skip security checks
items:
  - id: item-1
    title: Run full test suite
    description: |
      Execute all unit, integration, and e2e tests.
      Ensure 100% pass rate before proceeding.
    completed: false
    required: true
    order: 1
    tags: [testing, critical]
  - id: item-2
    title: Check code coverage
    description: Verify code coverage is above 80%
    completed: false
    required: true
    order: 2
    tags: [testing, quality]
  - id: item-3
    title: Review security scan results
    description: |
      Check for vulnerabilities:
      - SQL injection
      - XSS
      - CSRF
      - Dependency vulnerabilities
    completed: false
    required: true
    order: 3
    tags: [security, critical]
    url: https://security-scanner.example.com
  - id: item-4
    title: Update changelog
    description: Document all changes in CHANGELOG.md
    completed: false
    required: true
    order: 4
    tags: [documentation]
  - id: item-5
    title: Tag release in git
    description: |
      ```bash
      git tag -a v1.2.3 -m "Release v1.2.3"
      git push origin v1.2.3
      ```
    completed: false
    required: true
    order: 5
    tags: [release]
  - id: item-6
    title: Deploy to staging
    description: Verify deployment on staging environment
    completed: false
    required: true
    order: 6
    tags: [deployment, staging]
  - id: item-7
    title: Run smoke tests on staging
    description: Execute critical path smoke tests
    completed: false
    required: true
    order: 7
    tags: [testing, staging]
  - id: item-8
    title: Get deployment approval
    description: Obtain sign-off from tech lead
    completed: false
    required: true
    order: 8
    assignee: tech-lead
  - id: item-9
    title: Deploy to production
    description: |
      Execute production deployment:
      ```bash
      ./scripts/deploy-production.sh
      ```
    completed: false
    required: true
    order: 9
    tags: [deployment, production, critical]
  - id: item-10
    title: Monitor error rates
    description: Watch error tracking for 30 minutes post-deploy
    completed: false
    required: true
    order: 10
    tags: [monitoring, production]
  - id: item-11
    title: Announce deployment
    description: Notify team in #engineering channel
    completed: false
    required: false
    order: 11
    tags: [communication]
---

# Production Deployment Checklist

Critical checklist for deploying code to production. All items must be completed in order.

## How to Use

1. Create a copy of this checklist for each deployment
2. Work through items sequentially
3. Do not skip required items
4. Add completion notes as you go
5. Archive after successful deployment

## Rollback Procedure

If any critical item fails:
1. Stop deployment immediately
2. Execute rollback script
3. Investigate root cause
4. Fix and restart checklist
```

## Use Cases

### Deployment Checklist

```yaml
items:
  - title: Run tests
  - title: Update changelog
  - title: Tag release
  - title: Deploy to staging
  - title: Deploy to production
```

### Daily Routine

```yaml
resetOnComplete: true
items:
  - title: Morning standup
    completed: false
  - title: Check emails
    completed: false
  - title: Review PRs
    completed: false
  - title: Update task board
    completed: false
```

### Code Review Checklist

```yaml
items:
  - title: Code follows style guide
    required: true
  - title: Tests are included
    required: true
  - title: Documentation is updated
    required: false
  - title: No security vulnerabilities
    required: true
  - title: Performance impact assessed
    required: true
```

### Onboarding Checklist

```yaml
sequential: true
items:
  - title: Create accounts
    description: |
      - GitHub
      - Slack
      - Email
    assignee: hr
  - title: Assign hardware
    assignee: it
  - title: Schedule orientation
    assignee: manager
  - title: Add to team channels
    assignee: manager
```

### Meeting Agenda

```yaml
items:
  - title: Review previous action items
    completed: false
  - title: Discuss roadmap progress
    completed: false
  - title: Design review for feature X
    completed: false
  - title: Assign next sprint tasks
    completed: false
  - title: Set next meeting date
    completed: false
```

## Key Features

### Sequential Mode

When `sequential: true`:
- Items are completed in order
- UI disables uncompleted items after first incomplete
- Progress bar shows linear advancement
- Enforces process compliance

### Required vs Optional

- **Required items**: Must be completed (cannot skip)
- **Optional items**: Can be skipped in sequential mode
- Useful for must-do vs nice-to-have items

### Reset on Complete

For recurring checklists:
```yaml
resetOnComplete: true
```
When last item is checked, all items reset to `completed: false`.

### Completion Tracking

```yaml
- id: item-5
  title: Deploy to staging
  completed: true
  completedAt: "2025-11-24T14:30:00Z"
  completedBy: alice
  notes: Deployment succeeded without issues
```

## Comparison with Other Types

| Feature | Checklist | Board | Journal |
|---------|-----------|-------|---------|
| **Primary Structure** | Flat list | Columns | Chronological entries |
| **Item Type** | Checklist items | Tasks | Journal entries |
| **Organization** | Sequential/ordered | Workflow stages | Temporal |
| **Completion** | Binary (done/not done) | Subtask progress | N/A |
| **Best For** | Procedures | Projects | Logs |
| **Reusability** | High (reset) | Low | N/A |

## Comparison with Board Tasks

### When to Use Checklist

Use checklist when:
- Items are procedural steps
- Order matters (sequential)
- Simple completion (no subtasks)
- Reusable template (reset on complete)
- Single-pass workflow

### When to Use Board

Use board when:
- Items are independent tasks
- Status transitions (todo → in-progress → done)
- Complex tasks with subtasks
- Parallel work (multiple columns)
- Long-term tracking

### Example Comparison

**Checklist** (Deployment procedure):
```yaml
type: checklist
sequential: true
items:
  - Run tests
  - Tag release
  - Deploy to staging
  - Deploy to production
```

**Board** (Sprint planning):
```yaml
type: board
columns:
  - id: todo
    tasks:
      - Implement auth
      - Build dashboard
  - id: in-progress
    tasks: []
```

## Design Decisions

### Flat Structure

**Decision**: Single flat list, no nested items

**Rationale**:
- Checklists are inherently simple
- Nesting adds complexity
- For complex workflows, use board type
- Keep checklist focused on "do this, then that"

### Sequential Mode

**Decision**: Optional sequential enforcement

**Rationale**:
- Some checklists require order (deployment)
- Others don't (meeting agenda)
- Optional flag provides flexibility
- Enforced in UI, not schema

### Reset Behavior

**Decision**: Optional reset on completion

**Rationale**:
- Enables recurring checklists (daily routines)
- Opt-in to avoid accidental data loss
- Maintains completion history before reset
- Timestamp tracking shows when reset occurred

## Implementation Plan (Phase 4)

1. **Schema Definition**
   - Define checklist.json schema
   - Define item structure
   - Add validation rules

2. **Core Library**
   - Implement checklist parser
   - Add type inference
   - Create validation logic
   - Implement reset behavior

3. **CLI Support**
   - Add `brainfile checklist` commands
   - Implement add/remove/complete operations
   - Create template management

4. **VSCode Extension**
   - Build checklist view UI
   - Add sequential mode enforcement
   - Implement reset functionality
   - Add completion tracking
   - Show progress indicators

5. **Advanced Features**
   - Checklist templates
   - Completion history
   - Analytics (time to complete)
   - Recurring schedules

## Open Questions

1. **Nested Items**: Should we support sub-items?
   - **Current**: Flat list only
   - **Alternative**: One level of nesting
   - **Decision**: Start flat, add nesting if needed

2. **Dependencies**: Should items depend on other items?
   - **Current**: Sequential mode only
   - **Alternative**: Explicit dependencies like board blockedBy
   - **Decision**: Keep simple, use board for complex dependencies

3. **Templates**: How to manage checklist templates?
   - **Option A**: Separate template files
   - **Option B**: Template field in brainfile
   - **Option C**: Template registry

4. **Recurring Schedule**: How to handle daily/weekly checklists?
   - **Phase 4**: Manual reset only
   - **Future**: Automatic scheduling

## Related Resources

- [Base Schema](./base.md)
- [Board Schema](./board.md)
- [Schema Evolution Roadmap](../../SCHEMA_EVOLUTION_ROADMAP.md)
- [Phase 4 Plan](../../SCHEMA_EVOLUTION_ROADMAP.md#phase-4-implement-additional-types)

## Feedback Welcome

This is a design preview. If you have suggestions or use cases we haven't considered, please open an issue or discussion on the Brainfile repository.

---

**Status**: Design only - Schema not yet implemented
**Target**: Phase 4 (Month 7-8)
**Next Steps**: Finalize design based on user feedback
