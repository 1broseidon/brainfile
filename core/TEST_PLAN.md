# @brainfile/core Test Plan

## Overview

This document outlines the comprehensive testing strategy for the `@brainfile/core` library. The focus is on critical path testing with Jest, targeting 80% code coverage on core modules (parser, serializer, validator, templates).

## Testing Philosophy

- **Minimal but Practical**: Focus on critical functionality and common edge cases
- **Fast Feedback**: Tests should run quickly (<5 seconds total)
- **Clear Intent**: Each test should have a single, clear purpose
- **Realistic Fixtures**: Use real-world brainfile.md examples

## Test Framework Setup

### Dependencies

```json
{
  "devDependencies": {
    "@types/jest": "^29.5.0",
    "ts-jest": "^29.1.0",
    "jest": "^29.7.0"
  }
}
```

### Jest Configuration

**File**: `jest.config.js`

```javascript
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  collectCoverageFrom: ["src/**/*.ts", "!src/**/*.d.ts", "!src/__tests__/**"],
  coverageThresholds: {
    global: {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  moduleFileExtensions: ["ts", "js", "json"],
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: "tsconfig.json",
      },
    ],
  },
};
```

## Test Structure

```
packages/brainfile-core/src/__tests__/
├── fixtures/
│   ├── test-boards.ts          # TypeScript Board object fixtures
│   ├── valid-simple.md         # Minimal valid brainfile.md
│   ├── valid-complex.md        # Complex board with all features
│   ├── invalid-yaml.md         # Malformed YAML
│   ├── invalid-structure.md    # Valid YAML, invalid Board
│   ├── edge-cases.md           # Edge cases (empty, special chars)
│   └── templates.md            # Board using templates
├── parser.test.ts              # Parser tests (80+ tests)
├── serializer.test.ts          # Serializer tests (40+ tests)
├── validator.test.ts           # Validator tests (60+ tests)
├── templates.test.ts           # Template tests (30+ tests)
└── integration.test.ts         # End-to-end tests (20+ tests)
```

## Detailed Test Specifications

### 1. Parser Tests (`parser.test.ts`)

#### 1.1 Successful Parsing Tests

```typescript
describe("BrainfileParser.parse", () => {
  describe("successful parsing", () => {
    it("should parse minimal valid board");
    it("should parse board with all optional fields");
    it("should parse board with multiple columns");
    it("should parse board with tasks containing all fields");
    it("should parse board with subtasks");
    it("should parse board with all rule types");
    it("should parse board with agent instructions");
    it("should parse board with statsConfig");
    it("should parse board with archive");
    it("should preserve unknown fields in YAML");
    it("should handle empty arrays correctly");
    it("should handle multi-line strings");
    it("should parse special characters in strings");
    it("should parse ISO 8601 dates");
  });
});
```

#### 1.2 Error Handling Tests

```typescript
describe("error handling", () => {
  it("should return null for empty string");
  it("should return null for missing frontmatter");
  it("should return null for unclosed frontmatter");
  it("should return null for invalid YAML syntax");
  it("should return null for non-string content");
  it("should handle malformed task IDs gracefully");
  it("should handle circular references in YAML");
});
```

#### 1.3 parseWithErrors Tests

```typescript
describe("BrainfileParser.parseWithErrors", () => {
  it("should return board and no error for valid input");
  it("should return error message for invalid YAML");
  it("should return error message for missing frontmatter");
  it("should provide helpful error messages");
  it("should handle YAML parsing exceptions");
});
```

#### 1.4 findTaskLocation Tests

```typescript
describe("BrainfileParser.findTaskLocation", () => {
  it("should find task in compact format (- id: task-1)");
  it("should find task in expanded format (dash on separate line)");
  it("should return correct line number (1-indexed)");
  it("should return null for non-existent task");
  it("should find task in nested structure");
  it("should find task with special characters in ID");
  it("should find first occurrence of duplicate IDs");
  it("should handle whitespace variations");
});
```

#### 1.5 findRuleLocation Tests

