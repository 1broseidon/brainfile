# Type Inference Rules

This document defines how the Brainfile protocol automatically detects file types when the explicit `type` field is missing or needs validation.

## Overview

Type inference enables:
- **Backward Compatibility**: Legacy files without `type` field still work
- **Convenience**: File naming conventions can imply type
- **Validation**: Detected type must match explicit type (if present)
- **Error Detection**: Mismatches caught early
- **Community Extension**: Custom types validated against their own schemas

## Type System Design

The Brainfile protocol supports two categories of types:

### Official Types
Built-in types hosted at `brainfile.md/v1/`:
- `board` - Kanban-style task boards
- `journal` - Chronological entries/dev logs
- `collection` - Curated link/resource lists
- `checklist` - Sequential procedure lists
- `document` - RFC/spec documents with metadata

### Community/Custom Types
Any organization or individual can create custom types:
- Type name: Any valid string (e.g., `sprint-board`, `standup-notes`)
- Schema URL: Required for validation (e.g., `https://mycompany.com/schemas/sprint-board.json`)
- Extends base: Custom schemas should reference the Brainfile base schema

```yaml
# Community type example
---
type: sprint-board
schema: https://mycompany.com/schemas/sprint-board.json
title: Q1 Sprint Board
sprints:
  - id: sprint-1
    goal: Launch MVP
---
```

## Inference Priority

Type detection follows a priority cascade. The first matching rule determines the type:

1. **Explicit type field** - Type declared in frontmatter (highest priority)
2. **Schema URL pattern** - Extract type from schema URL
3. **File name suffix** - Extract from filename pattern
4. **Structure analysis** - Detect by presence of type-specific fields
5. **Default fallback** - Assume `board` type (lowest priority)

## Detection Methods

### 1. Explicit Type Field

**Priority**: Highest (1)
**Reliability**: 100%

The `type` field in YAML frontmatter explicitly declares the brainfile type.

```yaml
---
type: journal
title: Dev Log 2025
---
```

**Rules**:
- **Official types**: `board`, `journal`, `collection`, `checklist`, `document`
- **Custom types**: Any string with a valid `schema` URL for validation
- Case-sensitive (recommended: lowercase with hyphens)
- Takes precedence over all other detection methods
- Official types default to `brainfile.md/v1/{type}.json` schema
- Custom types MUST provide a `schema` URL

**Examples**:

✅ Valid (Official Types):
```yaml
type: board
type: journal
type: collection
```

✅ Valid (Custom Types):
```yaml
type: sprint-board
schema: https://mycompany.com/schemas/sprint-board.json

type: standup-notes
schema: ./schemas/standup.json
```

⚠️ Warning (Custom type without schema):
```yaml
type: kanban           # Unknown type, no schema URL
# Warning: Unknown type 'kanban' with no schema URL. Cannot validate.
```

### 2. Schema URL Pattern

**Priority**: High (2)
**Reliability**: 95%

Extract type from the `schema` field URL pattern.

**Pattern**: `https://brainfile.md/v{version}/{type}.json`

```yaml
---
schema: https://brainfile.md/v1/journal.json
title: Dev Log
---
# Inferred type: journal
```

**Detection Logic**:

1. Parse schema URL
2. Extract filename from path
3. Remove `.json` extension
4. Match against known types

**Supported Patterns**:

| Schema URL | Inferred Type |
|------------|---------------|
| `https://brainfile.md/v1/board.json` | `board` |
| `https://brainfile.md/v1/journal.json` | `journal` |
| `https://brainfile.md/v1/collection.json` | `collection` |
| `https://brainfile.md/v1/checklist.json` | `checklist` |
| `https://brainfile.md/v1/document.json` | `document` |
| `https://brainfile.md/v1` | `board` (legacy) |
| `https://brainfile.md/v1.json` | `board` (legacy) |

**Edge Cases**:

```yaml
# Local schema path
schema: ./schemas/board.json
# Inferred type: board

# Custom domain
schema: https://example.com/schemas/journal.json
# Inferred type: journal (extract filename only)

# No schema field
# Fall through to next detection method
```

