---
id: spec-18
title: "Where a hand-off lands: a target branch per task, pull requests as a landing, and an opt-in epic branch"
type: spec
column: todo
position: 4
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
    completed: false
  - id: spec-18-2
    title: "Fork from and land on the task's target: prepareWorktree, the conflict preview, landReview and send-back"
    completed: false
  - id: spec-18-3
    title: Hand to… shows Lands on <branch> with a picker, written to the task
    completed: false
  - id: spec-18-4
    title: "Open pull request beside Merge: push, open against the target, leave Ready to merge, show the PR on the task, feed and phone"
    completed: false
  - id: spec-18-5
    title: A pull request merged on the forge completes the task and removes its worktree; closed unmerged returns it to Ready to merge
    completed: false
  - id: spec-18-6
    title: "epicBranch on an epic: the lead makes dispatch/<epic-id> from the epic's target; children land on it and their worktrees go"
    completed: false
  - id: spec-18-7
    title: The lead brings the epic's target into the epic branch before each hand-off; a conflict goes back to an agent
    completed: false
  - id: spec-18-8
    title: "The epic in Ready to merge when its last child is done; Merge asks: target, another branch, pull request, or keep"
    completed: false
  - id: spec-18-9
    title: "Docs: MANUAL, desktop README and design.md; a changelog fragment"
    completed: false
createdAt: "2026-10-15T04:26:27.402Z"
---

## Description
Carries out decision-16. Today every hand-off forks from the trunk and lands on it (decision-11, decision-12); the branch it goes into is already recorded per branch (`branch.dispatch/<id>.brainfileBase`) and `intoOf` honours it, but nothing sets it: `prepareWorktree` always forks from `trunkOf`.

Defaults stay as they are: no `landsOn` anywhere means the trunk, Merge lands there, no epic branch.

**Target branch.** `landsOn: <branch>` on a task, inherited from its parent up the tree. Core reads and writes it (task_patch, `brainfile edit`), lint warns when the branch does not exist locally or on origin. The hand-off forks from it (local branch, else origin's) and records it as brainfileBase; landing, the conflict preview and send-back use it. Hand to… shows "Lands on <branch>" with a picker (the trunk, branches, recent targets); a choice there is written to the task, so it outlives the run.

**Pull request as a landing.** Beside Merge in Review and in Ready to merge: Open pull request pushes dispatch/<id> and opens one against the task's target (GitHub first, through the forge code the desktop already has; `gh` or the API). The item leaves Ready to merge and shows the pull request (number, link, state) on the task and in the feed. Merged on the forge: landedIn already sees it, so the task completes (settleLanded) and the worktree and local branch go. Closed unmerged: back in Ready to merge. The phone and MCP see the same state.

**Epic branch (opt-in).** `epicBranch: true` on an epic. Its lead makes dispatch/<epic-id> from the epic's target when it starts; children inherit it as their target, so they fork from and land on it, and each child's worktree goes as it lands. Before each hand-off the lead brings the epic's target into the epic branch (decision-12's landing, the other way), so the branch does not drift; a conflict there goes back to an agent like any other. When the last child is done, the epic is one item in Ready to merge, and Merge asks where it goes: the target (default), another branch, a pull request, or kept as a branch. The lead's dependency rule reads "landed on its own target" (today's fix, desktop/src/agents/worktree.ts `unlanded`).

**Parity.** The field is board data, so brainfile run and MCP runners (epic-6: task-76, task-80, task-81) honour it; build the fork-and-land choice where task-76 moves worktrees into core rather than twice.
