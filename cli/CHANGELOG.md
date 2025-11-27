# Changelog

All notable changes to `@brainfile/cli` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.9.1] - 2025-11-26

### Fixed
- **TUI empty string rendering bug** - Fixed critical Ink rendering error when `searchQuery` was empty
  - Changed `searchQuery && ...` to `searchQuery.length > 0 && ...` to return `false` instead of `""`
  - Empty strings in React/Ink cause "Text string must be rendered inside Text component" errors
- **truncate() utility** - Returns single space `' '` instead of empty string for Ink compatibility
- **Progress bar rendering** - Protected `.repeat()` calls from producing empty strings when `filled` or `empty` is 0
- **Separator lines** - Added `Math.max(1, ...)` safeguard for separator line widths

### Added
- **TUI task management** - Full interactive task management in the terminal
  - `e` - Edit task in $EDITOR
  - `m` - Move task to different column (overlay picker)
  - `d` - Delete task with confirmation
  - `t` - Toggle subtask completion (overlay picker)
  - `n` - Quick add new task (inline input)
  - `N` - New task in $EDITOR
  - `p` - Cycle priority (none→low→medium→high→critical)
  - `a` - Archive task
  - `y` - Copy task ID to clipboard
- **Minimum terminal size check** - Shows helpful message if terminal is smaller than 60x16
- **Due date display** - Shows due dates with color coding (red if overdue, yellow if ≤2 days)
- **Expanded subtask view** - Shows all subtasks when task is expanded (removed 5-subtask limit)
- **Search improvements** - Now searches description field, proper trimming, "no results" message

### Changed
- **TUI styling** - Lipgloss-inspired rounded borders and true black theme
- Upgraded to @brainfile/core@^0.8.0

## [0.8.0] - 2025-11-25

### Added
- **MCP server auto-discovery** - Automatically finds workspace brainfile without hardcoded paths
  - Checks `WORKSPACE_FOLDER_PATHS` env var (set by Cursor IDE)
  - Falls back to git repository root detection
  - Falls back to walking up directory tree from cwd
  - Logs discovered path to stderr for debugging

### Fixed
- **`brainfile init` schema URL** - Changed from `https://brainfile.md/v1` to `https://brainfile.md/v1/board.json` per protocol spec

### Changed
- Upgraded to @brainfile/core@^0.8.0 with `findNearestBrainfile()` support

## [0.7.1] - 2025-11-25

### Added
- **get_task MCP tool** - Get detailed information about a specific task by ID
- **search_tasks MCP tool** - Search tasks by title, description, or tags with relevance scoring
  - Supports filtering by column, priority, and assignee
  - Results sorted by relevance score

## [0.7.0] - 2025-11-25

### Added
- **Bulk MCP tools** - Process multiple tasks in a single operation
  - `bulk_move_tasks` - Move multiple tasks to a target column
  - `bulk_patch_tasks` - Apply the same patch (priority, tags, assignee) to multiple tasks
  - `bulk_delete_tasks` - Delete multiple tasks permanently
  - `bulk_archive_tasks` - Archive multiple tasks
- All bulk tools return detailed results with per-item success/failure status

### Changed
- Upgraded to @brainfile/core@^0.7.0 with bulk operation support

## [0.6.5] - 2025-11-25

### Fixed
- **MCP patch_task null handling** - Fixed field removal when passing `"null"` string from MCP clients

### Changed
- Updated help menu to show MCP command in usage section

## [0.6.4] - 2025-11-25

### Added
- **MCP Server** - Model Context Protocol server for AI assistant integration
  - `brainfile mcp` starts an MCP server via stdio
  - 11 tools available: list_tasks, add_task, move_task, patch_task, delete_task, archive_task, restore_task, add_subtask, delete_subtask, toggle_subtask, update_subtask
  - Works with Claude Code, Cursor, and other MCP-compatible clients
  - Configure via `.mcp.json` for project-specific integration

## [0.6.3] - 2025-11-24

### Added
- **patch command** - Update specific task fields with partial updates
  - Set new values for title, description, priority, tags, assignee, due date
  - Remove fields with `--clear-*` options (e.g., `--clear-assignee`)
- **delete command** - Permanently delete tasks (requires `--force` flag)
- **archive command** - Move tasks to the archive section
- **restore command** - Restore archived tasks to a column
- **subtask command** - Full subtask management
  - `--add` - Create new subtasks
  - `--toggle` - Toggle completion status
  - `--update` - Update subtask title
  - `--delete` - Remove subtasks