### 3. File Name Suffix

**Priority**: Medium (3)
**Reliability**: 90%

Extract type from filename before `.md` extension.

**Pattern**: `{basename}.{type}.md`

**Examples**:

| Filename | Inferred Type |
|----------|---------------|
| `brainfile.md` | *(fall through)* |
| `tasks.board.md` | `board` |
| `standup.journal.md` | `journal` |
| `bookmarks.collection.md` | `collection` |
| `deploy.checklist.md` | `checklist` |
| `rfc-042.document.md` | `document` |
| `project.private.md` | *(fall through - not a type)* |

**Detection Logic**:

1. Extract filename from file path
2. Split by `.` separator
3. Check second-to-last segment
4. Match against known types

**Implementation**:

```typescript
function inferTypeFromFilename(filepath: string): string | null {
  const filename = path.basename(filepath);
  const parts = filename.split('.');

  // Need at least: basename.type.md
  if (parts.length < 3) return null;

  // Get second-to-last part (before .md)
  const typeCandidate = parts[parts.length - 2];

  // Only infer official types from filename
  // Custom types should use explicit type field
  const officialTypes = [
    'board', 'journal', 'collection', 'checklist', 'document'
  ];

  if (officialTypes.includes(typeCandidate)) {
    return typeCandidate;
  }

  return null;
}
```

**Note**: Filename inference only works for official types. Custom types must use explicit `type` field with a `schema` URL.

**Special Cases**:

```bash
# Multiple dots before type
project.v2.board.md          → board

# Private suffix (not a type)
tasks.private.md             → (fall through)

# Backup suffix (not a type)
brainfile.backup.md          → (fall through)

# Type in basename (not as suffix)
journal-entries.md           → (fall through)
```

### 4. Structure Analysis

**Priority**: Low (4)
**Reliability**: 85%

Detect type by analyzing the presence of type-specific required fields in the frontmatter.

**Detection Rules**:

| Detected Field | Inferred Type |
|----------------|---------------|
| `columns` (array) | `board` |
| `entries` (array) | `journal` |
| `categories` (array) | `collection` |
| `items` (array, flat) | `checklist` |
| `sections` (array) | `document` |

**Detection Logic**:

```typescript
function inferTypeFromStructure(frontmatter: any): BrainfileType {
  // Check for type-specific required fields
  if (frontmatter.columns && Array.isArray(frontmatter.columns)) {
    return 'board';
  }

  if (frontmatter.entries && Array.isArray(frontmatter.entries)) {
    return 'journal';
  }

  if (frontmatter.categories && Array.isArray(frontmatter.categories)) {
    return 'collection';
  }

  if (frontmatter.sections && Array.isArray(frontmatter.sections)) {
    return 'document';
  }

  // Checklist vs Collection disambiguation
  // Both have items array, but checklist items have 'completed' field
  if (frontmatter.items && Array.isArray(frontmatter.items)) {
    if (frontmatter.items.length > 0) {
      const firstItem = frontmatter.items[0];
      if ('completed' in firstItem) {
        return 'checklist';
      }
      if ('url' in firstItem) {
        return 'collection';
      }
    }
    // Default items to checklist
    return 'checklist';
  }

  // Fall through to default
  return 'board';
}
```

**Disambiguation**:

Some structures might be ambiguous. Priority order:

1. `columns` → **board** (highest specificity)
2. `entries` → **journal**
3. `sections` → **document**
4. `categories` → **collection**
5. `items` → **checklist** (if items have `completed`)
6. `items` → **collection** (if items have `url`)
7. Default → **board**

**Edge Cases**:

```yaml
# Empty frontmatter
---
title: My File
---
# Inferred type: board (default fallback)

# Multiple structure fields (invalid)
---
columns: []
entries: []
---
# Error: Ambiguous structure, multiple type indicators
```

### 5. Default Fallback

**Priority**: Lowest (5)
**Reliability**: N/A (assumption)

