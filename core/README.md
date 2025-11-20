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

## Usage

### Quick Start

```typescript
import { Brainfile } from '@brainfile/core';

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
  console.error('Validation errors:', validation.errors);
}

// Serialize back to markdown
const output = Brainfile.serialize(board);
console.log(output);
```

### Using Templates

```typescript
import { Brainfile } from '@brainfile/core';

// Get all built-in templates
const templates = Brainfile.getBuiltInTemplates();
console.log(templates.map(t => t.name)); // ['Bug Report', 'Feature Request', 'Code Refactor']

// Create a task from a template
const bugTask = Brainfile.createFromTemplate('bug-report', {
  title: 'Login button not working',
  description: 'Users cannot log in to the application'
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
  Board
} from '@brainfile/core';

// Parse with error details
const parseResult = BrainfileParser.parseWithErrors(markdown);
if (!parseResult.board) {
  console.error('Parse error:', parseResult.error);
}

// Serialize with custom options
const output = BrainfileSerializer.serialize(board, {
  indent: 4,
  lineWidth: 80,
  trailingNewline: true
});

// Validate with detailed errors
const validation = BrainfileValidator.validate(board);
validation.errors.forEach(error => {
  console.log(`${error.path}: ${error.message}`);
});

// Find task location in source file
const location = BrainfileParser.findTaskLocation(markdown, 'task-1');
console.log(`Task found at line ${location.line}`);
```

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
  priority?: 'low' | 'medium' | 'high' | 'critical';
  dueDate?: string;
  subtasks?: Subtask[];
  template?: 'bug' | 'feature' | 'refactor';
}

interface Column {
  id: string;
  title: string;
  tasks: Task[];
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
  console.error('Parse error:', result.error);
}

const validation = Brainfile.validate(board);
if (!validation.valid) {
  validation.errors.forEach(err => {
    console.log(`${err.path}: ${err.message}`);
  });
}
```

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
