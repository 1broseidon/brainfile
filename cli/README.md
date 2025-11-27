<p align="center">
  <img src="https://raw.githubusercontent.com/brainfile/cli/main/logo.png" alt="Brainfile Logo" width="128" height="128">
</p>

# @brainfile/cli

**Task management for your terminal.** A full kanban board that lives in a markdown file.

- Interactive TUI with vim-style navigation
- CLI commands for scripting and automation
- MCP server for AI assistant integration (Claude Code, Cursor, etc.)

## Installation

```bash
npm install -g @brainfile/cli
```

Verify installation:

```bash
brainfile --version
```

## Quick Start

```bash
# Initialize a new brainfile
brainfile init

# Launch interactive TUI
brainfile

# Or use CLI commands
brainfile list                                    # List all tasks
brainfile add --title "My task" --column todo     # Add a task
brainfile move --task task-1 --column done        # Move a task
```

## Commands

### Terminal UI (TUI)

Launch an interactive task board:

```bash
brainfile                    # Open with default brainfile.md
brainfile ./path/to/file.md  # Open specific file
```

**Panel Navigation:**
| Key | Action |
|-----|--------|
| `1` | Switch to Tasks panel |
| `2` | Switch to Rules panel |
| `3` | Switch to Archive panel |
| `?` | Show help |
| `q` | Quit |

**Tasks Panel:**
| Key | Action |
|-----|--------|
| `TAB` / `Shift+TAB` | Navigate columns |
| `j`/`k` or `↑`/`↓` | Navigate tasks |
| `h`/`l` or `←`/`→` | Switch columns |
| `g`/`G` | Jump to top/bottom |
| `Enter` | Expand/collapse task |
| `/` | Search tasks |
| `r` | Refresh |

**Search Filters:**
| Filter | Example | Description |
|--------|---------|-------------|
| Priority | `p:high` | Filter by priority |
| Tag | `#bug` or `t:feature` | Filter by tag |
| Assignee | `@john` | Filter by assignee |
| Due date | `due:week` | `overdue`, `today`, `week`, `month` |

Combine filters with text: `p:high #bug login issue`

**Task Management:**
| Key | Action |
|-----|--------|
| `e` | Edit task in $EDITOR |
| `m` | Move task to column |
| `d` | Delete task |
| `n` | Quick add new task |
| `N` | New task in $EDITOR |
| `p` | Cycle priority |
| `t` | Toggle subtask |
| `A` | Archive task |
| `y` | Copy task ID |

**Rules Panel:**
| Key | Action |
|-----|--------|
| `TAB` / `Shift+TAB` | Switch rule type |
| `h`/`l` | Switch rule type (always/never/prefer/context) |
| `j`/`k` | Navigate rules |
| `n` | Add new rule |
| `e` | Edit selected rule |
| `d` | Delete selected rule |

**Archive Panel:**
| Key | Action |
|-----|--------|
| `j`/`k` | Navigate archived tasks |
| `Enter` | Expand/collapse task |
| `R` | Restore task to column |
| `d` | Permanently delete task |
| `r` | Refresh archive |

---

### list

List all tasks with optional filtering:

```bash
brainfile list
brainfile list --column "In Progress"
brainfile list --tag bug
```

**Options:**
- `-f, --file <path>` - Brainfile path (default: `brainfile.md`)
- `-c, --column <name>` - Filter by column
- `-t, --tag <name>` - Filter by tag

---

### add

Create a new task:

```bash
brainfile add --title "Implement auth" --column todo
brainfile add --title "Fix bug" --priority high --tags "bug,urgent"
brainfile add --title "Review PR" --assignee john --due-date 2025-02-01
```

**Options:**
- `-t, --title <text>` - Task title (required)
- `-c, --column <name>` - Target column (default: `todo`)
- `-d, --description <text>` - Task description
- `-p, --priority <level>` - `low`, `medium`, `high`, or `critical`
- `--tags <list>` - Comma-separated tags
- `--assignee <name>` - Assignee name
- `--due-date <date>` - Due date (YYYY-MM-DD)
- `--subtasks <list>` - Comma-separated subtask titles

---

### move

Move a task to a different column:

```bash
brainfile move --task task-1 --column "In Progress"
brainfile move --task task-5 --column done
```

**Options:**
- `-t, --task <id>` - Task ID (required)
- `-c, --column <name>` - Target column (required)

---

### patch

Update specific fields of a task:

```bash
brainfile patch --task task-1 --priority critical
brainfile patch --task task-1 --title "Updated title" --tags "new,tags"
brainfile patch --task task-1 --clear-assignee  # Remove assignee
```

