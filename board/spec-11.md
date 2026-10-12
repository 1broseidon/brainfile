---
id: spec-11
title: "Memory: fold recoil into Brainfile (decisions on the board, a local index, one brief)"
type: spec
column: review
position: 1
tags:
  - memory
  - recoil
  - search
  - cli
  - mcp
  - desktop
createdAt: "2026-10-12T05:36:52.024Z"
subtasks:
  - id: spec-11-1
    title: "Decision type: frontmatter, board/ while current, logs/ once superseded; ADRs fold in; list leaves decisions out"
    completed: true
  - id: spec-11-2
    title: decide and supersede commands with auto-supersede by claim key; MCP decide
    completed: true
  - id: spec-11-3
    title: "Local index: node:sqlite FTS5 in state/, mining with hash tracking and .gitignore, fallback to the scan"
    completed: true
  - id: spec-11-4
    title: "One search over the index: current first, history lane, path and line range on every hit"
    completed: true
  - id: spec-11-5
    title: "brief takes over wake: budgeted lanes; SessionStart hook injects it from a lean entry under 300ms"
    completed: true
  - id: spec-11-6
    title: check with stance rule and predicates (validUntil, source unchanged, package version); MCP check
    completed: true
  - id: spec-11-7
    title: "Desktop: Decisions view; decisions carried in Hand to… and chat briefs"
    completed: true
  - id: spec-11-8
    title: "Recoil: last release pointing to Brainfile, archive (owner's call)"
    completed: false
updatedAt: "2026-10-12T07:26:41.014Z"
parentId: epic-2
dependsOn:
  - spec-12
---

## Description
Recoil (Go, SQLite, one database per machine) keeps agents' decisions, handoffs and an index of project docs. Its memory never leaves the machine it was written on: on the Mac Studio it holds 1,090 indexed doc chunks and not one decision, and `.recoil/` is excluded from git. Brainfile already carries state between machines (the board branch, `refs/brainfile/*`, the field-level merge driver), already has ADRs whose `supersededBy` nothing reads, and both tools install a SessionStart hook. So memory moves into Brainfile, rebuilt on Brainfile's ground rather than ported line for line. Old recoil records are not imported. This replaces adr-2's split ("durable decisions live in ADRs (board) and recoil (lifecycle, supersession)"): both now live on the board.

**Decisions are documents.** A `decision` type, and ADRs fold into it. Frontmatter: `claimKey` (dotted, e.g. `dependency.http-client`), `kind` (decision, preference, constraint, rule), `status` (current, superseded, rejected, stale), `stance` (prefers, rejects, requires, forbids) and `subject`, `holdsWhile`, `recheck`, `validUntil`, `supersedes` / `supersededBy`. The body is the decision and why. A current decision lives in `board/`, a superseded or rejected one in `logs/`; no column, not completable, and `list` leaves decisions out unless asked (`--type decision`). They commit, sync and merge exactly like tasks; nothing new in the repo layer.

**Writing them.** `brainfile decide --claim-key k "text"` (with `--kind --stance --subject --holds-while --recheck --valid-until`) creates one; if the family already has a current decision, that one is superseded: status, links both ways, moved to `logs/`. `brainfile supersede <id> "text"` does it by hand. MCP gets `decide`. One commit per command, as now.

**Handoffs need no new type.** Next steps are tasks, what was settled is decisions, what happened is a note on the task (and the ledger on completion); `brief` already reads all three.

**A local index.** `.brainfile/state/index.db`, gitignored and rebuildable, never the source of truth: `node:sqlite` with FTS5 (verified on Node 26 here) over board and logs documents, the ledger, `plans/`, and the repo's own markdown (README, AGENTS.md, docs/), hash-tracked so a changed file replaces its chunks. Mining keeps recoil's rules (markdown and text, 256 KiB cap, skip .git, node_modules, dist and the like) and also honours `.gitignore`, which recoil did not. Where `node:sqlite` is missing (Node below 22.13), search falls back to today's scan over board and logs, and nothing fails. No native dependency: better-sqlite3 would break the single-file bundle and need an Electron rebuild.

**One search.** `brainfile search` and MCP `search` use the index when it is there: current results first, history (superseded decisions, completed work) in its own lane, every hit with its path and line range.

**One brief.** `brief` takes over recoil's `wake`: a budgeted session-start block (about 1,600 characters by default) in lanes: current decisions, your tasks, what changed since your checkpoint, and the docs that bear on them. The SessionStart hook runs it and injects the result; today it only prints a reminder. The hook path has to start fast: a lean entry that does not load ink or react, timed against a target of 300ms warm.

**Check.** `brainfile check "<action>"` finds the claim family an action touches and answers use, review, use_replacement or no_decision, with recoil's stance rule (the subject next to an adopt or remove cue) and the predicates worth keeping: `validUntil`, a source file unchanged since the decision, a package version. MCP gets `check`.

**Desktop.** A Decisions view per project beside list and board: current decisions grouped by claim-key prefix, superseded ones under the hand. Hand to… and the chat carry current decisions in their brief.

**Not in scope.** Importing old recoil records; mining agent transcripts (session evidence); embeddings and hybrid search; the tray (the desktop app has one); recoil's benchmark suites and benchmark-tuned heuristics; syncing the index (each machine rebuilds it from the synced files).

**Recoil afterwards.** Once brief, search and check land here, recoil gets a last release whose README points to Brainfile, and the repo is archived; owner's call at the time.

