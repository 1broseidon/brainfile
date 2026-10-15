---
id: spec-18
title: "Where a hand-off lands: a target branch per task, pull requests as a landing, and an opt-in epic branch"
type: spec
description: |-
  Carries out decision-16. Today every hand-off forks from the trunk and lands on it (decision-11, decision-12); the branch it goes into is already recorded per branch (`branch.dispatch/<id>.brainfileBase`) and `intoOf` honours it, but nothing sets it: `prepareWorktree` always forks from `trunkOf`.

  Defaults stay as they are: no `landsOn` anywhere means the trunk, Merge lands there, no epic branch.

  **Target branch.** `landsOn: <branch>` on a task, inherited from its parent up the tree. Core reads and writes it (task_patch, `brainfile edit`), lint warns when the branch does not exist locally or on origin. The hand-off forks from it (local branch, else origin's) and records it as brainfileBase; landing, the conflict preview and send-back use it. Hand to… shows "Lands on <branch>" with a picker (the trunk, branches, recent targets); a choice there is written to the task, so it outlives the run.

  **Pull request as a landing.** Beside Merge in Review and in Ready to merge: Open pull request pushes dispatch/<id> and opens one against the task's target (GitHub first, through the forge code the desktop already has; `gh` or the API). The item leaves Ready to merge and shows the pull request (number, link, state) on the task and in the feed. Merged on the forge: landedIn already sees it, so the task completes (settleLanded) and the worktree and local branch go. Closed unmerged: back in Ready to merge. The phone and MCP see the same state.

  **Epic branch (opt-in).** `epicBranch: true` on an epic. Its lead makes dispatch/<epic-id> from the epic's target when it starts; children inherit it as their target, so they fork from and land on it, and each child's worktree goes as it lands. Before each hand-off the lead brings the epic's target into the epic branch (decision-12's landing, the other way), so the branch does not drift; a conflict there goes back to an agent like any other. When the last child is done, the epic is one item in Ready to merge, and Merge asks where it goes: the target (default), another branch, a pull request, or kept as a branch. The lead's dependency rule reads "landed on its own target" (today's fix, desktop/src/agents/worktree.ts `unlanded`).

  **Parity.** The field is board data, so brainfile run and MCP runners (epic-6: task-76, task-80, task-81) honour it; build the fork-and-land choice where task-76 moves worktrees into core rather than twice.
tags:
  - desktop
  - dispatch
  - worktree
  - landing
  - git
  - forge
relatedFiles:
  - desktop/src/agents/worktree.ts
  - desktop/src/agents/agents.ts
  - desktop/src/agents/lead.ts
  - desktop/src/main/forge.ts
  - desktop/src/main/github.ts
  - desktop/src/host/host.ts
  - core/src/types
decisions:
  - decision-16
  - decision-11
  - decision-12
  - decision-15
subtasks:
  - id: spec-18-1
    title: landsOn on a task, inherited from its parent; core read/write, task_patch and brainfile edit, lint for a missing branch
    completed: true
  - id: spec-18-2
    title: "Fork from and land on the task's target: prepareWorktree, the conflict preview, landReview and send-back"
    completed: true
  - id: spec-18-3
    title: Hand to… shows Lands on <branch> with a picker, written to the task
    completed: true
  - id: spec-18-4
    title: "Open pull request beside Merge: push, open against the target, leave Ready to merge, show the PR on the task, feed and phone"
    completed: true
  - id: spec-18-5
    title: A pull request merged on the forge completes the task and removes its worktree; closed unmerged returns it to Ready to merge
    completed: true
  - id: spec-18-6
    title: "epicBranch on an epic: the lead makes dispatch/<epic-id> from the epic's target; children land on it and their worktrees go"
    completed: true
  - id: spec-18-7
    title: The lead brings the epic's target into the epic branch before each hand-off; a conflict goes back to an agent
    completed: true
  - id: spec-18-8
    title: "The epic in Ready to merge when its last child is done; Merge asks: target, another branch, pull request, or keep"
    completed: true
  - id: spec-18-9
    title: "Docs: MANUAL, desktop README and design.md; a changelog fragment"
    completed: true
