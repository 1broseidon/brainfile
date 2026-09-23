# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com); versions are synced across
`brainfile` (CLI) and `@brainfile/core`.

## [0.21.1] - 2026-09-23

Shared boards stop showing up as a branch on the remote, and the board
records which agent made each change without being told.

### Changed
- `sync` stores the board on the remote as `refs/brainfile/<name>` instead of
  a branch. It is pushed, fetched and kept like any other ref, but hosts list
  only branches, so autosync no longer triggers GitHub's "had recent pushes /
  Compare & pull request" banner, and the board stays out of the branch list
  and `git branch -a`. The last-known remote position is kept under
  `refs/brainfile/remotes/`, where `git fetch --prune` never touches it.
- `--remote-branch` is now `--board-name` (default `board` inside a
  repository), stored as `brainfile.boardName`. The old flag and config key
  still work.
- A fresh clone finds the shared board with one lookup on its first
  `brainfile` command, since a plain clone no longer downloads it. The lookup
  never prompts, gives up after a few seconds, and a miss is remembered for ten
  minutes.
- `sync --json` and `where --json` report `remoteRef` in place of
  `remoteBranch`; `where` also reports `webUrl`.

- Board commits are always authored by your git user. The acting agent is
  recorded on the board instead: a `[codex]` or `[claude]` suffix on the
  commit message, and the `[name]` on notes.

### Added
- Agent detection. Without `--agent` or `BRAINFILE_AGENT`, brainfile names
  the agent from the nearest agent CLI above the command (claude, codex,
  cursor-agent, gemini, opencode and others), falling back to the variables
  agents set for their commands (Codex's `CODEX_THREAD_ID`, Claude Code's
  `CLAUDECODE`) where a sandbox hides the process tree. Commands you type get
  no tag; your notes carry your git `user.name`. `BRAINFILE_DETECT_AGENT=off`
  keeps only explicit names.
- `where` and `sync --set-remote` say where the board is stored on the remote
  and, for GitHub remotes, link to its history
  (`https://github.com/<owner>/<repo>/commits/refs/brainfile/board`).

### Upgrading
- Boards shared by 0.21.0 move themselves: the first `sync` merges the
  `brainfile` branch from the remote, publishes it under `refs/brainfile/`,
  and deletes the branch (only if nobody pushed to it in the meantime).
  Upgrade every machine that shares the board; a 0.21.0 machine keeps pushing
  to the branch.

## [0.21.0] - 2026-09-22

Share a board without a service. Inside a git repository the board now lives
on its own `brainfile` branch: still ordinary files in `.brainfile/`, every
change a commit, kept out of your code and pull requests, and shared through
any git remote you choose. Nothing leaves your machine until you choose one.

### Added
- Board on a branch. Inside a git repository `brainfile init` stores
  `.brainfile/` as a worktree on an orphan `brainfile` branch, hidden from the
  code branch via `.git/info/exclude`. Outside one, `init --tracked` makes the
  board its own small repository, and `-g` targets a home board at
  `~/.brainfile`. Every change from the CLI, the MCP tools and the TUI is one
  commit authored as the acting agent; hand edits commit as `edit: <files>`.
- `brainfile where`: where the board lives, how it is stored, who else has
  it, and how many changes are waiting to be sent. Offline and read-only.
- `brainfile sync [--pull|--push] [--set-remote <name|url>] [--remote-branch
  <name>] [--autosync off|push|full]`: fetch, merge and push the board branch,
  entirely inside `.brainfile/`. No remote is ever assumed; a URL is
  registered as remote `board`, so a private board can sit next to public
  code.
- Autosync. Once a remote is set, changes are pushed a few seconds after each
  edit from a background process; `full` also fetches before stale reads.
  `brief` (CLI and MCP) syncs first unless `--offline`. The TUI header shows
  `synced 12s ago`, `local only`, or `not synced · saved locally`.
- A clone gets the board on its first `brainfile` command, says so, and sends
  changes back to the remote it came from.
- `brainfile merge-driver`, selected by `.gitattributes` on the board branch.
  Frontmatter merges field by field (the later `updatedAt` wins, ties go to
  the incoming side), log and note lists union by timestamp, `ledger.jsonl`
  merges by line, and a task completed on one machine while edited on another
  stays completed with the edit appended to its archive. The driver is
  registered as `brainfile merge-driver` only when none is configured, so a
  custom one (for example an absolute path when `brainfile` is not on PATH)
  is kept.
- `brainfile migrate --to-branch [--commit]` moves an existing board onto the
  branch: history included when it was committed with the code, uncommitted
  edits and new files included always, every file checked by content before
  the old copy is removed, and a full rollback on failure. `--to-plain`
  reverses it.
- `@brainfile/core`: `findBrainfile` and `resolveBrainfilePath` accept
  `stopAtGitRoot`; `parseFrontmatter` and `serializeFrontmatter` are exported.

### Changed
- `brainfile init` inside a git repository now creates the branch-backed
  board, at the repository root. Pass `--plain` for a plain folder in the
  current directory, as before. Existing boards are untouched until you run
  `migrate --to-branch`.
- Board discovery stops at the repository root instead of walking into
  parent directories, then looks for the board branch. A board kept above a
  repository is no longer picked up from inside it; pass `-f <path>`.
- Storage messages from init, migrate, sync and brief say in plain words where
  the board is, who has it, and that nothing is lost when a sync fails.

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
