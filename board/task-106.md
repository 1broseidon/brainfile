---
id: task-106
title: "Desktop: a mode selector in the chat box, showing the session's mode and changing it now, for the board's chat and for a hand-off's conversation"
column: todo
position: 8
description: |-
  From QA on 2026-10-15 (task-105). The person set Claude Code to Manual in Settings, then used the board's chat and a hand-off, and saw nothing asked. Two reasons, neither visible in the app:
  - The chat keeps its own mode whatever Settings say (keepsMode, decision-14).
  - Claude Code's Manual mode runs read-only commands without asking.

  Today the only control is the per-agent default in Settings, and nothing shows which mode a live session is actually in.

  **What to build**
  - **The selector.** The chat box (the composer under a session in the chat pane and the dock) shows the session's current mode, e.g. "Manual ▾". It lists the modes that agent offers (`session.modes.options`, with name and description).
  - **Choosing changes this session now.** `setSessionMode`, or `setSessionConfigOption` when modes come through a config option (`modes.via`). It does not change the default in Settings, and the next session starts from Settings again. Offer "Make this the default for <agent>" as a secondary action.
  - **The agent's own changes show.** `current_mode_update` already sets `session.mode`; send it to the window so the selector follows when the agent switches itself (e.g. plan → default).
  - **The board's chat and Discuss keep decision-14's limits.** Their selector lists only the modes their rule allows: never bypass, and nothing that lets them edit code. Hidden or disabled options say why. If the person should be able to give the chat more, record that as a change to decision-14 first (check, then decide).
  - **Hand-offs** list every mode the agent offers, bypass included when the repository's policy allows it. A lead's session keeps its own rules.
  - **Plumbing.** An agents-process IPC `setMode(runId | sessionKey, modeId)` and the mode on `AgentRun`, so the window and the phone can show it.
  - **Settings copy.** Under each agent's mode, say what it means in practice, e.g. "Manual: read-only commands run without asking; edits and other commands ask".

  **Tests**
  - core: a fake ACP agent with modes. A mode set on a live session takes effect and is reported; an agent-initiated mode change updates the session.
  - desktop: the chat's selector never offers bypass; a choice applies to the live session and leaves dispatch.json unchanged.
tags:
  - desktop
  - chat
  - permissions
  - acp
  - modes
relatedFiles:
  - core/src/dispatch/session.ts
  - desktop/src/agents/agents.ts
  - desktop/src/agents/discuss.ts
  - desktop/src/shared/api.ts
  - desktop/src/renderer/lib/state.svelte.ts
decisions:
  - decision-14
subtasks:
  - id: task-106-1
    title: Session mode on AgentRun and a setMode call through the agents process
    completed: false
  - id: task-106-2
    title: The selector in the chat box, following the agent's own mode changes
    completed: false
  - id: task-106-3
    title: The chat and Discuss limited to decision-14's modes; hand-offs get all, bypass by policy
    completed: false
  - id: task-106-4
    title: Make this the default for <agent>
    completed: false
  - id: task-106-5
    title: Settings says what each mode means in practice
    completed: false
  - id: task-106-6
    title: Tests in core and the desktop
    completed: false
createdAt: "2026-10-15T21:09:21.357Z"
---

## Description
From QA on 2026-10-15 (task-105). The person set Claude Code to Manual in Settings, then used the board's chat and a hand-off, and saw nothing asked. Two reasons, neither visible in the app:
- The chat keeps its own mode whatever Settings say (keepsMode, decision-14).
- Claude Code's Manual mode runs read-only commands without asking.

Today the only control is the per-agent default in Settings, and nothing shows which mode a live session is actually in.

**What to build**
- **The selector.** The chat box (the composer under a session in the chat pane and the dock) shows the session's current mode, e.g. "Manual ▾". It lists the modes that agent offers (`session.modes.options`, with name and description).
- **Choosing changes this session now.** `setSessionMode`, or `setSessionConfigOption` when modes come through a config option (`modes.via`). It does not change the default in Settings, and the next session starts from Settings again. Offer "Make this the default for <agent>" as a secondary action.
- **The agent's own changes show.** `current_mode_update` already sets `session.mode`; send it to the window so the selector follows when the agent switches itself (e.g. plan → default).
- **The board's chat and Discuss keep decision-14's limits.** Their selector lists only the modes their rule allows: never bypass, and nothing that lets them edit code. Hidden or disabled options say why. If the person should be able to give the chat more, record that as a change to decision-14 first (check, then decide).
- **Hand-offs** list every mode the agent offers, bypass included when the repository's policy allows it. A lead's session keeps its own rules.
- **Plumbing.** An agents-process IPC `setMode(runId | sessionKey, modeId)` and the mode on `AgentRun`, so the window and the phone can show it.
- **Settings copy.** Under each agent's mode, say what it means in practice, e.g. "Manual: read-only commands run without asking; edits and other commands ask".

**Tests**
- core: a fake ACP agent with modes. A mode set on a live session takes effect and is reported; an agent-initiated mode change updates the session.
- desktop: the chat's selector never offers bypass; a choice applies to the live session and leaves dispatch.json unchanged.
