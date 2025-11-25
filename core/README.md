<p align="center">
  <img src="https://raw.githubusercontent.com/brainfile/core/main/logo.png" alt="Brainfile Logo" width="128" height="128">
</p>

# @brainfile/core

Core library for the Brainfile task management protocol. This package provides parsing, serialization, validation, and template management for Brainfile markdown files with YAML frontmatter.

## Installation

```bash
npm install @brainfile/core
```

## Features

- **Parse** Brainfile markdown files into structured Board objects
- **Serialize** Board objects back to Brainfile markdown format
- **Validate** Board objects against the Brainfile schema
- **Templates** Built-in task templates (Bug Report, Feature Request, Refactor)
- **Location Finding** Find tasks and rules in source files for IDE integration
- **Realtime Sync** Shared hashing + diff utilities for live board updates

## Usage

### Quick Start

```typescript
import { Brainfile } from "@brainfile/core";

// Parse a brainfile.md file
const markdown = `---
title: My Project
columns:
  - id: todo
    title: To Do
    tasks:
      - id: task-1
        title: My First Task
---
`;

const board = Brainfile.parse(markdown);
console.log(board.title); // "My Project"

// Validate the board
const validation = Brainfile.validate(board);
if (!validation.valid) {
  console.error("Validation errors:", validation.errors);
}

// Serialize back to markdown
const output = Brainfile.serialize(board);
console.log(output);
```

### Using Templates

```typescript
import { Brainfile } from "@brainfile/core";

// Get all built-in templates
const templates = Brainfile.getBuiltInTemplates();
console.log(templates.map((t) => t.name)); // ['Bug Report', 'Feature Request', 'Code Refactor']

// Create a task from a template
const bugTask = Brainfile.createFromTemplate("bug-report", {
  title: "Login button not working",
  description: "Users cannot log in to the application",
});

console.log(bugTask);
// {
//   title: 'Login button not working',
//   description: '## Bug Description\nUsers cannot log in...',
//   template: 'bug',
//   priority: 'high',
//   tags: ['bug', 'needs-triage'],
//   subtasks: [...]
// }
```

### Advanced Usage

```typescript
import {
  BrainfileParser,
  BrainfileSerializer,
  BrainfileValidator,
  Board,
} from "@brainfile/core";

// Parse with error details
const parseResult = BrainfileParser.parseWithErrors(markdown);
if (!parseResult.board) {
  console.error("Parse error:", parseResult.error);
}

// Serialize with custom options
const output = BrainfileSerializer.serialize(board, {
  indent: 4,
  lineWidth: 80,
  trailingNewline: true,
});

// Validate with detailed errors
const validation = BrainfileValidator.validate(board);
validation.errors.forEach((error) => {
  console.log(`${error.path}: ${error.message}`);
});

// Find task location in source file
const location = BrainfileParser.findTaskLocation(markdown, "task-1");
console.log(`Task found at line ${location.line}`);
```

### Board Operations

The library provides immutable board operations that return a new board without mutating the original:

```typescript
import {
  addTask,
  patchTask,
  deleteTask,
  moveTask,
  archiveTask,
  restoreTask,
  addSubtask,
  deleteSubtask,
  updateSubtask,
  toggleSubtask,
  type TaskInput,
  type TaskPatch,
  type BoardOperationResult,
} from "@brainfile/core";

// Add a task with all fields
const result = addTask(board, "todo", {
  title: "Implement auth",
  description: "Add OAuth2 support",
  priority: "high",
  tags: ["security", "feature"],
  assignee: "john",
  dueDate: "2025-02-01",
  subtasks: ["Research providers", "Implement flow", "Add tests"],
});

if (result.success) {
  board = result.board!;
}

// Patch a task (partial update)
const patchResult = patchTask(board, "task-1", {
  priority: "critical",
  tags: ["urgent", "bug"],
});

// Remove a field by setting to null
const removeResult = patchTask(board, "task-1", {
  assignee: null, // removes assignee
  dueDate: null,  // removes dueDate
});

// Move a task between columns
const moveResult = moveTask(board, "task-1", "todo", "in-progress", 0);

// Subtask operations
const addSubResult = addSubtask(board, "task-1", "New subtask");
const deleteSubResult = deleteSubtask(board, "task-1", "task-1-2");
const updateSubResult = updateSubtask(board, "task-1", "task-1-1", "Updated title");
const toggleResult = toggleSubtask(board, "task-1", "task-1-1");

// Archive and restore
const archiveResult = archiveTask(board, "done", "task-5");
const restoreResult = restoreTask(board, "task-5", "todo");
```

