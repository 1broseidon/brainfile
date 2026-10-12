---
id: decision-1
title: Writes refuse only when the board they would land on is in doubt
type: decision
status: current
claimKey: board.integrity.write-guard
kind: decision
createdAt: "2026-10-12T20:44:49.182Z"
---

## Description
Two homes count as two boards: the folder in the checkout (plain, its own repo, or tracked by the code branch) and the board-branch lineage (local branch, origin's refs/brainfile/<name>). Writes refuse when the located board and the other home differ in content, containment included, because writing to the stale side is exactly runprism's failure. Within the lineage, ahead/behind/diverged with a shared ancestor is sync state, not two boards; unrelated histories are two boards. A code-branch copy of .brainfile/ next to a .brainfile/ that is the board-branch worktree is reported (where, desktop health: tracked twice) but does not block, since writes cannot reach it. Detection is offline by default; where --fetch and the desktop refresh origin's ref first.
