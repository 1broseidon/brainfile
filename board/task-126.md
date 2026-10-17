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
parentId: epic-11
updatedAt: "2026-10-17T05:09:29.557Z"
---

## Description
Found 2026-10-16 on hotline: `brainfile dispatch epic-7 --until review` queued a lead that `dispatch status` showed as `until done`, because the repository policy was bypass. cli/src/commands/dispatch.ts ~line 360 calls `runner.queue(place.projectId, [id], { agent, model, effort, by, role: 'lead' })` with no `until`, so the lead record falls back to the policy. The children's path (~line 402) passes `until`. Fix: pass `until` for the lead too, and a test that --until review on an epic under a bypass policy records until: review. Worked around on hotline with `brainfile dispatch policy ask`.

## Log
- 2026-10-16T14:18:21.920Z: [claude] Fixed on branch fix/lead-until (~/.brainfile-worktrees/fix/lead-until, uncommitted). The CLI fix alone was not enough: core overwrote a lead's until with the policy in Runner.queue and Leads.start, and a lead resumed from the board ignored its record's until. Now core/src/dispatch/lead.ts leadUntil(asked, policy) decides all three: review always holds, done or unset lands only under bypass. Tests: core 1226, CLI 714+191, desktop 178; fragment changes/task-126-lead-until.md.
- 2026-10-17T05:09:32.679Z: [claude] 2026-10-17 audit: work has started but is uncommitted, in the worktree ~/.brainfile-worktrees/fix/lead-until (branch fix/lead-until, no commits past main): lead.ts, runner.ts, cli dispatch.ts, their tests and changes/task-126-lead-until.md. Don't clean that worktree up before it's committed.
