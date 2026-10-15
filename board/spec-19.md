---
id: spec-19
title: "Agent skills: how Brainfile's own agents work branches, landing, pull requests and clean-up, and how outside agents drive Brainfile headless"
type: spec
column: todo
position: 10
description: |-
  From the person, 2026-10-15, while epic-6 ran under its lead. Today's QA kept needing fixes from outside the agents: a worker that force-added an ignored file, a pull request that carried other tasks' landings, branches and worktrees left behind, a lead that couldn't close a plan. The rules exist (decision-11, decision-12, decision-16), but agents meet them only as scattered lines in the brief, the lead's preamble and the MCP instructions.

  Two skills, one per audience. Both give defaults; a board can choose its own workflow.

  **1. For Brainfile's own agents** (hand-off workers, the epic's lead, the board's chat, Discuss): one guide, kept as files rather than strings spread through the code, and given to each role in the part it needs. It covers:
  - **Branches.** A hand-off works on `dispatch/<id>`. Where it forks from and lands: its `landsOn`, inherited, an epic's own branch, else the trunk.
  - **What not to do.** Never switch branches, rebase or push. Merge only the branch it goes into, and only when asked to settle a conflict. Commit everything, so nothing uncommitted is left behind.
  - **How landing happens and who does it.** Merge, a pull request, or an epic's one merge. A task completes when its branch lands; on a board with a Review column, the worker moves it there instead.
  - **Being sent back.** What the note says and how to settle it: merge the target, keep both sides, commit the merge.
  - **Pull requests.** What they carry, and why the base must be pushed first.
  - **Clean-up.** Worktrees and branches go when the work lands or is discarded; a leftover means something is wrong, so note it rather than delete it.
  - **The lead.** Plan the order by the files children touch; one child wires the whole; close or flag non-work children (a plan, a research document) so the epic can finish; ask the person before going against a decision.
  - **What goes in notes,** so the next task and the lead read the board, not a conversation.

  **Custom workflows.** A board can override the defaults in its own configuration, e.g. always land by pull request, push the target after landing, no epic branches, or its own agent instructions appended. The guide reads those and says the board's way. Record the defaults and the override points with decide.

  **2. For outside agents** (Claude Code, Codex, Cursor and others, using the brainfile CLI and MCP with no desktop, decision-17): a skill in the Agent Skills format (SKILL.md plus references) that ships with the CLI. `brainfile skill` prints it or installs it where each harness looks (.claude/skills, .agents/skills, …). It covers:
  - opening a session with brief;
  - the board tools;
  - handing work off and running it headless (dispatch, run, status, stop);
  - review, land, discard, pr;
  - leading an epic;
  - the same landing rules and clean-up as above;
  - when to ask the person.

  It can only be written once epic-6's surface exists: task-81, task-82 and task-83, proven by task-88. A test keeps it honest: every command, flag and tool the skill names must exist in the CLI and the MCP server, the way mcp-parity.test.ts checks the tool map.
tags:
  - agents
  - skills
  - docs
  - dispatch
  - landing
relatedFiles:
  - core/src/dispatch/brief.ts
  - desktop/src/agents/lead.ts
  - cli/src/mcp/instructions.ts
  - site/public/llms-install.txt
  - MANUAL.md
decisions:
  - decision-11
  - decision-12
  - decision-15
  - decision-16
  - decision-17
createdAt: "2026-10-15T21:50:59.012Z"
---

## Description
From the person, 2026-10-15, while epic-6 ran under its lead. Today's QA kept needing fixes from outside the agents: a worker that force-added an ignored file, a pull request that carried other tasks' landings, branches and worktrees left behind, a lead that couldn't close a plan. The rules exist (decision-11, decision-12, decision-16), but agents meet them only as scattered lines in the brief, the lead's preamble and the MCP instructions.

Two skills, one per audience. Both give defaults; a board can choose its own workflow.

**1. For Brainfile's own agents** (hand-off workers, the epic's lead, the board's chat, Discuss): one guide, kept as files rather than strings spread through the code, and given to each role in the part it needs. It covers:
- **Branches.** A hand-off works on `dispatch/<id>`. Where it forks from and lands: its `landsOn`, inherited, an epic's own branch, else the trunk.
- **What not to do.** Never switch branches, rebase or push. Merge only the branch it goes into, and only when asked to settle a conflict. Commit everything, so nothing uncommitted is left behind.
- **How landing happens and who does it.** Merge, a pull request, or an epic's one merge. A task completes when its branch lands; on a board with a Review column, the worker moves it there instead.
- **Being sent back.** What the note says and how to settle it: merge the target, keep both sides, commit the merge.
- **Pull requests.** What they carry, and why the base must be pushed first.
- **Clean-up.** Worktrees and branches go when the work lands or is discarded; a leftover means something is wrong, so note it rather than delete it.
- **The lead.** Plan the order by the files children touch; one child wires the whole; close or flag non-work children (a plan, a research document) so the epic can finish; ask the person before going against a decision.
- **What goes in notes,** so the next task and the lead read the board, not a conversation.

**Custom workflows.** A board can override the defaults in its own configuration, e.g. always land by pull request, push the target after landing, no epic branches, or its own agent instructions appended. The guide reads those and says the board's way. Record the defaults and the override points with decide.

**2. For outside agents** (Claude Code, Codex, Cursor and others, using the brainfile CLI and MCP with no desktop, decision-17): a skill in the Agent Skills format (SKILL.md plus references) that ships with the CLI. `brainfile skill` prints it or installs it where each harness looks (.claude/skills, .agents/skills, …). It covers:
- opening a session with brief;
- the board tools;
- handing work off and running it headless (dispatch, run, status, stop);
- review, land, discard, pr;
- leading an epic;
- the same landing rules and clean-up as above;
- when to ask the person.

It can only be written once epic-6's surface exists: task-81, task-82 and task-83, proven by task-88. A test keeps it honest: every command, flag and tool the skill names must exist in the CLI and the MCP server, the way mcp-parity.test.ts checks the tool map.