createdAt: "2026-10-15T04:26:27.402Z"
dependsOn:
  - task-76
updatedAt: "2026-10-15T21:18:24.770Z"
completedAt: "2026-10-15T21:18:24.770Z"
---

## Description
Carries out decision-16. Today every hand-off forks from the trunk and lands on it (decision-11, decision-12); the branch it goes into is already recorded per branch (`branch.dispatch/<id>.brainfileBase`) and `intoOf` honours it, but nothing sets it: `prepareWorktree` always forks from `trunkOf`.

Defaults stay as they are: no `landsOn` anywhere means the trunk, Merge lands there, no epic branch.

**Target branch.** `landsOn: <branch>` on a task, inherited from its parent up the tree. Core reads and writes it (task_patch, `brainfile edit`), lint warns when the branch does not exist locally or on origin. The hand-off forks from it (local branch, else origin's) and records it as brainfileBase; landing, the conflict preview and send-back use it. Hand to… shows "Lands on <branch>" with a picker (the trunk, branches, recent targets); a choice there is written to the task, so it outlives the run.

**Pull request as a landing.** Beside Merge in Review and in Ready to merge: Open pull request pushes dispatch/<id> and opens one against the task's target (GitHub first, through the forge code the desktop already has; `gh` or the API). The item leaves Ready to merge and shows the pull request (number, link, state) on the task and in the feed. Merged on the forge: landedIn already sees it, so the task completes (settleLanded) and the worktree and local branch go. Closed unmerged: back in Ready to merge. The phone and MCP see the same state.

**Epic branch (opt-in).** `epicBranch: true` on an epic. Its lead makes dispatch/<epic-id> from the epic's target when it starts; children inherit it as their target, so they fork from and land on it, and each child's worktree goes as it lands. Before each hand-off the lead brings the epic's target into the epic branch (decision-12's landing, the other way), so the branch does not drift; a conflict there goes back to an agent like any other. When the last child is done, the epic is one item in Ready to merge, and Merge asks where it goes: the target (default), another branch, a pull request, or kept as a branch. The lead's dependency rule reads "landed on its own target" (today's fix, desktop/src/agents/worktree.ts `unlanded`).

**Parity.** The field is board data, so brainfile run and MCP runners (epic-6: task-76, task-80, task-81) honour it; build the fork-and-land choice where task-76 moves worktrees into core rather than twice.

## Log
- 2026-10-15T04:39:03.994Z: [claude] From Hotline's epic-6 (2026-10-14): its children forked from and landed on a local main that was behind origin/main, so 57-59 landed where nobody looked and 60-63 never landed; the Hotline agent rebuilt them by hand as release/0.38.0, and task-66's worker had to fast-forward dispatch/task-66 onto release/0.38.0 itself. Fixed meanwhile (uncommitted): forking from origin's trunk when local is only behind, dependencies wait until their branch has landed, contract validate checks in the worktree and leaves the task open. Left for this spec: landing is local only and never pushes, so the app should say when the trunk is ahead of origin (Push, or Open pull request), and landsOn is what would have kept 0.38 on its release line.
- 2026-10-15T18:11:58.986Z: [claude] All nine subtasks built on parity/spec-18-target and parity/spec-18-pr, merged into parity/integration with review fixes (18a7aa1): landsOn/epicBranch fields + targetOf, core/src/repo/target.ts, Lands on picker, epic branch with bringIn before each hand-off and one Merge menu (target / another branch / pull request / keep); Open pull request (core forge openPullRequest/pullRequestState, Task.pullRequest, PullRequestWatch, brainfile pr, MCP pull_request); "main is N commits ahead of origin". Follow-ups: the phone cannot open a PR; PRs followed only while the app asks Ready to merge; GitHub only. Awaiting QA; nothing on main yet.
