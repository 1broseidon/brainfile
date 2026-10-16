---
id: task-116
title: "Small follow-ups from the final pass: a reopened pull request, a net-empty branch \"already merged\", the brief's column and review wording, lead-watch cost, Windows paths"
column: todo
position: 15
description: |-
  From the final pass (2026-10-16); none blocks a release.
  - **A pull request closed, then reopened on GitHub** is never followed again (a `closed` record is final); it is seen only when `brainfile pr <task>` hits the 422 path. Follow `closed` records for a while, or on demand.
  - **`landedIn` treats a net-empty branch as merged** (its merge-tree equals the target's tree), so Merge says "already in" and deletes a branch whose changes were undone rather than landed. Say so instead.
  - **The brief hard-codes "move to In Progress"** (brief.ts ≈146) though a board's column may be named otherwise, and `workplace()` says "a person reviews and merges the branch" even when the hand-off runs until done. Read the column from the board; say what until means. (Goes with task-108's landing guide.)
  - **Lead-watch cost:** `leadOver()` → `readTree` → `unlanded()` spawns about four git calls per completed child on every busy/reserve/ledBy/wake; `stampOf` stats every board and logs file every 2 s while a lead runs; `whyNot`/`agentEnv` spawn `which` per call. Cache per tick.
  - **A runner blocked more than 30 s** (a long synchronous git call) misses its beats; its own lead claim then reads as lost and `follow()` stops itself, to be re-taken next pass. Noisy, not wrong: lengthen the window or beat from a timer that can't be blocked.
  - **`atomicWriteFileSync`'s `.task-N.md.tmp-*`** sits in board/ briefly; a concurrent `git add -A` can commit it. Write temp files under state/ and rename across (same volume) or exclude the pattern.
  - **Windows:** `/usr/bin/which`, `/usr/bin/ditto`, `:` PATH joins in core/dispatch are Mac/Linux only, though `dataDir` has a win32 branch. Decide whether Windows is a target; if not, say so in core/README.
  - `isBranchName('HEAD')` is true; git refuses it. `dotDirOf` caches null for a board created later in the process's life. `pr.ts`/`issues.ts` take `dirname(dirname(brainfilePath))` as the project while dispatch uses `projectOfBoard`; they differ for bare or common-dir layouts.
tags:
  - core
  - dispatch
  - follow-up
relatedFiles:
  - core/src/forge/handOffPullRequest.ts
  - core/src/repo/worktree.ts
  - core/src/dispatch/brief.ts
  - core/src/dispatch/runner.ts
  - core/src/dispatch/lead.ts
createdAt: "2026-10-16T04:50:10.468Z"
---

## Description
From the final pass (2026-10-16); none blocks a release.
- **A pull request closed, then reopened on GitHub** is never followed again (a `closed` record is final); it is seen only when `brainfile pr <task>` hits the 422 path. Follow `closed` records for a while, or on demand.
- **`landedIn` treats a net-empty branch as merged** (its merge-tree equals the target's tree), so Merge says "already in" and deletes a branch whose changes were undone rather than landed. Say so instead.
- **The brief hard-codes "move to In Progress"** (brief.ts ≈146) though a board's column may be named otherwise, and `workplace()` says "a person reviews and merges the branch" even when the hand-off runs until done. Read the column from the board; say what until means. (Goes with task-108's landing guide.)
- **Lead-watch cost:** `leadOver()` → `readTree` → `unlanded()` spawns about four git calls per completed child on every busy/reserve/ledBy/wake; `stampOf` stats every board and logs file every 2 s while a lead runs; `whyNot`/`agentEnv` spawn `which` per call. Cache per tick.
- **A runner blocked more than 30 s** (a long synchronous git call) misses its beats; its own lead claim then reads as lost and `follow()` stops itself, to be re-taken next pass. Noisy, not wrong: lengthen the window or beat from a timer that can't be blocked.
- **`atomicWriteFileSync`'s `.task-N.md.tmp-*`** sits in board/ briefly; a concurrent `git add -A` can commit it. Write temp files under state/ and rename across (same volume) or exclude the pattern.
- **Windows:** `/usr/bin/which`, `/usr/bin/ditto`, `:` PATH joins in core/dispatch are Mac/Linux only, though `dataDir` has a win32 branch. Decide whether Windows is a target; if not, say so in core/README.
- `isBranchName('HEAD')` is true; git refuses it. `dotDirOf` caches null for a board created later in the process's life. `pr.ts`/`issues.ts` take `dirname(dirname(brainfilePath))` as the project while dispatch uses `projectOfBoard`; they differ for bare or common-dir layouts.
