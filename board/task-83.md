---
id: task-83
title: "An epic's lead in the shared runner: lead state on the board, woken by its children's events, inside the runner's rules"
column: backlog
position: 19
description: |-
  This builds spec-16-4, -5 and -6 once, in core, so a lead runs the same from `brainfile run`, from MCP and from the desktop. None of it exists yet.

  - Dispatching an epic, or any parent with children, starts a lead, not a worker. Its request has `role: lead`, and the claim on the epic means one lead per tree. It gets no worktree and runs in the chat's mode (decision-14). Its `brainfile mcp` has `BRAINFILE_AGENT_ROLE=lead` and `BRAINFILE_LEAD_SCOPE=<epic>`, so dispatch, status and stop reach only its descendants.
  - The lead's memory is the board: its plan in notes on the epic and a request record on each child. A lead lost to a restart is replaced by one that reads them and goes on.
  - The Runner wakes it with a new turn when a child lands, fails, conflicts, is sent back or asks. The turn is a short status read from the board, never a transcript. It never polls.
  - The rules it cannot bend, enforced in the Runner and not in the prompt:
    - dependsOn landed first;
    - at most N at once per repository;
    - retries up to maxRetries, then the child parks in Review;
    - landings serial;
    - only a lead dispatches;
    - a child the lead creates waits as a draft unless the epic was dispatched `until: done` on a repository whose policy is bypass;
    - the epic completes with its last child.
  - Pause, resume and stop, from `brainfile dispatch stop|pause|resume <epic>`, MCP and the desktop. The lead's state (`running`, `paused`, `stopped`) lives in the epic's request record.
tags:
  - core
  - dispatch
  - lead
relatedFiles:
  - core/src/dispatch/runner.ts
  - core/src/dispatch/lead.ts
  - core/src/dispatchRecord.ts
  - cli/src/mcp/tools/dispatch_tool.ts
  - desktop/src/agents/agents.ts
parentId: epic-6
dependsOn:
  - task-80
  - task-81
decisions:
  - decision-15
  - decision-14
  - decision-12
contract:
  status: draft
  deliverables:
    - type: file
      path: core/src/dispatch/lead.ts
      description: "The lead: start, wake on child events, pause, resume, stop; state in the epic's request record and notes"
    - type: test
      path: core/src/__tests__/dispatch-lead.test.ts
      description: "Fake agents: dependsOn order, the N limit, maxRetries then Review, one lead per tree, drafts wait, a new lead resumes from the board, the epic completes with its last child"
    - type: file
      path: cli/src/commands/dispatch.ts
      description: pause and resume for a lead
  validation:
    commands:
      - npm run build && npm test
  constraints:
    - The rules are the Runner's, not the lead prompt's (decision-15)
    - The lead writes no code and has no worktree
createdAt: "2026-10-14T22:16:33.537Z"
---

## Description
This builds spec-16-4, -5 and -6 once, in core, so a lead runs the same from `brainfile run`, from MCP and from the desktop. None of it exists yet.

- Dispatching an epic, or any parent with children, starts a lead, not a worker. Its request has `role: lead`, and the claim on the epic means one lead per tree. It gets no worktree and runs in the chat's mode (decision-14). Its `brainfile mcp` has `BRAINFILE_AGENT_ROLE=lead` and `BRAINFILE_LEAD_SCOPE=<epic>`, so dispatch, status and stop reach only its descendants.
- The lead's memory is the board: its plan in notes on the epic and a request record on each child. A lead lost to a restart is replaced by one that reads them and goes on.
- The Runner wakes it with a new turn when a child lands, fails, conflicts, is sent back or asks. The turn is a short status read from the board, never a transcript. It never polls.
- The rules it cannot bend, enforced in the Runner and not in the prompt:
  - dependsOn landed first;
  - at most N at once per repository;
  - retries up to maxRetries, then the child parks in Review;
  - landings serial;
  - only a lead dispatches;
  - a child the lead creates waits as a draft unless the epic was dispatched `until: done` on a repository whose policy is bypass;
  - the epic completes with its last child.
- Pause, resume and stop, from `brainfile dispatch stop|pause|resume <epic>`, MCP and the desktop. The lead's state (`running`, `paused`, `stopped`) lives in the epic's request record.
