# Journal Schema

The journal schema defines time-ordered journal entries for daily logs, decision tracking, and temporal notes.

## Schema URL

```
https://brainfile.md/v1/journal.json
```

## Overview

Journal files organize entries chronologically, typically representing daily logs, standup notes, or decision journals. They're ideal for:

- Daily development logs
- Work session notes
- Decision documentation
- Mood and productivity tracking
- Technical learning journals
- Meeting notes with timestamps

## Extends

[Base Schema](./base.md) - Inherits all base fields

## Type Identifier

```yaml
type: journal
```

## Required Fields

### `entries`

**Type**: `array` of `entry` objects
**Min Items**: 0
**Description**: Time-ordered journal entries (newest first)

```yaml
entries:
  - id: "2025-11-24"
    title: "2025-11-24 - Schema Evolution Planning"
    createdAt: "2025-11-24T10:30:00Z"
  - id: "2025-11-23"
    title: "2025-11-23 - Bug Fixes"
    createdAt: "2025-11-23T09:00:00Z"
```

**Best Practice**: Keep entries in reverse chronological order (newest first) for easier scanning.

## Entry Structure

### Required Entry Fields

#### `id`

**Type**: `string`
**Pattern**: `^[0-9]{4}-[0-9]{2}-[0-9]{2}$` (ISO date format)
**Description**: Unique entry identifier

```yaml
id: "2025-11-24"
```

Format: `YYYY-MM-DD`. For multiple entries per day, use suffixes:
- `"2025-11-24"` - Main entry
- `"2025-11-24-morning"` - Morning entry
- `"2025-11-24-afternoon"` - Afternoon entry

#### `title`

**Type**: `string`
**Description**: Entry title

```yaml
title: "2025-11-24 - Schema Evolution Planning"
```

**Best Practice**: Include date and brief topic for scanability.

### Optional Entry Fields

#### `createdAt`

**Type**: `string` (ISO 8601 timestamp)
**Format**: `date-time`
**Description**: When the entry was created

```yaml
createdAt: "2025-11-24T10:30:00Z"
```

**New in v0.5.0**: Essential for journal entries to track exact creation time.

#### `updatedAt`

**Type**: `string` (ISO 8601 timestamp)
**Format**: `date-time`
**Description**: When the entry was last modified

```yaml
updatedAt: "2025-11-24T16:45:00Z"
```

**Use Case**: Track when entries are revised or updated.

#### `summary`

**Type**: `string`
**Description**: Brief one-line summary of the entry

```yaml
summary: "Designed base schema architecture and created comprehensive roadmap"
```

**Best Practice**: Keep summaries to one sentence for quick scanning.

#### `mood`

**Type**: `string`
**Enum**: `productive`, `neutral`, `frustrated`, `energized`, `blocked`
**Description**: Subjective mood or productivity level

```yaml
mood: productive
```

Use for:
- Personal productivity tracking
- Identifying patterns in work satisfaction
- Retrospective analysis
- Team morale insights

#### `tags`

**Type**: `array` of `string`
**Description**: Categorization tags

```yaml
tags:
  - planning
  - schema-evolution
  - brainfile
```

#### `content`

**Type**: `string`
**Supports**: Markdown
**Description**: Main entry content

```yaml
content: |
  ## What I Worked On

  Today was a major planning day:
  - Created roadmap document
  - Designed base schema
  - Implemented examples

  ## Key Decisions

  Chose polymorphic schema approach...

  ## Tomorrow

  - Start type inference implementation
```

**Best Practice**: Use consistent markdown structure across entries.

#### `relatedTasks`

**Type**: `array` of task IDs
**Pattern**: `^task-[0-9]+$`
**Description**: Tasks related to this entry

```yaml
relatedTasks:
  - task-31
  - task-32
  - task-37
```

Use for:
- Linking daily work to task board
- Cross-referencing between brainfiles
- Progress tracking

## Complete Example

