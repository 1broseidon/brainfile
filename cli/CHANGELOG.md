# Changelog

All notable changes to `@brainfile/cli` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

### Changed

### Deprecated

### Removed

### Fixed

### Security

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