```typescript
describe("BrainfileParser.findRuleLocation", () => {
  it("should find rule in always section");
  it("should find rule in never section");
  it("should find rule in prefer section");
  it("should find rule in context section");
  it("should return correct line number");
  it("should return null for non-existent rule");
  it("should return null for non-existent rule type");
  it("should handle rules with same ID in different sections");
  it("should find rule in compact format");
  it("should find rule in expanded format");
});
```

### 2. Serializer Tests (`serializer.test.ts`)

#### 2.1 Basic Serialization

```typescript
describe("BrainfileSerializer.serialize", () => {
  describe("basic serialization", () => {
    it("should serialize minimal board");
    it("should serialize board with all fields");
    it("should wrap output with --- markers");
    it("should end with newline by default");
    it("should use 2-space indentation by default");
    it("should preserve field order");
    it("should not include null/undefined fields");
  });
});
```

#### 2.2 Round-Trip Consistency

```typescript
describe("round-trip consistency", () => {
  it("should parse and serialize to equivalent content");
  it("should maintain task order");
  it("should maintain column order");
  it("should maintain rule order");
  it("should preserve all task properties");
  it("should preserve all metadata");
  it("should handle special characters correctly");
  it("should preserve multiline strings");
});
```

#### 2.3 Serialization Options

```typescript
describe("serialization options", () => {
  it("should respect custom indent option");
  it("should respect lineWidth option");
  it("should respect trailingNewline option");
  it("should use default options when not provided");
  it("should handle invalid options gracefully");
});
```

#### 2.4 Edge Cases

```typescript
describe("edge cases", () => {
  it("should handle empty columns array");
  it("should handle empty tasks array");
  it("should handle board with only title");
  it("should handle very long strings");
  it("should handle Unicode characters");
  it("should handle YAML special characters");
  it("should serialize Date objects as strings");
});
```

### 3. Validator Tests (`validator.test.ts`)

#### 3.1 Board Validation

```typescript
describe("BrainfileValidator.validate", () => {
  describe("Board validation", () => {
    it("should pass for valid minimal board");
    it("should pass for valid complex board");
    it("should fail for null/undefined board");
    it("should fail for missing title");
    it("should fail for empty title");
    it("should fail for non-string title");
    it("should fail for missing columns");
    it("should fail for non-array columns");
    it("should include all error paths");
  });
});
```

#### 3.2 Column Validation

```typescript
describe("Column validation", () => {
  it("should fail for missing column id");
  it("should fail for empty column id");
  it("should fail for missing column title");
  it("should fail for non-array tasks");
  it("should validate all tasks in column");
  it("should collect all column errors");
});
```

#### 3.3 Task Validation

```typescript
describe("Task validation", () => {
  it("should fail for missing task id");
  it("should fail for missing task title");
  it("should fail for invalid priority value");
  it("should fail for invalid template value");
  it("should fail for non-array tags");
  it("should fail for non-array relatedFiles");
  it("should fail for non-array subtasks");
  it("should validate all subtasks");
  it("should allow all optional fields to be missing");
});
```

#### 3.4 Subtask Validation

```typescript
describe("Subtask validation", () => {
  it("should fail for missing subtask id");
  it("should fail for missing subtask title");
  it("should fail for non-boolean completed");
  it("should pass for valid subtask");
});
```

#### 3.5 Rules Validation

```typescript
describe("Rules validation", () => {
  it("should validate all rule types");
  it("should fail for non-array rule type");
  it("should fail for missing rule id");
  it("should fail for non-number rule id");
  it("should fail for missing rule text");
  it("should allow optional rules section");
  it("should collect errors from all rule types");
});
```

#### 3.6 StatsConfig Validation

```typescript
describe("StatsConfig validation", () => {
  it("should allow optional statsConfig");
  it("should fail for non-object statsConfig");
  it("should fail for non-array columns");
  it("should fail for more than 4 columns");
  it("should pass for 1-4 columns");
});
```

### 4. Templates Tests (`templates.test.ts`)

#### 4.1 Built-in Templates

