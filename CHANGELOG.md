# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com); versions are synced across
`brainfile` (CLI) and `@brainfile/core`.

## [Unreleased]

Memory moves onto the board (spec-11): decisions with claim families, one
search over a local index, a brief that starts every session, and `check`
before acting. Default types and the graph (spec-12): every board has epics,
specs, plans, tasks and decisions, and knows how they fit together. MCP
parity (spec-13): everything the CLI does to a board has an MCP tool, and
columns get a command of their own. The TUI catches up with decisions
(task-19): a view of their own, their detail, and the work resting on them.

### Added (spec-15, board integrity)
- Brainfile looks for every board a repository has: the `.brainfile/` folder
  in the checkout (tracked by the code branch or not), the `brainfile` branch,
  the remote's `refs/brainfile/<name>`, and checkouts of the board branch
  outside `.brainfile/`. `brainfile where` (and the MCP `where` tool) lists
  them with document counts and last change, says how the two stand (one
  already has everything the other has, or each has changes the other
  lacks), and `--fetch` / `fetch: true` asks the remote first.
- While two boards disagree, every write from the CLI, the MCP tools and the
  desktop app is refused, naming the command that settles it; reads still
  work. A board ahead of or behind the remote is not two boards.
- `where` says how many changes on the remote are not here yet, and reports a
  code branch that still tracks an old copy of `.brainfile/`.

### Added (task-19)
- The TUI has a decisions view, on `D` and at the type cycle's `decision`
  stop: standing decisions grouped by claim-key family, history (superseded,
  rejected, stale) folded below and opened with `L`. Rows lead with `●`
  (`○` once retired) and say only a kind other than `decision`, `proposed`,
  `review` past `validUntil`, or where a retired one went.
- A decision's detail in the TUI: claim key, kind, stance and subject, holds
  while, recheck, valid until (`review` once past), replaces and replaced by,
  and the open work resting on it, each opened from the detail cursor.
- Work's detail in the TUI lists the decisions it rests on, a retired one
  marked `superseded → decision-2`; its row says `decision changed`.

### Changed (task-19)
- The TUI no longer puts decisions in a column (with none they landed in
  `todo`) or retired decisions in the done view. In the decisions view the
  board's mutating keys say how decisions change (`decide`, `supersede`,
  `retire`) instead of acting; `e` still edits.
- The TUI's detail cursor is drawn as a bar as well as reverse video, so it
  shows under `NO_COLOR`; archived documents show their description.

### Changed (task-20)
- The TUI's list keeps a child under its parent across columns: it is drawn
  in the parent's tab, says its own column at the row's right edge (`review`),
  and is no longer listed in its own tab with `← epic-1`. A child completed
  into logs/ stays under its open parent as `✓ done`, read-only, until the
  parent is done. Grandchildren nest too. A tab counts what its list holds;
  `m` starts on the document's own column, and the cursor follows a child
  moved or completed under it.

### Added (spec-13)
- `brainfile columns`: list (the default, with task counts and `--json`),
  `add <title>` (`--id`, `--after`/`--before`, `--completion`), `rename
  <column> <title>` (the ID stays, so its tasks do), `reorder <columns...>`
  (the ones named first, the rest after) and `remove <column>`, which refuses
  a column that holds tasks unless `--move-to` names where they go; they
  move there without being completed. One board commit per change.
- MCP: eleven more tools, twenty-five in all: `note` (append to a task's log,
  attributed like `brainfile note`), `log` (one task's log, a search, the
  most recent), `columns` (the operations above), `board` (read; set the
  title, agent instructions and `related:` entries), `types` (list with the
  graph; add with `like`, `idPrefix`, `completable`), `template` (list; use),
  `lint` (`fix: true`), `sync` (`pull`/`push`), `where`, `retire` and
  `adr_promote`. Every one has an output schema; every write is one board
  commit. `list_tasks` reports a document's own `status` and filters by it.
- The bundled schemas as MCP resources: `brainfile://schema/board` and
  `brainfile://schema/base`.
- `brainfile mcp` sends server instructions: use these tools for every board
  change, never edit `.brainfile/` by hand, start with `brief`, note as you
  go, `check` before acting; then one line per tool.
- A parity test enumerates the CLI's commands and fails unless each maps to
  a tool, a resource, or an exclusion with a reason (`tui`, `mcp`,
  `merge-driver`, `hooks`, `auth`, `config`, `init`, `migrate`, `restore`,
  `index`).
- Core: `addColumn`, `renameColumn`, `reorderColumns`, `removeColumn`,
  `readBoardSettings` and `updateBoardSettings` (pure, also in
  `@brainfile/core/browser`), and their `*File` forms with
  `summarizeColumns`; `removeColumnFile` moves a column's tasks first or
  refuses.

### Changed (spec-13)
- The commander program is built by `createProgram()` in `src/program.ts`;
  `cli.ts` parses it. Nothing changes for the command line.

### Added (spec-11)
- `brainfile decide -k <claim.key> "text"` records a decision in its claim
  family (`--kind`, `--stance`/`--subject`, `--holds-while`, `--recheck`,
  `--valid-until`, `--source` with its sha256, `--package name<op>version`,
  `--for` work that rests on it). The family's current decision is
  superseded: status, `supersedes`/`supersededBy` both ways, moved to
  `logs/`. An empty family lists related ones (same parent key, same words).
  `supersede <id> "text"` replaces one by hand; `retire <id> --as
  rejected|stale` lets one go. One board commit per command; no ledger lines.
