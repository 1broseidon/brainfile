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

## Contract Operations

All contract operations return `BoardOperationResult` and are immutable.

### `setTaskContract(board, taskId, contract): BoardOperationResult`

Set or replace the complete contract for a task.

```typescript
import { setTaskContract, type Contract } from "@brainfile/core";

const contract: Contract = {
  status: "ready",
  deliverables: [
    { type: "file", path: "src/feature.ts", description: "Implementation" },
    { type: "test", path: "src/__tests__/feature.test.ts" },
  ],
  validation: {
    commands: ["npm test"],
  },
  constraints: ["Follow existing patterns"],
};

const result = setTaskContract(board, "task-1", contract);
```

### `clearTaskContract(board, taskId): BoardOperationResult`

Remove the contract from a task.

### `setTaskContractStatus(board, taskId, status): BoardOperationResult`

Update just the contract status.

```typescript
import { setTaskContractStatus } from "@brainfile/core";

setTaskContractStatus(board, "task-1", "in_progress");
```

### `patchTaskContract(board, taskId, patch): BoardOperationResult`

Update specific contract fields. Set fields to `null` to remove them.

```typescript
import { patchTaskContract } from "@brainfile/core";

// Update fields
patchTaskContract(board, "task-1", {
  status: "delivered",
  constraints: ["New constraint"],
});

// Remove fields
patchTaskContract(board, "task-1", {
  validation: null,
});
```

### `addTaskContractDeliverable(board, taskId, deliverable): BoardOperationResult`

Add a deliverable to the contract.

```typescript
import { addTaskContractDeliverable } from "@brainfile/core";

addTaskContractDeliverable(board, "task-1", {
  type: "docs",
  path: "docs/api.md",
  description: "API documentation",
});
```

### `removeTaskContractDeliverable(board, taskId, path): BoardOperationResult`

Remove a deliverable by path.

### `addTaskContractValidationCommand(board, taskId, command): BoardOperationResult`

Add a validation command.

### `removeTaskContractValidationCommand(board, taskId, command): BoardOperationResult`

Remove a validation command.

### `addTaskContractConstraint(board, taskId, constraint): BoardOperationResult`

Add a constraint.

### `removeTaskContractConstraint(board, taskId, constraint): BoardOperationResult`

Remove a constraint.

---

## Bulk Operations

Process multiple tasks in a single operation. All bulk operations return `BulkOperationResult`.

### `moveTasks(board, taskIds, toColumnId): BulkOperationResult`

Move multiple tasks to a column.

```typescript
import { moveTasks } from "@brainfile/core";

const result = moveTasks(board, ["task-1", "task-2", "task-3"], "done");

console.log(`Success: ${result.successCount}, Failed: ${result.failureCount}`);
result.results.forEach((r) => {
  if (!r.success) {
    console.log(`Failed to move ${r.id}: ${r.error}`);
  }
});
```

### `patchTasks(board, taskIds, patch): BulkOperationResult`

Apply the same patch to multiple tasks.

```typescript
import { patchTasks } from "@brainfile/core";

patchTasks(board, ["task-1", "task-2"], { priority: "high", assignee: "john" });
```

### `deleteTasks(board, taskIds): BulkOperationResult`

Delete multiple tasks.

### `archiveTasks(board, taskIds): BulkOperationResult`

Archive multiple tasks.

```typescript
import { archiveTasks } from "@brainfile/core";

archiveTasks(board, ["task-10", "task-11", "task-12"]);
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
  contract?: Contract;
}
```

### Contract

```typescript
interface Contract {
  status: ContractStatus;
  deliverables?: Deliverable[];
  validation?: ValidationConfig;
  constraints?: string[];
  context?: ContractContext;
}

type ContractStatus =
  | "draft"
  | "ready"
  | "in_progress"
  | "delivered"
  | "done"
  | "failed";

interface Deliverable {
  type: string; // "file", "test", "docs", "design", "research"
  path: string;
  description?: string;
}

interface ValidationConfig {
  commands?: string[];
}

interface ContractContext {
  relevantFiles?: string[];
  background?: string;
  feedback?: string;
  outOfScope?: string[];
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

### ContractPatch

For `patchTaskContract()`. Use `null` to remove fields.

```typescript
interface ContractPatch {
  status?: ContractStatus;
  deliverables?: Deliverable[] | null;
  validation?: ValidationConfig | null;
  constraints?: string[] | null;
  context?: ContractContext | null;
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

### BulkOperationResult

For bulk operations (`moveTasks`, `patchTasks`, `deleteTasks`, `archiveTasks`).

```typescript
interface BulkOperationResult {
  success: boolean; // True if all operations succeeded
  board?: Board;    // New board if at least one operation succeeded
  results: BulkItemResult[];
  successCount: number;
  failureCount: number;
}

interface BulkItemResult {
  id: string;       // Task ID
  success: boolean;
  error?: string;   // Error message if failed
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

---

## Next Steps

- [Protocol Specification](/reference/protocol) — File format details
- [CLI Commands](/reference/commands) — Command-line interface
- [Core Library Guide](/tools/core) — Usage examples
