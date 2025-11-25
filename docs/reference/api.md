---
title: API Reference
description: Complete API reference for @brainfile/core
---

# API Reference

Complete documentation for `@brainfile/core` TypeScript library.

## Brainfile Class

The main class provides static methods for all core operations.

### Parsing

#### `Brainfile.parse(content: string): Board | null`

Parse markdown content into a Board object.

```typescript
const board = Brainfile.parse(markdownString);
if (board) {
  console.log(board.title);
}
```

#### `Brainfile.parseWithErrors(content: string): ParseResult`

Parse with detailed error and warning information.

```typescript
const result = Brainfile.parseWithErrors(markdownString);
if (result.board) {
  console.log("Parsed successfully");
  if (result.warnings) {
    console.warn("Warnings:", result.warnings);
  }
} else {
  console.error("Parse error:", result.error);
}
```

### Serialization

#### `Brainfile.serialize(board: Board, options?: SerializeOptions): string`

Serialize a Board object back to markdown format.

```typescript
const markdown = Brainfile.serialize(board, {
  indent: 2,
  lineWidth: 80,
  trailingNewline: true,
});
```

### Validation

#### `Brainfile.validate(board: Board): ValidationResult`

Validate a board against the schema.

```typescript
const validation = Brainfile.validate(board);
if (!validation.valid) {
  validation.errors.forEach((err) => {
    console.log(`${err.path}: ${err.message}`);
  });
}
```

### Linting

#### `Brainfile.lint(content: string, options?: LintOptions): LintResult`

Lint raw content for issues, optionally auto-fixing.

```typescript
// Check for issues
const result = Brainfile.lint(content);
console.log(result.issues);

// Auto-fix issues
const fixedResult = Brainfile.lint(content, { autoFix: true });
console.log(fixedResult.fixedContent);
```

### Templates

#### `Brainfile.getBuiltInTemplates(): TaskTemplate[]`

Get all built-in task templates.

```typescript
const templates = Brainfile.getBuiltInTemplates();
templates.forEach((t) => console.log(`${t.id}: ${t.name}`));
```

#### `Brainfile.getTemplate(id: string): TaskTemplate | undefined`

Get a specific template by ID.

#### `Brainfile.createFromTemplate(templateId: string, values: Record<string, string>): Partial<Task>`

Create a task from a template.

```typescript
const task = Brainfile.createFromTemplate("bug-report", {
  title: "Login fails on mobile",
  description: "Users cannot log in on iOS",
});
```

### Location Finding

#### `Brainfile.findTaskLocation(content: string, taskId: string): Location`

Find line number of a task in source.

#### `Brainfile.findRuleLocation(content: string, ruleId: number, ruleType: RuleType): Location`

Find line number of a rule in source.

---

## Board Operations

All operations are immutable and return `BoardOperationResult`.

### `addTask(board, columnId, input): BoardOperationResult`

```typescript
import { addTask, type TaskInput } from "@brainfile/core";

const result = addTask(board, "todo", {
  title: "Implement auth",
  description: "Add OAuth2 support",
  priority: "high",
  tags: ["security"],
  assignee: "john",
  dueDate: "2025-02-01",
  subtasks: ["Research", "Implement", "Test"],
});

if (result.success) {
  board = result.board!;
}
```

### `patchTask(board, taskId, patch): BoardOperationResult`

Set fields to `null` to remove them.

```typescript
import { patchTask } from "@brainfile/core";

// Update fields
patchTask(board, "task-1", { priority: "critical" });

// Remove fields
patchTask(board, "task-1", { assignee: null, dueDate: null });
```

### `moveTask(board, taskId, fromColumn, toColumn, toIndex): BoardOperationResult`

```typescript
import { moveTask } from "@brainfile/core";

moveTask(board, "task-1", "todo", "in-progress", 0);
```

### `deleteTask(board, columnId, taskId): BoardOperationResult`

```typescript
import { deleteTask } from "@brainfile/core";

deleteTask(board, "todo", "task-1");
```

### `archiveTask(board, columnId, taskId): BoardOperationResult`

```typescript
import { archiveTask } from "@brainfile/core";

archiveTask(board, "done", "task-5");
```

### `restoreTask(board, taskId, columnId): BoardOperationResult`

```typescript
import { restoreTask } from "@brainfile/core";

restoreTask(board, "task-5", "todo");
```

---

## Subtask Operations

### `addSubtask(board, taskId, title): BoardOperationResult`

ID is auto-generated as `task-N-M`.

### `deleteSubtask(board, taskId, subtaskId): BoardOperationResult`

### `updateSubtask(board, taskId, subtaskId, title): BoardOperationResult`

### `toggleSubtask(board, taskId, subtaskId): BoardOperationResult`

