---
id: epic-4
title: Agent work lands on one trunk
type: epic
column: todo
position: 2
priority: high
tags:
  - git
  - dispatch
  - desktop
decisions:
  - decision-11
  - decision-12
  - decision-13
createdAt: "2026-10-14T15:15:46.397Z"
---

## Description
Hand-offs fork from the trunk and land on it from their own worktree, checked first and moved by compare-and-swap; a conflict goes back to the agent, not the person; this repository keeps one trunk. Decisions 11, 12 and 13, from Anthropic's 'Redesigning source control' (2026-10-13) and a replay of this repository's merges: 4 of 27 conflicted, while the tending came from merging in the person's folder, integration branches and a main that had drifted 152 ahead and 7 behind origin. Left for later: review that leads with the contract and lets low-risk paths land once green, and an agent that watches the trunk after each landing.