```typescript
describe("BUILT_IN_TEMPLATES", () => {
  it("should export exactly 3 templates");
  it("should include bug-report template");
  it("should include feature-request template");
  it("should include refactor template");

  describe("template structure", () => {
    it("should have required fields (id, name, description)");
    it("should have valid template field");
    it("should have non-empty variables array");
    it("should have isBuiltIn flag set to true");
  });

  describe("bug-report template", () => {
    it("should have high priority");
    it("should have bug and needs-triage tags");
    it("should have 5 subtasks");
    it("should have title and description variables");
    it("should have bug template type");
  });

  // Similar for feature-request and refactor
});
```

#### 4.2 Variable Substitution

```typescript
describe("processTemplate", () => {
  it("should substitute single variable in title");
  it("should substitute multiple variables in description");
  it("should leave unmatched placeholders unchanged");
  it("should handle missing variables gracefully");
  it("should handle empty variable values");
  it("should preserve non-variable braces");
  it("should handle special characters in values");
  it("should generate unique subtask IDs");
  it("should preserve template type");
  it("should preserve priority and tags");
});
```

#### 4.3 ID Generation

```typescript
describe("ID generation", () => {
  describe("generateTaskId", () => {
    it("should generate unique IDs");
    it("should follow expected format");
    it("should not collide in rapid succession");
  });

  describe("generateSubtaskId", () => {
    it("should include parent task ID");
    it("should include index");
    it("should generate sequential IDs");
  });
});
```

#### 4.4 Template Lookup

```typescript
describe("template lookup", () => {
  it("should find template by id");
  it("should return undefined for unknown id");
  it("should return all template IDs");
  it("should maintain template order");
});
```

### 5. Integration Tests (`integration.test.ts`)

#### 5.1 Complete Workflows

```typescript
describe("Integration: Complete Workflows", () => {
  it("should create board from scratch, add tasks, serialize");
  it("should parse, modify, validate, re-serialize");
  it("should handle template-based task creation workflow");
  it("should maintain data integrity through parse-serialize cycle");
  it("should handle complex board with all features");
});
```

#### 5.2 BangBang High-Level API

```typescript
describe("BangBang class", () => {
  it("should provide parse method");
  it("should provide parseWithErrors method");
  it("should provide serialize method");
  it("should provide validate method");
  it("should provide getBuiltInTemplates method");
  it("should provide getTemplate method");
  it("should provide createFromTemplate method");
  it("should provide findTaskLocation method");
  it("should provide findRuleLocation method");
  it("should throw error for invalid template ID");
});
```

#### 5.3 Error Recovery

```typescript
describe("error recovery", () => {
  it("should handle parse-validate-fix-serialize workflow");
  it("should provide actionable error messages");
  it("should maintain partial data on parse failure");
});
```

## Test Fixtures

### Fixture Files

**`fixtures/valid-simple.md`**

```markdown
---
title: Simple Board
columns:
  - id: todo
    title: To Do
    tasks:
      - id: task-1
        title: First Task
---
```

**`fixtures/valid-complex.md`**

```markdown
---
title: Complex Project
protocolVersion: "1.0"
schema: https://example.com/schema.json
agent:
  instructions:
    - Modify only YAML frontmatter
    - Preserve all IDs
rules:
  always:
    - id: 1
      rule: Write tests for new features
  never:
    - id: 1
      rule: Commit directly to main
  prefer:
    - id: 1
      rule: Small, focused commits
  context:
    - id: 1
      rule: This is a TypeScript project
statsConfig:
  columns:
    - todo
    - done
columns:
  - id: todo
    title: To Do
    tasks:
      - id: task-1
        title: Task with Everything
        description: |
          ## Description
          This task has all possible fields.

          - Bullet point
          - Another point
        assignee: john
        tags:
          - feature
          - high-priority
        priority: high
        dueDate: "2024-12-31"
        template: feature
        relatedFiles:
          - src/app.ts
          - src/utils.ts
        subtasks:
          - id: task-1-1
            title: Design
            completed: true
          - id: task-1-2
            title: Implement
            completed: false
  - id: done
    title: Done
    tasks: []
archive:
  - id: task-archived-1
    title: Old Task
    description: This was completed long ago
---
```

**`fixtures/invalid-yaml.md`**

