# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com); versions are synced across
`brainfile` (CLI) and `@brainfile/core`.

## [Unreleased]

### Added
- Board on a branch (spec-9). Inside a git repository `brainfile init` now
  stores `.brainfile/` as a linked worktree on an orphan `brainfile` branch,
  hidden from the code branch via `.git/info/exclude`; outside one,
  `--tracked` makes it its own repository, and `-g` targets a home board at
  `~/.brainfile`. Every mutation (CLI, MCP tools, TUI) is one commit authored
  as the acting agent; hand edits are committed as `edit: <files>`.
- `brainfile sync [--pull|--push] [--set-remote <name|url>] [--remote-branch
  <name>] [--autosync off|push|full]` — fetch, fast-forward or merge, push,
  entirely inside the board worktree. No remote is ever assumed; `origin` is
  a choice. `--set-remote` in a fresh clone checks the board out from the
  remote.
- `brainfile merge-driver` (registered as `merge.brainfile.driver`, selected
  by `.gitattributes` on the board branch): frontmatter merges field by field
  with the later `updatedAt` winning and ties going to the incoming side; log
  and note lists union by timestamp; `ledger.jsonl` merges by line union;
  complete-vs-edit keeps the completion and appends the edit to the archive.
- Autosync: after a remote is set, mutations push a few seconds later from a
  detached process; `full` also fetches before stale reads. `brief` (CLI and
  MCP) syncs first unless `--offline`. The TUI header shows `synced Ns ago`.
- `brainfile where` — where the board lives, how it is stored, who else has
  it, and how many changes are waiting to be sent. Offline and read-only.
  Every storage message (init, migrate, sync, brief) now says in plain words
  where the board is and that nothing is lost when a sync fails; the TUI
  header shows `local only` for a board nobody else has.
- `brainfile migrate --to-branch [--commit]` moves a committed board onto the
  branch with its history (`git subtree split`), imports a gitignored one, or
  folds a standalone board repository in; `--to-plain` reverses it. The board
  arrives as it is on disk: uncommitted edits, new or partly force-added files
  and deletions land as one `import uncommitted board changes` commit, every
  file is checked by content before the old copy is removed, and a failure
  rolls back the branch, worktree and index so the repository is left as it
  was.
- `@brainfile/core`: `findBrainfile`/`resolveBrainfilePath` accept
  `stopAtGitRoot`; `parseFrontmatter`/`serializeFrontmatter` are exported.

### Changed
- Board discovery stops at the repository root, then looks for the worktree
  on the board branch (materializing it when the branch exists locally or on
  the configured remote) before falling back to legacy file names. A clone
  that checks the board out from a remote announces it and keeps sending
  changes to that remote; `board/` and `logs/` carry a `.gitkeep` so an empty
  board survives the trip.

## [0.20.0] - 2026-08-13

### Added
- `brainfile brief --agent <name>` — per-agent session orientation: full
  briefing on first run, delta since your last brief after (notes, moves,
  completions, contract changes). Also an MCP tool (count is now 11).
- MCP: all tools declare `outputSchema` and return `structuredContent`
  (spec 2026-07-28); legacy-era clients receive identical JSON as text.
- TUI: `L` toggles the completed-history view, orthogonal to the `t` type
  cycle (they compose); `$EDITOR` handoff for editing documents; NO_COLOR
  support; launch resumes your last column and type filter; `h/l` column keys.

### Changed
- Completing a task now always writes BOTH `logs/ledger.jsonl` and the
  archived markdown, with rollback on failure; `legacyMode` is a no-op.
- TUI panel system (1/2/3) collapsed into the single list; completed work
  is the `L` view; rules panel removed with the rules system.
- Releases are tag-driven: pushing `vX.Y.Z` publishes and creates the
  GitHub Release.

### Fixed
- CLI errors print a clean message + usage instead of a stack trace.
- `migrate --logs-to-ledger` is a non-destructive, idempotent backfill —
  it previously DELETED the markdown archives it migrated.
- `log --recent` includes ledger-only records; `archive --to local`
  completes the task instead of dead-ending; failed overlays no longer
  report documents removed; MCP `contract validate` returns `ok: false`
  on failed checks instead of a tool error; help opened from a detail
  view returns to that detail.

### Removed
- The rules system (adr-2): schema block, core rule operations, and the
  `rules` command. Legacy boards parse fine; `lint --fix` folds rules
  into `agent.instructions`. `[` `]` column keybinds (use `h/l` or tab).

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
