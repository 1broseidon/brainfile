---
title: CLI Commands
description: Complete reference of all Brainfile CLI commands
---

## Command Overview

The Brainfile CLI provides five main commands for managing your tasks:

- `list` - Display tasks from your board
- `add` - Create new tasks
- `move` - Move tasks between columns
- `lint` - Validate and auto-fix syntax issues
- `template` - Manage task templates

## list

Display all tasks from your brainfile.md file with colored output.

### Usage

```bash
brainfile list [options]
```

### Options

- `-f, --file <path>` - Path to brainfile.md file (default: `brainfile.md`)
- `-c, --column <name>` - Filter by column (e.g., `todo`, `in-progress`, `done`)
- `-t, --tag <name>` - Filter by tag

### Examples

```bash
# List all tasks
brainfile list

# List tasks from a specific file
brainfile list --file ./project/brainfile.md

# List only tasks in the "in-progress" column
brainfile list --column in-progress

# List tasks with a specific tag
brainfile list --tag bug
```

## add

Create a new task and add it to a column.

### Usage

```bash
brainfile add --title <text> [options]
```

### Options

- `-f, --file <path>` - Path to brainfile.md file (default: `brainfile.md`)
- `-c, --column <name>` - Column to add task to (default: `todo`)
- `-t, --title <text>` - Task title (required)
- `-d, --description <text>` - Task description
- `-p, --priority <level>` - Priority level (`low`, `medium`, `high`)
- `--tags <tags>` - Comma-separated tags

### Examples

```bash
# Add a simple task
brainfile add --title "Fix login bug"

# Add a task with full details
brainfile add \
  --title "Implement user authentication" \
  --description "Add JWT-based auth to the API" \
  --priority high \
  --tags "backend,security" \
  --column in-progress

# Add to a specific column
brainfile add --title "Review PR #123" --column review
```

## move

Move a task from one column to another.

### Usage

```bash
brainfile move --task <task-id> --column <target-column>
```

### Options

- `-f, --file <path>` - Path to brainfile.md file (default: `brainfile.md`)
- `-t, --task <id>` - Task ID to move (required)
- `-c, --column <name>` - Target column name or ID (required)

### Examples

```bash
# Move task to in-progress
brainfile move --task task-4 --column in-progress

# Move task to done
brainfile move --task task-123 --column done

# Move using column ID
brainfile move --task task-456 --column review
```

## lint

Validate your brainfile.md syntax and automatically fix common issues.

### Usage

```bash
brainfile lint [options]
```

### Options

- `-f, --file <path>` - Path to brainfile.md file (default: `brainfile.md`)
- `--fix` - Automatically fix issues when possible
- `--check` - Exit with error code if issues found (useful for CI/CD)

### What it checks

- YAML syntax errors
- Unquoted strings containing colons
- Duplicate column IDs
- Board structure validation
- Missing required fields

### Auto-fixable issues

- Unquoted strings with colons (adds quotes automatically)

### Detection-only issues

- Duplicate column IDs
- Structural validation errors
- YAML syntax errors

### Examples

```bash
# Check for issues
brainfile lint

# Check and automatically fix issues
brainfile lint --fix

# Use in CI/CD (exits with error code if issues found)
brainfile lint --check

# Check a specific file
brainfile lint --file ./project/brainfile.md --fix
```

## template

List available templates and create tasks from templates.

### Usage

```bash
brainfile template [options]
```

### Options

- `-f, --file <path>` - Path to brainfile.md file (default: `brainfile.md`)
- `-l, --list` - List all available templates
- `-u, --use <template-id>` - Create task from template
- `--title <text>` - Task title (required when using template)
- `--description <text>` - Task description (optional)
- `-c, --column <name>` - Column to add task to (default: `todo`)

### Built-in Templates

- `bug-report` - Bug tracking with steps to reproduce, environment details
- `feature-request` - Feature proposals with requirements and acceptance criteria
- `refactor` - Code refactoring tasks with analysis and testing steps

### Examples

```bash
# List all templates
brainfile template --list

# Create a bug report
brainfile template --use bug-report --title "Login timeout on mobile"

# Create a feature request
brainfile template --use feature-request \
  --title "Add dark mode support" \
  --description "Users want dark mode" \
  --column todo

# Create a refactor task
brainfile template --use refactor \
  --title "Refactor authentication module" \
  --column in-progress
```

## Global Options

These options work with all commands:

- `--help` - Display help for a command
- `--version` - Display CLI version

### Examples

```bash
# Get help for a specific command
brainfile add --help

# Check CLI version
brainfile --version
```

## Exit Codes

The CLI uses standard exit codes:

- `0` - Success
- `1` - Error (invalid arguments, file not found, etc.)
- `2` - Validation error (when using `lint --check`)

This makes the CLI suitable for use in scripts and CI/CD pipelines.

## Examples in Scripts

### npm scripts

```json
{
  "scripts": {
    "tasks": "brainfile list",
    "task:add": "brainfile add",
    "task:lint": "brainfile lint --check"
  }
}
```

### CI/CD

```yaml
# GitHub Actions example
- name: Validate brainfile
  run: npx @brainfile/cli lint --check
```

## See Also

- [Installation guide](/cli/installation)
- [Usage examples](/cli/examples)
- [Task templates](/core/templates)

