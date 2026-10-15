---
id: task-108
title: "The landing guide for Brainfile's own agents: workers, the lead, the chat and Discuss each given the part they need, from files, with the board's own workflow able to override it"
column: todo
position: 11
description: |-
  spec-19, part 1. Collect what the brief (core/src/dispatch/brief.ts: finish, workplace, leftFor), the lead's preamble (desktop/src/agents/lead.ts, moving to core in task-83) and the chat's rules say about branches, landing, pull requests and clean-up. Write it once as a guide: markdown files under core, one section per role, read at runtime. Each role's prompt includes its part, so wording lives in one place and tests can check it.

  What it covers is listed in spec-19, part 1. Add what today's QA showed agents needed:
  - a file git ignores is force-added only once, then `git add -u`;
  - the brief says which branch the work lands on;
  - a pull request needs its base pushed;
  - a plan or research document is not work for a lead to hand off.

  **The board's own workflow.** Defaults come from the decisions. A board may set overrides in brainfile.md, e.g.:
  - `workflow.landing: merge | pull-request`
  - `workflow.pushAfterLanding`
  - `workflow.epicBranch: default on/off`
  - extra agent instructions per role

  The guide says the board's way when they are set. Record the defaults and these override points with decide (claim `agents.workflow`). Only build overrides that the runner and landing code honour as well; a guide that says something the code does not do is worse than none.

  **Done when** the brief, the lead's preamble and the chat's rules read from the guide; a test renders each role's text for a board with no overrides and for one with overrides; and design.md and MANUAL describe the overrides.
tags:
  - agents
  - skills
  - dispatch
  - landing
  - core
relatedFiles:
  - core/src/dispatch/brief.ts
  - desktop/src/agents/lead.ts
  - desktop/src/agents/discuss.ts
  - core/src/types/base.ts
parentId: spec-19
subtasks:
  - id: task-108-1
    title: The guide as files, one section per role; the brief, lead and chat read it
    completed: false
  - id: task-108-2
    title: QA's lessons in it
    completed: false
  - id: task-108-3
    title: Board workflow overrides, honoured by the code too; decision recorded
    completed: false
  - id: task-108-4
    title: Tests render each role's text with and without overrides
    completed: false
  - id: task-108-5
    title: MANUAL and design.md
    completed: false
createdAt: "2026-10-15T21:51:20.309Z"
dependsOn:
  - task-83
updatedAt: "2026-10-15T21:51:23.549Z"
---

## Description
spec-19, part 1. Collect what the brief (core/src/dispatch/brief.ts: finish, workplace, leftFor), the lead's preamble (desktop/src/agents/lead.ts, moving to core in task-83) and the chat's rules say about branches, landing, pull requests and clean-up. Write it once as a guide: markdown files under core, one section per role, read at runtime. Each role's prompt includes its part, so wording lives in one place and tests can check it.

What it covers is listed in spec-19, part 1. Add what today's QA showed agents needed:
- a file git ignores is force-added only once, then `git add -u`;
- the brief says which branch the work lands on;
- a pull request needs its base pushed;
- a plan or research document is not work for a lead to hand off.

**The board's own workflow.** Defaults come from the decisions. A board may set overrides in brainfile.md, e.g.:
- `workflow.landing: merge | pull-request`
- `workflow.pushAfterLanding`
- `workflow.epicBranch: default on/off`
- extra agent instructions per role

The guide says the board's way when they are set. Record the defaults and these override points with decide (claim `agents.workflow`). Only build overrides that the runner and landing code honour as well; a guide that says something the code does not do is worse than none.

**Done when** the brief, the lead's preamble and the chat's rules read from the guide; a test renders each role's text for a board with no overrides and for one with overrides; and design.md and MANUAL describe the overrides.
