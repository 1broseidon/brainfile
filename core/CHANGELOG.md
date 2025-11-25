# Changelog

All notable changes to `@brainfile/core` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.7.0] - 2025-11-25

### Added
- **Bulk task operations** - Process multiple tasks in a single operation with partial success handling
  - `moveTasks(board, taskIds, toColumnId)` - Move multiple tasks to a target column
  - `patchTasks(board, taskIds, patch)` - Apply the same patch to multiple tasks
  - `deleteTasks(board, taskIds)` - Delete multiple tasks from any column
  - `archiveTasks(board, taskIds)` - Archive multiple tasks
- **New types for bulk operations**
  - `BulkItemResult` - Per-item result with id, success flag, and optional error
  - `BulkOperationResult` - Aggregate result with board, results array, and success/failure counts

### Changed
- All bulk operations support partial success - successfully processed items are applied even if some fail
- Bulk operations are immutable and return new board instances

## [0.5.1] - 2025-11-24

### Added
- **Subtask operations** - Full subtask management via immutable operations
  - `addSubtask(board, taskId, title)` - Add a subtask with auto-generated ID
  - `deleteSubtask(board, taskId, subtaskId)` - Remove a subtask
  - `updateSubtask(board, taskId, subtaskId, title)` - Update subtask title
  - `toggleSubtask(board, taskId, subtaskId)` - Toggle subtask completion

### Changed
- All subtask operations return `BoardOperationResult` for consistent error handling

## [0.5.0] - 2025-11-24

### Added
- **Board operations** - Immutable operations for board manipulation
  - `addTask(board, columnId, taskInput)` - Create tasks with full field support
  - `patchTask(board, taskId, patch)` - Partial task updates (set null to remove fields)
  - `deleteTask(board, columnId, taskId)` - Permanently delete a task
  - `archiveTask(board, columnId, taskId)` - Move task to archive
  - `restoreTask(board, taskId, columnId)` - Restore task from archive
  - `moveTask(board, taskId, fromColumn, toColumn, index)` - Move task between columns
- **New types**
  - `TaskInput` - Input type for creating tasks with all fields
  - `TaskPatch` - Partial update type (null removes fields)
  - `BoardOperationResult` - Standardized result type with success/error

### Changed
- All operations are immutable and return new board instances
- Consistent error handling across all operations

## [0.4.1] - 2025-11-21

### Added
- Realtime helpers: `hashBoardContent`, `hashBoard`, and `diffBoards` for consistent change tokens and structured board deltas across clients.

### Changed
- Exported new realtime types (`BoardDiff`, `ColumnDiff`, `TaskDiff`) via the public API.

## [0.3.0] - 2025-11-20

### Added
- **BrainfileLinter module**: Comprehensive linting functionality extracted from CLI
- `Brainfile.lint()` convenience method for easy linting
- Auto-fix capability for common YAML issues (unquoted strings with colons)
- Detailed lint results with error codes, line numbers, and fixability status
- Helper methods: `getSummary()` and `groupIssues()` for processing lint results

### Changed
- Enhanced `parseWithErrors()` to capture all warning messages including duplicate column details
- Improved warning capture mechanism for better integration with linting

## [0.2.0] - 2025-11-20

### Added
- **Duplicate column consolidation**: Parser now automatically detects and merges duplicate columns with the same ID, making it more forgiving of LLM-generated content
- Warnings in `parseWithErrors()` result to surface duplicate column detections
- Comprehensive test coverage for duplicate column scenarios

### Fixed
- Parser now gracefully handles duplicate columns by merging their tasks instead of displaying them separately

## [0.1.1] - 2024-12-01

### Added
- Initial release of core library
- Parser for Brainfile markdown format
- Serializer for generating Brainfile markdown
- Validator for Brainfile structure
- Template generator for new boards
- Full TypeScript support with type definitions

## [0.1.0] - 2024-11-15

### Added
- Initial public release
- Core parsing and serialization functionality
- Full test coverage
- TypeScript definitions