If no type indicators are found, default to `board` type.

**Rules**:
- Used only when all other methods fail
- Maintains backward compatibility with v1.0 files
- Assumes board is the most common type

**Example**:

```yaml
---
title: My Project
---
# No type indicators found
# Inferred type: board (default)
```

## Complete Inference Algorithm

```typescript
// Official types have built-in schema URLs
const OFFICIAL_TYPES = ['board', 'journal', 'collection', 'checklist', 'document'];

interface InferenceResult {
  type: string;
  isOfficial: boolean;
  schemaUrl: string | null;
  warning?: string;
}

function inferBrainfileType(
  filepath: string,
  frontmatter: any
): InferenceResult {
  // 1. Explicit type field (highest priority)
  if (frontmatter.type) {
    const isOfficial = OFFICIAL_TYPES.includes(frontmatter.type);
    
    // Official type - use default schema URL if not provided
    if (isOfficial) {
      return {
        type: frontmatter.type,
        isOfficial: true,
        schemaUrl: frontmatter.schema || `https://brainfile.md/v1/${frontmatter.type}.json`
      };
    }
    
    // Custom type - schema URL is required for validation
    if (frontmatter.schema) {
      return {
        type: frontmatter.type,
        isOfficial: false,
        schemaUrl: frontmatter.schema
      };
    }
    
    // Custom type without schema - warn but don't fail
    return {
      type: frontmatter.type,
      isOfficial: false,
      schemaUrl: null,
      warning: `Unknown type '${frontmatter.type}' with no schema URL. Cannot validate.`
    };
  }

  // 2. Schema URL pattern
  if (frontmatter.schema) {
    const typeFromSchema = extractTypeFromSchemaURL(frontmatter.schema);
    if (typeFromSchema) {
      return {
        type: typeFromSchema,
        isOfficial: OFFICIAL_TYPES.includes(typeFromSchema),
        schemaUrl: frontmatter.schema
      };
    }
  }

  // 3. File name suffix
  const typeFromFilename = inferTypeFromFilename(filepath);
  if (typeFromFilename) {
    return {
      type: typeFromFilename,
      isOfficial: OFFICIAL_TYPES.includes(typeFromFilename),
      schemaUrl: `https://brainfile.md/v1/${typeFromFilename}.json`
    };
  }

  // 4. Structure analysis
  const typeFromStructure = inferTypeFromStructure(frontmatter);
  if (typeFromStructure !== 'board') {
    return {
      type: typeFromStructure,
      isOfficial: true,
      schemaUrl: `https://brainfile.md/v1/${typeFromStructure}.json`
    };
  }

  // 5. Default fallback
  return {
    type: 'board',
    isOfficial: true,
    schemaUrl: 'https://brainfile.md/v1/board.json'
  };
}
```

## Validation

After inference, validate that the detected type matches the structure:

```typescript
function validateInferredType(
  inferredType: BrainfileType,
  frontmatter: any
): ValidationResult {
  // Load type-specific schema
  const schema = loadSchema(inferredType);

  // Validate frontmatter against schema
  const result = validateAgainstSchema(frontmatter, schema);

  if (!result.valid) {
    return {
      valid: false,
      errors: [
        `File inferred as '${inferredType}' but validation failed:`,
        ...result.errors
      ]
    };
  }

  return { valid: true };
}
```

## Type Conflicts

When multiple detection methods suggest different types:

### Explicit vs Inferred Mismatch

**Scenario**: Type field says `journal`, but structure has `columns`

```yaml
---
type: journal
columns: [...]  # Board structure!
---
```

**Resolution**: Explicit type wins, but validation fails

**Error**:
```
Type mismatch: Explicit type is 'journal' but structure suggests 'board'.
Validation failed: 'columns' field not allowed in journal type.
```

### Schema vs Structure Mismatch

**Scenario**: Schema says `board.json`, but structure has `entries`

```yaml
---
schema: https://brainfile.md/v1/board.json
entries: [...]  # Journal structure!
---
```

**Resolution**: Schema URL wins (higher priority), validation fails

**Error**:
```
Schema mismatch: Schema URL suggests 'board' but structure suggests 'journal'.
Validation failed: Required field 'columns' missing.
```

### Filename vs Structure Mismatch

**Scenario**: Filename is `tasks.journal.md`, but structure has `columns`

```yaml
# File: tasks.journal.md
---
columns: [...]  # Board structure!
---
```

**Resolution**: Structure analysis wins (lower priority, higher confidence)

**Behavior**: Warn about misleading filename, but proceed with board type

**Warning**:
```
Warning: Filename suggests 'journal' type but structure detected as 'board'.
Consider renaming to 'tasks.board.md' for clarity.
```

## Migration Strategy

### Phase 0-2: Optional Type (Current)

- Type field optional
- Inference used for missing types
- No errors, only warnings

```yaml
# Valid (explicit)
type: board

