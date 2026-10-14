---
id: task-63
title: A conflict goes back to the hand-off's agent
priority: medium
tags:
  - git
  - dispatch
  - desktop
  - agents
relatedFiles:
  - desktop/src/agents/agents.ts
  - desktop/src/agents/worktree.ts
parentId: epic-4
dependsOn:
  - task-62
decisions:
  - decision-12
contract:
  status: delivered
  deliverables:
    - type: file
      path: desktop/src/agents/agents.ts
      description: Send-back on conflict
    - type: test
      path: desktop/test/worktree.test.ts
      description: A conflict is sent back with its files and tasks
  validation:
    commands:
      - cd desktop && npm run typecheck && npm test
  metrics:
    pickedUpAt: "2026-10-14T20:55:43.223Z"
    reworkCount: 0
    deliveredAt: "2026-10-14T21:00:35.112Z"
    duration: 292
createdAt: "2026-10-14T15:16:10.374Z"
updatedAt: "2026-10-14T21:16:24.095Z"
completedAt: "2026-10-14T21:16:24.095Z"
---

## Description
decision-12. A conflict (said by Review, or met while landing), or a check that fails once the trunk is in, sends the task back to the agent that did it over ACP (else the one Hand to… offers first) instead of stopping at the person. The send-back carries the conflicting files, the trunk commits it collided with and the tasks that made them (from 'Merge task-N: title' and the board), and the instruction: keep what both sides meant, commit, run the checks. It goes up to the contract's maxRetries (else once), then stays in Review naming the files. The row and Review say it in plain words (decision-10). The CLI and the phone still name the files and stop.

## Log
- 2026-10-14T21:00:35.542Z: [claude] Built on main (uncommitted). agents.ts sendBackLanding: on a conflict or a failed check from landReview, a note in the task's log (files, the trunk's commits it met with the tasks that landed them via worktree.ts collisions(), what to do, the checks), then dispatch to the last run's agent and model, else the assignee, else the first agent at hand; up to contract.maxRetries, else once, counted from 'Landing sent back' notes; past that Merge says so. The brief lets the agent merge the trunk in only when the log asks. noteTask is now an agent host method. Keys: 'Send back to settle' in Review, 'Send back' in the list and the feed. The CLI and phone are unchanged. Tested: collisions() (2 tests' worth in one); and in the real app on the demo board with a stand-in ACP agent: Send back from the feed wrote the note naming task-21, started the agent in task-2's worktree with the note and the merge permission in its brief, and a second press past the limit refused without starting one. 195/195, typecheck clean.
