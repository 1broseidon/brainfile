---
id: spec-11
title: "Memory: fold recoil into Brainfile (decisions on the board, a local index, one brief)"
type: spec
column: todo
position: 4
tags:
  - memory
  - recoil
  - search
  - cli
  - mcp
  - desktop
createdAt: "2026-10-12T05:36:52.024Z"
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
