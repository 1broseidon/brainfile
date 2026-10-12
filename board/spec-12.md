---
id: spec-12
title: "Default types and the graph: epic, spec, plan, task, decision"
type: spec
column: todo
position: 5
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
    completed: false
  - id: spec-12-2
    title: "Containment: allowed parents per type; parents cannot complete with open children; lint warns, strict refuses"
    completed: false
updatedAt: "2026-10-12T05:45:06.444Z"
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
