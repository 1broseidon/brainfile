---
id: task-109
title: "A Brainfile skill for outside agents: driving the board and running work headless with the CLI and MCP, shipped with the CLI and kept in step with it by a test"
column: backlog
position: 14
description: |-
  spec-19, part 2. Waits on epic-6's headless surface: dispatch, review and land (task-81), brainfile run (task-82), the lead in core (task-83), proven end to end by task-88.

  **The skill.** In the Agent Skills format: a SKILL.md with a description that triggers on board and hand-off work, plus references loaded when needed:
  - the command and tool reference;
  - landing and pull requests;
  - leading an epic.

  It covers:
  - opening a session with `brief`, and leaving notes as you go;
  - checking decisions before acting, and recording them;
  - adding and shaping work (types, parents, dependsOn, contracts, landsOn, epicBranch);
  - handing off and running it with no desktop (dispatch, run, status, stop);
  - review, land, discard and pr;
  - leading an epic;
  - the landing rules and clean-up from part 1 (task under spec-19), including the board's own overrides;
  - when to stop and ask the person.

  Write it in the style of the chain skill the person already uses: a reach order, BAD/GOOD pairs, and a checklist.

  **Shipping it.**
  - `brainfile skill` prints it.
  - `brainfile skill install [--project|--user]` writes it where harnesses look (.claude/skills/brainfile, .agents/skills/brainfile, …) and says where.
  - The MCP server mentions it in its instructions.
  - llms-install.txt and the site link to it.

  **Kept honest.** A CLI test parses the skill for every `brainfile <command> --flag` and every MCP tool name, and fails if any is not in the CLI's program or the MCP tool list, in the same way mcp-parity.test.ts checks the tool map.
tags:
  - agents
  - skills
  - cli
  - mcp
  - docs
relatedFiles:
  - cli/src/mcp/instructions.ts
  - cli/src/__tests__/mcp-parity.test.ts
  - site/public/llms-install.txt
  - MANUAL.md
parentId: spec-19
dependsOn:
  - task-81
  - task-82
  - task-83
  - task-88
subtasks:
  - id: task-109-1
    title: SKILL.md and its references, in the chain skill's style
    completed: false
  - id: task-109-2
    title: brainfile skill and skill install for each harness
    completed: false
  - id: task-109-3
    title: MCP instructions and llms-install.txt point to it
    completed: false
  - id: task-109-4
    title: "A test: every command, flag and tool it names exists"
    completed: false
createdAt: "2026-10-15T21:51:20.604Z"
---

## Description
spec-19, part 2. Waits on epic-6's headless surface: dispatch, review and land (task-81), brainfile run (task-82), the lead in core (task-83), proven end to end by task-88.

**The skill.** In the Agent Skills format: a SKILL.md with a description that triggers on board and hand-off work, plus references loaded when needed:
- the command and tool reference;
- landing and pull requests;
- leading an epic.

It covers:
- opening a session with `brief`, and leaving notes as you go;
- checking decisions before acting, and recording them;
- adding and shaping work (types, parents, dependsOn, contracts, landsOn, epicBranch);
- handing off and running it with no desktop (dispatch, run, status, stop);
- review, land, discard and pr;
- leading an epic;
- the landing rules and clean-up from part 1 (task under spec-19), including the board's own overrides;
- when to stop and ask the person.

Write it in the style of the chain skill the person already uses: a reach order, BAD/GOOD pairs, and a checklist.

**Shipping it.**
- `brainfile skill` prints it.
- `brainfile skill install [--project|--user]` writes it where harnesses look (.claude/skills/brainfile, .agents/skills/brainfile, …) and says where.
- The MCP server mentions it in its instructions.
- llms-install.txt and the site link to it.

**Kept honest.** A CLI test parses the skill for every `brainfile <command> --flag` and every MCP tool name, and fails if any is not in the CLI's program or the MCP tool list, in the same way mcp-parity.test.ts checks the tool map.