- `brainfile check "<action>"` (or a decision ID, `--claim-key`,
  `--claim-key-prefix`) answers `use`, `review`, `use_replacement` or
  `no_decision` in recoil's order, with the stance rule and the predicates
  `validUntil`, source unchanged and package version (package.json,
  go.mod, pyproject.toml). Exit codes 0, 2, 3, 0; errors 1.
- A local search index at `.brainfile/state/index.db` (gitignored,
  rebuildable) on Node's own `node:sqlite` with FTS5: board and logs
  documents, the ledger, `plans/` and the project's Markdown, via `git
  ls-files` so `.gitignore` holds. Tracked by size, mtime and sha256; changed
  files replace their chunks. `brainfile index [--rebuild] [--status]`.
- MCP: `decide`, `supersede` and `check` (fourteen tools).
- Core: `decisions` (claim families, stance rule, verdicts; also in
  `@brainfile/core/browser`), `decideFile`, `supersedeDecisionFile`,
  `retireDecisionFile` and the file predicates in the main entry, and the new
  Node-only `@brainfile/core/memory`: `MemoryIndex`, `searchMemory`,
  `composeBrief`, `checkDecision`, `checkClaimKeyPrefix`.
- `/v2/decision.json` documents `sourcePath`, `sourceHash` and
  `packageVersion`.

### Changed (spec-11)
- `search` (CLI and MCP) uses the index when Node has `node:sqlite` (22.13
  and later): AND then OR, titles over bodies, current results first and
  history (completed work, superseded decisions) in its own lane, every hit
  with its path and line range, and the project's docs alongside the board.
  Filter tokens work as before. Elsewhere, or with `BRAINFILE_INDEX=off`, the
  scan answers in the same shape. New: `search --json`, `--limit`,
  `--no-history`.
- `brief` prints one budgeted block (about 1,600 characters, `--max-chars`):
  work resting on a superseded decision and decisions whose predicates broke,
  current decisions, your tasks (or the work in flight), what changed since
  your checkpoint, and the docs that bear on your tasks. `--json` adds
  `sections`, `text`, `maxChars` and `truncated`; `lanes` is unchanged.
- The SessionStart hook injects that brief (Claude Code:
  `hookSpecificOutput.additionalContext`) instead of a reminder, from a lean
  entry that loads neither commander, the MCP server nor the TUI (~150ms
  warm).
- `log --recent` and MCP `search recent` leave out decisions retired to
  `logs/`; they were never completed.

### Added (spec-12)
- Five built-in types that need no `types:` entry: `epic`, `spec`, `plan`,
  `task` (alias `issue`) and `decision` (alias `adr`). `brainfile types`
  prints each with its place in the graph; `types add <name> --like <type>`
  takes a built-in's place (parents, children, completion rule, glyph).
- Containment by `parentId`: epic ▸ spec · plan · task, spec ▸ plan · task,
  plan ▸ task, task ▸ task. `list --tree` prints the outline (`--parent` for a
  subtree); `show` names the parent and children.
- `decisions: [ids]` on work: the decisions it rests on. `add --decisions`,
  `patch --decisions`; `show` lists them with where each stands and says when
  one is superseded, and a decision shows the work resting on it. The reverse
  is computed, never written.
- `patch --parent / --clear-parent` and `--depends-on / --clear-depends-on`;
  `add --depends-on`; `list --type` and `search --type`, aliases included.
- MCP: `task_add` and `task_patch` take `decisions` (and `dependsOn`);
  `list_tasks` takes `tree: true` and lists decisions with `type: "decision"`;
  `get_task` returns `graph`; `search` takes `type`.
- `/v2/decision.json`; `task.json` documents `parentId` and `decisions`;
  `board.json` documents `like`.
- Core: `docTypes` (registry, `resolveDocType`, `parentFit`) and `docGraph`
  (`buildDocGraph`, `docPlace`, `checkDocumentLinks`, `lintDocGraph`), both in
  `@brainfile/core/browser`; `readBoardGraph` and
  `findWorkOnSupersededDecisions` in the main entry.

### Changed (spec-12)
- A parent with open children refuses to complete, whatever its type (it was
  only epics); `--force` still overrides. A decision is never completed.
- An off-pattern parent (an epic under a task, anything under a decision) is a
  `lint` warning; on a `strict` board `add`, `patch` and `lint` refuse it. A
  `parentId` or `dependsOn` loop is always refused.
- `--type adr` writes `type: decision` with a `decision-N` ID, no column and
  `status: current`; `--type issue` writes a plain task. Existing `type: adr`
  files read as decisions and keep their IDs.
- A strict board accepts the five built-ins without listing them.
- New IDs use the type's `idPrefix` from `types:`; before, the prefix was
  always the type name whatever `idPrefix` said.
- `list` leaves decisions out of the columns (they have none) and says how
  many; `list --type decision` lists them. `brief` orients against current
  decisions as well as accepted ADRs.

## [0.21.2] - 2026-10-11

Descriptions come back whole, headings, dividers and all.

### Fixed
- A task description may carry headings and dividers of its own. Reading one
  stopped at its first `## ` heading, so `show`, `list --json`, search and the
  MCP tools returned only the text above it; it now runs to the `## Log` or
  `## Child Tasks` section brainfile writes itself.
- A `---` line inside a multi-line frontmatter value (a description saved by
  `patch`) no longer ends the frontmatter early. Only an unindented `---`
  closes it.
- `patch --description` edits the description where `add` wrote it, in the
  body, instead of adding a second copy to the frontmatter that the body's
  stale one then sat beside.

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
