# Document Schema (Design Preview)

**Status**: 🔜 Design Phase - Implementation planned for Phase 4

The document schema will define structured documents with sections, metadata, and long-form content for RFCs, specifications, guides, and reports.

## Schema URL

```
https://brainfile.md/v1/document.json
```

## Overview

Document files organize long-form content into structured sections, ideal for:

- RFCs (Request for Comments)
- Technical specifications
- Architecture decision records (ADRs)
- Project proposals
- Design documents
- API documentation
- User guides
- Research reports

## Extends

[Base Schema](./base.md) - Inherits all base fields

## Type Identifier

```yaml
type: document
```

## Proposed Structure

### Required Fields

#### `sections`

**Type**: `array` of `section` objects
**Description**: Hierarchical document sections

```yaml
sections:
  - id: overview
    title: Overview
    content: |
      Document overview content...
  - id: proposal
    title: Proposal
    content: |
      Detailed proposal...
```

### Optional Fields

#### `status`

**Type**: `string`
**Enum**: `draft`, `review`, `approved`, `implemented`, `deprecated`
**Description**: Document lifecycle status

```yaml
status: review
```

#### `authors`

**Type**: `array` of `string`
**Description**: Document authors

```yaml
authors:
  - alice
  - bob
```

#### `reviewers`

**Type**: `array` of `string`
**Description**: Document reviewers

```yaml
reviewers:
  - carol
  - david
```

#### `version`

**Type**: `string`
**Pattern**: Semver (e.g., `1.0.0`)
**Description**: Document version

```yaml
version: "1.0.0"
```

#### `createdAt`

**Type**: `string` (ISO 8601 timestamp)
**Description**: When document was created

```yaml
createdAt: "2025-11-24T10:00:00Z"
```

#### `updatedAt`

**Type**: `string` (ISO 8601 timestamp)
**Description**: When document was last updated

```yaml
updatedAt: "2025-11-24T16:45:00Z"
```

#### `approvedAt`

**Type**: `string` (ISO 8601 timestamp)
**Description**: When document was approved

```yaml
approvedAt: "2025-11-25T09:00:00Z"
```

#### `relatedDocuments`

**Type**: `array` of document IDs or file paths
**Description**: Related documents

```yaml
relatedDocuments:
  - docs/RFC-001.md
  - docs/ADR-005.md
```

#### `tags`

**Type**: `array` of `string`
**Description**: Document categorization

```yaml
tags:
  - architecture
  - database
  - performance
```

## Section Structure

### Required Section Fields

```yaml
id: string          # Unique identifier (kebab-case)
title: string       # Section title
content: string     # Section content (markdown)
```

### Optional Section Fields

```yaml
order: integer          # Display order
level: integer          # Heading level (1-6, default: 2)
collapsed: boolean      # Default collapsed state
subsections: array      # Nested sections
metadata: object        # Section-specific metadata
```

## Proposed Example

