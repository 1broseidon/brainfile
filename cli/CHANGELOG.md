# Changelog

All notable changes to `@brainfile/cli` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.15.1] - 2026-02-19

### Added
- **Workspace format probe for migration readiness**
  - New shared detector classifies workspaces as `v2`, `legacy-root`, `legacy-dotbrainfile`, `mixed`, or `empty`
  - Used consistently by init/migrate/hint flows to avoid command drift
- **Soft migration warnings in TUI read path**
  - Launching `brainfile tui` in legacy/mixed workspaces now shows a non-blocking upgrade hint

### Changed
- **`brainfile migrate` is now the primary v2 upgrade path**
  - Migration now handles legacy root and legacy `.brainfile/brainfile.md` layouts in one command
  - Mixed workspaces are handled safely (including backup of stray legacy root files)
  - Existing `board/`/`logs/` partial states are recognized and migrated more robustly
- **Migration guidance text now points to `brainfile migrate` (without `--v2`)**
  - Updated CLI hints and relevant command errors/messages

### Fixed
- **`brainfile init` legacy detection behavior**
  - `init` now refuses to initialize over detected legacy/mixed layouts and suggests running `brainfile migrate`
  - Already-v2 workspaces are treated idempotently (no destructive re-init path)
- **List/TUI migration nudges**
  - `brainfile list` and `brainfile tui` now provide soft warnings when legacy layout is detected, improving discoverability for required migration

## [0.14.0] - 2026-02-18

### Added
- **Per-task file architecture (v2)** - Tasks are now individual `.md` files instead of embedded YAML
  - `brainfile init` creates v2 structure: `brainfile.md` (config), `tasks/`, `logs/`, `state.json`
  - `brainfile migrate --v2` converts v1 boards to v2 per-task files (creates `.v1.bak` backup)
  - All existing commands auto-detect v1 vs v2 and handle both transparently
- **`brainfile complete`** - Move task from `tasks/` to `logs/` with `completedAt` timestamp
  - Strips `column` and `position` fields from completed task
  - `complete_task` MCP tool for parity
- **`brainfile log`** - View and manage task history
  - `brainfile log -t <id>` - View a completed task's log
  - `brainfile log --search <query>` - Search across all completed task logs
  - `brainfile log --recent` - List recently completed tasks
  - `brainfile log note -t <id> "<message>"` - Append timestamped entry to any task's `## Log` section
  - `search_logs` and `append_log` MCP tools for parity
- **`brainfile search`** - Search across active tasks and completed logs with relevance scoring
  - `search_tasks` MCP tool updated for v2

### Changed
- **All MCP tools have v2 support** - 29 tools detect v1/v2 and handle per-task files correctly
  - Uses `@brainfile/core` as single source of truth for all task I/O operations
  - CLI is a thin wrapper over core (no duplicated parsing/serialization logic)
- **`brainfile init` defaults to v2** - Creates per-task file directory structure
- Upgraded to @brainfile/core@^0.11.0

## [0.13.3] - 2026-01-01

### Added
- **`brainfile schema` command** - View and manage brainfile schemas
  - `brainfile schema` - List available schemas (board, base)
  - `brainfile schema <name>` - Display specific schema as JSON
  - `brainfile schema update` - Check for schema updates from protocol repo
  - Schemas bundled with CLI package (no network for basic usage)
  - 24-hour auto-check for updates with non-blocking notification
  - `--json` flag for programmatic output
- **`brainfile rules` command** - Manage project rules
  - `brainfile rules` - List all rules by category
  - `brainfile rules add <category> "rule text"` - Add a rule
  - `brainfile rules delete <category> <id>` - Delete a rule by ID
  - Categories: `always`, `never`, `prefer`, `context`
  - `--json` flag for programmatic output
- **MCP tools for rules** - `list_rules`, `add_rule`, `delete_rule`

## [0.13.2] - 2026-01-01

### Fixed
- **Contract validation base directory** - When brainfile is at `.brainfile/brainfile.md`, validation now correctly resolves paths from project root instead of `.brainfile/` directory
  - Deliverable paths like `cli/src/file.ts` now resolve correctly
  - Validation commands run from project root, not `.brainfile/`

