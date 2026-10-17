---
id: task-128
title: Landing says what a checked-out branch is and how to free it
column: todo
position: 18
description: |-
  Feedback from hotline, 2026-10-16: a checked-out branch blocked a merge, and the reason wasn't clear.

  Today `landReview` (core/src/repo/worktree.ts ~830) refuses when the branch it lands on is checked out in another worktree: "`<into>` is checked out at `<path>`: merge or discard that first, then Merge again. Nothing was merged." That wording assumes the checkout is a hand-off's worktree (an epic's branch up for review). When it's the person's own second checkout, or another agent's (hotline keeps several), "merge or discard" is wrong advice.

  Fix: say what holds it and how to free it. For a hand-off's worktree, name its task (merge or discard task-N). For anything else, name the folder and say to switch it to another branch (`git -C <path> switch <other>`) or remove it (`git worktree remove <path>`). Then the lead, `brainfile land` and the window's Merge all pass the reason through. Also check the same case where an epic's branch or a `landsOn` branch is first made or refreshed (repo/target.ts), so a checkout there fails with the same words rather than a raw git error. First reproduce hotline's exact case: which branch was it, and which checkout held it?

  Tests: the refusal for a hand-off worktree names the task; for a plain checkout it gives the switch/remove advice.
priority: medium
tags:
  - dispatch
  - landing
relatedFiles:
  - core/src/repo/worktree.ts
contract:
  status: draft
  deliverables:
    - type: file
      path: core/src/repo/worktree.ts
      description: refusal names what holds the branch and how to free it
    - type: test
      path: core/src/__tests__
      description: refusal wording for a hand-off worktree and a plain checkout
  validation:
    commands:
      - npm run build
      - npm test
createdAt: "2026-10-16T15:12:39.024Z"
parentId: epic-11
updatedAt: "2026-10-17T05:09:30.586Z"
---

## Description
Feedback from hotline, 2026-10-16: a checked-out branch blocked a merge, and the reason wasn't clear.

Today `landReview` (core/src/repo/worktree.ts ~830) refuses when the branch it lands on is checked out in another worktree: "`<into>` is checked out at `<path>`: merge or discard that first, then Merge again. Nothing was merged." That wording assumes the checkout is a hand-off's worktree (an epic's branch up for review). When it's the person's own second checkout, or another agent's (hotline keeps several), "merge or discard" is wrong advice.

Fix: say what holds it and how to free it. For a hand-off's worktree, name its task (merge or discard task-N). For anything else, name the folder and say to switch it to another branch (`git -C <path> switch <other>`) or remove it (`git worktree remove <path>`). Then the lead, `brainfile land` and the window's Merge all pass the reason through. Also check the same case where an epic's branch or a `landsOn` branch is first made or refreshed (repo/target.ts), so a checkout there fails with the same words rather than a raw git error. First reproduce hotline's exact case: which branch was it, and which checkout held it?

Tests: the refusal for a hand-off worktree names the task; for a plain checkout it gives the switch/remove advice.
