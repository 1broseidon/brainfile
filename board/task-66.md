---
id: task-66
title: Add ACP agents from official registry via dropdown in Settings
column: review
position: 3
description: Fetch the official ACP registry (https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json) and present agents in a dropdown under the add expand in Settings > Agents. Selecting an agent and clicking Add populates its command, arguments, and environment into agentServers (supporting npx and binary distributions) without manual typing. Includes caching or offline fallback when the registry cannot be reached.
priority: medium
tags:
  - desktop
  - agents
  - acp
  - settings
relatedFiles:
  - desktop/src/renderer/components/AgentServers.svelte
  - desktop/src/agents/agents.ts
  - desktop/src/shared/agentServers.ts
  - desktop/src/shared/api.ts
subtasks:
  - id: task-66-1
    title: Fetch and cache registry.json from cdn.agentclientprotocol.com
    completed: true
  - id: task-66-2
    title: Registry dropdown and Add button in AgentServers under the add expand
    completed: true
  - id: task-66-3
    title: Map registry distribution (npx/binary) into agent command and args
    completed: true
  - id: task-66-4
    title: Offline and fetch error handling
    completed: true
createdAt: "2026-10-14T18:45:19.838Z"
assignee: codex
updatedAt: "2026-10-14T18:51:13.594Z"
---

## Description
Fetch the official ACP registry (https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json) and present agents in a dropdown under the add expand in Settings > Agents. Selecting an agent and clicking Add populates its command, arguments, and environment into agentServers (supporting npx and binary distributions) without manual typing. Includes caching or offline fallback when the registry cannot be reached.

## Log
- 2026-10-14T18:47:09.449Z: [codex] Started in dispatch/task-66. Verified official registry schema: npx package/args/env and per-platform binary archive/cmd/args/env. Implementing app-data cache and binary installation with Settings dropdown; existing manual and Zed entry forms remain available.
- 2026-10-14T18:51:13.308Z: [codex] Implemented official ACP registry dropdown under Settings > Agents > Add an agent, preserving args/env for npx and downloading platform binaries to absolute app-data paths. Added 24-hour disk cache, offline fallback/retry, duplicate protection and documentation. Build/typecheck and all 168 desktop tests pass (7 new registry tests). Committed as f10dca6 on dispatch/task-66; worktree clean. Ready for a person to review and merge the branch.