```yaml
---
type: journal
schema: https://brainfile.md/v1/journal.json
title: Dev Log 2025
protocolVersion: 0.5.0
agent:
  instructions:
    - Append new entries at the top
    - Use ISO date format (YYYY-MM-DD) for entry IDs
    - Preserve chronological order (newest first)
    - Include summary for each entry
  llmNotes: Daily developer journal for tracking work progress and decisions
rules:
  always:
    - id: 1
      rule: add entry for each work session
    - id: 2
      rule: include what was accomplished and what's blocked
  prefer:
    - id: 1
      rule: brief summaries over lengthy descriptions
entries:
  - id: "2025-11-24"
    title: "2025-11-24 - Schema Evolution Planning"
    createdAt: "2025-11-24T10:30:00Z"
    updatedAt: "2025-11-24T16:45:00Z"
    tags:
      - planning
      - schema-evolution
      - brainfile
    mood: productive
    summary: "Designed base schema architecture and created comprehensive roadmap for multi-type support"
    content: |
      ## What I Worked On

      Today was a major planning day for the Brainfile schema evolution project:

      - ✅ Created complete roadmap document (SCHEMA_EVOLUTION_ROADMAP.md)
      - ✅ Designed base schema architecture with type discriminator
      - ✅ Implemented v1/base.json, v1/board.json, and v1/journal.json
      - ✅ Updated v1.json with optional type field for backward compatibility
      - ✅ Created example files for all types

      ## Key Decisions

      **Type System Architecture**
      - Chose polymorphic schema approach with base + type-specific schemas
      - Type field optional initially (defaults to board) for backward compatibility
      - Used JSON Schema `allOf` pattern for extension

      **Timeline**
      - Phase 0: 2 weeks (foundation & planning)
      - Phase 1-5: 6-9 months total
      - No breaking changes until v1.0.0

      ## Blockers

      None today! Everything went smoothly.

      ## Tomorrow

      - Start implementing type inference in core library
      - Create comprehensive test suite for schema validation
      - Begin documentation updates

      ## Notes

      The analysis session that led to this was incredibly valuable. Having an unbiased
      exploration of the schema evolution helped identify gaps we hadn't considered.
    relatedTasks:
      - task-31
      - task-32
      - task-37
  - id: "2025-11-23"
    title: "2025-11-23 - VSCode Extension Bug Fixes"
    createdAt: "2025-11-23T09:00:00Z"
    updatedAt: "2025-11-23T17:30:00Z"
    tags:
      - bug-fix
      - vscode
      - drag-drop
    mood: energized
    summary: "Fixed cross-column drag-and-drop persistence bug in VSCode extension"
    content: |
      ## What I Worked On

      Spent the day debugging the drag-and-drop issue:

      - 🐛 Fixed cross-column drag not persisting after drop
      - ✅ Added debug logging to trace event flow
      - ✅ Verified boardOperations.moveTask handles cross-column moves
      - ✅ Confirmed file writes and board refreshes work correctly

      ## Technical Details

      The issue was in Column.vue's handleEnd() method. The Sortable.js event
      data wasn't being extracted correctly for cross-column moves. Fixed by:

      ```typescript
      const fromColumnId = event.from.dataset.columnId;
      const toColumnId = event.to.dataset.columnId;
      ```

      ## Testing

      - ✅ Within-column reordering works
      - ✅ Cross-column drag persists correctly
      - ✅ Multiple rapid moves don't cause conflicts
      - ✅ Undo/redo works as expected

      ## Tomorrow

      - Start Phase 0 planning
      - Design base schema architecture
    relatedTasks:
      - task-28
---

# Dev Log 2025

This journal tracks daily progress, decisions, and learnings from the Brainfile development project.

## Purpose

- **Daily Standup Notes**: What I worked on, what's blocked, what's next
- **Decision Log**: Important architectural and design decisions
- **Learning Journal**: Technical insights and lessons learned
- **Mood Tracking**: Reflection on productivity and challenges

## Related Boards

- [Main Development Board](./board.md)
- [VSCode Extension Board](../vscode/brainfile.md)
```

## Use Cases

### Daily Dev Log

```yaml
entries:
  - id: "2025-11-24"
    title: "2025-11-24 - Work Session"
    mood: productive
    summary: "Implemented authentication feature"
    content: |
      ## Done
      - JWT token generation
      - Login endpoint
      - Tests passing

      ## Blocked
      - Need design review for UI

      ## Tomorrow
      - Build login form
```

### Standup Notes

```yaml
entries:
  - id: "2025-11-24"
    title: "2025-11-24 - Daily Standup"
    summary: "Sprint progress update"
    content: |
      **Yesterday**: Completed user auth (task-42)
      **Today**: Working on dashboard UI (task-43)
      **Blockers**: Waiting on API spec from backend team
    relatedTasks:
      - task-42
      - task-43
```

### Decision Journal

```yaml
entries:
  - id: "2025-11-24"
    title: "2025-11-24 - Architecture Decision: State Management"
    tags:
      - architecture
      - decision
    summary: "Chose Zustand over Redux for state management"
    content: |
      ## Context
      Need to decide on state management library for new project.

      ## Options Considered
      1. Redux - Industry standard, verbose
      2. Zustand - Lightweight, minimal boilerplate
      3. Jotai - Atomic state, learning curve

      ## Decision
      Going with Zustand because:
      - Minimal boilerplate (80% less code than Redux)
      - TypeScript-first design
      - No Provider wrapper needed
      - Easy to test

      ## Consequences
      - Less community resources than Redux
      - Team needs to learn new patterns
      - Migration path to Redux if needed later
```

### Learning Journal

```yaml
entries:
  - id: "2025-11-24"
    title: "2025-11-24 - TIL: JSON Schema Composition"
    tags:
      - learning
      - json-schema
    mood: energized
    summary: "Learned about allOf pattern for schema inheritance"
    content: |
      ## What I Learned

      JSON Schema's `allOf` keyword allows clean composition:

      ```json
      {
        "allOf": [
          { "$ref": "base.json" },
          { "properties": { "extra": {...} } }
        ]
      }
      ```

      ## Why It Matters

      - Avoids duplication across schemas
      - Clear parent-child relationships
      - Excellent validator support

      ## Resources

      - [JSON Schema docs](https://json-schema.org/understanding-json-schema/reference/combining.html#allof)
```