```markdown
---
title: Broken Board
columns:
  - id: todo
    title: To Do
    tasks:
      - id: task-1
        title: Task
        description: "Unclosed quote
---
```

**`fixtures/invalid-structure.md`**

```markdown
---
title: 123
columns: "not an array"
---
```

**`fixtures/edge-cases.md`**

```markdown
---
title: "Edge Cases & Special: Characters"
columns:
  - id: "with-special-chars-!"
    title: 'Quotes "and" escapes'
    tasks:
      - id: "task-unicode-🎉"
        title: "Unicode: 你好 🌟"
        description: "Emoji 😀 and symbols ±∞"
---
```

### TypeScript Fixtures (`fixtures/test-boards.ts`)

```typescript
import { Board, Task, Column } from "../../types";

export const minimalBoard: Board = {
  title: "Test Board",
  columns: [
    {
      id: "todo",
      title: "To Do",
      tasks: [],
    },
  ],
};

export const complexBoard: Board = {
  title: "Complex Board",
  protocolVersion: "1.0",
  agent: {
    instructions: ["Test instruction"],
  },
  rules: {
    always: [{ id: 1, rule: "Always test" }],
    never: [{ id: 1, rule: "Never skip tests" }],
    prefer: [{ id: 1, rule: "Prefer simple solutions" }],
    context: [{ id: 1, rule: "Context matters" }],
  },
  statsConfig: {
    columns: ["todo", "done"],
  },
  columns: [
    {
      id: "todo",
      title: "To Do",
      tasks: [
        {
          id: "task-1",
          title: "Complete Task",
          description: "Full description",
          assignee: "alice",
          tags: ["bug", "urgent"],
          priority: "high",
          template: "bug",
          relatedFiles: ["src/app.ts"],
          subtasks: [
            { id: "sub-1", title: "Step 1", completed: true },
            { id: "sub-2", title: "Step 2", completed: false },
          ],
        },
      ],
    },
    {
      id: "done",
      title: "Done",
      tasks: [],
    },
  ],
  archive: [
    {
      id: "archived-1",
      title: "Old Task",
    },
  ],
};

export const invalidBoards = {
  noTitle: { columns: [] },
  noColumns: { title: "Test" },
  invalidPriority: {
    title: "Test",
    columns: [
      {
        id: "todo",
        title: "To Do",
        tasks: [
          {
            id: "task-1",
            title: "Task",
            priority: "super-high", // Invalid
          },
        ],
      },
    ],
  },
};
```

## Test Coverage Goals

### Critical Modules (80% minimum)

| Module        | Target Coverage | Priority              |
| ------------- | --------------- | --------------------- |
| parser.ts     | 85%             | Critical              |
| serializer.ts | 85%             | Critical              |
| validator.ts  | 90%             | Critical              |
| templates.ts  | 80%             | High                  |
| index.ts      | 95%             | High                  |
| types.ts      | N/A             | Type definitions only |

### Coverage by Type

- **Statements**: 80%
- **Branches**: 70% (lower due to error handling branches)
- **Functions**: 80%
- **Lines**: 80%

## Test Execution

### NPM Scripts

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:ci": "jest --ci --coverage --maxWorkers=2"
  }
}
```

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode for development
npm run test:watch

# Run specific test file
npm test -- parser.test.ts

# Run tests matching pattern
npm test -- --testNamePattern="parse"
```

## Best Practices

### Test Organization

1. **Group Related Tests**: Use `describe` blocks to group related functionality
2. **One Assertion Focus**: Each test should verify one specific behavior
3. **Descriptive Names**: Test names should clearly state what is being tested
4. **AAA Pattern**: Arrange, Act, Assert structure

### Test Writing Guidelines

```typescript
// ✅ GOOD: Clear, focused test
describe("BrainfileParser.parse", () => {
  it("should parse board with multiple columns", () => {
    // Arrange
    const markdown = `---
title: Test
columns:
  - id: todo
    title: To Do
    tasks: []
  - id: done
    title: Done
    tasks: []
