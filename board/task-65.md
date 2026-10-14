---
id: task-65
title: The chat manages the board; code work goes to a hand-off
column: todo
position: 8
priority: high
tags:
  - desktop
  - chat
  - dispatch
  - agents
relatedFiles:
  - desktop/src/agents/agents.ts
  - desktop/src/agents/discuss.ts
  - desktop/src/renderer/components/ChatPane.svelte
  - desktop/design.md
decisions:
  - decision-14
  - decision-10
  - decision-6
contract:
  status: draft
  deliverables:
    - type: file
      path: desktop/src/agents/agents.ts
      description: Chat preamble and permission rules
    - type: file
      path: desktop/src/renderer/components/ChatPane.svelte
      description: Placeholder and Hand to… under the reply
    - type: docs
      path: desktop/design.md
      description: Dispatch section
    - type: test
      path: desktop/test/discuss.test.ts
      description: Chat permission verdicts
  validation:
    commands:
      - cd desktop && npm run typecheck && npm test
createdAt: "2026-10-14T15:16:21.592Z"
---

## Description
decision-14. Prompt: ASK_PREAMBLE (agents.ts:1164) ends 'Do not change code unless asked', which leaves the chat able to become a dev environment. It says instead that the chat does not change code or run commands; asked for code work, the agent writes the task or updates the one in context (what it must do, how to check it), dispatches it when the person asked for it done, else says it is ready to hand off; and it reads code freely to write a good task. Enforcement, as Discuss has: applyMode gives chat sessions discussMode (never bypass, read-only when offered), and requestPermission refuses edit, delete, move and execute before anyone is asked, keeping board and desk tools and the brainfile command line (the fallback when MCP is missing). Open: whether read-only git (log, status, diff) stays allowed for the health line's Ask agent. Window, words and structure only (decision-10, tips two or three words): the composer's placeholder 'Ask or tell it something' is vague, so it names what it takes (proposed: 'Ask, or add and change tasks'); under a reply, a task the turn added or changed and did not hand off carries a Hand to… key beside it. The chat key ('Ask the board') and the empty line already name the board. The phone's chat goes through the desk's ask and gets the prompt and the refusals with it; its composer takes the same words. design.md › Dispatch says all of this.
