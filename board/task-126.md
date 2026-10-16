---
id: task-126
title: dispatch drops --until for an epic's lead, so a bypass policy lands every child
column: todo
position: 16
priority: high
tags:
  - bug
  - dispatch
  - lead
createdAt: "2026-10-16T14:04:45.324Z"
---

## Description
Found 2026-10-16 on hotline: `brainfile dispatch epic-7 --until review` queued a lead that `dispatch status` showed as `until done`, because the repository policy was bypass. cli/src/commands/dispatch.ts ~line 360 calls `runner.queue(place.projectId, [id], { agent, model, effort, by, role: 'lead' })` with no `until`, so the lead record falls back to the policy. The children's path (~line 402) passes `until`. Fix: pass `until` for the lead too, and a test that --until review on an epic under a bypass policy records until: review. Worked around on hotline with `brainfile dispatch policy ask`.