```yaml
---
type: document
schema: https://brainfile.md/v1/document.json
title: "RFC-042: Implement Multi-Type Schema System"
protocolVersion: 0.5.0
status: approved
version: "1.0.0"
authors:
  - alice
  - bob
reviewers:
  - carol
  - david
createdAt: "2025-11-20T10:00:00Z"
updatedAt: "2025-11-24T16:45:00Z"
approvedAt: "2025-11-25T09:00:00Z"
tags:
  - rfc
  - schema-evolution
  - architecture
relatedDocuments:
  - docs/ADR-001-type-system.md
  - docs/SCHEMA_EVOLUTION_ROADMAP.md
agent:
  instructions:
    - Update status as document progresses through lifecycle
    - Add reviewer feedback to comments section
    - Keep changelog updated with each version
sections:
  - id: metadata
    title: Metadata
    order: 1
    level: 2
    content: |
      - **RFC Number**: 042
      - **Status**: Approved
      - **Created**: 2025-11-20
      - **Last Updated**: 2025-11-24
      - **Authors**: Alice Smith, Bob Johnson
      - **Reviewers**: Carol White, David Brown
  - id: summary
    title: Summary
    order: 2
    level: 2
    content: |
      This RFC proposes implementing a multi-type schema system for the Brainfile
      protocol. The system will support multiple brainfile types (board, journal,
      collection, checklist, document) with a shared base schema and type-specific
      extensions.
  - id: motivation
    title: Motivation
    order: 3
    level: 2
    content: |
      ## Current Limitations

      The current brainfile protocol only supports board-type files. Users have
      expressed need for:

      - Daily journals and logs
      - Resource collections and bookmarks
      - Procedural checklists
      - Structured documents

      ## Benefits of Multi-Type System

      1. **Specialized Structures**: Each type optimized for its use case
      2. **Shared Foundation**: Common fields and patterns across types
      3. **Type Safety**: Explicit type declaration enables validation
      4. **Extensibility**: Easy to add new types in future
  - id: proposal
    title: Proposal
    order: 4
    level: 2
    subsections:
      - id: base-schema
        title: Base Schema
        level: 3
        content: |
          Create `v1/base.json` with shared fields:

          ```json
          {
            "type": "string",
            "title": "string",
            "schema": "string",
            "protocolVersion": "string",
            "agent": { ... },
            "rules": { ... }
          }
          ```
      - id: type-specific
        title: Type-Specific Schemas
        level: 3
        content: |
          Each type extends base using `allOf`:

          - **board.json**: Kanban boards with columns
          - **journal.json**: Time-ordered entries
          - **collection.json**: Categorized resources
          - **checklist.json**: Sequential items
          - **document.json**: Structured sections
      - id: inference
        title: Type Inference
        level: 3
        content: |
          Support multiple detection methods:

          1. Explicit `type` field (highest priority)
          2. Schema URL pattern
          3. File name suffix
          4. Structure analysis
          5. Default to board
  - id: design
    title: Detailed Design
    order: 5
    level: 2
    content: |
      ## Implementation Phases

      **Phase 0** (Weeks 1-2): Foundation
      - Design base schema architecture
      - Create initial type-specific schemas
      - Document inference rules

      **Phase 1** (Weeks 3-4): Core Implementation
      - Implement base schema in core library
      - Add type inference logic
      - Create validation system

      **Phase 2** (Weeks 5-6): Board & Journal
      - Full board type support
      - Full journal type support
      - Update CLI and VSCode extension

      **Phase 3-5**: Additional types and polish
  - id: alternatives
    title: Alternatives Considered
    order: 6
    level: 2
    content: |
      ## Single Monolithic Schema

      **Rejected**: Too complex, hard to maintain, poor separation of concerns.

      ## Completely Independent Schemas

      **Rejected**: Too much duplication, no shared foundation, inconsistent UX.

      ## Dynamic Type Field Only

      **Rejected**: Weak validation, no schema composition, poor tooling support.
  - id: drawbacks
    title: Drawbacks
    order: 7
    level: 2
    content: |
      - Increased schema complexity
      - Migration needed for existing files
      - Learning curve for users
      - More test coverage required
  - id: backwards-compatibility
    title: Backwards Compatibility
    order: 8
    level: 2
    content: |
      ## Strategy

      - Make `type` field optional initially
      - Legacy files inferred as `board` type
      - No breaking changes until v1.0.0
      - Migration tool provided

      ## Timeline

      - **Phase 0-2**: Type optional, inferred if missing
      - **Phase 3**: CLI warnings for missing type
      - **v1.0.0**: Type required (6+ months out)
  - id: unresolved
    title: Unresolved Questions
    order: 9
    level: 2
    content: |
      1. Should we allow custom user-defined types?
         - Deferred to Phase 5

      2. How strict should schema validation be?
         - Using `additionalProperties: false` for now

      3. Should we support mixed types in one file?
         - No, one type per file for clarity
  - id: implementation
    title: Implementation Plan
    order: 10
    level: 2
    content: |
      ## Task Breakdown

      - [x] Task 31: Design base schema architecture
      - [ ] Task 32: Document type-specific schemas
      - [ ] Task 33: Define type inference rules
      - [ ] Task 34: Create example files
      - [ ] Task 35: Define migration strategy
      - [ ] Task 36: Update protocol documentation
      - [ ] Task 37: Review and approve roadmap
  - id: changelog
    title: Changelog
    order: 11
    level: 2
    content: |
      ## Version 1.0.0 (2025-11-25)

      - Document approved by all reviewers
      - No changes from v0.9.0

      ## Version 0.9.0 (2025-11-24)

      - Added detailed implementation plan
      - Clarified backward compatibility strategy
      - Added timeline for type requirement

      ## Version 0.1.0 (2025-11-20)

      - Initial draft
      - Basic structure and proposal
---

# RFC-042: Implement Multi-Type Schema System

This RFC proposes implementing a multi-type schema system for the Brainfile protocol to support multiple use cases beyond Kanban boards.

## Quick Links

- [Summary](#summary)
- [Motivation](#motivation)
- [Proposal](#proposal)
- [Implementation Plan](#implementation-plan)
```

