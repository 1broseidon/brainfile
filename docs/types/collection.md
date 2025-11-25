# Collection Schema (Design Preview)

**Status**: 🔜 Design Phase - Implementation planned for Phase 4

The collection schema will define curated collections of resources, bookmarks, and references organized by categories.

## Schema URL

```
https://brainfile.md/v1/collection.json
```

## Overview

Collection files will organize resources into categories, ideal for:

- Bookmark collections
- Learning resource libraries
- API endpoint catalogs
- Design system references
- Documentation hubs
- Tool directories

## Extends

[Base Schema](./base.md) - Inherits all base fields

## Type Identifier

```yaml
type: collection
```

## Proposed Structure

### Required Fields

#### `categories`

**Type**: `array` of `category` objects
**Description**: Organized categories of items

```yaml
categories:
  - id: frontend
    title: Frontend Resources
    items: [...]
  - id: backend
    title: Backend Resources
    items: [...]
```

### Optional Fields

#### `defaultView`

**Type**: `string`
**Enum**: `list`, `grid`, `compact`
**Description**: Preferred display mode

```yaml
defaultView: grid
```

## Category Structure

### Required Category Fields

```yaml
id: string          # Unique identifier (kebab-case)
title: string       # Display name
items: array        # Collection items
```

### Optional Category Fields

```yaml
description: string  # Category description
icon: string        # Icon name or emoji
order: integer      # Display order
collapsed: boolean  # Default collapsed state
```

## Item Structure

### Required Item Fields

```yaml
id: string          # Unique identifier
title: string       # Item title
url: string         # Resource URL
```

### Optional Item Fields

```yaml
description: string      # Item description
tags: array<string>      # Categorization tags
favicon: string          # Favicon URL
thumbnail: string        # Preview image URL
addedAt: timestamp       # When item was added
lastVisited: timestamp   # Last access time
rating: integer          # 1-5 star rating
notes: string            # Personal notes (markdown)
archived: boolean        # Hide from main view
```

## Proposed Example

```yaml
---
type: collection
schema: https://brainfile.md/v1/collection.json
title: Development Resources
protocolVersion: 0.5.0
defaultView: grid
agent:
  instructions:
    - Organize items by category
    - Include descriptions for all resources
    - Add tags for filtering
rules:
  always:
    - id: 1
      rule: verify URLs before adding
  prefer:
    - id: 1
      rule: group related resources together
categories:
  - id: frontend
    title: Frontend Development
    icon: 🎨
    order: 1
    items:
      - id: item-1
        title: React Documentation
        url: https://react.dev
        description: Official React documentation and guides
        tags:
          - react
          - javascript
          - framework
        addedAt: "2025-11-24T10:00:00Z"
        rating: 5
      - id: item-2
        title: Tailwind CSS
        url: https://tailwindcss.com
        description: Utility-first CSS framework
        tags:
          - css
          - styling
          - framework
        addedAt: "2025-11-23T14:30:00Z"
        rating: 5
  - id: backend
    title: Backend Development
    icon: ⚙️
    order: 2
    items:
      - id: item-3
        title: Go Documentation
        url: https://go.dev/doc
        description: Official Go language documentation
        tags:
          - go
          - golang
          - backend
        addedAt: "2025-11-22T09:15:00Z"
        rating: 5
        notes: |
          Excellent resource for learning Go idioms.
          See especially the Effective Go guide.
  - id: tools
    title: Development Tools
    icon: 🛠️
    order: 3
    collapsed: true
    items:
      - id: item-4
        title: VSCode
        url: https://code.visualstudio.com
        description: Popular code editor
        tags:
          - editor
          - tools
        addedAt: "2025-11-20T10:00:00Z"
---

# Development Resources

Curated collection of essential development resources, tools, and references.

## Categories

- **Frontend**: React, CSS frameworks, UI libraries
- **Backend**: Go, Node.js, databases
- **Tools**: Editors, CLI tools, productivity apps
```