---`;

    // Act
    const board = BrainfileParser.parse(markdown);

    // Assert
    expect(board).not.toBeNull();
    expect(board?.columns).toHaveLength(2);
    expect(board?.columns[0].id).toBe("todo");
    expect(board?.columns[1].id).toBe("done");
  });
});

// ❌ BAD: Multiple concerns, unclear intent
it("should work", () => {
  const board = BrainfileParser.parse(someMarkdown);
  expect(board).toBeTruthy();
  const serialized = BrainfileSerializer.serialize(board);
  expect(serialized).toContain("---");
  const validation = BrainfileValidator.validate(board);
  expect(validation.valid).toBe(true);
});
```

### Fixture Usage

```typescript
// ✅ GOOD: Reusable fixtures
import { minimalBoard, complexBoard } from './fixtures/test-boards';

it('should validate minimal board', () => {
  const result = BrainfileValidator.validate(minimalBoard);
  expect(result.valid).toBe(true);
});

// ❌ BAD: Inline fixtures in every test
it('should validate board', () => {
  const board = {
    title: 'Test',
    columns: [...]  // 50 lines of setup
  };
  // ... test code
});
```

### Error Testing

```typescript
// ✅ GOOD: Test error messages and paths
it("should provide helpful error for missing title", () => {
  const invalidBoard = { columns: [] };
  const result = BrainfileValidator.validate(invalidBoard);

  expect(result.valid).toBe(false);
  expect(result.errors).toHaveLength(1);
  expect(result.errors[0].path).toBe("title");
  expect(result.errors[0].message).toContain("non-empty string");
});

// ❌ BAD: Only checking failure flag
it("should fail validation", () => {
  const result = BrainfileValidator.validate(badBoard);
  expect(result.valid).toBe(false);
});
```

## Anti-Patterns to Avoid

### 1. Don't Test Implementation Details

```typescript
// ❌ BAD: Testing internal implementation
it("should call yaml.load internally", () => {
  const spy = jest.spyOn(yaml, "load");
  BrainfileParser.parse(markdown);
  expect(spy).toHaveBeenCalled();
});

// ✅ GOOD: Test public API behavior
it("should parse valid YAML frontmatter", () => {
  const board = BrainfileParser.parse(markdown);
  expect(board?.title).toBe("Test Board");
});
```

### 2. Don't Use Brittle Assertions

```typescript
// ❌ BAD: Exact string matching
expect(serialized).toBe("---\ntitle: Test\ncolumns:\n...");

// ✅ GOOD: Semantic assertions
expect(serialized).toMatch(/^---\n/);
expect(serialized).toContain("title: Test");
const reparsed = BrainfileParser.parse(serialized);
expect(reparsed?.title).toBe("Test");
```

### 3. Don't Create Test Interdependencies

```typescript
// ❌ BAD: Tests depend on execution order
let sharedBoard;
it("should parse board", () => {
  sharedBoard = BrainfileParser.parse(markdown);
});
it("should serialize board", () => {
  const result = BrainfileSerializer.serialize(sharedBoard);
  // ...
});

// ✅ GOOD: Independent tests
it("should parse board", () => {
  const board = BrainfileParser.parse(markdown);
  expect(board).not.toBeNull();
});

it("should serialize board", () => {
  const board = createTestBoard();
  const result = BrainfileSerializer.serialize(board);
  expect(result).toContain("---");
});
```

## Performance Considerations

- Tests should run in <5 seconds total
- Use `beforeEach` for setup, not expensive `beforeAll`
- Avoid file I/O in tests (use in-memory strings)
- Mock external dependencies if needed (currently none in core)

## Maintenance Guidelines

### When to Update Tests

1. **Adding Features**: Write tests BEFORE implementation (TDD)
2. **Bug Fixes**: Add regression test for the bug
3. **Refactoring**: Tests should remain unchanged (green)
4. **API Changes**: Update tests to match new contract

### Test Review Checklist

- [ ] Tests are independent and can run in any order
- [ ] Test names clearly describe what is being tested
- [ ] Fixtures are reusable and well-organized
- [ ] Error cases are tested with clear assertions
- [ ] Coverage meets 80% threshold
- [ ] No console.log or commented-out tests
- [ ] All tests pass before committing