### Added
- **Directory-change warning in validation** - Warns when validation commands use `cd`, `pushd`, or `chdir`
  - Explains that directory changes may cause brainfile CLI to find a different brainfile
  - Suggests using `-f` flag or running from project root
  - Warning appears in both CLI and MCP tool output
- **`--json` flag for show command** - Output task data as JSON for scripting
  - `brainfile show -t task-123 --json`
  - Includes all task fields plus `column` and `archived` metadata

## [0.12.4] - 2025-11-28

### Fixed
- **Archive file separation** - CLI now correctly uses separate `brainfile-archive.md` file
  - Archive command writes to separate file, not inline `archive: []` array
  - Restore command reads from separate archive file
  - `--all` flag reads from `brainfile-archive.md` for bulk export
  - MCP tools (archive_task, restore_task, bulk_archive_tasks) use separate file

### Added
- **Extended destination format** - Inline archive destination in brainfile.md
  - `archive.destination: github:owner/repo` - specify GitHub repo directly
  - `archive.destination: linear:TEAM_KEY` - specify Linear team by key
  - Falls back to global config if target not specified
- **TUI external archive** - Shift+A now supports GitHub/Linear destinations
  - Respects `archive.destination` from brainfile.md or global config
  - Shows "Archiving..." status during async operation
  - Displays result (e.g., "Archived to GitHub #123")
- **Shared archive utilities** - New `cli/src/utils/archive.ts` module
  - `archiveTaskToFile()` - archive to separate file
  - `loadArchivedTasks()` - read from archive file
  - `restoreFromArchive()` - restore task to main file
  - `removeFromArchive()` - remove after external export

## [0.12.3] - 2025-11-28

### Improved
- **Linear auth flow** - Auto-detects teams and prompts for selection
  - Single team: auto-configures as default
  - Multiple teams: interactive selection prompt
  - Offers to set Linear as default archive destination

## [0.12.2] - 2025-11-28

### Added
- **MCP archive_task destination support** - Archive tasks to GitHub/Linear via MCP
  - New `destination` parameter: `"local"`, `"github"`, or `"linear"`
  - Respects project default from `brainfile.md` `archive.destination`
  - Falls back to user default from `~/.config/brainfile/config.json`
  - Helpful error messages with exact CLI commands when auth/config needed
  - Example: `archive_task({ task: "task-1", destination: "github" })`

## [0.12.1] - 2025-11-27

### Added
- **config command** - Manage CLI configuration
  - `brainfile config list` - Show all config values
  - `brainfile config get <key>` - Get a specific value
  - `brainfile config set <key> <value>` - Set a value
  - `brainfile config path` - Show config file path
  - Configuration stored at `~/.config/brainfile/config.json`

## [0.12.0] - 2025-11-27

### Added
- **External archive destinations** - Archive completed tasks to GitHub Issues or Linear
  - `brainfile archive --task task-1 --to=github` - Create closed GitHub Issue
  - `brainfile archive --task task-1 --to=linear` - Create completed Linear issue
  - `brainfile archive --all --to=github` - Batch archive entire local archive
  - `brainfile archive --dry-run` - Preview without creating
  - Reads `archive.destination` from brainfile.md for project-level defaults
  - Reads `~/.config/brainfile/config.json` for user-level defaults
- **auth command** - Authenticate with external services
  - `brainfile auth github` - OAuth device flow (opens browser) or detects gh CLI
  - `brainfile auth github --token <PAT>` - Manual Personal Access Token
  - `brainfile auth linear --token <API_KEY>` - Linear API key authentication
  - `brainfile auth status` - Show authentication status for all providers
  - `brainfile auth logout [provider]` - Clear stored credentials
  - `brainfile auth logout --all` - Clear all credentials
  - Secure token storage in `~/.config/brainfile/auth.json`
  - Automatic gh CLI detection (piggybacks on existing auth)

### Changed
- Upgraded to @brainfile/core@^0.9.0 with task formatter functions

## [0.11.1] - 2025-11-27