## Use Cases

### RFC (Request for Comments)

```yaml
type: document
status: draft
sections:
  - id: summary
    title: Summary
  - id: motivation
    title: Motivation
  - id: proposal
    title: Proposal
  - id: alternatives
    title: Alternatives Considered
```

### Architecture Decision Record (ADR)

```yaml
type: document
status: approved
sections:
  - id: context
    title: Context
  - id: decision
    title: Decision
  - id: consequences
    title: Consequences
  - id: alternatives
    title: Alternatives
```

### Technical Specification

```yaml
type: document
status: approved
sections:
  - id: overview
    title: Overview
  - id: requirements
    title: Requirements
  - id: architecture
    title: Architecture
  - id: api
    title: API Specification
  - id: testing
    title: Testing Strategy
```

### Design Document

```yaml
type: document
status: review
authors: [designer]
reviewers: [engineer, product-manager]
sections:
  - id: problem
    title: Problem Statement
  - id: users
    title: User Research
  - id: solution
    title: Proposed Solution
  - id: mockups
    title: Mockups
  - id: metrics
    title: Success Metrics
```

### Project Proposal

```yaml
type: document
status: draft
sections:
  - id: executive-summary
    title: Executive Summary
  - id: objectives
    title: Objectives
  - id: scope
    title: Scope
  - id: timeline
    title: Timeline
  - id: resources
    title: Resources Required
  - id: risks
    title: Risks
```

## Key Features

### Document Lifecycle

```yaml
status: draft       # Initial creation
status: review      # Under review
status: approved    # Approved by reviewers
status: implemented # Proposal implemented
status: deprecated  # No longer relevant
```

### Version Control

```yaml
version: "1.0.0"
createdAt: "2025-11-20T10:00:00Z"
updatedAt: "2025-11-24T16:45:00Z"
approvedAt: "2025-11-25T09:00:00Z"
```

### Authorship & Review

```yaml
authors:
  - alice
  - bob
reviewers:
  - carol
  - david
```

### Hierarchical Sections

```yaml
sections:
  - id: parent
    title: Parent Section
    subsections:
      - id: child-1
        title: Child Section 1
      - id: child-2
        title: Child Section 2
```

### Cross-References

```yaml
relatedDocuments:
  - docs/RFC-001.md
  - docs/ADR-005.md
```

## Comparison with Other Types

