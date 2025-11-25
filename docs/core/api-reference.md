---
title: API Reference
description: Complete API reference for @brainfile/core
---

## Brainfile (Main Class)

The main class provides static methods for parsing, serializing, validating, and working with brainfile documents.

### Static Methods

#### `parse(content: string): Board | null`

Parse markdown content into a Board object.

```typescript
const board = Brainfile.parse(markdownString);
if (board) {
  console.log(board.title);
}
```

#### `parseWithErrors(content: string): ParseResult`

Parse with detailed error information.

```typescript
const result = Brainfile.parseWithErrors(markdownString);
if (result.board) {
  console.log("Parsed successfully");
} else {
  console.error("Parse error:", result.error);
}
```

#### `serialize(board: Board, options?: SerializeOptions): string`

Serialize a Board object back to markdown format.

```typescript
const markdown = Brainfile.serialize(board, {
  indent: 2,
  lineWidth: 80,
  trailingNewline: true,
});
```

#### `validate(board: Board): ValidationResult`

Validate a board object against the schema.

```typescript
const validation = Brainfile.validate(board);
if (!validation.valid) {
  validation.errors.forEach((err) => {
    console.log(`${err.path}: ${err.message}`);
  });
}
```

#### `getBuiltInTemplates(): TaskTemplate[]`

Get all built-in task templates.

```typescript
const templates = Brainfile.getBuiltInTemplates();
templates.forEach((template) => {
  console.log(`${template.id}: ${template.name}`);
});
```

#### `getTemplate(id: string): TaskTemplate | undefined`

Get a specific template by ID.

```typescript
const bugTemplate = Brainfile.getTemplate("bug-report");
if (bugTemplate) {
  console.log(bugTemplate.name);
}
```

#### `createFromTemplate(templateId: string, values: Record<string, string>): Partial<Task>`

Create a task from a template with variable substitution.

```typescript
const task = Brainfile.createFromTemplate("bug-report", {
  title: "Login fails on mobile",
  description: "Users cannot log in on iOS devices",
});
```

#### `findTaskLocation(content: string, taskId: string): Location`

Find the line number and position of a task in the source file.

```typescript
const location = Brainfile.findTaskLocation(markdown, "task-1");
console.log(`Task at line ${location.line}`);
```

#### `findRuleLocation(content: string, ruleId: number, ruleType: RuleType): Location`

Find the location of a rule in the source file.

```typescript
const location = Brainfile.findRuleLocation(markdown, 1, "always");
console.log(`Rule at line ${location.line}`);
```

## Types

### Board

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

### StatsConfig

```typescript
interface StatsConfig {
  columns?: string[];
}
```

### SerializeOptions

```typescript
interface SerializeOptions {
  indent?: number; // Number of spaces for indentation (default: 2)
  lineWidth?: number; // Maximum line width (default: 80)
  trailingNewline?: boolean; // Add trailing newline (default: true)
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
}
```

### TaskTemplate

```typescript
interface TaskTemplate {
  id: string;
  name: string;
  description: string;
  variables: string[];
  task: Partial<Task>;
}
```

## Board Operations

Immutable operations that return a new board without mutating the original.

### `addTask(board: Board, columnId: string, input: TaskInput): BoardOperationResult`

Add a new task to a column with all optional fields.

```typescript
import { addTask, type TaskInput } from "@brainfile/core";

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
```

### `patchTask(board: Board, taskId: string, patch: TaskPatch): BoardOperationResult`

Partially update a task. Set fields to `null` to remove them.

```typescript
import { patchTask } from "@brainfile/core";

// Update specific fields
const result = patchTask(board, "task-1", {
  priority: "critical",
  tags: ["urgent", "bug"],
});

// Remove fields by setting to null
const removeResult = patchTask(board, "task-1", {
  assignee: null,
  dueDate: null,
});
```

### `moveTask(board: Board, taskId: string, fromColumn: string, toColumn: string, toIndex: number): BoardOperationResult`

Move a task between columns or reorder within the same column.

