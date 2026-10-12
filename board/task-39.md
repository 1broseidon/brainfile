---
id: task-39
title: Make stop cancel a dispatch that is still starting
column: todo
position: 5
description: desktop/src/agents/agents.ts:798-799; stopRun at :964-965 and turn at :664. Dispatch registers a starting run before awaiting open (agent download/ACP initialization/newSession). stop finds sessions only by s.run.id, which is assigned in turn after open returns, so stopping during startup marks the run stopped but cancels/kills no session. open subsequently returns and turn unconditionally sets working and sends the task prompt. The tool has already reported Stopped, yet the agent begins editing; a redispatch or discard after stop can also race the old agent in its worktree. Persist cancellation through startup, close late sessions and never prompt a stopped run. Verified by tracing registration/open/turn and stop; existing desk stop test mocks this lifecycle away.
priority: critical
relatedFiles:
  - desktop/src/agents/agents.ts
parentId: spec-16
createdAt: "2026-10-12T23:38:24.239Z"
---

## Description
desktop/src/agents/agents.ts:798-799; stopRun at :964-965 and turn at :664. Dispatch registers a starting run before awaiting open (agent download/ACP initialization/newSession). stop finds sessions only by s.run.id, which is assigned in turn after open returns, so stopping during startup marks the run stopped but cancels/kills no session. open subsequently returns and turn unconditionally sets working and sends the task prompt. The tool has already reported Stopped, yet the agent begins editing; a redispatch or discard after stop can also race the old agent in its worktree. Persist cancellation through startup, close late sessions and never prompt a stopped run. Verified by tracing registration/open/turn and stop; existing desk stop test mocks this lifecycle away.
