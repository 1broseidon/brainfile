# Changelog

All notable changes to `@brainfile/core` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

### Changed

### Deprecated

### Removed

### Fixed

### Security

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