| Feature | Document | Board | Journal |
|---------|----------|-------|---------|
| **Primary Structure** | Hierarchical sections | Columns with tasks | Chronological entries |
| **Content Type** | Long-form | Task-based | Log-based |
| **Organization** | Logical sections | Workflow | Temporal |
| **Best For** | Specifications | Work tracking | Daily logs |
| **Lifecycle** | Draft → Approved | Todo → Done | N/A |
| **Versioning** | Explicit versions | N/A | N/A |
| **Authorship** | Multiple authors | Assignees | Single author |

## Comparison with Markdown Files

### Why Not Just Use Plain Markdown?

Documents differ from plain markdown in key ways:

**Structured Metadata**:
- Status tracking (draft/review/approved)
- Version control
- Author and reviewer tracking
- Timestamps

**Schema Validation**:
- Required sections enforced
- Consistent structure across docs
- Type-safe fields

**AI Integration**:
- Agent instructions for updates
- Automated status transitions
- Template enforcement

**Tooling**:
- Status views in VSCode
- Progress tracking
- Cross-document linking

### When to Use Document Type

Use document when:
- Formal approval process needed
- Multiple authors/reviewers
- Version control important
- Consistent structure required
- Status tracking needed

Use plain markdown when:
- Informal notes
- No approval needed
- Freeform content
- No metadata required

## Design Decisions

### Section Structure

**Decision**: Hierarchical sections with subsections

**Rationale**:
- Documents naturally have structure
- Enables table of contents generation
- Supports progressive disclosure (collapse/expand)
- Allows section-level metadata

### Status Field

**Decision**: Enum of draft/review/approved/implemented/deprecated

**Rationale**:
- Explicit lifecycle stages
- Enables workflow automation
- Clear document state
- Supports filtering and views

### Version Field

**Decision**: Optional semver version string

**Rationale**:
- Some documents need versioning (RFCs, specs)
- Others don't (meeting notes)
- Semver is familiar and parseable
- Enables version comparison

## Implementation Plan (Phase 4)

1. **Schema Definition**
   - Define document.json schema
   - Define section structure
   - Add validation rules

2. **Core Library**
   - Implement document parser
   - Add type inference
   - Create validation logic
   - Implement section navigation

3. **CLI Support**
   - Add `brainfile document` commands
   - Implement section management
   - Create document templates (RFC, ADR)
   - Add version management

4. **VSCode Extension**
   - Build document view UI
   - Add section navigation sidebar
   - Implement status indicators
   - Add version history
   - Create review workflow

5. **Advanced Features**
   - Document templates library
   - Change tracking
   - Approval workflow
   - PDF export
   - Table of contents generation

## Open Questions

1. **Section Depth**: How many levels of nesting?
   - **Current**: Unlimited nesting
   - **Alternative**: Max 3 levels
   - **Decision**: Start unlimited, add warnings if too deep

2. **Approval Workflow**: Should we track approval history?
   - **Phase 4**: Simple approved/rejected
   - **Future**: Full approval log with comments

3. **Change Tracking**: Should we diff versions?
   - **Phase 4**: Manual changelog section
   - **Future**: Automated diff generation

4. **Templates**: How to manage document templates?
   - **Option A**: Built-in templates (RFC, ADR, spec)
   - **Option B**: User-defined templates
   - **Option C**: Template marketplace

5. **Collaboration**: How to handle concurrent edits?
   - **Phase 4**: File-level locking
   - **Future**: Section-level locking or CRDT

## Related Resources

- [Base Schema](./base.md)
- [Board Schema](./board.md)
- [Journal Schema](./journal.md)
- [Schema Evolution Roadmap](../../SCHEMA_EVOLUTION_ROADMAP.md)
- [Phase 4 Plan](../../SCHEMA_EVOLUTION_ROADMAP.md#phase-4-implement-additional-types)

## Feedback Welcome

This is a design preview. If you have suggestions or use cases we haven't considered, please open an issue or discussion on the Brainfile repository.

---

**Status**: Design only - Schema not yet implemented
**Target**: Phase 4 (Month 7-8)
**Next Steps**: Finalize design based on user feedback
