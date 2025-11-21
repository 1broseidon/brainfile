---
title: Task Templates
description: Built-in task templates for common development scenarios
---

## Overview

The Core library includes three built-in task templates for common development scenarios. These templates provide pre-configured tasks with appropriate priority levels, tags, descriptions, and subtasks.

## Available Templates

### Bug Report

**Template ID**: `bug-report`

Pre-configured for tracking and fixing bugs with structured reproduction steps and environment details.

**Properties**:
- **Priority**: `high`
- **Tags**: `['bug', 'needs-triage']`
- **Template Type**: `bug`

**Variables**:
- `title` - Short description of the bug
- `description` - Detailed bug description

**Subtasks**:
1. Reproduce the issue
2. Identify root cause
3. Implement fix
4. Test the fix
5. Verify in production

**Example Usage**:

```typescript
import { Brainfile } from '@brainfile/core';

const bugTask = Brainfile.createFromTemplate('bug-report', {
  title: 'Login timeout on mobile',
  description: 'Users experience timeout after 30 seconds on iOS devices'
});

// Result:
// {
//   title: 'Login timeout on mobile',
//   description: '## Bug Description\nUsers experience timeout...',
//   priority: 'high',
//   tags: ['bug', 'needs-triage'],
//   template: 'bug',
//   subtasks: [
//     { id: 'task-1-1', title: 'Reproduce the issue', completed: false },
//     { id: 'task-1-2', title: 'Identify root cause', completed: false },
//     ...
//   ]
// }
```

### Feature Request

**Template ID**: `feature-request`

Structured template for proposing and implementing new features with clear requirements and acceptance criteria.

**Properties**:
- **Priority**: `medium`
- **Tags**: `['feature', 'enhancement']`
- **Template Type**: `feature`

**Variables**:
- `title` - Feature name
- `description` - Feature description and use case

**Subtasks**:
1. Design specification
2. Implement core functionality
3. Write unit tests
4. Write integration tests
5. Update documentation
6. Code review

**Example Usage**:

```typescript
const featureTask = Brainfile.createFromTemplate('feature-request', {
  title: 'Add dark mode support',
  description: 'Users want ability to toggle between light and dark themes'
});
```

### Code Refactor

**Template ID**: `refactor`

Template for code refactoring tasks with emphasis on analysis, testing, and performance validation.

**Properties**:
- **Priority**: `low`
- **Tags**: `['refactor', 'technical-debt']`
- **Template Type**: `refactor`

**Variables**:
- `area` - Code area to refactor (e.g., "authentication module")
- `description` - Motivation and scope of refactoring

**Subtasks**:
1. Analyze current code
2. Design new structure
3. Implement refactoring
4. Update tests
5. Update documentation
6. Verify performance

**Example Usage**:

```typescript
const refactorTask = Brainfile.createFromTemplate('refactor', {
  area: 'authentication module',
  description: 'Simplify auth flow and improve testability'
});
```

## Using Templates Programmatically

### List All Templates

```typescript
import { Brainfile } from '@brainfile/core';

const templates = Brainfile.getBuiltInTemplates();

templates.forEach(template => {
  console.log(`${template.id}: ${template.name}`);
  console.log(`  Description: ${template.description}`);
  console.log(`  Variables: ${template.variables.join(', ')}`);
});
```

### Get Specific Template

```typescript
const bugTemplate = Brainfile.getTemplate('bug-report');

if (bugTemplate) {
  console.log(bugTemplate.name);        // "Bug Report"
  console.log(bugTemplate.variables);   // ['title', 'description']
}
```

### Create Task from Template

```typescript
// With all variables
const task = Brainfile.createFromTemplate('bug-report', {
  title: 'Login fails',
  description: 'Users cannot log in'
});

// Minimal (only required variables)
const task = Brainfile.createFromTemplate('feature-request', {
  title: 'New feature'
});
```

### Add Template Task to Board

```typescript
// Parse existing board
const board = Brainfile.parse(markdownContent);

// Create task from template
const newTask = Brainfile.createFromTemplate('bug-report', {
  title: 'Critical bug',
  description: 'System crash on startup'
});

// Generate unique ID
const maxId = Math.max(
  ...board.columns
    .flatMap(col => col.tasks)
    .map(task => parseInt(task.id.replace('task-', '')) || 0)
);
newTask.id = `task-${maxId + 1}`;

// Add to appropriate column
const todoColumn = board.columns.find(col => col.id === 'todo');
if (todoColumn) {
  todoColumn.tasks.push(newTask as Task);
}

// Serialize back
const updatedMarkdown = Brainfile.serialize(board);
```

## Template Structure

Each template follows this structure:

```typescript
interface TaskTemplate {
  id: string;                // Unique template identifier
  name: string;              // Display name
  description: string;       // Template description
  variables: string[];       // Required variable names
  task: Partial<Task>;       // Pre-configured task properties
}
```

The `task` object contains:
- Pre-set priority level
- Default tags
- Template type marker
- Pre-configured subtasks
- Description structure with placeholders

## Custom Templates

While the library includes three built-in templates, you can create custom templates by constructing task objects manually:

```typescript
function createCustomTask(title: string, description: string): Partial<Task> {
  return {
    title,
    description: `## Overview\n${description}\n\n## Tasks\n- [ ] Step 1\n- [ ] Step 2`,
    priority: 'medium',
    tags: ['custom'],
    subtasks: [
      { id: '', title: 'Step 1', completed: false },
      { id: '', title: 'Step 2', completed: false }
    ]
  };
}

const customTask = createCustomTask('My Task', 'Task description');
```

## CLI Integration

The templates are also available through the [@brainfile/cli](/cli/commands) tool:

```bash
# List available templates
brainfile template --list

# Create task from template
brainfile template --use bug-report --title "Login fails"
```

## VSCode Integration

The VSCode extension provides a UI for creating tasks from templates through:
- Command Palette: "Brainfile: Create Task from Template"
- UI button in the sidebar: "New from Template"

See the [VSCode Extension documentation](/vscode/extension) for details.

