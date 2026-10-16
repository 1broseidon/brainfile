---
id: task-79
title: "Discuss without the desktop: the task's context and rules in core, brainfile discuss, and an MCP discuss prompt"
column: in-progress
position: 7
tags:
  - core
  - cli
  - mcp
  - discuss
relatedFiles:
  - desktop/src/agents/discuss.ts
  - desktop/src/agents/agents.ts
  - desktop/test/discuss.test.ts
  - cli/src/mcp/instructions.ts
  - cli/src/mcp/resources.ts
  - cli/src/__tests__/mcp-parity.test.ts
parentId: epic-6
dependsOn:
  - task-75
  - task-82
  - task-84
decisions:
  - decision-6
  - decision-14
  - decision-19
contract:
  status: draft
  deliverables:
    - type: file
      path: core/src/dispatch/discuss.ts
      description: The task's discussion context and rules, from the desktop's discuss.ts
    - type: file
      path: cli/src/mcp/prompts.ts
      description: An MCP discuss prompt
    - type: test
      path: core/src/__tests__/dispatch-discuss.test.ts
      description: Context, rules and refusals
  validation:
    commands:
      - npm install --prefer-offline --no-audit --no-fund && npm run build && npm test
      - cd desktop && npm install --prefer-offline --no-audit --no-fund && npm run typecheck && npm test && node scripts/build-electron.mjs
  constraints:
    - Ask the person and record the decision before going against decision-6
createdAt: "2026-10-14T22:15:40.890Z"
updatedAt: "2026-10-16T01:31:26.707Z"
dispatch:
  agent: claude
  model: opus
  effort: high
  by: lead
  at: "2026-10-15T23:28:08.087Z"
assignee: claude
---

## Description
discuss.ts is pure and depends only on core: `discussContext`, `taskInformation`, `workInformation`, `discussRules`, `discussPreamble`, `discussPermission`, `chatPermission` and `discussMode`. Move it to `@brainfile/core/dispatch`. `workOf`, which needs the review from task-76 and whether a run is live, reads the run files from task-74 once they exist.

**Any MCP client is already a chat.** `brainfile mcp` serves an MCP prompt `discuss` with argument taskId: the `<task-information>` and `<work>` blocks and the rules (change only this task's description, subtasks and contract, record decisions after running check, note what was agreed). It also serves a `discuss` tool that returns the same text, for clients that do not support prompts. The client keeps to the rules itself: an MCP server cannot refuse its client's own edits.

The terminal session, `brainfile discuss`, is its own task under epic-6 (task-110), which depends on this one.

decision-19 records Discuss as one set of rules wherever it runs; set its source to core/src/dispatch/discuss.ts when this lands.

## Log
- 2026-10-15T23:28:07.198Z: [claude] Lead, before hand-off: task-84 landed. The desk is gone. desktop/src/agents/discuss.ts stays where it was (agents.ts:83 imports chatPermission, discussContext, discussMode, discussPermission, discussPreamble and DiscussWork), and chatPermission is now a thin wrapper over core's leadPermission. Moving it to core/src/dispatch/discuss.ts leaves desktop/src/agents/discuss.ts as a re-export or removes it, with agents.ts importing from @brainfile/core/dispatch and desktop/test/discuss.test.ts kept passing (or moved to core). For workOf's "is a run live", use the Runner's live(projectId)/liveDispatch(projectId, taskId), which already merge other runners' run files; don't read state/runs a second time. brainfile discuss runs a session with role discuss (task-81's brainfile mcp role, which has no dispatch tools). The constraint still holds: ask the person about superseding decision-6 and record it with decide before building.
- 2026-10-15T23:28:27.497Z: [claude] Picked up. check on decision-6 answers review (source_hash_changed on desktop/src/agents/discuss.ts). Asked the person whether to supersede it with "Discuss is a task-scoped discussion, a thread in the desktop's chat or a session in the terminal or an MCP client, under the same rules"; building waits on the answer.
- 2026-10-16T01:13:32.181Z: [claude] The person agreed to supersede decision-6 with decision-19 [core.dispatch.discuss]. Discuss is now one set of rules (core/src/dispatch/discuss.ts) for the desktop's chat thread, brainfile discuss and the MCP discuss prompt/tool, so the constraint is met and building can start. It has no source yet: set it to core/src/dispatch/discuss.ts when this branch lands.
- 2026-10-16T01:17:07.861Z: [claude] Split agreed with the person: brainfile discuss (the terminal session) moved to task-110, which depends on this task. task-79 now lands the move into core and the MCP discuss prompt/tool. Dropped cli/src/commands/discuss.ts and the mcp-parity mapping (it maps CLI commands, so it goes with task-110) from the contract.
