---
id: task-83
title: Move the desktop's epic lead into core's shared runner, so it runs the same from brainfile run and MCP
column: backlog
position: 19
tags:
  - core
  - dispatch
  - lead
relatedFiles:
  - desktop/src/agents/lead.ts
  - desktop/test/lead.test.ts
  - desktop/src/agents/agents.ts
  - core/src/dispatch/lead.ts
  - core/src/dispatch/runner.ts
  - cli/src/commands/dispatch.ts
  - cli/src/mcp/tools/dispatch_tool.ts
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
updatedAt: "2026-10-15T01:37:23.658Z"
---

## Description
The lead now exists in the desktop (spec-16-4/5/6): desktop/src/agents/lead.ts holds it with no Electron in it (planReport, the rules in mayDispatch and guard, waking by childEnded, wake and boardChanged, pause, resume, stop, finish), driven through LeadDeps by agents.ts, and tested with fakes in desktop/test/lead.test.ts. This task moves it into core beside the shared runner (task-80), so a lead runs the same from `brainfile run`, from MCP and from the desktop.

- Move lead.ts to core/src/dispatch/lead.ts as it stands; LeadDeps becomes the Runner's. Its tests move with it.
- The lead's `brainfile mcp` gets `BRAINFILE_AGENT_ROLE=lead` and `BRAINFILE_LEAD_SCOPE=<epic>` in place of the desk's grant, so dispatch, status and stop reach only its descendants (task-81's roles).
- The `lead:` record on the epic (agent, model, effort, by, at, until) gains the claim from task-74, so one lead per tree holds across processes and machines.
- `attempts` (handed off per child) is counted from the children's request records, not in memory, so a resumed lead keeps the count.
- Pause, resume and stop from `brainfile dispatch pause|resume|stop <epic>` and MCP, beside the desktop's Lead block.
- The desktop's agents.ts keeps only the wiring: the Runner calls back for turns, and the window keeps the Lead block and the dock tab.

## Log
- 2026-10-15T15:49:45.181Z: [claude] The lead's prompt changed in 2cff04e: its plan check makes sure one child wires the parts together and tests the whole (Hotline's epic-6 had none, and every child deferred its wiring), and on later turns it moves what a child left for later into the task that will do it. Its rules line says dependsOn done and landed. TreeDoc has `unlanded`; boardChanged says a complete-but-unlanded child is not yet built on.
