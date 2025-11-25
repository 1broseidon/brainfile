---
title: Core Library Overview
description: TypeScript/JavaScript library for parsing and manipulating brainfiles
---

## @brainfile/core

Core library for the Brainfile task management protocol. Provides parsing, serialization, validation, immutable board operations, and template management.

## Installation

```bash
npm install @brainfile/core
```

## Features

- **Parse** - Convert markdown files into structured Board objects
- **Serialize** - Convert Board objects back to markdown
- **Validate** - Validate against the Brainfile schema
- **Board Operations** - Immutable operations for tasks (add, patch, move, delete, archive, restore)
- **Subtask Operations** - Manage subtasks (add, delete, toggle, update)
- **Templates** - Built-in task templates (Bug Report, Feature Request, Refactor)
- **Realtime Sync** - Hash-based change detection and structural diffing
- **Linting** - Syntax validation with auto-fix

## Quick Start

```typescript
import { Brainfile } from '@brainfile/core';

// Parse a brainfile
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

// Serialize back to markdown
const output = Brainfile.serialize(board);
```

## Board Operations

All operations are immutable and return a `BoardOperationResult`:

```typescript
import { addTask, patchTask, moveTask, deleteTask, archiveTask, restoreTask } from '@brainfile/core';

// Add a task with all fields
const result = addTask(board, 'todo', {
  title: 'Implement auth',
  description: 'Add OAuth2 support',
  priority: 'high',
  tags: ['security', 'feature'],
  assignee: 'john',
  dueDate: '2025-02-01',
  subtasks: ['Research providers', 'Implement flow', 'Add tests']
});

if (result.success) {
  board = result.board!;
}

// Update specific fields (null removes the field)
const patchResult = patchTask(board, 'task-1', {
  priority: 'critical',
  assignee: null  // Removes assignee
});

// Move task between columns
const moveResult = moveTask(board, 'task-1', 'todo', 'in-progress', 0);

// Archive and restore
const archiveResult = archiveTask(board, 'done', 'task-5');
const restoreResult = restoreTask(board, 'task-5', 'todo');

// Delete permanently
const deleteResult = deleteTask(board, 'todo', 'task-1');
```

## Subtask Operations

```typescript
import { addSubtask, deleteSubtask, toggleSubtask, updateSubtask } from '@brainfile/core';

// Add a subtask (ID auto-generated)
const addResult = addSubtask(board, 'task-1', 'New subtask');

// Toggle completion
const toggleResult = toggleSubtask(board, 'task-1', 'task-1-1');

// Update title
const updateResult = updateSubtask(board, 'task-1', 'task-1-1', 'Updated title');

// Delete
const deleteResult = deleteSubtask(board, 'task-1', 'task-1-2');
```

## Templates

```typescript
import { Brainfile } from '@brainfile/core';

// List templates
const templates = Brainfile.getBuiltInTemplates();
// ['Bug Report', 'Feature Request', 'Code Refactor']

// Create task from template
const bugTask = Brainfile.createFromTemplate('bug-report', {
  title: 'Login button not working',
  description: 'Users cannot log in'
});
```

## Realtime Sync

Utilities for coordinating live updates across editors and tools:

```typescript
import { hashBoardContent, hashBoard, diffBoards } from '@brainfile/core';

// Skip redundant refreshes in file watchers
const newHash = hashBoardContent(content);
if (newHash !== lastKnownHash) {
  lastKnownHash = newHash;
  refreshBoard();
}

// Compute structural differences
const diff = diffBoards(previousBoard, nextBoard);
if (diff.tasksMoved.length > 0) {
  // Only update moved tasks, not entire board
}
```

## Linting

```typescript
import { Brainfile } from '@brainfile/core';

const result = Brainfile.lint(content);
console.log(result.getSummary());
// { errors: 2, warnings: 1, fixable: 1 }

// Auto-fix issues
const fixed = Brainfile.lint(content, { fix: true });
```

## Validation

```typescript
import { Brainfile } from '@brainfile/core';

const validation = Brainfile.validate(board);
if (!validation.valid) {
  validation.errors.forEach(err => {
    console.log(`${err.path}: ${err.message}`);
  });
}
```

## Error Handling

```typescript
const result = Brainfile.parseWithErrors(markdown);
if (!result.board) {
  console.error('Parse error:', result.error);
}
```

## Used By

- **[@brainfile/cli](https://www.npmjs.com/package/@brainfile/cli)** - CLI with TUI and MCP server
- **[brainfile-vscode](https://github.com/brainfile/vscode)** - VSCode extension

## Links

- **npm**: https://www.npmjs.com/package/@brainfile/core
- **GitHub**: https://github.com/brainfile/core
- **API Reference**: [/core/api-reference](/core/api-reference)
