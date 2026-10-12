---
id: spec-12
title: "Default types and the graph: epic, spec, plan, task, decision"
type: spec
column: review
position: 0
tags:
  - types
  - graph
  - cli
  - mcp
  - desktop
createdAt: "2026-10-12T05:45:05.871Z"
subtasks:
  - id: spec-12-1
    title: "Core: built-in registry of the five with roles, aliases (issue, adr) and like: for custom types"
    completed: true
  - id: spec-12-2
    title: "Containment: allowed parents per type; parents cannot complete with open children; lint warns, strict refuses"
    completed: true
  - id: spec-12-3
    title: "decisions: edge on work, computed reverse, flag work resting on a superseded decision"
    completed: true
  - id: spec-12-4
    title: "CLI: add --parent checks, list --tree, show with edges, types lists the graph; MCP accepts aliases and decisions"
    completed: true
  - id: spec-12-5
    title: "Desktop: outline and glyphs per type; decisions leave the list for their own view"
    completed: true
  - id: spec-12-6
    title: "Docs and schemas: MANUAL, site/public/v2 schemas, llms.txt; init writes a short brainfile.md"
    completed: true
updatedAt: "2026-10-12T06:40:06.644Z"
parentId: epic-2
---

## Description
Every document is a file with frontmatter, so the board can be a graph and not only a list. Brainfile ships five types with opinions about what each is for and how they connect. Any other name still works, and can borrow a default's place. This board's own config already says it in prose ("Issues are tasks, larger arcs are epics with parentId children, design work starts as specs, decisions are ADRs"); this makes it the default for every board. spec-11's `decision` type is defined here.

**The five.**
- `epic`: an outcome worth several pieces of work. Holds specs, plans and tasks; done when everything under it is.
- `spec`: what to build and why: behaviour, scope, what is not in scope. Holds plans and tasks.
- `plan`: how, and in what order. Holds tasks; done when they are.
- `task` (alias `issue`): one piece of work a person or an agent can pick up; may carry a contract and subtasks. Holds tasks.
- `decision` (alias `adr`): a standing choice (spec-11). Not work: no column, never completed; current until superseded, rejected or stale.

**Aliases.** `issue` and `adr` are accepted wherever a type is (`add --type`, filters, MCP) and new documents are written as `task` and `decision`. Existing `type: adr` files read as decisions and keep their IDs.

**Containment is the tree.** `parentId` stays the one parent link, and the defaults say which parents fit:

    epic  ▸ spec · plan · task
    spec  ▸ plan · task
    plan  ▸ task
    task  ▸ task

A parent cannot complete while it has open children: epic's rule today, now every container's. An off-pattern parent (an epic under a task, a decision anywhere) is a lint warning; on a `strict` board it is refused.

**The other edges are few and named.**
- `dependsOn`: order between pieces of work, across boards too (spec-10).
- `decisions: [decision-3]`: on any piece of work, the decisions it rests on. The reverse is computed, never written twice. When a decision is superseded, open work resting on it says so ("rests on a superseded decision") in `show`, `brief` and the app.
- `supersedes` / `supersededBy`: between decisions only.

**Your own names.** A type in `types:` can take a default's place with `like:`: `bug: { like: task }`, `rfc: { like: spec }`, `story: { like: task }`. It gets that type's parents, children, completion rule and glyph. A type with no `like` behaves as a task does today.

**Built in, not configured.** A new board's `brainfile.md` stays short: the five exist without being listed, and `types:` names only additions and overrides. `brainfile types` lists every type with its place in the graph.

**Where it shows.**
- CLI: `add --type spec --parent epic-2`; `list --tree` prints the outline; `show` names parent, children, dependsOn and decisions.
- MCP: tools accept the aliases and `decisions`; `list_tasks` can return the tree.
- Desktop: the list's outline already nests by parentId and now follows the five; each keeps its TUI glyph (▸ epic, ◆ spec, ⎘ plan, ● decision); decisions leave the list for their own view (spec-11).

**Not in scope.** More than one parent, arbitrary named edges, a graph canvas.