```typescript
import {
  addSubtask,
  deleteSubtask,
  updateSubtask,
  toggleSubtask,
} from "@brainfile/core";

addSubtask(board, "task-1", "New subtask");
toggleSubtask(board, "task-1", "task-1-1");
updateSubtask(board, "task-1", "task-1-1", "Updated title");
deleteSubtask(board, "task-1", "task-1-2");
```

---

## Realtime Sync Utilities

### `hashBoardContent(content: string): string`

SHA-256 hash of raw content. Use to detect file changes.

```typescript
const hash = hashBoardContent(markdown);
if (hash !== lastHash) {
  refreshBoard();
}
```

### `hashBoard(board: Board): string`

Hash of serialized board. Deterministic fingerprint for sharing.

### `diffBoards(previous: Board, next: Board): BoardDiff`

Compute structural differences for incremental UI updates.

```typescript
const diff = diffBoards(oldBoard, newBoard);
if (diff.tasksMoved.length > 0) {
  // Handle moved tasks
}
```

---

## Types

### Board

```typescript
interface Board {
  title: string;
  protocolVersion?: string;
  schema?: string;
  agent?: AgentInstructions;
  rules?: Rules;
  columns: Column[];
  archive?: Task[];
}
```

### Column

```typescript
interface Column {
  id: string;
  title: string;
  tasks: Task[];
}
```

### Task

```typescript
interface Task {
  id: string;
  title: string;
  description?: string;
  relatedFiles?: string[];
  assignee?: string;
  tags?: string[];
  priority?: "low" | "medium" | "high" | "critical";
  effort?: "trivial" | "small" | "medium" | "large" | "xlarge";
  blockedBy?: string[];
  dueDate?: string;
  subtasks?: Subtask[];
  template?: "bug" | "feature" | "refactor";
}
```

### Subtask

```typescript
interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}
```

### TaskInput

For `addTask()`:

```typescript
interface TaskInput {
  title: string;
  description?: string;
  priority?: "low" | "medium" | "high" | "critical";
  tags?: string[];
  assignee?: string;
  dueDate?: string;
  relatedFiles?: string[];
  template?: "bug" | "feature" | "refactor";
  subtasks?: string[]; // Titles only, IDs auto-generated
}
```

### TaskPatch

For `patchTask()`. Use `null` to remove fields.

```typescript
interface TaskPatch {
  title?: string;
  description?: string | null;
  priority?: "low" | "medium" | "high" | "critical" | null;
  tags?: string[] | null;
  assignee?: string | null;
  dueDate?: string | null;
  relatedFiles?: string[] | null;
  template?: "bug" | "feature" | "refactor" | null;
}
```

### BoardOperationResult

```typescript
interface BoardOperationResult {
  success: boolean;
  board?: Board;  // New board if success
  error?: string; // Error message if failed
}
```

### BoardDiff

```typescript
interface BoardDiff {
  metadataChanged: boolean;
  columnsAdded: ColumnDiff[];
  columnsRemoved: ColumnDiff[];
  columnsUpdated: ColumnDiff[];
  columnsMoved: ColumnDiff[];
  tasksAdded: TaskDiff[];
  tasksRemoved: TaskDiff[];
  tasksUpdated: TaskDiff[];
  tasksMoved: TaskDiff[];
}
```

### AgentInstructions

```typescript
interface AgentInstructions {
  instructions?: string[];
  llmNotes?: string;
}
```

### Rules

```typescript
interface Rules {
  always?: Rule[];
  never?: Rule[];
  prefer?: Rule[];
  context?: Rule[];
}

interface Rule {
  id: number;
  rule: string;
}
```

### SerializeOptions

```typescript
interface SerializeOptions {
  indent?: number;        // Default: 2
  lineWidth?: number;     // Default: 80
  trailingNewline?: boolean; // Default: true
}
```

### ValidationResult

```typescript
interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

interface ValidationError {
  path: string;
  message: string;
}
```

### ParseResult

```typescript
interface ParseResult {
  board: Board | null;
  error?: string;
  warnings?: string[];
}
```

---

## Low-Level Classes

For advanced usage:

```typescript
import {
  BrainfileParser,
  BrainfileSerializer,
  BrainfileValidator,
  BrainfileLinter,
} from "@brainfile/core";

// Parser
BrainfileParser.parse(markdown);
BrainfileParser.parseWithErrors(markdown);
BrainfileParser.findTaskLocation(markdown, "task-1");

// Serializer
BrainfileSerializer.serialize(board, options);

// Validator
BrainfileValidator.validate(board);

// Linter
BrainfileLinter.lint(content, { autoFix: true });
BrainfileLinter.getSummary(lintResult);
BrainfileLinter.groupIssues(lintResult);
```