### Meeting Notes

```yaml
entries:
  - id: "2025-11-24-standup"
    title: "2025-11-24 - Team Standup"
    createdAt: "2025-11-24T09:00:00Z"
    tags:
      - meeting
      - standup
    content: |
      ## Attendees
      - Alice (frontend)
      - Bob (backend)
      - Carol (design)

      ## Updates

      **Alice**: Completed login UI, starting dashboard
      **Bob**: Auth API done, working on rate limiting
      **Carol**: Finished mockups, ready for review

      ## Action Items
      - [ ] Alice: Review Carol's mockups by EOD
      - [ ] Bob: Deploy auth to staging
      - [ ] Carol: Update design system docs
```

## Best Practices

### Entry Structure

- **Consistent Format**: Use the same markdown structure across entries
- **Scannable Titles**: Include date and brief topic
- **Short Summaries**: One sentence per entry for quick reference
- **Newest First**: Reverse chronological order for easy access

### Content Organization

```yaml
content: |
  ## What I Worked On
  [Today's accomplishments]

  ## Key Decisions
  [Important choices made]

  ## Blockers
  [Current obstacles]

  ## Tomorrow
  [Next steps]

  ## Notes
  [Additional thoughts]
```

### Mood Tracking

Use mood consistently:
- `productive` - High output, accomplishments made
- `energized` - Excited, motivated, learning
- `neutral` - Standard work day
- `frustrated` - Obstacles, challenges, debugging
- `blocked` - Waiting on others, can't progress

### Tags

Use tags for filtering and categorization:
- **Work type**: `bug-fix`, `feature`, `refactor`, `research`
- **Technology**: `vscode`, `typescript`, `react`, `go`
- **Context**: `planning`, `architecture`, `design`, `meeting`
- **Topic**: Specific features or areas

### Related Tasks

Always link to relevant tasks:
```yaml
relatedTasks:
  - task-31  # Main task worked on
  - task-32  # Related context
```

### AI Agent Integration

```yaml
agent:
  instructions:
    - Append new entries at the top (newest first)
    - Use ISO date format for entry IDs
    - Always include summary field
    - Set mood based on content sentiment
    - Link to related tasks when mentioned
    - Use consistent markdown structure
```

## Entry Templates

### Standard Work Log

```yaml
- id: "YYYY-MM-DD"
  title: "YYYY-MM-DD - [Topic]"
  createdAt: "YYYY-MM-DDTHH:MM:SSZ"
  mood: productive
  tags: [tag1, tag2]
  summary: "[One-line summary]"
  content: |
    ## What I Worked On
    - Item 1
    - Item 2

    ## Blockers
    - Issue 1

    ## Tomorrow
    - Next task
  relatedTasks:
    - task-X
```

### Bug Investigation

```yaml
- id: "YYYY-MM-DD"
  title: "YYYY-MM-DD - Bug: [Issue]"
  mood: frustrated
  tags: [bug-fix, debugging]
  summary: "[What was fixed or investigated]"
  content: |
    ## Issue
    [Description of the bug]

    ## Investigation
    [Steps taken to debug]

    ## Root Cause
    [What caused it]

    ## Fix
    [How it was resolved]

    ## Testing
    [Verification steps]
```

### Architecture Decision

```yaml
- id: "YYYY-MM-DD"
  title: "YYYY-MM-DD - ADR: [Decision]"
  tags: [architecture, decision]
  summary: "[Decision made]"
  content: |
    ## Context
    [Why we need to decide]

    ## Options
    1. Option A - [pros/cons]
    2. Option B - [pros/cons]

    ## Decision
    [What we chose and why]

    ## Consequences
    [Impact and tradeoffs]
```

## Migration from Board Notes

Old board task notes can become journal entries:

**Before** (in board.md):
```yaml
- id: task-42
  title: Implement authentication
  description: |
    ## Session Notes

    2025-11-24: Started JWT implementation
    2025-11-23: Researched auth libraries
```

**After** (separate journal.md):
```yaml
entries:
  - id: "2025-11-24"
    title: "2025-11-24 - Auth Implementation"
    summary: "Started JWT implementation"
    relatedTasks:
      - task-42
  - id: "2025-11-23"
    title: "2025-11-23 - Auth Research"
    summary: "Researched auth libraries"
    relatedTasks:
      - task-42
```

## Comparison with Board Type

| Feature | Journal | Board |
|---------|---------|-------|
| **Primary Structure** | Time-ordered entries | Column-based tasks |
| **Organization** | Chronological | Workflow stages |
| **Item Type** | Journal entries | Tasks with subtasks |
| **Best For** | Daily logs, notes | Project management |
| **ID Pattern** | ISO dates | task-N |
| **Timestamps** | Essential | Optional |
| **Mood Tracking** | Supported | Not included |
| **Completion** | N/A | Subtask completion |

## See Also

- [Base Schema](./base.md)
- [Board Schema](./board.md)
- [Type Inference](../type-inference.md)
- [Example Journal](../../example/journal.md)
