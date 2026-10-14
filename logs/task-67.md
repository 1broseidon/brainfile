---
id: task-67
title: Fix task hand-off changing the main chat backend and model
description: |-
  Reported bug: handing off a task currently changes the main chat's selected backend and model.

  Expected behavior: the backend and model chosen for a task hand-off apply only to that task's agent session. The main chat keeps its selected backend and model.

  Acceptance criteria:
  - Hand off a task using a different backend and/or model and confirm the main chat selections remain unchanged.
  - Subsequent messages in the main chat continue using its original backend and model.
  - Add regression coverage for hand-off session settings remaining separate from main chat settings.
tags:
  - bug
  - desktop
  - dispatch
createdAt: "2026-10-14T18:46:44.730Z"
assignee: codex
updatedAt: "2026-10-14T18:56:49.615Z"
completedAt: "2026-10-14T18:56:49.615Z"
---

## Description
Reported bug: handing off a task currently changes the main chat's selected backend and model.

Expected behavior: the backend and model chosen for a task hand-off apply only to that task's agent session. The main chat keeps its selected backend and model.

Acceptance criteria:
- Hand off a task using a different backend and/or model and confirm the main chat selections remain unchanged.
- Subsequent messages in the main chat continue using its original backend and model.
- Add regression coverage for hand-off session settings remaining separate from main chat settings.

## Log
- 2026-10-14T18:47:32.360Z: [codex] Traced hand-off preference leak to AppState.dispatch calling remember(agentId), which changes the chat backend and therefore its displayed/requested model. Fix will leave hand-off choices on the dispatched session and cover subsequent chat requests.
- 2026-10-14T18:49:17.626Z: [codex] Fixed hand-off changing the chat backend/model by removing dispatch's chat-preference write. Added reactive-state regression coverage for same/different backends, session model/effort, persisted chat selections and subsequent messages in the original thread. All 164 desktop tests and typecheck pass. Committed as aaccb8b on dispatch/task-67; worktree clean. Next: review and merge the branch.
- 2026-10-14T18:56:48.751Z: [claude] [claude] Reviewed and merged as 5a7d0a4: dispatch no longer calls remember(), so Hand to… leaves the chat's agent, model and effort alone. Typecheck clean, 164/164 on the branch; 171/171 merged.