All operations return a `BoardOperationResult`:

```typescript
interface BoardOperationResult {
  success: boolean;
  board?: Board;  // New board if success
  error?: string; // Error message if failed
}
```

### Realtime Sync Utilities

```typescript
import {
  hashBoardContent,
  hashBoard,
  diffBoards,
  type BoardDiff,
} from "@brainfile/core";

// 1. Guard file watchers / save loops with a stable content hash
const currentHash = hashBoardContent(markdownString);
if (currentHash === lastKnownHash) {
  return; // skip redundant refreshes
}
lastKnownHash = currentHash;

// 2. Share board state across processes by hashing serialized structures
const boardHash = hashBoard(boardObject); // uses BrainfileSerializer internally

// 3. Compute structural diffs for incremental UI updates
const diff: BoardDiff = diffBoards(previousBoard, nextBoard);
if (diff.tasksMoved.length > 0) {
  console.log("Tasks moved:", diff.tasksMoved);
}
```

The realtime helpers were built for the VS Code extension but live in `@brainfile/core`
so every client (CLI, Zed, JetBrains, custom bots) can:

- Detect external edits with collision-resistant hashes (`hashBoardContent`)
- Generate consistent board fingerprints across threads/workers (`hashBoard`)
- Drive fine-grained UI updates or telemetry with `diffBoards`

**Migration tips**

- Replace ad-hoc `crypto` usage with `hashBoardContent` to ensure identical digests
  across Node/electron environments.
- Use `diffBoards` instead of manual `JSON.stringify` comparisons to avoid
  false positives when metadata changes but tasks stay untouched.
- Wrap realtime error handling so malformed boards fall back to last-known-good
  state before broadcasting diffs (the helper types make this easy to model).

## API Reference

### Brainfile (Main Class)

#### Static Methods

- `parse(content: string): Board | null` - Parse markdown content
- `parseWithErrors(content: string): ParseResult` - Parse with detailed errors
- `serialize(board: Board, options?: SerializeOptions): string` - Serialize board to markdown
- `validate(board: Board): ValidationResult` - Validate a board object
- `getBuiltInTemplates(): TaskTemplate[]` - Get all built-in templates
- `getTemplate(id: string): TaskTemplate | undefined` - Get a template by ID
- `createFromTemplate(templateId: string, values: Record<string, string>): Partial<Task>` - Create task from template
- `findTaskLocation(content: string, taskId: string)` - Find task location in file
- `findRuleLocation(content: string, ruleId: number, ruleType: RuleType)` - Find rule location in file

### Types

```typescript
interface Board {
  title: string;
  protocolVersion?: string;
  schema?: string;
  agent?: AgentInstructions;
  rules?: Rules;
  statsConfig?: StatsConfig;
  columns: Column[];
  archive?: Task[];
}

interface Task {
  id: string;
  title: string;
  description?: string;
  relatedFiles?: string[];
  assignee?: string;
  tags?: string[];
  priority?: "low" | "medium" | "high" | "critical";
  dueDate?: string;
  subtasks?: Subtask[];
  template?: "bug" | "feature" | "refactor";
}

interface Column {
  id: string;
  title: string;
  tasks: Task[];
}

// For creating tasks with addTask()
interface TaskInput {
  title: string;
  description?: string;
  priority?: "low" | "medium" | "high" | "critical";
  tags?: string[];
  assignee?: string;
  dueDate?: string;
  relatedFiles?: string[];
  template?: "bug" | "feature" | "refactor";
  subtasks?: string[]; // Just titles - IDs auto-generated
}

// For partial updates with patchTask()
interface TaskPatch {
  title?: string;
  description?: string;
  priority?: "low" | "medium" | "high" | "critical" | null;
  tags?: string[] | null;
  assignee?: string | null;
  dueDate?: string | null;
  relatedFiles?: string[] | null;
  template?: "bug" | "feature" | "refactor" | null;
}
```

## Built-in Templates

### Bug Report

- Priority: `high`
- Tags: `['bug', 'needs-triage']`
- Variables: `title`, `description`
- Subtasks: 5 (reproduce, identify, fix, test, verify)

### Feature Request

- Priority: `medium`
- Tags: `['feature', 'enhancement']`
- Variables: `title`, `description`
- Subtasks: 6 (design, implement, unit test, integration test, docs, review)

### Code Refactor

- Priority: `low`
- Tags: `['refactor', 'technical-debt']`
- Variables: `area`, `description`
- Subtasks: 6 (analyze, design, implement, test, docs, performance)

## Testing