**Options:**
- `-t, --task <id>` - Task ID (required)
- `--title <text>` - New title
- `--description <text>` - New description
- `--priority <level>` - New priority
- `--tags <list>` - New tags (comma-separated)
- `--assignee <name>` - New assignee
- `--due-date <date>` - New due date
- `--clear-description` - Remove description
- `--clear-priority` - Remove priority
- `--clear-tags` - Remove tags
- `--clear-assignee` - Remove assignee
- `--clear-due-date` - Remove due date

---

### delete

Permanently delete a task:

```bash
brainfile delete --task task-1 --force
```

**Options:**
- `-t, --task <id>` - Task ID (required)
- `--force` - Confirm deletion (required)

---

### archive

Move a task to the archive:

```bash
brainfile archive --task task-1
```

---

### restore

Restore a task from the archive:

```bash
brainfile restore --task task-1 --column todo
```

**Options:**
- `-t, --task <id>` - Task ID (required)
- `-c, --column <name>` - Target column (required)

---

### subtask

Manage subtasks:

```bash
brainfile subtask --task task-1 --add "New subtask"
brainfile subtask --task task-1 --toggle task-1-1
brainfile subtask --task task-1 --update task-1-1 --title "Updated"
brainfile subtask --task task-1 --delete task-1-2
```

**Options:**
- `-t, --task <id>` - Parent task ID (required)
- `--add <title>` - Add a new subtask
- `--toggle <id>` - Toggle subtask completion
- `--update <id>` - Update subtask (use with `--title`)
- `--delete <id>` - Delete a subtask
- `--title <text>` - New title (for `--update`)

---

### lint

Validate and auto-fix brainfile syntax:

```bash
brainfile lint              # Check for issues
brainfile lint --fix        # Auto-fix issues
brainfile lint --check      # Exit with error code (for CI)
```

**What it checks:**
- YAML syntax errors
- Unquoted strings with colons (auto-fixable)
- Duplicate column IDs
- Missing required fields

---

### template

Create tasks from templates:

```bash
brainfile template --list
brainfile template --use bug-report --title "Login fails"
brainfile template --use feature-request --title "Dark mode"
```

**Built-in Templates:**
- `bug-report` - Bug tracking with triage steps
- `feature-request` - Feature proposals
- `refactor` - Code refactoring tasks

---

### hooks

Integrate with AI coding assistants:

```bash
brainfile hooks install claude-code
brainfile hooks install cursor --scope project
brainfile hooks install cline
brainfile hooks list
brainfile hooks uninstall claude-code --scope all
```

**Supported Assistants:**
- Claude Code
- Cursor
- Cline

Hooks provide automatic reminders to update task status during AI-assisted development.

---

### mcp

Start an MCP (Model Context Protocol) server for AI assistant integration:

```bash
brainfile mcp
brainfile mcp --file ./project/brainfile.md
```

The MCP server exposes all brainfile operations as tools that AI assistants can use directly.

**Available MCP Tools:**
| Tool | Description |
|------|-------------|
| `list_tasks` | List tasks with optional filtering |
| `add_task` | Create a new task |
| `move_task` | Move task between columns |
| `patch_task` | Update task fields |
| `delete_task` | Permanently delete a task |
| `archive_task` | Archive a task |
| `restore_task` | Restore from archive |
| `add_subtask` | Add a subtask |
| `delete_subtask` | Delete a subtask |
| `toggle_subtask` | Toggle subtask completion |
| `update_subtask` | Update subtask title |

**Configuration for Claude Code:**

Add to your MCP settings (`.mcp.json` or Claude Code config):

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

Or with a specific file:

```json
{
  "mcpServers": {
    "brainfile": {
      "command": "npx",
      "args": ["@brainfile/cli", "mcp", "-f", "path/to/brainfile.md"]
    }
  }
}
```

---

### init

Create a new brainfile:

```bash
brainfile init
brainfile init --file ./project/tasks.md
brainfile init --force  # Overwrite existing
```

## Output Colors

The CLI uses colors to highlight information:

| Element | Color |
|---------|-------|
| Task IDs | Gray |
| Titles | White |
| Critical Priority | Red (bold) |
| High Priority | Red |
| Medium Priority | Yellow |
| Low Priority | Blue |
| Tags | Cyan |
| Completed | Green |

## Package Information

- **npm**: https://www.npmjs.com/package/@brainfile/cli
- **GitHub**: https://github.com/brainfile/cli
- **Core Library**: [@brainfile/core](https://www.npmjs.com/package/@brainfile/core)
- **Protocol**: https://brainfile.md

## Development

```bash
git clone https://github.com/brainfile/cli.git
cd cli
npm install
npm run build
npm test
```

## License

MIT
