---
id: epic-4
title: Agent work lands on one trunk
type: epic
tags:
  - git
  - dispatch
  - desktop
decisions:
  - decision-11
  - decision-12
  - decision-13
  - decision-15
createdAt: "2026-10-14T15:15:46.397Z"
updatedAt: "2026-10-14T21:16:24.929Z"
completedAt: "2026-10-14T21:16:24.929Z"
---

## Description
Hand-offs fork from the trunk and land on it from their own worktree, checked first and moved by compare-and-swap; a conflict goes back to the agent, not the person; this repository keeps one trunk. Decisions 11, 12 and 13, from Anthropic's 'Redesigning source control' (2026-10-13) and a replay of this repository's merges: 4 of 27 conflicted, while the tending came from merging in the person's folder, integration branches and a main that had drifted 152 ahead and 7 behind origin. Left for later: review that leads with the contract and lets low-risk paths land once green, and an agent that watches the trunk after each landing.

## Log
- 2026-10-14T18:48:19.859Z: [claude] decision-15: epic-4 is meant to be the first epic a lead runs (spec-16 phase 2). Landing (task-62) is not a prerequisite for the lead; until it lands, children end in Review.
- 2026-10-14T19:11:57.459Z: [claude] [claude] Priorities reset by the definitions in task-68: task-61 high (next, blocks task-62); task-60, 62, 63 medium; task-64 low; the epic itself none, its urgency is its children's. They were all high because I filed them so.

## Child Tasks
Summary: 7/7 children completed.
- task-60: One trunk for this repository: the release fixes in main, merged branches gone (completed)
- task-61: Hand-offs fork from the trunk, and a hand-off that only reads leaves no branch (completed)
- task-62: Merge lands from the worktree: a conflict said before, checks run there, the trunk moved by compare-and-swap (completed)
- task-63: A conflict goes back to the hand-off's agent (completed)
- task-64: Fewer shared files: changelog fragments, Settings sections gathered by glob (completed)
- task-69: A Ready to merge group at the top of the list, with Merge on the row (completed)
- task-70: Ready to build an epic in the app: hand-offs survive merges, Merge checks then completes, hand-offs wait on dependencies (completed)