### Fixed
- **Status bar rendering** - Fixed character clipping in footer hints

## [0.11.0] - 2025-11-27

### Changed
- **TUI redesign** - Complete visual overhaul of the terminal interface
  - Borderless task cards for cleaner, faster scanning
  - Selection indicator (`▌`) matches column tabs for visual consistency
  - Priority badge leads the title row for immediate visibility
  - Compact `[X/Y]` subtask counts replace block progress bars
  - Meta row shows progress, due date, and tags with `·` separators
  - Task IDs right-aligned for consistent table-like appearance
  - 3 lines per collapsed task (down from 7) - more tasks visible at once

### Fixed
- **Layout stability** - Reserved space for status messages prevents layout shifts during updates
- **Row spacing** - Fixed inconsistent margins between task cards
- **Viewport calculations** - Fixed content width calculations for accurate scrolling

## [0.10.3] - 2025-11-27

### Fixed
- **Task card border overflow** - Fixed metadata row (tags, priority) overflowing the rounded border. Added explicit width constraints and tag truncation with ellipsis.

## [0.10.2] - 2025-11-27

### Fixed
- **Expanded task disappearing** - Fixed bug where expanding a task with many subtasks would cause it to vanish from view. Selected task is now always rendered regardless of height.
- **Priority badge labels** - Changed truncated "MEDI" to proper abbreviations: LOW, MED, HIGH, CRIT

## [0.10.1] - 2025-11-27

### Added
- **TAB navigation in Rules panel** - TAB/Shift+TAB now cycles through rule types (always/never/prefer/context)

### Changed
- **Context-aware footer hints** - Status bar now shows `TAB type` in Rules panel, hides TAB hint in Archive panel

### Fixed
- **Removed broken archive search** - Archive panel no longer shows non-functional search box

## [0.10.0] - 2025-11-27

### Added
- **Rules Panel** - Full rule management in TUI (feature parity with VSCode extension)
  - Press `2` to switch to Rules panel
  - Four rule categories: Always, Never, Prefer, Context
  - `h/l` to switch between rule types
  - `n` to add new rule, `e` to edit, `d` to delete
  - Rules persist to brainfile YAML frontmatter
- **Archive Panel** - View and manage archived tasks in TUI
  - Press `3` to switch to Archive panel
  - Browse archived tasks with `j/k` navigation
  - `R` (Shift+R) to restore task to a column
  - `d` to permanently delete archived task
  - `Enter` to expand/collapse task details
  - `r` to refresh archive from file
- **Main Panel Tabs** - Tab-based navigation between Tasks, Rules, and Archive
  - Press `1`, `2`, `3` to switch panels
  - Visual tab bar shows active panel with counts
- **Updated Help Overlay** - Three-column layout documenting all panel shortcuts
- **Clean exit** - Screen clears on quit, returning to clean terminal (like vim/htop)

### Changed
- **Archive keybinding** - Changed from `a` to `A` (Shift+A) to prevent accidental archiving
  - Easy to hit `a` thinking "add" and accidentally archive a task
  - Now requires intentional Shift+A keystroke
- **Panel tabs visual alignment** - Main panel tabs now match column tabs styling exactly
  - Same `▌` indicator, spacing, and color treatment for visual consistency

### Fixed
- **Archive to separate file** - Archive now writes to `brainfile-archive.md` per protocol spec
  - Previously archived tasks to inline `archive: []` array in same file
  - Now matches VSCode extension behavior and protocol specification
  - Archive file is created automatically in same directory as brainfile
- **Cursor artifact after editor** - Fixed blinking cursor appearing after returning from external editor

## [0.9.2] - 2025-11-26

### Added
- **Advanced search filters** - Filter tasks using structured queries
  - `p:high` or `priority:critical` - Filter by priority
  - `#tag` or `t:bug` - Filter by tag
  - `@john` or `assignee:john` - Filter by assignee
  - `due:overdue`, `due:today`, `due:week`, `due:month` - Filter by due date
  - Combine filters with text search: `p:high #bug fix login`
- **Filter hints in search bar** - Shows available filters when search is empty
- **Updated help overlay** - Documents filter syntax

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