```typescript
import { moveTask } from "@brainfile/core";

const result = moveTask(board, "task-1", "todo", "in-progress", 0);
```

### `deleteTask(board: Board, columnId: string, taskId: string): BoardOperationResult`

Delete a task from a column.

```typescript
import { deleteTask } from "@brainfile/core";

const result = deleteTask(board, "todo", "task-1");
```

### `archiveTask(board: Board, columnId: string, taskId: string): BoardOperationResult`

Move a task to the archive.

```typescript
import { archiveTask } from "@brainfile/core";

const result = archiveTask(board, "done", "task-5");
```

### `restoreTask(board: Board, taskId: string, columnId: string): BoardOperationResult`

Restore a task from the archive to a column.

```typescript
import { restoreTask } from "@brainfile/core";

const result = restoreTask(board, "task-5", "todo");
```

### Subtask Operations

```typescript
import {
  addSubtask,
  deleteSubtask,
  updateSubtask,
  toggleSubtask,
} from "@brainfile/core";

// Add a subtask (ID auto-generated as task-N-M)
const addResult = addSubtask(board, "task-1", "New subtask title");

// Delete a subtask
const deleteResult = deleteSubtask(board, "task-1", "task-1-2");

// Update subtask title
const updateResult = updateSubtask(board, "task-1", "task-1-1", "Updated title");

// Toggle subtask completion
const toggleResult = toggleSubtask(board, "task-1", "task-1-1");
```

### TaskInput

Input type for creating tasks with `addTask()`.

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
  subtasks?: string[]; // Just titles - IDs are auto-generated
}
```

### TaskPatch

Input type for partial updates with `patchTask()`. Use `null` to remove optional fields.

```typescript
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

### BoardOperationResult

All operations return this result type.

```typescript
interface BoardOperationResult {
  success: boolean;
  board?: Board;  // New board if success
  error?: string; // Error message if failed
}
```

## Low-Level Classes

For advanced usage, you can import and use the low-level classes directly:

### BrainfileParser

```typescript
import { BrainfileParser } from "@brainfile/core";

const board = BrainfileParser.parse(markdown);
const result = BrainfileParser.parseWithErrors(markdown);
const location = BrainfileParser.findTaskLocation(markdown, "task-1");
```

### BrainfileSerializer

```typescript
import { BrainfileSerializer } from "@brainfile/core";

const markdown = BrainfileSerializer.serialize(board, options);
```

### BrainfileValidator

```typescript
import { BrainfileValidator } from "@brainfile/core";

const validation = BrainfileValidator.validate(board);
```

## Realtime Sync Utilities

Use these helpers to coordinate live Brainfile updates across editors, CLIs, and
automation:

### `hashBoardContent(content: string): string`

Returns a SHA-256 hash for raw `brainfile.md` content. Handy for file watchers to
skip redundant refreshes or detect external changes before writing.

```typescript
const currentHash = hashBoardContent(content);
if (currentHash !== lastKnownHash) {
  lastKnownHash = currentHash;
  refreshBoard();
}
```

### `hashBoard(board: Board): string`

Serializes a `Board` via `BrainfileSerializer` and then hashes the result. Use this
when you already have parsed objects and need a deterministic fingerprint to share
between workers or clients.

### `diffBoards(previous: Board, next: Board): BoardDiff`

Computes structural differences between two board states, returning:

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

This lets clients avoid re-rendering entire boards—only touched columns or tasks
need to be updated. Each diff entry includes before/after snapshots, indexes, and
`changedFields` so UIs can highlight precise changes.

> **Migration note:** these utilities ship in `@brainfile/core@0.4.0+`. Replace
> bespoke hashing/diff logic with the shared helpers to ensure consistent behavior
> across VS Code, CLI, and future integrations.

## Constants

### RuleType

```typescript
type RuleType = "always" | "never" | "prefer" | "context";
```

### Priority

```typescript
type Priority = "low" | "medium" | "high" | "critical";
```

### Effort

```typescript
type Effort = "trivial" | "small" | "medium" | "large" | "xlarge";
```

### Template

```typescript
type Template = "bug" | "feature" | "refactor";
```