## Example Test File Structure

```typescript
// parser.test.ts
import { BrainfileParser } from "../parser";
import { readFileSync } from "fs";
import { join } from "path";

// Helper to load fixtures
const loadFixture = (name: string): string => {
  return readFileSync(join(__dirname, "fixtures", name), "utf8");
};

describe("BrainfileParser", () => {
  describe("parse", () => {
    describe("successful parsing", () => {
      it("should parse minimal valid board", () => {
        const markdown = loadFixture("valid-simple.md");
        const board = BrainfileParser.parse(markdown);

        expect(board).not.toBeNull();
        expect(board?.title).toBe("Simple Board");
        expect(board?.columns).toHaveLength(1);
      });

      // More tests...
    });

    describe("error handling", () => {
      it("should return null for invalid YAML", () => {
        const markdown = loadFixture("invalid-yaml.md");
        const board = BrainfileParser.parse(markdown);

        expect(board).toBeNull();
      });

      // More tests...
    });
  });

  describe("parseWithErrors", () => {
    it("should return error message for invalid input", () => {
      const result = BrainfileParser.parseWithErrors("invalid");

      expect(result.board).toBeNull();
      expect(result.error).toBeDefined();
      expect(result.error).toContain("frontmatter");
    });
  });

  describe("findTaskLocation", () => {
    const markdown = loadFixture("valid-complex.md");

    it("should find task location by ID", () => {
      const location = BrainfileParser.findTaskLocation(markdown, "task-1");

      expect(location).not.toBeNull();
      expect(location?.line).toBeGreaterThan(0);
    });

    it("should return null for non-existent task", () => {
      const location = BrainfileParser.findTaskLocation(markdown, "task-999");

      expect(location).toBeNull();
    });
  });
});
```

## CI/CD Integration

### GitHub Actions Workflow (Future)

```yaml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: "20.x"
      - run: cd packages/brainfile-core && npm ci
      - run: cd packages/brainfile-core && npm test
      - run: cd packages/brainfile-core && npm run test:coverage
      - uses: codecov/codecov-action@v3
        with:
          files: ./packages/brainfile-core/coverage/lcov.info
```

## Success Criteria

The test suite is complete and successful when:

- ✅ All 200+ tests pass
- ✅ Coverage is ≥80% on critical modules
- ✅ Tests run in <5 seconds
- ✅ No flaky tests (100% reliability)
- ✅ Zero errors/warnings from Jest
- ✅ test-core.js integration test still passes
- ✅ Documentation is updated with testing examples

## Next Steps After Implementation

1. Run `npm test` to verify all tests pass
2. Run `npm run test:coverage` to check coverage report
3. Review coverage report in `coverage/lcov-report/index.html`
4. Address any coverage gaps in critical paths
5. Add pre-commit hook to run tests (optional)
6. Set up CI/CD pipeline for automated testing
7. Update README.md with testing section

## Estimated Test Count

| Module      | Unit Tests | Integration Tests | Total    |
| ----------- | ---------- | ----------------- | -------- |
| Parser      | 50         | 10                | 60       |
| Serializer  | 30         | 10                | 40       |
| Validator   | 50         | 5                 | 55       |
| Templates   | 25         | 5                 | 30       |
| Integration | 0          | 20                | 20       |
| **Total**   | **155**    | **50**            | **~205** |

## Implementation Timeline

1. **Phase 1**: Setup (1 subtask) - Jest config and dependencies
2. **Phase 2**: Fixtures (2 subtasks) - Create all test fixtures
3. **Phase 3**: Parser Tests (4 subtasks) - Complete parser coverage
4. **Phase 4**: Serializer Tests (3 subtasks) - Serialization and round-trip
5. **Phase 5**: Validator Tests (4 subtasks) - Complete validation coverage
6. **Phase 6**: Templates Tests (4 subtasks) - Template system coverage
7. **Phase 7**: Integration (1 subtask) - End-to-end workflows
8. **Phase 8**: Verification (3 subtasks) - Coverage, docs, cleanup

Each phase builds on the previous one, allowing for incremental progress and early feedback.
