---
id: task-118
title: "Final pass leftovers not in the fix batch: a hand-off with an open pull request, a late child after the epic is offered, show and land wording, a Settings line on roles, concurrency in Settings"
column: todo
position: 16
description: |-
  Small findings from the 2026-10-16 final pass that are not in the fix batch (see the "Final pass on today's work" task). Each is one change with a test.
  - **A task with an open pull request can be started:** `begin()` does not refuse a hand-off whose task carries `pullRequest: open`, and `pr --status` (which may complete the task and remove its worktree when the PR merged) checks for no live run because pr.ts holds no Runner. Refuse the start while a PR is open; have `pr --status` hold the task (the landing hold) while it follows.
  - **A late child after the epic is offered:** once `offerEpicBranch` checks the epic's branch out for review, a child handed off afterwards has its `bringIn` refused silently and its landing refused with "checked out at …". By design, but the lead is never told; put it in the lead's wake and the child's send-back note.
  - **`brainfile land` prints two lines on refusal** ("… has no commits to merge" then "Error: task-1 did not land") where `discard` prints one `Error:`; make them alike.
  - **`brainfile show -t` (human) shows no `dispatch:`** record, claim outcome or worktree; only `--json` and `review` do. Add a "Hand-off:" line (agent, model, by, at; claim held/ended with outcome; tries).
  - **`pr --status` for a discarded hand-off** still says "Merge it, or open another" though nothing is left to merge.
  - **Settings:** one line under the agents saying roles are a guardrail, not a security boundary (a worker in bypass can run anything in its shell), as the MANUAL says; and a field for the per-repository concurrency (`projects[<id>].concurrency`, default 3; the lead and the runner keep to it), which has no UI.
  - **Verify, then close or fix:** a lead that gives up used to stay "Leading", and an agent's ask did not wake the lead (noted 2026-10-15 before the lead moved into core). Check whether core's lead (task-83) and the runner's ask path changed this; if not, fix.
tags:
  - final-pass
  - follow-up
  - cli
  - desktop
  - core
relatedFiles:
  - core/src/dispatch/runner.ts
  - core/src/forge/handOffPullRequest.ts
  - cli/src/commands/pr.ts
  - cli/src/commands/show.ts
  - cli/src/commands/review.ts
  - desktop/src/renderer/components/Settings.svelte
subtasks:
  - id: task-118-1
    title: A start is refused while the task's pull request is open; pr --status holds the task
    completed: false
  - id: task-118-2
    title: "A late child after the epic is offered: the lead and the child's note say so"
    completed: false
  - id: task-118-3
    title: land and discard refuse alike, one Error line
    completed: false
  - id: task-118-4
    title: show -t prints the hand-off record and claim
    completed: false
  - id: task-118-5
    title: pr --status for a discarded hand-off says nothing is left to merge
    completed: false
  - id: task-118-6
    title: "Settings: the roles line and the concurrency field"
    completed: false
  - id: task-118-7
    title: Lead gives up → not Leading; an ask wakes the lead (verified or fixed)
    completed: false
  - id: task-118-8
    title: brainfile --help's "Common workflows" footer (cli/src/program.ts) shows only init/migrate/list/add/move and contract examples; add a hand-off example (dispatch, run, review, land)
    completed: false
  - id: task-118-9
    title: "One implementation of a landing's checks: core's runChecks takes a cancel hook (signal or onChild(kill)) and the Runner's check() uses it, instead of two copies of the detached-group logic"
    completed: false
createdAt: "2026-10-16T04:55:30.792Z"
updatedAt: "2026-10-16T05:47:55.529Z"
---

## Description
Small findings from the 2026-10-16 final pass that are not in the fix batch (see the "Final pass on today's work" task). Each is one change with a test.
- **A task with an open pull request can be started:** `begin()` does not refuse a hand-off whose task carries `pullRequest: open`, and `pr --status` (which may complete the task and remove its worktree when the PR merged) checks for no live run because pr.ts holds no Runner. Refuse the start while a PR is open; have `pr --status` hold the task (the landing hold) while it follows.
- **A late child after the epic is offered:** once `offerEpicBranch` checks the epic's branch out for review, a child handed off afterwards has its `bringIn` refused silently and its landing refused with "checked out at …". By design, but the lead is never told; put it in the lead's wake and the child's send-back note.
- **`brainfile land` prints two lines on refusal** ("… has no commits to merge" then "Error: task-1 did not land") where `discard` prints one `Error:`; make them alike.
- **`brainfile show -t` (human) shows no `dispatch:`** record, claim outcome or worktree; only `--json` and `review` do. Add a "Hand-off:" line (agent, model, by, at; claim held/ended with outcome; tries).
- **`pr --status` for a discarded hand-off** still says "Merge it, or open another" though nothing is left to merge.
- **Settings:** one line under the agents saying roles are a guardrail, not a security boundary (a worker in bypass can run anything in its shell), as the MANUAL says; and a field for the per-repository concurrency (`projects[<id>].concurrency`, default 3; the lead and the runner keep to it), which has no UI.
- **Verify, then close or fix:** a lead that gives up used to stay "Leading", and an agent's ask did not wake the lead (noted 2026-10-15 before the lead moved into core). Check whether core's lead (task-83) and the runner's ask path changed this; if not, fix.
