---
id: task-127
title: A lead hands off children the person adds mid-run; only the lead's own new children wait
column: todo
position: 17
description: |-
  Feedback from hotline, 2026-10-16: tasks added to an epic mid-run waited for a person to hand them off.

  Cause: until review, `leadRefusal` and `waitingFor` (core/src/dispatch/lead.ts ~304, ~326) hold every child whose `createdAt` is after the lead started (`addedAfter`). decision-15 means only what the lead creates: "ready is the person's yes, and a lead does not approve its own new work". A child the person adds, by hand, in the window or through the chat, is that yes already, but nothing records who added a task, so the lead can't tell the two apart. task-126 makes this more common: a lead asked `--until review` now really runs until review.

  Fix: record who added a child (e.g. the MCP access role at task_add, `addedBy: lead` when a lead adds it, or the lead's run id), and hold only children a lead added (plus draft contracts, as now). A person's child added mid-run is handed off in order like the rest, and the lead's wake says so. Keep until done as it is.

  Tests: until review, a child added by the person after start is handed off; one added by the lead waits; a draft still waits.
priority: high
tags:
  - dispatch
  - lead
relatedFiles:
  - core/src/dispatch/lead.ts
  - cli/src/mcp/tools
decisions:
  - decision-15
contract:
  status: draft
  deliverables:
    - type: file
      path: core/src/dispatch/lead.ts
      description: addedAfter replaced by who-added, lead-added children wait
    - type: test
      path: core/src/__tests__/dispatch-lead.test.ts
      description: person-added vs lead-added children until review
  validation:
    commands:
      - npm run build
      - npm test
createdAt: "2026-10-16T15:12:38.702Z"
---

## Description
Feedback from hotline, 2026-10-16: tasks added to an epic mid-run waited for a person to hand them off.

Cause: until review, `leadRefusal` and `waitingFor` (core/src/dispatch/lead.ts ~304, ~326) hold every child whose `createdAt` is after the lead started (`addedAfter`). decision-15 means only what the lead creates: "ready is the person's yes, and a lead does not approve its own new work". A child the person adds, by hand, in the window or through the chat, is that yes already, but nothing records who added a task, so the lead can't tell the two apart. task-126 makes this more common: a lead asked `--until review` now really runs until review.

Fix: record who added a child (e.g. the MCP access role at task_add, `addedBy: lead` when a lead adds it, or the lead's run id), and hold only children a lead added (plus draft contracts, as now). A person's child added mid-run is handed off in order like the rest, and the lead's wake says so. Keep until done as it is.

Tests: until review, a child added by the person after start is handed off; one added by the lead waits; a draft still waits.