## Log
- 2026-10-12T07:22:08.617Z: [claude] Subtask 1 (decision type) was delivered by spec-12 (39188f1..20ae859): decision type and aliases, no column, status current, board/ while current, list leaves decisions out, show flags rests-on-superseded. spec-11 builds on it; toggled as done.
- 2026-10-12T07:22:09.204Z: [claude] Core landed on feat/memory-graph (4d63abd, 5b4d8c6, 45e109b): core/src/decisions.ts (claim families, stance rule, predicates, recoil verdict order; also in ./browser), decisionOperations.ts (decideFile auto-supersede to logs/ with links both ways, supersedeDecisionFile, retireDecisionFile, sha256 source + package.json/go.mod/pyproject predicates resolved against the project root), and the Node-only @brainfile/core/memory (node:sqlite via process.getBuiltinModule in try/catch, FTS5 index in state/index.db with size+mtime+sha256 tracking, searchMemory with scan fallback, composeBrief, checkDecision). Core 837/837.
- 2026-10-12T07:22:10.079Z: [claude] CLI + MCP landed (dfcc4aa, 841c807, 2315a01): decide/supersede/retire, check (exit 0 use|no_decision, 2 review, 3 use_replacement, 1 error), index [--rebuild|--status], search over the index (current first, history lane, path+lines, --json/--limit/--no-history, filter tokens kept), brief as the budgeted block (--max-chars, default 1600), hooks session-start injects it (Claude Code additionalContext) from a lean entry dist/hook.mjs (no commander/MCP/ink). MCP: decide, supersede, check (14 tools), search and brief upgraded. Hook warm: 130-140ms on this board (old reminder hook ~150ms).
- 2026-10-12T07:23:19.186Z: [claude] Decision: judgement calls for spec-11. (1) node:sqlite is loaded with process.getBuiltinModule('node:sqlite') inside try/catch, not await import(): lazy and failure-safe, keeps search/brief/check synchronous, invisible to esbuild and jest (also listed external). Node < 20.16 has no getBuiltinModule and falls back like Node < 22.13; verified on real Node 20.20.2 (scan everywhere, hook works), 24.21 and 26.11 (index, clean stderr). BRAINFILE_INDEX=off forces the scan. (2) engines stays >=20; a bump to >=22.13 would make the index always-on: George decides. (3) The index lives in a new Node-only subpath @brainfile/core/memory; main and ./browser never reach sqlite (browser-entry test). It is created on first use and refreshed on every read, not only when index.db exists. (4) Retiring is 'brainfile retire <id> --as rejected|stale [--note]'; MCP gets decide, supersede, check only (retire over MCP left to spec-13). 'Link context' is decide --for <work ids> (adds to their decisions:), no --parent. (5) Claim keys are lowercased; prefixes match by segment. A decision without a claimKey (legacy ADRs) is a family of one for check. Re-deciding the same words+stance is a no-op duplicate. Title = first sentence when more follows; body = full text. (6) Retired decisions go to logs/ with status/supersededBy, no completedAt, no ledger line; the legacy markdown-ledger fallback, log --recent and MCP recent skip them. (7) New frontmatter: sourcePath (relative to the project root, through symlinks) + sourceHash (sha256:), packageVersion (name<op>version; == also accepts equal version numbers, so ^4.3.6 == 4.3.6). Predicates resolve against the project root, never cwd. (8) check keeps four verdicts: recoil's 'ignore' (a historical decision named by ID with no replacement) is review/ignore_decision; the family search ignores action-cue words (use, add, switch, drop…); holdsWhile is an advisory whenever no predicate broke; the stance rule is ported as is (subject right after the cue: 'switch the client to axios' is a plain use, 'use axios' is caught). Exit codes 0 use/no_decision, 2 review, 3 use_replacement, 1 error. (9) Search: single words are FTS prefix terms, compound words (task-1, dependency.http-client) phrases; one-letter and filter-only queries scan (old substring behaviour); IDs and type names are not FTS text, exact IDs are looked up and ranked first; 20 per lane by default (was unlimited); a ledger record yields to its logs/ doc; small path priors (AGENTS/CLAUDE/README up, changelog/fixtures/public down) instead of recoil's tuned source-quality heuristics. (10) Mining: git ls-files -co --exclude-standard + recoil's skip list, 256 KiB, 5,000-file ceiling, never home or /; root AGENTS.md and CLAUDE.md are indexed even when gitignored; extensionless README-like names only (recoil also took e.g. security.ts). Index schema 2; a corrupt or older db rebuilds itself. (11) Brief: buildBrief and the JSON 'lanes' are unchanged (envelope stays 0.1); the block is 'sections' + 'text'. Lanes: '!' heads-up lines (work resting on superseded decisions, current decisions whose predicates broke), current decisions, your tasks or 'In flight' when nothing is assigned (columns named progress/doing/review/active/wip, else all but the first), changes since the checkpoint incl. decisions made/retired (or latest notes+completions on a first brief; 'Nothing new since your last brief.' when empty), docs = AND of each task title's 3 rarest terms relaxing to 1 over repo docs+plans. Tight budgets: every lane a short first line, grown evenly, then fill. (12) Hook: Claude Code gets JSON hookSpecificOutput.additionalContext, Cline/terminal text, Cursor's stop event keeps the old reminder; agent = BRAINFILE_AGENT else the tool; it advances that agent's checkpoint; index refresh capped at 120ms; no sync; the launcher routes exactly 'hooks session-start' to dist/hook.mjs. (13) Not done here: Desktop subtask (desktop/ untouched) and Recoil last release (owner's call). Desktop API: groupDecisionsByPrefix / readDecisionDocs / summarizeDecision + decideFile / supersedeDecisionFile / retireDecisionFile (main), searchMemory, composeBrief, checkDecision / checkClaimKeyPrefix / checkExitCode (@brainfile/core/memory).
