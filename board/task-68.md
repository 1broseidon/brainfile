---
id: task-68
title: Priority levels say what they mean, and agents leave priority unset unless told
column: todo
position: 9
tags:
  - agents
  - cli
  - mcp
  - core
  - desktop
relatedFiles:
  - cli/src/mcp/tools/task_add_tool.ts
  - cli/src/mcp/tools/task_patch_tool.ts
  - cli/src/commands/add.ts
  - cli/src/commands/patch.ts
  - MANUAL.md
  - core/src/templates.ts
  - core/src/linter.ts
  - desktop/src/agents/agents.ts
contract:
  status: draft
  deliverables:
    - type: file
      path: cli/src/mcp/tools/task_add_tool.ts
      description: The levels defined in the priority field's description
    - type: file
      path: core/src/linter.ts
      description: A warning when high and critical crowd the open tasks
  validation:
    commands:
      - npm test
      - cd desktop && npm run typecheck && npm test
  constraints:
    - One wording of the five levels, shared by the MCP schemas, the CLI help and the MANUAL
    - Coordinate the preamble line with task-65 rather than rewriting the preamble
createdAt: "2026-10-14T19:11:45.532Z"
---

## Description
Agents set priority by their own sense of importance, because nothing says what the levels mean: the MCP schema describes the field as 'Task priority', the CLI help and the MANUAL only list low, medium, high, critical, and the chat preamble never mentions it. The task an agent was just asked to file always feels important, so it comes out high. Across the person's seven boards (252 tasks and logs, 2026-10-14): high 80, medium 68, none 67, critical 19 (15 on one board), low 18. Low is almost unused, so open work collapses to none, medium or high, and most rows carry the three pips.

Define each level by its consequence, not its importance, with none as the normal case:
- none: not judged yet; most tasks stay here.
- low: worth doing, fine if it never happens.
- medium: do it in the normal order.
- high: next up; it blocks other work or something promised soon.
- critical: broken for the people using it now; drop other work.

The rule against inflation: leave priority unset unless the person said how urgent it is, or something is broken; a task is not high because it was just asked for.

Where the words go:
- MCP: the priority field's describe() in task_add and task_patch (what agents actually read).
- CLI: --priority help on add and patch.
- MANUAL: the priority row of the fields table.
- Desktop chat preamble (ASK_PREAMBLE in agents.ts), coordinating with task-65, which rewrites it.
- core templates: bug-report drops from high to no priority.
- lint: a warning when more than a third of open tasks (at least six of them) are high or critical.
