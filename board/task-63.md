---
id: task-63
title: A conflict goes back to the hand-off's agent
column: todo
position: 6
priority: high
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
  status: draft
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
createdAt: "2026-10-14T15:16:10.374Z"
---

## Description
decision-12. A conflict (said by Review, or met while landing), or a check that fails once the trunk is in, sends the task back to the agent that did it over ACP (else the one Hand to… offers first) instead of stopping at the person. The send-back carries the conflicting files, the trunk commits it collided with and the tasks that made them (from 'Merge task-N: title' and the board), and the instruction: keep what both sides meant, commit, run the checks. It goes up to the contract's maxRetries (else once), then stays in Review naming the files. The row and Review say it in plain words (decision-10). The CLI and the phone still name the files and stop.
