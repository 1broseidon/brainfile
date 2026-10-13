---
id: task-47
title: "Custom ACP agents: run any ACP server the person names, the way Zed's agent_servers does"
column: in-progress
position: 3
description: |-
  The agents Brainfile can start are a fixed list (`KNOWN` in desktop/src/agents/agents.ts; `AgentId` in desktop/src/shared/api.ts is a closed union: claude, codex, antigravity, cursor, grok). A person who has another ACP server on their machine has no way to use it.

  Let them add their own, in the same shape Zed uses for `agent_servers`:

  ```json
  {
    "agent_servers": {
      "Muse Code": {
        "command": "muse-acp",
        "args": [],
        "env": {}
      }
    }
  }
  ```

  Each entry is a display name with a `command`, `args` and `env`; we launch it as-is over ACP (no npm install, no download), with `env` merged over the process environment and the command resolved on the person's PATH the way the known agents' clients are.

  Scope:
  - Where it lives: an `agentServers` map in the app's settings (dispatch.json, `DispatchSettings`), same keys as Zed's so an entry can be pasted across. Optionally a project-level override later; not needed now.
  - `AgentId` opens up to custom ids (e.g. `custom:<name>`) so a custom agent goes everywhere a known one does: Hand to…, the chat, Discuss, the desk's `dispatch`, models and modes when the server reports them.
  - A custom agent gets what the known ones get: the repo (or its dispatch worktree, decision-2) as cwd and Brainfile's MCP server.
  - Unavailable when its command is not found; the picker says so rather than failing at start.
  - A small editor in settings to add, edit and remove entries (name, command, args, env), or at least a way to open the JSON.
  - design.md's Dispatch section names how custom agents are added.

  Not in scope: the ACP registry, or installing a custom server for the person.
priority: medium
tags:
  - desktop
  - dispatch
  - agents
  - acp
relatedFiles:
  - desktop/src/agents/agents.ts
  - desktop/src/shared/api.ts
  - desktop/design.md
decisions:
  - decision-2
subtasks:
  - id: task-47-1
    title: "Settings: agentServers map in dispatch.json, Zed's shape"
    completed: false
  - id: task-47-2
    title: AgentId and the picker take custom agents
    completed: false
  - id: task-47-3
    title: "Launch a custom server: command, args, env merged; unavailable when not on PATH"
    completed: false
  - id: task-47-4
    title: Settings UI to add, edit, remove a custom agent
    completed: false
  - id: task-47-5
    title: "Tests: settings round-trip, launch args/env, missing command"
    completed: false
  - id: task-47-6
    title: "design.md: custom agents under Dispatch"
    completed: false
createdAt: "2026-10-13T20:29:58.653Z"
assignee: claude
dispatch:
  agent: claude
  model: opus
  by: chat
  at: "2026-10-13T20:30:48.549Z"
updatedAt: "2026-10-13T20:30:55.121Z"
---

## Description
The agents Brainfile can start are a fixed list (`KNOWN` in desktop/src/agents/agents.ts; `AgentId` in desktop/src/shared/api.ts is a closed union: claude, codex, antigravity, cursor, grok). A person who has another ACP server on their machine has no way to use it.

Let them add their own, in the same shape Zed uses for `agent_servers`:

```json
{
  "agent_servers": {
    "Muse Code": {
      "command": "muse-acp",
      "args": [],
      "env": {}
    }
  }
}
```

Each entry is a display name with a `command`, `args` and `env`; we launch it as-is over ACP (no npm install, no download), with `env` merged over the process environment and the command resolved on the person's PATH the way the known agents' clients are.

Scope:
- Where it lives: an `agentServers` map in the app's settings (dispatch.json, `DispatchSettings`), same keys as Zed's so an entry can be pasted across. Optionally a project-level override later; not needed now.
- `AgentId` opens up to custom ids (e.g. `custom:<name>`) so a custom agent goes everywhere a known one does: Hand to…, the chat, Discuss, the desk's `dispatch`, models and modes when the server reports them.
- A custom agent gets what the known ones get: the repo (or its dispatch worktree, decision-2) as cwd and Brainfile's MCP server.
- Unavailable when its command is not found; the picker says so rather than failing at start.
- A small editor in settings to add, edit and remove entries (name, command, args, env), or at least a way to open the JSON.
- design.md's Dispatch section names how custom agents are added.

Not in scope: the ACP registry, or installing a custom server for the person.
