---
id: task-79
title: "Discuss without the desktop: the task's context and rules in core, brainfile discuss, and an MCP discuss prompt"
column: todo
position: 7
description: |-
  discuss.ts is pure and depends only on core: `discussContext`, `taskInformation`, `workInformation`, `discussRules`, `discussPreamble`, `discussPermission`, `chatPermission` and `discussMode`. Move it to `@brainfile/core/dispatch`. `workOf`, which needs the review from task-76 and whether a run is live, reads the run files from task-74 once they exist.

  Two ways to discuss with no window:
  - **Any MCP client is already a chat.** `brainfile mcp` serves an MCP prompt `discuss` with argument taskId: the `<task-information>` and `<work>` blocks and the rules (change only this task's description, subtasks and contract, record decisions after running check, note what was agreed). It also serves a `discuss` tool that returns the same text, for clients that do not support prompts. The client keeps to the rules itself: an MCP server cannot refuse its client's own edits.
  - **`brainfile discuss <task-id> [--agent --model --effort]`**: an interactive ACP session in the terminal, through core's sessions. The same mode (never bypass, read-only when offered) and the same refusals as the desktop. What was agreed goes in the task's log, where the hand-off brief finds it.

  **decision-6** says Discuss is a thread in the board's chat. `check` answers review: its source predicate (discuss.ts) changed, and a terminal discussion is not a chat thread. Before building, ask the person whether to supersede decision-6 with "Discuss is a task-scoped discussion, a thread in the desktop's chat or a session in the terminal or an MCP client, under the same rules", then record it with decide, pointing its source at the new core file.
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
contract:
  status: ready
  deliverables:
    - type: file
      path: core/src/dispatch/discuss.ts
      description: The task's discussion context and rules, from the desktop's discuss.ts
    - type: file
      path: cli/src/commands/discuss.ts
      description: brainfile discuss
    - type: file
      path: cli/src/mcp/prompts.ts
      description: An MCP discuss prompt
    - type: test
      path: core/src/__tests__/dispatch-discuss.test.ts
      description: Context, rules and refusals
    - type: file
      path: cli/src/__tests__/mcp-parity.test.ts
      description: discuss mapped
  validation:
    commands:
      - npm install --prefer-offline --no-audit --no-fund && npm run build && npm test
      - cd desktop && npm install --prefer-offline --no-audit --no-fund && npm run typecheck && npm test && node scripts/build-electron.mjs
  constraints:
    - Ask the person and record the decision before going against decision-6
  metrics:
    readyAt: "2026-10-15T21:40:10.253Z"
createdAt: "2026-10-14T22:15:40.890Z"
updatedAt: "2026-10-15T21:47:11.550Z"
---

## Description
discuss.ts is pure and depends only on core: `discussContext`, `taskInformation`, `workInformation`, `discussRules`, `discussPreamble`, `discussPermission`, `chatPermission` and `discussMode`. Move it to `@brainfile/core/dispatch`. `workOf`, which needs the review from task-76 and whether a run is live, reads the run files from task-74 once they exist.

Two ways to discuss with no window:
- **Any MCP client is already a chat.** `brainfile mcp` serves an MCP prompt `discuss` with argument taskId: the `<task-information>` and `<work>` blocks and the rules (change only this task's description, subtasks and contract, record decisions after running check, note what was agreed). It also serves a `discuss` tool that returns the same text, for clients that do not support prompts. The client keeps to the rules itself: an MCP server cannot refuse its client's own edits.
- **`brainfile discuss <task-id> [--agent --model --effort]`**: an interactive ACP session in the terminal, through core's sessions. The same mode (never bypass, read-only when offered) and the same refusals as the desktop. What was agreed goes in the task's log, where the hand-off brief finds it.

**decision-6** says Discuss is a thread in the board's chat. `check` answers review: its source predicate (discuss.ts) changed, and a terminal discussion is not a chat thread. Before building, ask the person whether to supersede decision-6 with "Discuss is a task-scoped discussion, a thread in the desktop's chat or a session in the terminal or an MCP client, under the same rules", then record it with decide, pointing its source at the new core file.