# Valid (inferred from filename)
# File: tasks.board.md

# Valid (inferred from structure)
columns: [...]

# Valid (defaults to board)
title: My Project
```

### Phase 3: Deprecation Warnings

- Type field still optional
- CLI warns about missing type
- Encourages migration

```bash
$ brainfile validate tasks.md
⚠ Warning: Missing 'type' field. Type inferred as 'board'.
  Add 'type: board' to frontmatter for explicit declaration.
  Type field will be required in v1.0.0.
```

### v1.0.0: Required Type

- Type field becomes required
- Inference still available for validation
- Migration tool available

```bash
$ brainfile migrate tasks.md
✓ Added explicit type field: type: board
✓ Updated schema URL: https://brainfile.md/v1/board.json
```

## Edge Cases

### Empty Frontmatter

```yaml
---
---
# Content here
```

**Result**: Inferred as `board` (default fallback)

### Minimal Board

```yaml
---
title: My Tasks
columns: []
---
```

**Result**: Inferred as `board` (structure analysis)

### Ambiguous Items Array

```yaml
---
title: My List
items:
  - title: First item
  - title: Second item
---
```

**Result**: Inferred as `checklist` (items default to checklist)

**Rationale**: Checklist is more common for simple lists than collection

To force collection, add URL or use explicit type:

```yaml
# Option 1: Explicit type
type: collection
items: [...]

# Option 2: Add URL to items
items:
  - title: First item
    url: https://example.com
```

### Legacy Files

```yaml
---
title: My Project
columns:
  - id: todo
    tasks: []
---
```

**Result**: Inferred as `board` (structure analysis)

**Validation**: Passes board schema without type field

### Custom Types with Schema URLs

```yaml
# Custom type with explicit schema
---
type: sprint-board
schema: https://my-company.com/schemas/sprint-board.json
sprints:
  - id: sprint-1
    goal: Launch MVP
---
```

**Result**:
1. Explicit type field found → `sprint-board` (custom type)
2. Schema URL provided → Use for validation
3. Validate against company's custom schema
4. Custom schema should extend `https://brainfile.md/v1/base.json`

### Community Type Best Practices

When creating custom types:

1. **Always include `schema` URL** - Required for validation
2. **Extend the base schema** - Use `allOf` to inherit shared fields
3. **Use descriptive type names** - lowercase with hyphens (e.g., `sprint-board`)
4. **Host schema publicly** - Or distribute with your project

**Example Custom Schema**:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://mycompany.com/schemas/sprint-board.json",
  "title": "Sprint Board Schema",
  "allOf": [
    { "$ref": "https://brainfile.md/v1/base.json" },
    {
      "type": "object",
      "required": ["sprints"],
      "properties": {
        "type": { "const": "sprint-board" },
        "sprints": {
          "type": "array",
          "items": { "$ref": "#/definitions/sprint" }
        }
      }
    }
  ]
}
```

## Flowchart

```
┌─────────────────────────────────────┐
│  Parse Brainfile Frontmatter        │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│  1. Check Explicit Type Field       │
│     frontmatter.type exists?        │
└────────────┬────────────────────────┘
             │
         ┌───┴───┐
         │  YES  │──→ Validate type value
         └───────┘    ├─ Valid → Return type
                      └─ Invalid → Error
         │  NO   │
         └───┬───┘
             │
             ▼
