# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com); versions are synced across
`brainfile` (CLI) and `@brainfile/core`.

## [0.19.0] - 2026-08-12

### Added
- TUI v3: complete redesign on ink 7 + react 19 via esbuild bundle — dense
  one-row-per-document board, type glyphs, signal-only color, split detail.
- First-class plans: `brainfile plan add/list/show/link`, `plan-N` documents.
- MCP: spec 2026-07-28 (stateless era) via `@modelcontextprotocol/server` v2;
  one stdio server serves both protocol eras.

### Changed
- Core owns all V2 board mutations; CLI, MCP, and TUI are thin frontends with
  parity locked by tests.

### Removed
- V1 board-format support (adr-1); `brainfile migrate` remains the converter.

### Security
- Cleared GHSA-345p-7cg4-v4c7 et al. by leaving the pinned v1 MCP SDK.

## [0.18.1] - 2026-08-11

### Fixed
- First monorepo release: workspaces, tokenless publishing (npm trusted
  publishing / OIDC), commander 14, jest 30.

## [0.18.0] - 2026-08-11

### Changed
- Package renamed `@brainfile/cli` → `brainfile`. Monorepo consolidation at
  github.com/1broseidon/brainfile.
