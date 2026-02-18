<p align="center">
  <img src="https://raw.githubusercontent.com/brainfile/core/main/logo.png" alt="Brainfile Logo" width="128" height="128">
</p>

# @brainfile/core

**The TypeScript engine behind Brainfile.**

This library provides the core logic for managing Brainfile v2 projects: parsing configuration, reading/writing task files, managing contracts, and handling board state.

It is used by the [CLI](https://www.npmjs.com/package/@brainfile/cli), VS Code extension, and other tools in the Brainfile ecosystem.

## Installation

```bash
npm install @brainfile/core
```

## v2 Architecture: Files & Folders

Brainfile v2 uses a directory-based structure:
- **Board Config**: `.brainfile/brainfile.md` (columns, types, rules)
- **Active Tasks**: `.brainfile/board/*.md` (individual task files)
- **Completed Tasks**: `.brainfile/logs/*.md` (history)

This library exposes low-level file operations to manage this structure efficiently.

## API Reference

### File Operations

Read and write task files directly.

```typescript
import {
  readTaskFile,
  writeTaskFile,
  readTasksDir,
  addTaskFile,
  moveTaskFile,
  completeTaskFile,
  deleteTaskFile,
  appendLog
} from "@brainfile/core";

// Read a single task
const taskDoc = readTaskFile(".brainfile/board/task-1.md");
console.log(taskDoc.task.title); // "Fix login bug"
console.log(taskDoc.body);       // Markdown content

// Read all active tasks
const tasks = readTasksDir(".brainfile/board/");

// Add a new task (auto-generates filename like task-123.md)
const newTask = addTaskFile(".brainfile/board/", {
  title: "New Feature",
  column: "todo",
  type: "task",
  priority: "high"
});

// Move a task to another column
moveTaskFile(".brainfile/board/task-1.md", "in-progress");

// Complete a task (moves file to logs/ directory)
completeTaskFile(".brainfile/board/task-1.md", ".brainfile/logs/");

// Append a log entry to the task file
appendLog(".brainfile/board/task-1.md", "Deployed to staging", "codex");
```

### Board Configuration

Parse the `brainfile.md` configuration file to understand columns, types, and rules.

```typescript
import { Brainfile, readV2BoardConfig } from "@brainfile/core";

// Parse config from string
const configContent = await fs.readFile(".brainfile/brainfile.md", "utf-8");
const parseResult = Brainfile.parseWithErrors(configContent);

if (parseResult.error) {
  console.error("Config error:", parseResult.error);
} else {
  const config = parseResult.board; // BoardConfig object
  console.log("Columns:", config.columns.map(c => c.title));
}

// Or read directly from the v2 brainfile.md path
const board = readV2BoardConfig(".brainfile/brainfile.md");
```

### Type Validation

Validate tasks against the defined strict types (e.g., ensuring an "Epic" is in a valid column).

```typescript
import { getBoardTypes, validateType, validateColumn } from "@brainfile/core";

// Get available types from config
const types = getBoardTypes(boardConfig);

// Validate a task's type
const typeError = validateType(boardConfig, "epic");
if (typeError) console.error(typeError);

// Validate if a column allows a specific type
const colError = validateColumn(boardConfig, "todo", "task");
```

### Utilities

Helper functions for common tasks.

```typescript
import {
  generateNextFileTaskId,
  taskFileName,
  findBrainfile,
  extractTaskIdNumber
} from "@brainfile/core";

// Auto-detect project root
const brainfileDir = findBrainfile(process.cwd());

// Generate next ID (scans board and logs)
const nextId = generateNextFileTaskId(".brainfile/board", ".brainfile/logs");
// Returns "task-124" if 123 is the highest

// Get standard filename
const filename = taskFileName("task-123"); // "task-123.md"
```

## Types

Key interfaces exported by the package:

```typescript
import type {
  Task,
  Board,
  BoardConfig,
  TypeEntry,
  TypesConfig,
  Contract,
  TaskDocument
} from "@brainfile/core";

// The shape of a task in frontmatter
interface Task {
  id: string;
  title: string;
  type: string;        // e.g., "task", "epic", "adr"
  column: string;      // Column ID
  status?: string;     // Read-only status derived from column
  assignee?: string;
  contract?: Contract; // Agent contract
  // ... other fields
}

// v1 board with embedded tasks
interface Board {
  columns: Column[];
  archive?: Task[];
  // ... inherits BrainfileBase fields (title, rules, agent, etc.)
}

// v2 board config (columns + types, no embedded tasks)
interface BoardConfig {
  columns: ColumnConfig[];
  strict?: boolean;
  types?: TypesConfig;
  // ... inherits BrainfileBase fields (title, rules, agent, etc.)
}

// Per-type configuration (used in strict mode)
interface TypeEntry {
  idPrefix: string;
  completable?: boolean;
  schema?: string;
}

// Map of type name -> type configuration
interface TypesConfig {
  [typeName: string]: TypeEntry;
}

// The parsed file content
interface TaskDocument {
  task: Task;
  body: string;      // Markdown description + logs
  filePath: string;
}

// Agent Contract
interface Contract {
  status: "ready" | "in_progress" | "delivered" | "done" | "failed";
  deliverables: Deliverable[];
  validation?: {
    commands: string[];
  };
}
```

## Contributing

This package is part of the [Brainfile](https://github.com/brainfile) monorepo.
Please see the root [CONTRIBUTING.md](../../CONTRIBUTING.md) for development guidelines.

## License

MIT
