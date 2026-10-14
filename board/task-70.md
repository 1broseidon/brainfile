---
id: task-70
title: "Ready to build an epic in the app: hand-offs survive merges, Merge checks then completes, hand-offs wait on dependencies"
column: review
position: 1
tags:
  - desktop
  - dispatch
  - git
parentId: epic-4
createdAt: "2026-10-14T20:43:02.831Z"
---

## Description
What stood between the person and building a whole epic from Brainfile Desktop on main, found 2026-10-14. (1) In dev, merging into the app's own code ended every running hand-off: the agents process was let go on each rebuild and Electron restarted on main/preload/host changes. Now the agents process writes how many agents are at work to BRAINFILE_DEV_BUSY (set by scripts/dev.mjs), and both the agents swap (main.ts) and the Electron restart (dev.mjs) wait for none, saying so once in the terminal. (2) Merge left the task in Review; merging is the person's yes, so the window completes it (a parent with open children stays, and says so). (3) Hand to... started a child whose dependsOn were still open, and the agent's pickup then refused: the task pane's key waits ('Waits on task-62') and the agents process refuses the same dispatch from the chat. (4) Merge ran no checks: it now runs the contract's validation in the hand-off's worktree first (async, 'Checking...'), merges nothing on a failure, toasts the first line and logs the end of the output on the task for Send back. Checks run on the branch as it is, not with the trunk merged in: that stays task-62.

## Log
- 2026-10-14T20:43:03.253Z: [claude] Built on main (uncommitted). worktree.ts: whyNotMerge, runChecks; agents.ts: checkThenMerge, the dispatch wait, markBusy; main.ts and scripts/dev.mjs wait while busy; state: completes after merge, logs failed checks; HandTo waitsOn; Merge keys read Checking.... 4 new tests in worktree.test.ts. Checked: offscreen on the demo board (a waiting dispatch refused, a failing check merged nothing and logged, a passing one merged from the feed and completed the task); the dev loop held an Electron restart while one agent was marked at work and restarted once it was not.