## Log
- 2026-10-12T06:27:55.007Z: [claude] Step 0 + core/CLI/MCP landed on feat/memory-graph (b517b30..95a5a37): patch --parent/--depends-on (+MCP dependsOn); core docTypes.ts (registry, aliases, like:, parentFit) and docGraph.ts (tree, decisions reverse, checkDocumentLinks, lintDocGraph, docPlace) + boardGraph.ts; completion gate for every container; decisions never completed; add/patch/list --tree/--type/show/types/lint/search/plan/complete and MCP task_add/task_patch/list_tasks(tree)/get_task(graph)/search/task_complete. Core 752/752; CLI 517 pass / 9 fail (same 9 baseline); TUI 129/129. Smoke-tested the real binary on /tmp scratch board incl. strict refusals and MCP over stdio.
- 2026-10-12T06:33:23.980Z: [claude] Docs and schemas landed (20ae859): MANUAL Document types rewritten around the five + graph table, commands updated (add/patch/list --tree/--type/show/complete/search/plan/adr/types/lint, MCP table); /v2/decision.json new; task.json documents parentId + decisions and no longer requires a column on decisions; adr.json reads as the alias; board.json typeEntry gains like (idPrefix optional); bundled CLI board.json, llms-install.txt, READMEs, CHANGELOG Unreleased. init's brainfile.md stays short (no types:). Final: npm run build OK; core 752/752, CLI 519 pass / 9 fail (identical 9 baseline failures), TUI 129/129. Desktop subtask left open; desktop/ untouched. Desktop API: @brainfile/core/browser exports DOC_TYPES, TYPE_ALIASES, TYPE_GLYPHS, resolveDocType, typeGlyph, parentFit, listDocTypes, buildDocGraph, docPlace, decisionStatus; main entry adds readBoardGraph and findWorkOnSupersededDecisions.
- 2026-10-12T06:33:33.861Z: [claude] Decision: calls made where spec-12 was silent. (1) Entries under an alias name in types: (adr, issue) do not configure the canonical type; this board's types.adr is now inert (brainfile types says so) and new decisions here get decision-N IDs, existing adr-1/adr-2 keep theirs. (2) New IDs honour idPrefix from types: (before, the prefix was always the type name). (3) task is always completable and decision never, whatever config says; any other explicit completable wins (plan stays non-completable on this board). (4) The open-children gate covers every type with parentId children, task under task included; decision children never count; epic keeps the legacy subtasks-as-children fallback; any container that had children gets the Child Tasks section in its archive. (5) Decision status: none = current for type decision, proposed for legacy type adr; accepted/promoted read current, deprecated stale; supersededBy set = superseded. add --type decision/adr writes no column and status: current. (6) Strict boards accept the five without a types: map, and now refuse unknown custom types even when types: is absent. (7) Off-pattern = warning, refused on strict at write (add, patch, plan add/link, MCP task_add/task_patch) and an error in strict lint; loops and self links are always refused; IDs not on the board only warn; decisions: naming a non-decision or set on a decision, dependsOn touching a decision, and supersedes on work count as off-pattern. (8) list leaves decisions out of the columns with a count hint and list --type decision lists them (board+logs, current first) - this overlaps spec-11's 'list leaves decisions out', done here because decisions have no column. (9) list --tree shows a dim dot for plain tasks (TUI table keeps none), orders by column then position, keeps ancestors as dim context under filters, --parent gives a subtree. (10) MCP list_tasks tree is flat pre-order with depth/parentId/children so both protocol eras advertise an object schema. (11) like: may chain through custom types; loops behave as task; types add refuses alias names and unknown like. (12) brief now counts current decisions as well as accepted ADRs, but does not yet say 'rests on a superseded decision' - spec-11 rebuilds brief; the hook is findWorkOnSupersededDecisions()/graph.openWorkOnSupersededDecisions()/docPlace().restsOnSuperseded. (13) Left as is: adr promote (legacy adr only), move does not refuse a decision, ledger record types (task/epic/adr).
- 2026-10-12T06:40:03.261Z: [claude] Desktop (00e046d on feat/memory-graph): roles and glyphs come from core; decisions leave the list and board for a Decisions view (flag key, D) grouped by claim-key family with history folded; task pane shows decision fields, chain and resting work; rows flag 'decision changed'. Verified in the app on this board (adr-1, adr-2 show as standing decisions; epic-2 outline nests spec-11/12).
