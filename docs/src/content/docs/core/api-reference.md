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
  console.log('Parsed successfully');
} else {
  console.error('Parse error:', result.error);
}
```

#### `serialize(board: Board, options?: SerializeOptions): string`

Serialize a Board object back to markdown format.

```typescript
const markdown = Brainfile.serialize(board, {
  indent: 2,
  lineWidth: 80,
  trailingNewline: true
});
```

#### `validate(board: Board): ValidationResult`

Validate a board object against the schema.

```typescript
const validation = Brainfile.validate(board);
if (!validation.valid) {
  validation.errors.forEach(err => {
    console.log(`${err.path}: ${err.message}`);
  });
}
```

#### `getBuiltInTemplates(): TaskTemplate[]`

Get all built-in task templates.

```typescript
const templates = Brainfile.getBuiltInTemplates();
templates.forEach(template => {
  console.log(`${template.id}: ${template.name}`);
});
```

#### `getTemplate(id: string): TaskTemplate | undefined`

Get a specific template by ID.

```typescript
const bugTemplate = Brainfile.getTemplate('bug-report');
if (bugTemplate) {
  console.log(bugTemplate.name);
}
```

#### `createFromTemplate(templateId: string, values: Record<string, string>): Partial<Task>`

Create a task from a template with variable substitution.

```typescript
const task = Brainfile.createFromTemplate('bug-report', {
  title: 'Login fails on mobile',
  description: 'Users cannot log in on iOS devices'
});
```

#### `findTaskLocation(content: string, taskId: string): Location`

Find the line number and position of a task in the source file.

```typescript
const location = Brainfile.findTaskLocation(markdown, 'task-1');
console.log(`Task at line ${location.line}`);
```

#### `findRuleLocation(content: string, ruleId: number, ruleType: RuleType): Location`

Find the location of a rule in the source file.

```typescript
const location = Brainfile.findRuleLocation(markdown, 1, 'always');
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
  priority?: 'low' | 'medium' | 'high' | 'critical';
  effort?: 'trivial' | 'small' | 'medium' | 'large' | 'xlarge';
  blockedBy?: string[];
  dueDate?: string;
  subtasks?: Subtask[];
  template?: 'bug' | 'feature' | 'refactor';
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
  indent?: number;           // Number of spaces for indentation (default: 2)
  lineWidth?: number;        // Maximum line width (default: 80)
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

## Low-Level Classes

For advanced usage, you can import and use the low-level classes directly:

### BrainfileParser

```typescript
import { BrainfileParser } from '@brainfile/core';

const board = BrainfileParser.parse(markdown);
const result = BrainfileParser.parseWithErrors(markdown);
const location = BrainfileParser.findTaskLocation(markdown, 'task-1');
```

### BrainfileSerializer

```typescript
import { BrainfileSerializer } from '@brainfile/core';

const markdown = BrainfileSerializer.serialize(board, options);
```

### BrainfileValidator

```typescript
import { BrainfileValidator } from '@brainfile/core';

const validation = BrainfileValidator.validate(board);
```

## Constants

### RuleType

```typescript
type RuleType = 'always' | 'never' | 'prefer' | 'context';
```

### Priority

```typescript
type Priority = 'low' | 'medium' | 'high' | 'critical';
```

### Effort

```typescript
type Effort = 'trivial' | 'small' | 'medium' | 'large' | 'xlarge';
```

### Template

```typescript
type Template = 'bug' | 'feature' | 'refactor';
```