### Changed
- Updated add command to support `--assignee`, `--due-date`, and `--subtasks` options
- Upgraded to @brainfile/core@^0.5.1 with new operation APIs

## [0.5.1] - 2025-11-23

### Changed
- **TUI: Optimized file watching with hash-based deduplication**
  - Uses `hashBoardContent` from `@brainfile/core` to skip redundant refreshes
  - File watcher now only re-renders when content actually changes
  - Reduces unnecessary re-renders when file is saved without changes
  - Consistent behavior with VSCode extension's realtime sync
- Added documentation for realtime sync utilities in README

## [0.5.0] - 2025-11-22

### Added
- **Terminal UI (TUI)** - Interactive split-terminal friendly task board
  - `brainfile` or `brainfile tui` launches the TUI
  - `brainfile <file>` opens TUI with a specific brainfile
  - Real-time file watching with auto-refresh on changes
  - Column navigation with TAB key
  - Task navigation with j/k or arrow keys
  - Expand/collapse task details with Enter
  - Search/filter with `/` key
  - Help overlay with `?` key
  - Progress bar showing completion percentage
  - Column ordering by `order` property (matches VSCode extension)
  - True black dark mode color scheme
  - Inverse selection highlighting for clarity
  - Responsive layout that adapts to terminal size

### Changed
- Updated @brainfile/core to ^0.4.1 for column ordering support

### Dependencies
- Added ink ^3.2.0 for React-based terminal UI
- Added chokidar ^4.0.3 for file watching
- Added react ^17.0.2 for ink compatibility

## [0.4.3] - 2025-11-21

### Fixed
- **Cline Hooks Hanging Issue** - Fixed hook scripts hanging on startup
  - Added 2-second timeout to stdin read using `read -t 2`
  - Hooks now gracefully handle missing stdin data by using empty JSON object
  - Prevents indefinite blocking when Cline doesn't provide stdin properly
  - All three hooks (PostToolUse, UserPromptSubmit, TaskStart) updated

## [0.4.2] - 2025-11-21

### Added
- **Cline Hooks Support** - Added support for Cline VS Code extension
  - `brainfile hooks install cline` - Install hooks for Cline
  - `brainfile hooks uninstall cline` - Remove Cline hooks
  - `brainfile hooks list cline` - View Cline hook status
  - Creates executable hook scripts: PostToolUse, UserPromptSubmit, TaskStart
  - Hooks return JSON with `cancel` and `contextModification` fields
  - User scope: `~/Documents/Cline/Rules/Hooks/`
  - Project scope: `.clinerules/hooks/`
  - Full test coverage for Cline integration

## [0.4.0] - 2025-11-21

### Added
- **AI Agent Hooks Integration** - Native support for AI coding assistant hooks
  - `brainfile hooks install <tool>` - Install hooks for Claude Code or Cursor
  - `brainfile hooks uninstall <tool>` - Remove hooks with `--scope` option (user/project/all)
  - `brainfile hooks list [tool]` - View installed hooks status
  - `brainfile hooks after-edit` - Internal hook handler for post-edit events
  - `brainfile hooks before-prompt` - Internal hook handler for pre-prompt events with staleness detection
  - `brainfile hooks session-start` - Internal hook handler for session start
  - Generic hook handlers work with multiple AI assistants (Claude Code and Cursor)
  - Automatic task status reminders during AI-assisted development
  - Smart staleness detection (warns if brainfile >5 minutes old with uncommitted changes)
  - Git integration to detect uncommitted changes
  - Gentle reminders (80%) + smart checkpoints (20%) approach
  - Non-blocking hooks that fail gracefully
  - Preserves existing hooks in settings files
  - Works with both user and project scope installations

## [0.3.0] - 2025-11-20

### Added
- **init command** - Initialize new brainfile.md with minimal template
  - `brainfile init` creates a basic project structure
  - Includes default agent instructions and three columns (todo, in-progress, done)
  - `--force` flag to overwrite existing files
  - `--file` option to specify custom output path

## [0.2.0] - 2025-11-20

### Added
- Dynamic version reading from package.json for `brainfile -V`

### Changed
- **Refactored lint command** to use `BrainfileLinter` from @brainfile/core
- Upgraded to @brainfile/core@^0.3.0 with integrated linter
- Removed ~200 lines of duplicate linting logic
- Simplified lint command implementation

### Fixed
- Version command now correctly displays current version from package.json

## [0.1.0] - 2024-12-01

### Added
- Initial public release
- Command-line interface for Brainfile management
- Integration with @brainfile/core

