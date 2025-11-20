---
title: CLI Examples
description: Real-world examples and workflows using the Brainfile CLI
---

## Common Workflows

### Starting a New Project

```bash
# Create a basic brainfile.md (manually or use template)
echo "---
title: My Project
columns:
  - id: todo
    title: To Do
    tasks: []
  - id: in-progress
    title: In Progress
    tasks: []
  - id: done
    title: Done
    tasks: []
---" > brainfile.md

# Add your first task
brainfile add --title "Setup project structure" --priority high

# List tasks to verify
brainfile list
```

### Daily Development Workflow

```bash
# Check what needs to be done
brainfile list --column todo

# Start working on a task
brainfile move --task task-5 --column in-progress

# Add a quick bug fix
brainfile add \
  --title "Fix navbar overflow" \
  --tags "bug,ui" \
  --priority high \
  --column in-progress

# Complete a task
brainfile move --task task-5 --column done

# Check progress
brainfile list
```

### Bug Tracking

```bash
# Create a bug report from template
brainfile template --use bug-report \
  --title "Memory leak in data processing" \
  --description "Application crashes after processing 1000+ items"

# Add additional context
brainfile add \
  --title "Investigate memory usage" \
  --tags "bug,performance,investigation" \
  --priority critical \
  --column in-progress

# List all bugs
brainfile list --tag bug
```

### Feature Development

```bash
# Create feature from template
brainfile template --use feature-request \
  --title "Add user preferences panel" \
  --description "Users need customizable settings for notifications"

# Break down into subtasks (manually edit brainfile.md)
# Or add individual tasks
brainfile add \
  --title "Design preferences UI" \
  --tags "feature,ui,design" \
  --priority medium

brainfile add \
  --title "Implement preferences backend" \
  --tags "feature,backend,api" \
  --priority medium

brainfile add \
  --title "Add preferences persistence" \
  --tags "feature,database" \
  --priority medium
```

### Code Review Workflow

```bash
# Move completed work to review
brainfile move --task task-12 --column review

# List everything in review
brainfile list --column review

# After approval, move to done
brainfile move --task task-12 --column done
```

### Project Planning

```bash
# Add multiple planned features
brainfile add --title "Implement OAuth login" --priority high --tags "auth,feature"
brainfile add --title "Add email notifications" --priority medium --tags "notifications,feature"
brainfile add --title "Create admin dashboard" --priority low --tags "admin,feature"

# Use refactor template for technical debt
brainfile template --use refactor \
  --title "Refactor API error handling" \
  --description "Standardize error responses across all endpoints"

# View roadmap
brainfile list --column todo
```

### CI/CD Integration

#### Pre-commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit

# Validate brainfile.md before commit
if [ -f "brainfile.md" ]; then
  npx @brainfile/cli lint --check
  if [ $? -ne 0 ]; then
    echo "❌ brainfile.md has validation errors"
    echo "Run 'brainfile lint --fix' to auto-fix"
    exit 1
  fi
fi
```

#### GitHub Actions

```yaml
name: Validate Brainfile
on: [push, pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - name: Validate brainfile
        run: npx @brainfile/cli lint --check
```

#### npm Scripts

```json
{
  "scripts": {
    "tasks": "brainfile list",
    "task:todo": "brainfile list --column todo",
    "task:progress": "brainfile list --column in-progress",
    "task:add": "brainfile add",
    "task:lint": "brainfile lint --fix",
    "precommit": "brainfile lint --check"
  }
}
```

### Filtering and Organization

```bash
# View high priority items
brainfile list --tag high

# View backend-related tasks
brainfile list --tag backend

# View bugs
brainfile list --tag bug

# View specific project file
brainfile list --file ./projects/api/brainfile.md
```

### Batch Operations

```bash
# Add multiple related tasks
brainfile add --title "Write unit tests" --tags "testing" --priority high
brainfile add --title "Write integration tests" --tags "testing" --priority high
brainfile add --title "Update test documentation" --tags "testing,docs" --priority medium

# Move multiple tasks (in a loop)
for task in task-1 task-2 task-3; do
  brainfile move --task $task --column done
done
```

### Multi-Project Management

```bash
# Project A tasks
brainfile list --file ./project-a/brainfile.md --column todo

# Project B tasks
brainfile list --file ./project-b/brainfile.md --column in-progress

# Add task to specific project
brainfile add \
  --file ./project-a/brainfile.md \
  --title "Deploy to staging" \
  --priority high
```

### Maintenance and Cleanup

```bash
# Validate and fix formatting issues
brainfile lint --fix

# Check for problems
brainfile lint

# Archive completed tasks (manually move to archive section)
# Then clear done column by editing brainfile.md
```

## Advanced Patterns

### Task Templates with Variables

```bash
# Bug report with detailed context
brainfile template --use bug-report \
  --title "API returns 500 on /users endpoint" \
  --description "Steps to reproduce:
1. Make GET request to /api/users
2. Include auth token
3. Server returns 500

Expected: 200 with user list
Actual: 500 Internal Server Error

Environment: Production
Browser: Chrome 120
User: test@example.com"
```

### Automated Task Creation

```bash
#!/bin/bash
# create-sprint-tasks.sh

SPRINT="Sprint 23"

brainfile add --title "[$SPRINT] Planning meeting" --priority high
brainfile add --title "[$SPRINT] Sprint review" --priority medium
brainfile add --title "[$SPRINT] Sprint retrospective" --priority medium
brainfile add --title "[$SPRINT] Update documentation" --priority low

echo "✅ Created sprint tasks"
```

### Status Reports

```bash
#!/bin/bash
# generate-status.sh

echo "📊 Project Status Report"
echo "======================="
echo ""
echo "📝 To Do:"
brainfile list --column todo | grep -c "task-"
echo ""
echo "🚧 In Progress:"
brainfile list --column in-progress | grep -c "task-"
echo ""
echo "✅ Done:"
brainfile list --column done | grep -c "task-"
```

## Tips and Tricks

### Aliases

Add to your `.bashrc` or `.zshrc`:

```bash
alias bf="brainfile"
alias bfl="brainfile list"
alias bfa="brainfile add"
alias bfm="brainfile move"
alias bft="brainfile template"
```

Then use short commands:

```bash
bf list
bfa --title "New task"
bfm --task task-5 --column done
```

### Watch Mode

Monitor tasks in real-time:

```bash
watch -n 2 brainfile list
```

### Colored Output in Scripts

The CLI automatically disables colors in non-TTY environments. To force colors:

```bash
FORCE_COLOR=1 brainfile list
```

### JSON Export (Custom)

While not built-in, you can parse the markdown for custom exports:

```bash
# Extract YAML frontmatter
sed -n '/^---$/,/^---$/p' brainfile.md
```

## See Also

- [CLI Commands Reference](/cli/commands)
- [Installation Guide](/cli/installation)
- [Task Templates](/core/templates)

