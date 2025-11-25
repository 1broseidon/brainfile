---
title: CLI Examples
description: Real-world examples and workflows using the Brainfile CLI
---

## Getting Started

### New Project Setup

```bash
# Initialize brainfile
brainfile init

# Add first tasks
brainfile add --title "Setup project structure" --priority high
brainfile add --title "Configure CI/CD" --priority medium

# Open interactive TUI
brainfile
```

### Using the TUI

```bash
# Open default brainfile.md
brainfile

# Open specific file
brainfile ./projects/api/brainfile.md
```

The TUI provides:
- Column navigation with `TAB`
- Task navigation with `j`/`k` or arrows
- Search with `/`
- Real-time file sync

---

## Daily Workflows

### Development Workflow

```bash
# Check pending tasks
brainfile list --column todo

# Start working
brainfile move --task task-1 --column in-progress

# Update task priority
brainfile patch --task task-1 --priority critical

# Complete task
brainfile move --task task-1 --column done
```

### Bug Tracking

```bash
# Create from template
brainfile template --use bug-report \
  --title "Memory leak in data processing" \
  --description "Crashes after 1000+ items"

# List all bugs
brainfile list --tag bug
```

### Feature Development

```bash
# Create feature with subtasks
brainfile add --title "User preferences" \
  --priority high \
  --subtasks "Design UI,Implement backend,Add persistence,Write tests"

# Toggle subtask completion
brainfile subtask --task task-1 --toggle task-1-1

# Add more subtasks
brainfile subtask --task task-1 --add "Deploy to staging"
```

---

## Task Management

### Updating Tasks

```bash
# Update multiple fields
brainfile patch --task task-1 \
  --title "Updated title" \
  --priority critical \
  --tags "urgent,bug"

# Assign task
brainfile patch --task task-1 --assignee john

# Set due date
brainfile patch --task task-1 --due-date 2025-02-01

# Remove fields
brainfile patch --task task-1 --clear-assignee --clear-due-date
```

### Subtask Operations

```bash
# Add subtask
brainfile subtask --task task-1 --add "New subtask"

# Toggle completion
brainfile subtask --task task-1 --toggle task-1-1

# Update title
brainfile subtask --task task-1 --update task-1-1 --title "Updated title"

# Delete subtask
brainfile subtask --task task-1 --delete task-1-2
```

### Archive and Restore

```bash
# Archive completed task
brainfile archive --task task-5

# Restore to different column
brainfile restore --task task-5 --column todo

# Delete permanently
brainfile delete --task task-99 --force
```

---

## AI Integration

### MCP Server

Add to `.mcp.json`:

```json
{
  "mcpServers": {
    "brainfile": {
      "command": "npx",
      "args": ["@brainfile/cli", "mcp"]
    }
  }
}
```

Start manually for testing:

```bash
brainfile mcp
brainfile mcp --file ./project/brainfile.md
```

### Agent Hooks

```bash
# Install for Claude Code
brainfile hooks install claude-code

# Install for Cursor (project scope)
brainfile hooks install cursor --scope project

# Install for Cline
brainfile hooks install cline

# Check status
brainfile hooks list

# Uninstall
brainfile hooks uninstall claude-code --scope all
```

---

## CI/CD Integration

### GitHub Actions

```yaml
name: Validate Brainfile
on: [push, pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Validate
        run: npx @brainfile/cli lint --check
```

### Pre-commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit

if [ -f "brainfile.md" ]; then
  npx @brainfile/cli lint --check
  if [ $? -ne 0 ]; then
    echo "brainfile.md has validation errors"
    echo "Run 'brainfile lint --fix' to auto-fix"
    exit 1
  fi
fi
```

### npm Scripts

```json
{
  "scripts": {
    "tasks": "brainfile list",
    "tasks:todo": "brainfile list --column todo",
    "tasks:lint": "brainfile lint --fix",
    "precommit": "brainfile lint --check"
  }
}
```

---

## Filtering

```bash
# By column
brainfile list --column in-progress

# By tag
brainfile list --tag bug
brainfile list --tag feature

# Specific file
brainfile list --file ./project-a/brainfile.md
```

---

## Batch Operations

```bash
# Add multiple tasks
for task in "Setup database" "Configure auth" "Add API routes"; do
  brainfile add --title "$task" --tags "backend"
done

# Move multiple tasks
for id in task-1 task-2 task-3; do
  brainfile move --task $id --column done
done
```

---

## Templates

```bash
# List available templates
brainfile template --list

# Bug report
brainfile template --use bug-report \
  --title "Login fails on mobile" \
  --description "Users cannot log in on iOS"

# Feature request
brainfile template --use feature-request \
  --title "Dark mode" \
  --column todo

# Refactoring task
brainfile template --use refactor \
  --title "Refactor auth module"
```

---

## Linting

```bash
# Check for issues
brainfile lint

# Auto-fix issues
brainfile lint --fix

# CI mode (exits with error)
brainfile lint --check
```

---

## Tips

### Shell Aliases

```bash
# Add to .bashrc or .zshrc
alias bf="brainfile"
alias bfl="brainfile list"
alias bfa="brainfile add"
alias bfm="brainfile move"
alias bfp="brainfile patch"

# Usage
bf                          # TUI
bfl                         # list
bfa --title "New task"      # add
bfm --task task-1 --column done  # move
```

### Watch Tasks

```bash
watch -n 2 brainfile list
```

---

## See Also

- [CLI Commands](/cli/commands) - Full reference
- [AI Agent Integration](/agents/integration) - MCP and hooks
- [Templates](/core/templates) - Template details
