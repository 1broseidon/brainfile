# Brainfile Type Comparison

This guide helps you choose the right brainfile type for your use case by comparing the five official types: board, journal, collection, checklist, and document. Note: The Brainfile protocol also supports [custom types](#custom-types) for community-defined schemas.

## Quick Reference

| Type | Best For | Primary Structure | Status |
|------|----------|-------------------|--------|
| **[board](./board.md)** | Project management, task tracking | Columns with tasks | ✅ Implemented |
| **[journal](./journal.md)** | Daily logs, work notes | Chronological entries | ✅ Implemented |
| **[collection](./collection.md)** | Bookmarks, resource libraries | Categories with items | 🔜 Phase 4 |
| **[checklist](./checklist.md)** | Procedures, routines | Sequential items | 🔜 Phase 4 |
| **[document](./document.md)** | RFCs, specifications | Hierarchical sections | 🔜 Phase 4 |

## Detailed Comparison

### Structure

| Feature | Board | Journal | Collection | Checklist | Document |
|---------|-------|---------|------------|-----------|----------|
| **Top-Level** | Columns | Entries | Categories | Items | Sections |
| **Organization** | Workflow stages | Chronological | Topical | Sequential | Hierarchical |
| **Item Type** | Tasks | Journal entries | Links/resources | Checklist items | Sections |
| **Nesting** | Tasks → Subtasks | Flat entries | Categories → Items | Flat items | Sections → Subsections |
| **Ordering** | Column order | Reverse chrono | Category order | Sequential/order | Section order |

### Primary Use Cases

| Type | Primary Use Cases |
|------|-------------------|
| **Board** | Sprint planning, feature tracking, bug triage, team coordination, personal task management |
| **Journal** | Daily dev logs, work session notes, decision tracking, mood logging, standup notes |
| **Collection** | Bookmark management, API catalogs, learning resources, design references, tool directories |
| **Checklist** | Deployment procedures, code review checklists, onboarding steps, meeting agendas, daily routines |
| **Document** | RFCs, technical specs, ADRs, project proposals, design docs, API documentation |

### Key Features

| Feature | Board | Journal | Collection | Checklist | Document |
|---------|-------|---------|------------|-----------|----------|
| **Status/Progress** | Column position | N/A | N/A | Completion % | Lifecycle status |
| **Timestamps** | Optional | Essential | Optional | Optional | Essential |
| **Completion Tracking** | Subtasks | N/A | N/A | Binary (done/not done) | N/A |
| **Dependencies** | blockedBy | N/A | N/A | Sequential mode | N/A |
| **Metadata** | Priority, effort, tags, assignee | Mood, summary, tags | Ratings, thumbnails, visits | Required flag, assignee | Authors, reviewers, version |
| **Cross-References** | Related files | Related tasks | URL links | URL links | Related docs |
| **Archiving** | Archive array | N/A | Archive flag | N/A | Deprecated status |
| **Reusability** | Low | N/A | N/A | High (reset) | Medium (templates) |

### Content Type

| Type | Content Type | Content Length | Content Format |
|------|--------------|----------------|----------------|
| **Board** | Action items | Brief (task descriptions) | Markdown descriptions |
| **Journal** | Reflective notes | Medium (daily summaries) | Structured markdown |
| **Collection** | References | Brief (descriptions + links) | Metadata + markdown notes |
| **Checklist** | Procedural steps | Brief (step descriptions) | Simple text + markdown |
| **Document** | Long-form | Long (specifications) | Hierarchical markdown |

### Lifecycle

| Type | Typical Lifecycle | Duration | Update Frequency |
|------|-------------------|----------|------------------|
| **Board** | Todo → In Progress → Done | Days to weeks | Continuous |
| **Journal** | Created → Updated | Single day | 1-2x per day |
| **Collection** | Add → Update → Archive | Indefinite | Occasional |
| **Checklist** | Not started → Complete (→ Reset) | Single execution | Per use |
| **Document** | Draft → Review → Approved | Weeks to months | Occasional |

## When to Use Each Type

### Use Board When:

✅ **Yes:**
- Managing multiple tasks with different statuses
- Tracking work through stages (todo → in-progress → done)
- Need to assign tasks to team members
- Want to track priorities and blockers
- Working on sprints or milestones

❌ **No:**
- Simple sequential steps → Use **checklist**
- Daily notes and reflections → Use **journal**
- Curating links and resources → Use **collection**
- Writing specifications → Use **document**

### Use Journal When:

✅ **Yes:**
- Recording daily work sessions
- Tracking decisions and learnings
- Logging mood and productivity
- Creating standup notes
- Documenting progress over time

❌ **No:**
- Tracking tasks to completion → Use **board**
- Step-by-step procedures → Use **checklist**
- Saving bookmarks → Use **collection**
- Writing formal docs → Use **document**

### Use Collection When:

✅ **Yes:**
- Organizing bookmarks and links
- Building resource libraries
- Cataloging APIs or tools
- Curating learning materials
- Managing design references

❌ **No:**
- Tracking task status → Use **board**
- Recording daily activities → Use **journal**
- Sequential procedures → Use **checklist**
- Long-form documentation → Use **document**

### Use Checklist When:

✅ **Yes:**
- Deployment procedures
- Code review checklists
- Onboarding steps
- Pre-flight checks
- Daily routines
- Meeting agendas

❌ **No:**
- Complex tasks with subtasks → Use **board**
- Daily reflections → Use **journal**
- Organizing links → Use **collection**
- Formal specifications → Use **document**

### Use Document When:

✅ **Yes:**
- Writing RFCs
- Technical specifications
- Architecture decision records
- Project proposals
- Design documents
- API documentation

❌ **No:**
- Task tracking → Use **board**
- Daily logs → Use **journal**
- Link collections → Use **collection**
- Simple checklists → Use **checklist**

## Decision Tree

```
┌─────────────────────────────────────┐
│ What are you trying to accomplish?  │
└────────────┬────────────────────────┘
             │
    ┌────────┴────────┐
    │ Track work?     │
    └────────┬────────┘
             │
         ┌───┴───┐
         │ YES   │
         └───┬───┘
             │
    ┌────────┴─────────┐
    │ Simple steps or  │
    │ complex tasks?   │
    └────────┬─────────┘
             │
      ┌──────┴──────┐
      │   Simple    │──→ Use CHECKLIST
      │   steps     │    (Sequential procedures)
      └─────────────┘
      │
      │   Complex   │──→ Use BOARD
      │   tasks     │    (Multiple stages, statuses)
      └─────────────┘

    ┌───┴───┐
    │  NO   │
    └───┬───┘
        │
   ┌────┴─────────────┐
   │ Recording notes  │
   │ or organizing?   │
   └────┬─────────────┘
        │
    ┌───┴───────┐
    │ Recording │
    │ notes     │──→ Use JOURNAL
    └───────────┘    (Daily logs, time-based)
        │
    │ Organizing│
    │ content   │
    └───┬───────┘
        │
   ┌────┴──────────────┐
   │ Links or long-form?│
   └────┬──────────────┘
        │
    ┌───┴──────┐
    │ Links/   │──→ Use COLLECTION
    │ resources│    (Bookmarks, catalogs)
    └──────────┘
        │
    │ Long-form│──→ Use DOCUMENT
    │ content  │    (Specs, RFCs, guides)
    └──────────┘
```

## Common Scenarios

### Scenario: Building a New Feature

**Question**: How should I organize work on a new feature?

**Answer**: Use **board** for task tracking + **journal** for daily notes + **document** for specification

```yaml
# feature.board.md - Task tracking
type: board
columns:
  - id: todo
    tasks:
      - Implement auth API
      - Build login UI
      - Write tests

# feature.journal.md - Daily progress
type: journal
entries:
  - id: "2025-11-24"
    summary: "Implemented JWT token generation"
    relatedTasks: [task-1]

# feature-spec.md - Technical specification
type: document
sections:
  - id: requirements
    title: Requirements
  - id: architecture
    title: Architecture
```

### Scenario: Deploying to Production

**Question**: Should I use a checklist or board for deployment?

**Answer**: Use **checklist** for deployment procedures

**Why**: Deployments are sequential, procedural, and reusable. Checklists enforce order and can be reset for next deployment.

```yaml
# deployment.checklist.md
type: checklist
sequential: true
resetOnComplete: true
items:
  - Run tests
  - Update changelog
  - Tag release
  - Deploy to staging
  - Deploy to production
```

### Scenario: Managing Research Links

**Question**: Where should I keep learning resources?

**Answer**: Use **collection** for curated resources

**Why**: Collections are optimized for organizing links with metadata, ratings, and categories.

```yaml
# learning-resources.collection.md
type: collection
categories:
  - id: typescript
    title: TypeScript Resources
    items:
      - title: TypeScript Handbook
        url: https://www.typescriptlang.org/docs/
        rating: 5
```

### Scenario: Writing an RFC

**Question**: Should I write an RFC as a document or board?

**Answer**: Use **document** for RFCs

**Why**: Documents support formal structure, review workflow, versioning, and approval tracking.

```yaml
# rfc-042.md
type: document
status: draft
authors: [alice]
reviewers: [bob, carol]
sections:
  - id: summary
  - id: motivation
  - id: proposal
```

### Scenario: Daily Standup Notes

**Question**: Where should I track daily standup updates?

**Answer**: Use **journal** for standup notes

**Why**: Journals are chronological and optimized for daily entries with summaries.

```yaml
# standup.journal.md
type: journal
entries:
  - id: "2025-11-24"
    title: "2025-11-24 - Daily Standup"
    summary: "Sprint progress update"
    content: |
      **Yesterday**: Completed auth (task-42)
      **Today**: Working on dashboard (task-43)
      **Blockers**: None
```

### Scenario: Code Review Checklist

**Question**: Should I use a checklist or board for code reviews?

**Answer**: Use **checklist** for code review procedures

**Why**: Code reviews follow a standard set of checks that don't need status transitions.

```yaml
# code-review.checklist.md
type: checklist
sequential: false
items:
  - Code follows style guide
  - Tests are included
  - Documentation is updated
  - No security vulnerabilities
```

## Multiple Types in One Project

It's common to use multiple brainfile types in a single project:

```
project/
├── tasks.board.md          # Main task board
├── standup.journal.md      # Daily standup notes
├── resources.collection.md # Useful links
├── deploy.checklist.md     # Deployment procedure
└── architecture.md         # Architecture doc (document type)
```

### Recommended Combinations

| Project Type | Recommended Types | Example |
|--------------|-------------------|---------|
| **Feature Development** | Board + Journal + Document | Tasks + daily notes + spec |
| **Research Project** | Collection + Journal | Links + research notes |
| **Operations** | Checklist + Board | Procedures + incident tracking |
| **Documentation** | Document + Collection | Specs + reference links |
| **Sprint Work** | Board + Journal + Checklist | Tasks + standup notes + DoD checklist |

## Type Selection Guidelines

### Start Simple

Begin with one type and add others as needed:

1. **Start with board** for most projects (default type)
2. **Add journal** when daily logging becomes useful
3. **Add checklist** for repetitive procedures
4. **Add collection** when you have many reference links
5. **Add document** for formal specifications

### Avoid Over-Engineering

Don't create brainfiles you won't maintain:

- ❌ **Don't** create a journal if you won't write daily
- ❌ **Don't** create a collection if you only have 3 links (use board task description)
- ❌ **Don't** create a document if a simple README would suffice
- ❌ **Don't** create a board if you only have 3 tasks (use checklist)

### One Type Per File

Each brainfile should have exactly one type:

✅ **Good:**
```
tasks.board.md       (type: board)
standup.journal.md   (type: journal)
```

❌ **Bad:**
```
mixed.md (trying to combine board + journal + checklist)
```

**Why**: Single type per file keeps structure clear, enables proper validation, and simplifies tooling.

## Migration Between Types

Sometimes you'll realize you chose the wrong type. Here's how to migrate:

### Checklist → Board

**When**: Checklist items need statuses beyond "done/not done"

```yaml
# Before (checklist)
items:
  - title: Implement feature X
    completed: false

# After (board)
columns:
  - id: in-progress
    tasks:
      - id: task-1
        title: Implement feature X
        priority: high
```

### Board → Checklist

**When**: Board is just a todo list without real workflow

```yaml
# Before (board)
columns:
  - id: todo
    tasks:
      - title: Step 1
      - title: Step 2

# After (checklist)
sequential: true
items:
  - title: Step 1
    completed: false
  - title: Step 2
    completed: false
```

### Board Notes → Journal

**When**: Task descriptions become daily logs

```yaml
# Before (board task description)
- id: task-1
  description: |
    2025-11-24: Made progress
    2025-11-23: Started work

# After (journal entries)
entries:
  - id: "2025-11-24"
    summary: "Made progress on task-1"
    relatedTasks: [task-1]
```

## Custom Types

The Brainfile protocol is **extensible by design**. If none of the official types fit your use case, you can create custom types:

### When to Create a Custom Type

| Scenario | Solution |
|----------|----------|
| Need features from multiple types | Create a hybrid custom type |
| Domain-specific workflow | Create a custom type with domain fields |
| Organization-specific processes | Create internal custom types |
| Experimental features | Prototype with custom types |

### Creating a Custom Type

1. **Define a JSON Schema** that extends `brainfile.md/v1/base.json`
2. **Host the schema** at a URL or distribute locally
3. **Reference in your brainfile** with `type` and `schema` fields

```yaml
---
type: sprint-board                    # Your custom type name
schema: https://yourorg.com/schemas/sprint-board.json
title: Q1 Sprint Board
sprints:                              # Your custom fields
  - id: sprint-1
    goal: Launch MVP
---
```

### Example Custom Types

| Custom Type | Use Case | Custom Fields |
|-------------|----------|---------------|
| `sprint-board` | Agile sprints | `sprints`, `velocity`, `burndown` |
| `standup-notes` | Daily standups | `participants`, `blockers`, `decisions` |
| `retrospective` | Sprint retros | `wentWell`, `needsImprovement`, `actionItems` |
| `reading-queue` | Personal reading | `queue`, `inProgress`, `finished` |
| `incident-report` | Incident management | `severity`, `timeline`, `rootCause` |

See [Base Schema - Custom Types](./base.md#custom-types) for implementation details.

## See Also

- [Base Schema](./base.md) - Shared fields across all types
- [Board Schema](./board.md) - Detailed board documentation
- [Journal Schema](./journal.md) - Detailed journal documentation
- [Collection Schema](./collection.md) - Collection design preview
- [Checklist Schema](./checklist.md) - Checklist design preview
- [Document Schema](./document.md) - Document design preview
- [Type Inference](../type-inference.md) - How types are detected
- [Schema Evolution Roadmap](../../SCHEMA_EVOLUTION_ROADMAP.md) - Implementation timeline