┌─────────────────────────────────────┐
│  2. Check Schema URL Pattern        │
│     frontmatter.schema exists?      │
└────────────┬────────────────────────┘
             │
         ┌───┴───┐
         │  YES  │──→ Extract type from URL
         └───────┘    ├─ Found → Return type
                      └─ Not found → Continue
         │  NO   │
         └───┬───┘
             │
             ▼
┌─────────────────────────────────────┐
│  3. Check Filename Pattern          │
│     filename matches *.{type}.md?   │
└────────────┬────────────────────────┘
             │
         ┌───┴───┐
         │  YES  │──→ Extract type from name
         └───────┘    ├─ Valid type → Return type
                      └─ Invalid → Continue
         │  NO   │
         └───┬───┘
             │
             ▼
┌─────────────────────────────────────┐
│  4. Analyze Structure               │
│     Check for type-specific fields  │
└────────────┬────────────────────────┘
             │
     ┌───────┼───────┐
     │       │       │       │       │
     ▼       ▼       ▼       ▼       ▼
  columns entries categories items sections
     │       │       │       │       │
  board  journal collection checklist document
     │       │       │       │       │
     └───────┴───────┴───────┴───────┘
             │
             ▼
┌─────────────────────────────────────┐
│  5. Default Fallback                │
│     No indicators found             │
└────────────┬────────────────────────┘
             │
             ▼
        Return 'board'
```

## Testing Type Inference

### Test Cases

```typescript
describe('Type Inference', () => {
  test('explicit type field', () => {
    const result = inferType('test.md', { type: 'journal' });
    expect(result).toBe('journal');
  });

  test('schema URL pattern', () => {
    const result = inferType('test.md', {
      schema: 'https://brainfile.md/v1/journal.json'
    });
    expect(result).toBe('journal');
  });

  test('filename pattern', () => {
    const result = inferType('work.journal.md', {});
    expect(result).toBe('journal');
  });

  test('structure analysis - board', () => {
    const result = inferType('test.md', { columns: [] });
    expect(result).toBe('board');
  });

  test('structure analysis - journal', () => {
    const result = inferType('test.md', { entries: [] });
    expect(result).toBe('journal');
  });

  test('default fallback', () => {
    const result = inferType('test.md', { title: 'Test' });
    expect(result).toBe('board');
  });

  test('type conflict - explicit wins', () => {
    const result = inferType('test.journal.md', {
      type: 'board',
      columns: []
    });
    expect(result).toBe('board');  // Explicit type wins
  });
});
```

## Best Practices

### For Users

1. **Always Use Explicit Type**: Don't rely on inference for new files

```yaml
# ✅ Recommended
---
type: journal
title: Dev Log
entries: []
---

# ❌ Avoid (relies on inference)
---
title: Dev Log
entries: []
---
```

2. **Match Filename to Type**: Use `.{type}.md` suffix for clarity

```bash
✅ tasks.board.md
✅ standup.journal.md
❌ tasks.md         # Ambiguous
❌ journal.md       # Ambiguous (is it a journal type or about journals?)
```

3. **Include Schema URL**: Enables validation tools

```yaml
---
type: journal
schema: https://brainfile.md/v1/journal.json
---
```

### For Tool Developers

1. **Prefer Explicit Over Inferred**: Warn when type is inferred

2. **Validate After Inference**: Always validate inferred type against schema

3. **Clear Error Messages**: Explain type conflicts clearly

4. **Migration Tools**: Provide tools to add explicit types to legacy files

## See Also

- [Base Schema](./types/base.md) - Shared fields across all types
- [Type Comparison](./types/comparison.md) - When to use each type
- [Schema Evolution Roadmap](../SCHEMA_EVOLUTION_ROADMAP.md) - Implementation timeline
- [v1 README](../v1/README.md) - Schema architecture overview
