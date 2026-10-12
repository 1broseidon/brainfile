---
id: spec-10
title: "Related boards: name sister repos, dependsOn across them, list them"
type: spec
tags:
  - boards
  - cli
  - mcp
  - desktop
createdAt: "2026-10-12T02:12:52.102Z"
completedAt: "2026-10-12T03:14:34.951Z"
updatedAt: "2026-10-12T03:14:34.951Z"
---

## Description
Boards can name sister boards in other repos so a task can point at one. Writing to a sister needs nothing new: the CLI and MCP tools already work in that repo's own directory. So the scope is only awareness, cross-repo dependsOn, and listing.

**Awareness.** `brainfile.md` gets a `related:` map of short names to repo folders, relative to this repo's root, committed with the board:

    related:
      mobile: ../hotline-mobile

**References.** `mobile:task-12` is valid anywhere a task ID is: `dependsOn`, `show`, MCP tool arguments. The prefix resolves to that folder's board exactly as running `brainfile` in that folder would, including the branch worktree.

**dependsOn across repos.** A task that depends on `mobile:task-12` is blocked until that task is completed there (it is in that board's logs/). Contract readiness uses the same rule.

**Listing.** `brainfile list --related` shows the open tasks on related boards that this board's tasks depend on; `--related all` shows every related board's open tasks. MCP list gets the same option.

**When the folder is missing.** The reference stays valid; show and list say the board is not on this machine, and dependsOn treats it as not done.

**Not in scope.** No remote fetch, no cache, no cross-repo writes, no sync. The desktop app picks the feature up from core (related projects grouped in the rail, linked tasks named in the task pane) once it lands.
