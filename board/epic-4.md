---
id: epic-4
title: Agent work lands on one trunk
type: epic
column: todo
position: 2
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
updatedAt: "2026-10-14T19:11:55.745Z"
---

## Description
Hand-offs fork from the trunk and land on it from their own worktree, checked first and moved by compare-and-swap; a conflict goes back to the agent, not the person; this repository keeps one trunk. Decisions 11, 12 and 13, from Anthropic's 'Redesigning source control' (2026-10-13) and a replay of this repository's merges: 4 of 27 conflicted, while the tending came from merging in the person's folder, integration branches and a main that had drifted 152 ahead and 7 behind origin. Left for later: review that leads with the contract and lets low-risk paths land once green, and an agent that watches the trunk after each landing.

## Log
- 2026-10-14T18:48:19.859Z: [claude] decision-15: epic-4 is meant to be the first epic a lead runs (spec-16 phase 2). Landing (task-62) is not a prerequisite for the lead; until it lands, children end in Review.
- 2026-10-14T19:11:57.459Z: [claude] [claude] Priorities reset by the definitions in task-68: task-61 high (next, blocks task-62); task-60, 62, 63 medium; task-64 low; the epic itself none, its urgency is its children's. They were all high because I filed them so.
