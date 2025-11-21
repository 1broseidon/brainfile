---
title: Quick Start
description: Get started with Brainfile in 5 minutes
---

## Installation

Choose your preferred method:

### VSCode Extension (Recommended for Visual UI)

1. Open VSCode
2. Install the Brainfile extension from the marketplace
3. Create a `brainfile.md` file in your project root
4. The visual kanban board appears automatically

### CLI Tool (Recommended for Terminal Users)

```bash
npm install -g @brainfile/cli
```

### Core Library (For Developers)

```bash
npm install @brainfile/core
```

## Create Your First Brainfile

### Option 1: Copy the Example (Recommended for AI Integration)

Download the fully-featured example from the repository:

```bash
curl -o brainfile.md https://raw.githubusercontent.com/brainfile/protocol/main/example/brainfile.md
```

This example includes:
- Multiple columns (todo, in-progress, review, done)
- Tasks with various metadata (priority, tags, assignee, description)
- Project rules (always, never, prefer)
- AI agent instructions
- Custom stats configuration

### Option 2: Use the CLI

Initialize a new brainfile in your project:

```bash
npm install -g @brainfile/cli
brainfile init
```

This creates a minimal `brainfile.md` with basic structure.

### Option 3: Create Manually

Create a file named `brainfile.md` in your project root:

```yaml
---
schema: https://brainfile.md/v1
title: My First Project
agent:
  instructions:
    - Modify only the YAML frontmatter
    - Preserve all IDs
    - Keep ordering
columns:
  - id: todo
    title: To Do
    tasks:
      - id: task-1
        title: Setup project structure
        priority: high
      - id: task-2
        title: Write documentation
        priority: medium
  - id: in-progress
    title: In Progress
    tasks: []
  - id: done
    title: Done
    tasks: []
---

# My First Project

Welcome to your Brainfile task board!
```

## Using the CLI

### List Tasks

```bash
brainfile list
```

Output:
```
📋 My First Project

To Do:
  task-1: Setup project structure [high]
  task-2: Write documentation [medium]
```

### Add a Task

```bash
brainfile add --title "Implement authentication" --priority high
```

### Move a Task

```bash
brainfile move --task task-1 --column in-progress
```

### Create from Template

```bash
brainfile template --list
brainfile template --use bug-report --title "Login fails on mobile"
```

## Using the VSCode Extension

1. **Open your project** with `brainfile.md` in VSCode
2. **View the board** in the Brainfile sidebar
3. **Drag and drop** tasks between columns
4. **Create tasks** using the "+" button or templates
5. **Edit tasks** by clicking on them

## Using the Core Library

```typescript
import { Brainfile } from '@brainfile/core';
import fs from 'fs';

// Read and parse
const markdown = fs.readFileSync('brainfile.md', 'utf-8');
const board = Brainfile.parse(markdown);

console.log(`Project: ${board.title}`);
console.log(`Tasks: ${board.columns.flatMap(c => c.tasks).length}`);

// Add a task
const todoColumn = board.columns.find(c => c.id === 'todo');
todoColumn?.tasks.push({
  id: 'task-3',
  title: 'New task',
  priority: 'medium'
});

// Serialize back
const output = Brainfile.serialize(board);
fs.writeFileSync('brainfile.md', output);
```

## Working with AI Agents

### Step 1: Add Agent Configuration

Add these instructions to your agent configuration file (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`, etc.):

```markdown
# Task Management Rules

- review and follow rules in @brainfile.md
- update task status in @brainfile.md as you work (todo → in-progress → done)
- reference `schema` in the file for how to create tasks
- your existing tools do not modify this file, you need to edit it directly
```

**Recommended**: Keep only these minimal instructions in your agent config file, and use `brainfile.md` for project-specific rules and context.

### Step 2: Optional README Integration

Add this comment to your README to auto-load the board for AI assistants:

```markdown
<!-- load:brainfile.md -->
```

Now when AI agents read your README, they automatically understand your project's task context.

AI agents that support Brainfile will:
- Automatically detect and load your board
- Follow the instructions in both your agent config and the `brainfile.md` agent block
- Update task status as they work
- Validate changes against the schema
- Preserve your task structure

## Adding Project Rules

Define project-specific rules:

```yaml
rules:
  always:
    - id: 1
      rule: write tests for all new features
    - id: 2
      rule: update documentation when adding features
  never:
    - id: 1
      rule: commit directly to main branch
    - id: 2
      rule: skip code review
  prefer:
    - id: 1
      rule: functional programming patterns
    - id: 2
      rule: small, atomic commits
  context:
    - id: 1
      rule: this is a TypeScript monorepo
    - id: 2
      rule: we use Jest for testing
```

## Using Subtasks

Break down complex tasks:

```yaml
tasks:
  - id: task-1
    title: Implement user authentication
    priority: high
    subtasks:
      - id: task-1-1
        title: Setup OAuth provider
        completed: true
      - id: task-1-2
        title: Create login UI
        completed: false
      - id: task-1-3
        title: Add session management
        completed: false
```

## Task Templates

Use built-in templates for common scenarios:

### Bug Report

```bash
brainfile template --use bug-report \
  --title "Memory leak in data processing" \
  --description "Application crashes after 1000+ items"
```

### Feature Request

```bash
brainfile template --use feature-request \
  --title "Add dark mode" \
  --description "Users want theme customization"
```

### Refactor

```bash
brainfile template --use refactor \
  --title "Refactor authentication module"
```

## Version Control

Brainfile works perfectly with Git:

```bash
# Add to version control
git add brainfile.md
git commit -m "Add task board"

# See task changes in diffs
git diff brainfile.md

# Merge conflicts are just YAML
# Resolve like any other file
```

## CI/CD Integration

Validate your brainfile in CI:

```yaml
# .github/workflows/validate.yml
name: Validate Brainfile
on: [push, pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - name: Validate
        run: npx @brainfile/cli lint --check
```

## Next Steps

- [Protocol Specification](/protocol/specification) - Learn the complete file format
- [AI Agent Integration](/agents/integration) - Configure AI agent behavior
- [CLI Commands](/cli/commands) - Explore all CLI features
- [VSCode Extension](/vscode/extension) - Master the visual interface
- [Core API Reference](/core/api-reference) - Build custom integrations

## Examples

See a fully-featured example:
- [Example Project Board](https://github.com/brainfile/protocol/blob/main/example/brainfile.md) - Complete board with rules, multiple columns, and various task metadata

## Need Help?

- [GitHub Discussions](https://github.com/brainfile/protocol/discussions)
- [Issue Tracker](https://github.com/brainfile/protocol/issues)
- [Contributing Guide](https://github.com/brainfile/protocol/blob/main/CONTRIBUTING.md)

