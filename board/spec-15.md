---
id: spec-15
title: "Board integrity: one board per repo, detected, merged and backed up"
type: spec
column: todo
position: 3
priority: high
tags:
  - sync
  - git
  - integrity
  - cli
  - desktop
createdAt: "2026-10-12T19:03:41.963Z"
---

## Description
A repo should have one board, and Brainfile should know when it doesn't. runprism.ai (2026-10-12) had two: an old plain-files `.brainfile/` tracked on `main` (7 docs) and the newer `brainfile` branch with the Linear import (19 docs), checked out in a stray worktree under `/private/tmp`. `locateBoard` took the folder in the checkout without looking further, so the desktop showed the stale board as "folder" and the CLI would have kept writing to it; `migrate --to-branch` then failed on the branch being checked out elsewhere. An agent untangled it by hand (compared, backed up into `.git/brainfile-backup-2026-10-12`, adopted the branch, PR #2 to untrack `.brainfile/` on `main`). Nothing was lost, but only because it stopped and asked.

**Detect, never guess.** `locateBoard`, `brainfile where` and the desktop look for every board a repo has: a `.brainfile/` folder in the checkout (tracked by the code branch or not), the local `brainfile` branch, the remote's `refs/brainfile/*`, and any worktree of the board branch outside `.brainfile/`. When they disagree (different contents, not just one ahead of the other), nothing writes until the person chooses. `where` says what it found, with counts and last change; the desktop says it in one line in the board's band ("Two boards: this folder (7) and origin's (19, newer)") with Use origin's, Merge, Keep this one. Agents get the same answer as an error from every write, naming the command to resolve it.

**Merge is a command.** `brainfile merge-boards <ref|path>` combines two boards by document ID with the existing field-level merge (frontmatter fields last-writer-wins by `updatedAt`, logs unioned by timestamp, completion wins over edit). The same ID on two different documents (different `createdAt`, unrelated titles) keeps the older and gives the newer the next free ID, with a log line saying so and references rewritten. When one board already contains everything the other has (runprism's case), it reports that and adopts without a question. Also `brainfile adopt <ref>`: take that board as it is.

**Backups are refs.** Anything that replaces or merges a board first saves the current one to `refs/brainfile/backups/<UTC timestamp>`; `brainfile backups` lists them, `brainfile backups restore <name>` puts one back (itself backed up first). Backups stay local unless pushed by name.

**One home for the branch.** The board branch is checked out only at `.brainfile/` in the main worktree. A worktree of it anywhere else is reported by `where`, `lint` and the desktop; one whose folder is gone is pruned.

**Moving to the branch finishes the job.** `migrate --to-branch` also stops code branches tracking `.brainfile/` (git rm --cached, `.brainfile/` in `.gitignore`) in one commit on the current branch, and says to push it. A board tracked by a code branch while a board ref also exists is reported as two boards.

**Health says it.** The desktop's health covers: two boards, a stray board worktree, the board behind or ahead of the remote (not only "waiting to send"), the board tracked by the code branch, and a failed merge left half-done.

**Not in scope.** Two-way sync with Linear or GitHub Issues (a Linear import is a one-time copy; drift such as BRO-224's title and BRO-254's state is expected), and any server.
