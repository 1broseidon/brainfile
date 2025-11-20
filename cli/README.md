# @brainfile/cli

Command-line interface for Brainfile task management. Manage your tasks from the terminal with ease.

## Installation

```bash
npm install -g @brainfile/cli
```

Or use directly from the repo:

```bash
cd packages/brainfile-cli
npm install
npm run build
node dist/cli.js --help
```

## Usage

### List Tasks

Display all tasks from your brainfile.md file with colored output:

```bash
brainfile list
```

**Options:**
- `-f, --file <path>` - Path to brainfile.md file (default: `brainfile.md`)
- `-c, --column <name>` - Filter by column (e.g., `todo`, `in-progress`, `done`)
- `-t, --tag <name>` - Filter by tag

**Examples:**

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

### Add Task

Create a new task and add it to a column:

```bash
brainfile add --title "Task title"
```

**Options:**
- `-f, --file <path>` - Path to brainfile.md file (default: `brainfile.md`)
- `-c, --column <name>` - Column to add task to (default: `todo`)
- `-t, --title <text>` - Task title (required)
- `-d, --description <text>` - Task description
- `-p, --priority <level>` - Priority level (`low`, `medium`, `high`)
- `--tags <tags>` - Comma-separated tags

**Examples:**

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

### Move Task

Move a task from one column to another:

```bash
brainfile move --task <task-id> --column <target-column>
```

**Options:**
- `-f, --file <path>` - Path to brainfile.md file (default: `brainfile.md`)
- `-t, --task <id>` - Task ID to move (required)
- `-c, --column <name>` - Target column name or ID (required)

**Examples:**

```bash
# Move task to in-progress
brainfile move --task task-4 --column in-progress

# Move task to done
brainfile move --task task-123 --column done

# Move using column ID
brainfile move --task task-456 --column review
```

### Template Management

List available templates and create tasks from templates:

```bash
# List all available templates
brainfile template --list

# Create task from template
brainfile template --use <template-id> --title "Task title"
```

**Options:**
- `-f, --file <path>` - Path to brainfile.md file (default: `brainfile.md`)
- `-l, --list` - List all available templates
- `-u, --use <template-id>` - Create task from template
- `--title <text>` - Task title (required when using template)
- `--description <text>` - Task description (optional)
- `-c, --column <name>` - Column to add task to (default: `todo`)

**Built-in Templates:**
- `bug-report` - Bug tracking with steps to reproduce, environment details
- `feature-request` - Feature proposals with requirements and acceptance criteria
- `refactor` - Code refactoring tasks with analysis and testing steps

**Examples:**

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

## Features

### Colored Output

The CLI provides colorful, easy-to-read output:
- **Task IDs** - Gray
- **Titles** - White
- **High Priority** - Red
- **Medium Priority** - Yellow
- **Low Priority** - Blue
- **Tags** - Cyan
- **Templates** - Magenta
- **Subtask Progress** - Green (complete) or Yellow (incomplete)

### Smart Task IDs

Task IDs are automatically generated with a timestamp and random string to ensure uniqueness.

## Roadmap

### Completed ✓
- `brainfile list` - List and filter tasks
- `brainfile add` - Create new tasks
- `brainfile move` - Move tasks between columns
- `brainfile template` - Template management
- Colored output and pretty-printing
- Binary compilation for distribution

### Future Enhancements
- `brainfile update` - Update existing tasks
- `brainfile delete` - Remove tasks
- Interactive mode for task creation
- Advanced filtering and search
- Task completion tracking
- Subtask management

## Development

### Using Make (Recommended)

From the project root:

```bash
# Build the CLI (includes core library)
make build-cli

# Run the CLI with automatic build (fast dev shortcut)
make cli ARGS="list --file brainfile.md"
make cli ARGS="add --title 'New task' --priority high"
make cli ARGS="--help"

# Create standalone binaries for distribution
make build-cli-bin

# Clean all build artifacts
make clean
```

### Using npm directly

From the `packages/brainfile-cli` directory:

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev
```

## License

MIT
