---
id: task-17
title: migrate --to-branch loses uncommitted board edits and leaves partial state on failure
column: in-progress
position: 0
priority: critical
tags:
  - bug
  - migrate
  - tracked-board
  - data-loss
relatedFiles:
  - cli/src/commands/migrate-tracked.ts
createdAt: "2026-09-23T03:05:55.594Z"
updatedAt: "2026-09-23T03:09:11.079Z"
---

## Description
Reproduced 2026-09-22 with brainfile 0.20.0 on scratch repos (board committed on the code branch, the `trackedOnCodeBranch` path in migrateToBranch).

1. Silent data loss. Commit a board, append a line to .brainfile/board/task-1.md without committing, run `brainfile migrate --to-branch`. It exits 0, prints "the board itself is safe", and the edit is gone. Cause: the new branch comes from `git subtree split` (committed history only), the worktree is checked out from it, and verifyAndFinish compares file lists, not contents, then deletes the aside copy.

2. Failure leaves partial state. Commit a board, add a task without committing, run the migration. It fails with "Board contents differ after migration; the original directory was restored", exit 1, but leaves: the board staged for deletion on the code branch (`git rm --cached` already ran), a new `brainfile` branch, and a prunable worktree registration. A re-run then refuses because the branch exists.

The common real-world trigger: boards that are partly committed (for example `.brainfile/` in .gitignore with some files force-added; cymbal has 11 of 22 files committed) or that have fresh tasks not yet committed.

Fix:
- After `git worktree add` in the split path, copy the aside contents over the worktree (copyBoardContents, as the orphan path already does) and commitBoard "import uncommitted board changes" when dirty, so committed history plus working-tree state both survive.
- verifyAndFinish compares contents (hash each file), not just names, before deleting the aside copy.
- On any failure after the split: `git worktree remove --force` (or prune), delete the branch the migration created, and `git reset -q -- <relDotDir>` so the index is back where it started.
- Tests: uncommitted edit preserved; untracked task preserved; ignored-but-present files preserved; failure leaves no branch, no worktree entry, no staged change.

## Log
- 2026-09-23T03:10:52.269Z: [claude] Picked up. Working on branch fix/migrate-to-branch-data-loss in worktree ../brainfile-migrate-fix (from local main cf61f36). Plan: mirror aside contents (incl. deletions) over the split worktree + import commit; content-hash verify; one rollback helper (worktree, branch, index, aside) shared by all --to-branch paths.
