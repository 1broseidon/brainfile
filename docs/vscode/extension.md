---
title: VSCode Extension
description: Visual Studio Code extension for Brainfile task management
---

## Overview

The Brainfile VSCode extension provides a visual kanban board interface for managing tasks directly within your editor. View, create, and organize tasks without leaving your development environment.

Built on [@brainfile/core](https://www.npmjs.com/package/@brainfile/core) - the official Brainfile parser and serializer.

## Features

- **Visual Kanban Board** - View tasks in customizable columns
- **Drag and Drop** - Move tasks between columns with drag and drop
- **Live Updates** - Changes sync automatically when editing markdown
- **Task Templates** - Create tasks from built-in templates
- **Project Rules** - Define rules (always, never, prefer, context) with inline editing
- **Progress Tracking** - Track completion with subtasks
- **Collapsible Sections** - Organize tasks efficiently
- **Archive Management** - Search, restore, or permanently delete archived tasks
- **Bulk Operations** - Multi-select tasks for batch move, archive, delete, or priority changes
- **Send to Agent** - Dispatch tasks to AI coding assistants (GitHub Copilot, Claude Code)

## Installation

1. Open VSCode
2. Go to Extensions (`Ctrl+Shift+X` / `Cmd+Shift+X`)
3. Search for "Brainfile"
4. Click Install

Alternatively, install from the command line:

```bash
code --install-extension brainfile.brainfile
```

## Usage

### Getting Started

1. **Create a `brainfile.md` file** in your project root
2. **Open the folder** in VSCode
3. **The Brainfile sidebar appears** automatically
4. **View and manage your tasks** in the visual board

### File Format

Tasks are defined in YAML frontmatter:

```yaml
---
title: My Project
rules:
  always:
    - id: 1
      rule: write tests for all new features
  never:
    - id: 1
      rule: commit directly to main branch
columns:
  - id: todo
    title: To Do
    tasks:
      - id: task-1
        title: Task Title
        description: Task description
        priority: high
        tags: [feature, backend]
---
```

### Creating Tasks from Templates

Brainfile includes built-in task templates to help you quickly create structured tasks:

#### Using the Command Palette

1. Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Search for **"Brainfile: Create Task from Template"**
3. Select a template:
   - **Bug Report** - For tracking bugs with reproduction steps
   - **Feature Request** - For proposing new features
   - **Code Refactor** - For refactoring tasks
4. Fill in the required variables
5. Select the column for the new task

#### Using the UI Button

1. Click the **"New from Template"** button in the Brainfile sidebar
2. Follow the prompts to create a task

### Available Templates

#### Bug Report

Pre-configured for tracking and fixing bugs:
- **Priority**: High
- **Tags**: bug, needs-triage
- **Subtasks**: Reproduce, identify, fix, test, verify

Example:
```yaml
- id: task-1
  title: Login timeout on mobile
  description: |
    ## Bug Description
    Users experience timeout after 30 seconds on iOS devices
    
    ## Steps to Reproduce
    1. Open app on iOS
    2. Navigate to login
    3. Wait 30 seconds
  priority: high
  tags: [bug, needs-triage]
  template: bug
  subtasks:
    - id: task-1-1
      title: Reproduce the issue
      completed: false
```

#### Feature Request

Structured template for new features:
- **Priority**: Medium
- **Tags**: feature, enhancement
- **Subtasks**: Design, implement, test, document, review

Example:
```yaml
- id: task-2
  title: Add dark mode support
  description: |
    ## Feature Description
    Users want ability to toggle between light and dark themes
    
    ## Use Cases
    - Users working late at night
    - Users with visual sensitivity
  priority: medium
  tags: [feature, enhancement]
  template: feature
```

#### Code Refactor

Template for refactoring tasks:
- **Priority**: Low
- **Tags**: refactor, technical-debt
- **Subtasks**: Analyze, design, implement, test, document, verify performance

### Task Management

#### Moving Tasks

**Drag and Drop**:
- Click and drag a task card
- Drop it in the target column
- Changes save automatically

**Via Markdown**:
- Edit `brainfile.md` directly
- Move task objects between column arrays
- Save the file - UI updates automatically

#### Editing Tasks

**Via UI**:
- Click on a task to view details
- Edit fields in the detail panel
- Changes save to markdown automatically

**Via Markdown**:
- Edit the YAML frontmatter directly
- Save the file
- UI reflects changes immediately

### Project Rules

Define project-specific rules that appear in the UI:

```yaml
rules:
  always:
    - id: 1
      rule: update task status as you work
    - id: 2
      rule: write tests for all features
  never:
    - id: 1
      rule: commit directly to main
    - id: 2
      rule: skip code review
  prefer:
    - id: 1
      rule: functional programming patterns
  context:
    - id: 1
      rule: this is a TypeScript monorepo
```

### Subtasks

Track granular progress within tasks:

```yaml
tasks:
  - id: task-1
    title: Implement authentication
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

The UI shows progress: `2/3 subtasks completed`

### Archive Management

Tasks can be archived for later reference or permanent deletion:

**Archiving Tasks**:
- Click the archive icon on any task card
- Task moves to the Archive tab
- Archived tasks are stored in a separate `brainfile-archive.md` file

**Restoring Tasks**:
- Navigate to the Archive tab
- Search archived tasks by title, description, or ID
- Click the restore icon
- Select which column to restore the task to

**Permanent Deletion**:
- From the Archive tab, click the delete icon
- Confirm the deletion - this cannot be undone

### Bulk Operations

Select multiple tasks for batch operations:

1. Click **"Select"** button in the header to enter selection mode
2. Click checkboxes on tasks to select them
3. Use the bulk action toolbar:
   - **Move to** - Move all selected tasks to a column
   - **Set Priority** - Change priority on all selected tasks
   - **Archive** - Archive all selected tasks
   - **Delete** - Delete all selected tasks
4. Click **"Clear"** or exit selection mode when done

### Send to Agent

Dispatch tasks directly to AI coding assistants:

1. Click the play icon (▶) on any task card
2. Select your preferred agent:
   - **GitHub Copilot** - Opens in Copilot Chat
   - **Claude Code** - Opens in Claude Code extension
   - **Copy to Clipboard** - Fallback for any agent
3. The task context is formatted for the agent automatically

## Keyboard Shortcuts

- `Ctrl+Shift+P` / `Cmd+Shift+P` - Command Palette
  - Search "Brainfile" to see all commands

## Settings

Configure the extension in VSCode settings:

```json
{
  "brainfile.autoRefresh": true,
  "brainfile.showRules": true
}
```

## Live Sync

The extension watches `brainfile.md` for changes:

1. **Edit in VSCode** - Changes appear in UI immediately
2. **Edit via CLI** - UI updates automatically
3. **Edit via Git** - Pull changes, UI refreshes
4. **Concurrent edits** - Last write wins (use version control)

## Integration with Other Tools

### CLI Tool

Use [@brainfile/cli](/cli/installation) alongside the extension:

```bash
# Add task from terminal
brainfile add --title "Fix bug" --priority high

# View in VSCode - UI updates automatically
```

### AI Agents

The extension respects agent instructions in the YAML:

```yaml
agent:
  instructions:
    - Modify only the YAML frontmatter
    - Preserve all IDs
    - Keep ordering
```

See [AI Agent Integration](/agents/integration) for details.

## Troubleshooting

### Sidebar not appearing

1. Check that `brainfile.md` exists in project root
2. Try reloading VSCode window
3. Check for YAML syntax errors

### Changes not syncing

1. Verify file saves successfully
2. Check for YAML syntax errors
3. View VSCode output panel for errors

### Template button not working

1. Ensure you have a valid `brainfile.md`
2. Check that columns exist in your board
3. Try using Command Palette instead

## Development

Want to contribute? See the [GitHub repository](https://github.com/brainfile/vscode).

```bash
# Clone the repository
git clone https://github.com/brainfile/vscode.git
cd vscode

# Install dependencies
npm install

# Run in development mode
npm run dev
```

## Links

- **Marketplace**: https://marketplace.visualstudio.com/items?itemName=brainfile.brainfile
- **GitHub**: https://github.com/brainfile/vscode
- **Core Library**: [@brainfile/core](https://www.npmjs.com/package/@brainfile/core)
- **CLI Tool**: [@brainfile/cli](/cli/installation)

## Related Tools

- [CLI Tool](/cli/installation) - Command-line interface
- [Core Library](/core/overview) - JavaScript/TypeScript API
- [Protocol Specification](/protocol/specification) - File format details

