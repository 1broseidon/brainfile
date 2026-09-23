---
id: task-17
title: migrate --to-branch loses uncommitted board edits and leaves partial state on failure
priority: critical
tags:
  - bug
  - migrate
  - tracked-board
  - data-loss
relatedFiles:
  - cli/src/commands/migrate-tracked.ts
createdAt: "2026-09-23T03:05:55.594Z"
updatedAt: "2026-09-23T03:40:47.304Z"
completedAt: "2026-09-23T03:40:47.304Z"
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
- 2026-09-23T03:19:49.080Z: [claude] Fix ready for review on branch fix/migrate-to-branch-data-loss (worktree ../brainfile-migrate-fix): 3fc218b fix+tests, c5d3831 CHANGELOG/MANUAL. migrate-tracked.ts: after worktree add, mirror the original dir over the worktree (edits, untracked, ignored-but-present, deletions) and commit 'import uncommitted board changes' when dirty; verify by sha256 per file before deleting the aside copy; one MigrationRollback for all --to-branch paths (remove worktree judged by what exists, restore dir, delete branch this run created, git reset -- <board> + re-apply previously staged board changes). 9 new tests in board-repo.test.ts (8 fail on old code). npm test: core 642/642, cli 447/447, tui 129/129; tsc clean; cli also green at --maxWorkers=2. E2E with built CLI: scenario 1 edit kept (exit 0), scenario 2 new task kept (exit 0), cymbal-like partly force-added board all 6 files kept and committed on the board branch, forced failure (failing post-checkout hook) exit 1 with repo/index/branches/worktrees/board byte-identical to before; re-run then succeeds. E2E caught one gap fixed before commit: git worktree add can register the worktree then fail. Not pushed, no PR.
- 2026-09-23T03:40:47.042Z: Reviewed and merged to main (ff 3fc218b, c5d3831). Follow-up 2ec: history path now writes .gitattributes + merge driver as its own commit; .gitkeep backfill for older boards commits as 'chore: keep board/ and logs/ in git' instead of under the next command. Full matrix green incl. cli --maxWorkers=2. Not pushed.