## Use Cases

### Bookmark Manager

```yaml
categories:
  - id: reading-list
    title: Reading List
    items:
      - id: article-1
        title: "How to Build Better APIs"
        url: https://example.com/article
        addedAt: "2025-11-24T10:00:00Z"
```

### API Endpoint Catalog

```yaml
categories:
  - id: user-endpoints
    title: User Management
    items:
      - id: api-1
        title: "POST /api/users"
        url: https://api.example.com/users
        description: Create new user
        notes: |
          ## Request
          ```json
          {
            "email": "user@example.com",
            "name": "John Doe"
          }
          ```
```

### Learning Resources

```yaml
categories:
  - id: tutorials
    title: Tutorials
    items:
      - id: tutorial-1
        title: "TypeScript Deep Dive"
        url: https://example.com/ts-tutorial
        tags: [typescript, tutorial, beginner]
        rating: 5
```

### Design System Reference

```yaml
categories:
  - id: components
    title: Components
    items:
      - id: comp-1
        title: Button Component
        url: https://design-system.example.com/button
        thumbnail: https://cdn.example.com/button-preview.png
```

## Key Features

### Metadata Richness

Unlike simple bookmark lists, collection items include:
- Descriptions and notes
- Tags for filtering
- Ratings for prioritization
- Timestamps for sorting
- Visual elements (favicons, thumbnails)

### Organization

- **Categories**: Logical grouping
- **Tags**: Cross-category filtering
- **Order**: Custom sorting
- **Collapsed**: Space management

### Discovery

- Search by title, description, tags
- Filter by category, rating, date
- Sort by various criteria
- Archive unused items

## Comparison with Other Types

| Feature | Collection | Board | Journal |
|---------|------------|-------|---------|
| **Primary Structure** | Categories with items | Columns with tasks | Chronological entries |
| **Item Type** | URLs/references | Tasks | Journal entries |
| **Organization** | Topical | Workflow | Temporal |
| **Best For** | Resources | Work tracking | Daily logs |
| **Metadata** | Rich (ratings, thumbnails) | Status-focused | Mood, summary |

## Design Decisions

### Why Not Board Type?

Collections differ from boards in key ways:
- **External Focus**: Items point to external resources
- **No Completion**: Resources don't get "done"
- **Rich Metadata**: Ratings, thumbnails, visit tracking
- **Discovery-Oriented**: Filtering and search are primary

### Why Not Document Type?

Documents are for long-form content; collections are for references:
- **Links vs Content**: Collections link out, documents contain
- **Curation vs Composition**: Organize existing vs create new
- **Navigation vs Reading**: Browse vs deep dive

## Implementation Plan (Phase 4)

1. **Schema Definition**
   - Define collection.json schema
   - Define category and item structures
   - Add validation rules

2. **Core Library**
   - Implement collection parser
   - Add type inference for collections
   - Create validation logic

3. **CLI Support**
   - Add `brainfile collection` commands
   - Implement add/remove/update operations
   - Create import from browser bookmarks

4. **VSCode Extension**
   - Build collection view UI
   - Add grid/list/compact views
   - Implement search and filtering
   - Add drag-and-drop between categories

5. **Advanced Features**
   - Favicon fetching
   - Link validation
   - Thumbnail generation
   - Export to HTML/JSON

## Open Questions

1. **Nested Categories**: Should categories support sub-categories?
   - **Current**: Flat structure with tags
   - **Alternative**: Tree structure with parent/child

2. **Duplicate Detection**: How to handle duplicate URLs?
   - **Option A**: Block duplicates
   - **Option B**: Allow with warning
   - **Option C**: Merge into single item

3. **External Sync**: Should collections sync with browser bookmarks?
   - **Phase 4**: Local only
   - **Future**: Browser extension integration

4. **Link Checking**: Should we validate URLs periodically?
   - **Phase 4**: Manual only
   - **Future**: Automated link checking

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
