---
title: Core Library
description: TypeScript/JavaScript library for Brainfile operations
---

# Core Library

`@brainfile/core` is the TypeScript library that powers all Brainfile tools. Use it to build custom integrations, scripts, or entirely new interfaces.

## Installation

```bash
npm install @brainfile/core
```

## Quick Example

```typescript
import { Brainfile, addTask, moveTask } from '@brainfile/core';
import fs from 'fs';

// Parse a brainfile
const markdown = fs.readFileSync('brainfile.md', 'utf-8');
let board = Brainfile.parse(markdown);

// Add a task (immutable - returns new board)
const result = addTask(board, 'todo', {
  title: 'New feature',
  priority: 'high',
  tags: ['feature']
});

if (result.success) {
  board = result.board!;
}

// Move a task
const moveResult = moveTask(board, 'task-1', 'todo', 'in-progress', 0);
if (moveResult.success) {
  board = moveResult.board!;
}

// Save changes
const output = Brainfile.serialize(board);
fs.writeFileSync('brainfile.md', output);
```

---

## Core Concepts

### Immutable Operations

::: info Key concept
All operations are immutable — they return a new board object rather than modifying the original.
:::

```typescript
const result = addTask(board, 'todo', { title: 'Task' });

// Original unchanged
console.log(board.columns[0].tasks.length);  // 0

// New board has the task
console.log(result.board!.columns[0].tasks.length);  // 1
```

### Operation Results

Every operation returns a `BoardOperationResult`:

```typescript
interface BoardOperationResult {
  success: boolean;
  board?: Board;   // New board if successful
  error?: string;  // Error message if failed
}
```

Always check `success` before using the result:

```typescript
const result = moveTask(board, 'task-999', 'todo', 'done', 0);
if (!result.success) {
  console.error(result.error);  // "Task not found: task-999"
}
```

---

## Board Operations

### Add Task

```typescript
import { addTask, TaskInput } from '@brainfile/core';

const input: TaskInput = {
  title: 'Implement auth',
  description: 'Add OAuth2 support',
  priority: 'high',
  tags: ['security', 'feature'],
  assignee: 'john',
  dueDate: '2025-02-01',
  subtasks: ['Research', 'Implement', 'Test']  // Creates subtasks
};

const result = addTask(board, 'todo', input);
```

### Patch Task

::: tip Removing fields
Set a field to `null` to remove it from the task.
:::

```typescript
import { patchTask, TaskPatch } from '@brainfile/core';

// Update fields
const result = patchTask(board, 'task-1', {
  priority: 'critical',
  tags: ['urgent']
});

// Remove fields
const removeResult = patchTask(board, 'task-1', {
  assignee: null,  // Removes assignee
  dueDate: null    // Removes due date
});
```

### Move Task

```typescript
import { moveTask } from '@brainfile/core';

// Move task-1 from todo to in-progress, at position 0
const result = moveTask(board, 'task-1', 'todo', 'in-progress', 0);
```

### Delete Task

```typescript
import { deleteTask } from '@brainfile/core';

const result = deleteTask(board, 'todo', 'task-1');
```

### Archive & Restore

```typescript
import { archiveTask, restoreTask } from '@brainfile/core';

// Archive
const archiveResult = archiveTask(board, 'done', 'task-5');

// Restore to a column
const restoreResult = restoreTask(board, 'task-5', 'todo');
```

---

## Subtask Operations

```typescript
import {
  addSubtask,
  toggleSubtask,
  updateSubtask,
  deleteSubtask
} from '@brainfile/core';

// Add subtask (ID auto-generated)
const addResult = addSubtask(board, 'task-1', 'Write tests');

// Toggle completion
const toggleResult = toggleSubtask(board, 'task-1', 'task-1-1');

// Update title
const updateResult = updateSubtask(board, 'task-1', 'task-1-1', 'New title');

// Delete
const deleteResult = deleteSubtask(board, 'task-1', 'task-1-2');
```

---

## Parsing & Serialization

### Parse

```typescript
import { Brainfile, BrainfileParser } from '@brainfile/core';

// Simple parse
const board = Brainfile.parse(markdown);

// Parse with error details
const result = BrainfileParser.parseWithErrors(markdown);
if (!result.board) {
  console.error('Parse error:', result.error);
}
if (result.warnings) {
  console.warn('Warnings:', result.warnings);
}
```

### Serialize

```typescript
import { Brainfile, BrainfileSerializer } from '@brainfile/core';

// Simple serialize
const output = Brainfile.serialize(board);

// With options
const output = BrainfileSerializer.serialize(board, {
  indent: 2,
  lineWidth: 80,
  trailingNewline: true
});
```

---

## Validation & Linting

```typescript
import { Brainfile, BrainfileLinter } from '@brainfile/core';

// Validate structure
const validation = Brainfile.validate(board);
if (!validation.valid) {
  validation.errors.forEach(e => console.log(`${e.path}: ${e.message}`));
}

// Lint raw content
const lintResult = Brainfile.lint(content);
console.log(lintResult.issues);

// Lint with auto-fix
const fixedResult = Brainfile.lint(content, { autoFix: true });
console.log(fixedResult.fixedContent);
```

---

## Templates

```typescript
import { Brainfile } from '@brainfile/core';

// List templates
const templates = Brainfile.getBuiltInTemplates();

// Create from template
const task = Brainfile.createFromTemplate('bug-report', {
  title: 'Login fails on mobile',
  description: 'Users see error on iOS Safari'
});
```

---

## Realtime Sync Utilities

For building UIs with live updates:

```typescript
import { hashBoardContent, hashBoard, diffBoards } from '@brainfile/core';

// Hash content to detect changes
const hash = hashBoardContent(markdown);
if (hash !== lastHash) {
  // Content changed, re-parse
}

// Diff boards for incremental updates
const diff = diffBoards(oldBoard, newBoard);
if (diff.tasksMoved.length > 0) {
  // Handle moved tasks
}
```

---

## TypeScript Types

```typescript
import type {
  Board,
  Column,
  Task,
  Subtask,
  TaskInput,
  TaskPatch,
  BoardOperationResult
} from '@brainfile/core';
```

See [API Reference](/reference/api) for complete type definitions.

---

## Next Steps

- [API Reference](/reference/api) — Complete method documentation
- [Protocol Specification](/reference/protocol) — File format details
- [CLI Source](https://github.com/brainfile/cli) — See how CLI uses core