- Test files live in `src/__tests__` with shared fixtures under `src/__tests__/fixtures`.
- Run `npm test` to execute the Jest suite with coverage, or `npm run test:watch` while developing.
- Coverage focuses on critical modules (parser, serializer, validator) and currently exceeds 80% line coverage.
- `npm run test:coverage` generates an lcov report in `coverage/` for deeper review.

## Error Handling

The library provides detailed error messages for parsing and validation:

```typescript
const result = Brainfile.parseWithErrors(invalidMarkdown);
if (!result.board) {
  console.error("Parse error:", result.error);
}

const validation = Brainfile.validate(board);
if (!validation.valid) {
  validation.errors.forEach((err) => {
    console.log(`${err.path}: ${err.message}`);
  });
}
```

## Linting and Auto-Fixing

The core library includes a comprehensive linter that can detect and fix common issues in brainfile.md files:

```typescript
import { Brainfile, BrainfileLinter } from "@brainfile/core";

const content = `---
title: My Board
columns:
  - id: todo
    title: To Do
    tasks:
      - id: task-1
        title: Bug: Login not working
---`;

// Lint without fixing
const result = Brainfile.lint(content);

console.log(result.valid); // false
console.log(result.issues);
// [{
//   type: "warning",
//   message: "Unquoted string with colon: ...",
//   line: 8,
//   fixable: true,
//   code: "UNQUOTED_STRING"
// }]

// Lint with auto-fix
const fixedResult = Brainfile.lint(content, { autoFix: true });
console.log(fixedResult.fixedContent);
// Content with quotes added around strings with colons

// Helper methods
const summary = BrainfileLinter.getSummary(result);
console.log(summary); // "2 warnings, 2 fixable"

const grouped = BrainfileLinter.groupIssues(result);
console.log(grouped.errors); // Array of error issues
console.log(grouped.warnings); // Array of warning issues
console.log(grouped.fixable); // Array of fixable issues
```

**What the linter detects:**

- ✅ Missing or malformed YAML frontmatter
- ✅ YAML syntax errors (with line numbers)
- ✅ Unquoted strings containing colons (auto-fixable)
- ✅ Invalid priority/template values
- ✅ Missing required fields
- ✅ Duplicate column IDs (warning)
- ✅ Structural validation errors

**Error codes:**

- `MISSING_FRONTMATTER_START` - Missing opening `---`
- `MISSING_FRONTMATTER_END` - Missing closing `---`
- `YAML_SYNTAX_ERROR` - Invalid YAML syntax
- `UNQUOTED_STRING` - String with colon needs quotes (fixable)
- `DUPLICATE_COLUMN` - Duplicate column ID detected
- `VALIDATION_ERROR` - Board structure validation failed
- `PARSE_ERROR` - General parsing error

## Duplicate Column Handling

The parser automatically handles duplicate columns with the same ID, making it more forgiving of LLM-generated or manually edited files. When duplicates are detected:

- **Tasks are merged**: All tasks from duplicate columns are consolidated into a single column
- **First occurrence wins**: The title and properties of the first column with that ID are preserved
- **Warnings are logged**: Console warnings alert you to the duplicates
- **Warnings in result**: `parseWithErrors()` includes warnings in the result object

```typescript
// Example: File with duplicate "todo" columns
const markdown = `---
title: My Board
columns:
  - id: todo
    title: To Do
    tasks:
      - id: task-1
        title: First Task
  - id: todo
    title: To Do (Duplicate)
    tasks:
      - id: task-2
        title: Second Task
---`;

const result = Brainfile.parseWithErrors(markdown);

// Result will have one "todo" column with both tasks merged
console.log(result.board.columns.length); // 1
console.log(result.board.columns[0].tasks.length); // 2

// Warnings will indicate duplicates were found
if (result.warnings) {
  console.log(result.warnings);
  // ["[Brainfile Parser] Duplicate columns detected:", ...]
}
```

This feature is particularly useful when:

- LLMs accidentally create duplicate columns
- Merging brainfile.md files from different sources
- Recovering from manual editing mistakes
- Migrating or consolidating project boards

## Integration with Other Tools

This core library is used by:

- **[@brainfile/cli](https://www.npmjs.com/package/@brainfile/cli)** - Command-line interface
- **brainfile-vscode** - VSCode extension (coming soon)
- Future: Zed, JetBrains, and other IDE integrations

## License

MIT

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for details.

## Links

- **npm**: https://www.npmjs.com/package/@brainfile/core
- **GitHub**: https://github.com/brainfile/core
- **Protocol**: https://brainfile.md
- **CLI**: [@brainfile/cli](https://www.npmjs.com/package/@brainfile/cli)
