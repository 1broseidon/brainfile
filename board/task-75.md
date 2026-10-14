---
id: task-75
title: "Core: ACP agents, the agent registry, custom agents, settings and sessions move out of the desktop"
column: backlog
position: 11
description: |-
  Move everything that starts and talks to an ACP agent out of the desktop's agents process (agents.ts, lines 98–905) into a node-only core subpath, `@brainfile/core/dispatch`. It sits beside `./repo`, with `@agentclientprotocol/sdk` as a dependency, and it is not exported from the browser entry. A new workspace package is the other choice. Record the choice with decide before you start: this is the first runtime dependency core takes besides js-yaml (2026-08-11 boundary spec).

  What moves, as is:
  - The agents Brainfile knows (KNOWN: Claude Code, Codex, Antigravity, Cursor, Grok) and how each starts: the npm server install with the real node binary, the Antigravity download, `realNode`, `agentEnv`, `which`.
  - Custom agents (custom.ts, `agentServers` in Zed's shape; desktop/src/shared/agentServers.ts) and the ACP registry (registry.ts) with its cache.
  - Settings (settings.ts): `bypass`, `modes`, `agentServers`, and each repository's `permissions`. The file stays where it is: core reads `BRAINFILE_DATA_DIR`, else the platform's data folder (~/Library/Application Support/Brainfile on a Mac, $XDG_DATA_HOME/brainfile on Linux). The CLI and the desktop then share dispatch.json, models.json and agents/ with no migration.
  - Model, mode and effort probing (models.json cache, effort.ts, `modesOf`, `applyMode`, `learnEfforts`).
  - The session: `open`, `turn`, `hear`, `stepsOf`, `replyOf`, `close`, the idle timeout, and Startups (startup.ts) so stop reaches a run that is still starting.
  - Permissions as policy: BOARD_TOOL auto-allow, the repository's policy, and `requestPermission` taking an `ask(PermissionAsk) => Promise<optionId|null>` callback. The desktop answers it in the band; a terminal runner answers it at a prompt.
  - The brief (`brief`, `standingDecisions`, `finish`, `workplace`).
  - `brainfileMcp()`, which starts `brainfile mcp` with the real node binary and PATH and HOME passed.

  The desktop's agents.ts keeps its IPC handlers and calls core. It must behave exactly as before.
tags:
  - core
  - acp
  - agents
relatedFiles:
  - desktop/src/agents/agents.ts
  - desktop/src/agents/custom.ts
  - desktop/src/agents/registry.ts
  - desktop/src/agents/settings.ts
  - desktop/src/agents/effort.ts
  - desktop/src/agents/startup.ts
  - desktop/src/shared/agentServers.ts
  - core/package.json
  - core/src/browser.ts
parentId: epic-6
decisions:
  - decision-14
contract:
  status: draft
  deliverables:
    - type: file
      path: core/src/dispatch/index.ts
      description: "The node-only @brainfile/core/dispatch entry: agents, launch, custom agents, registry, settings, models, sessions, permissions, brief"
    - type: file
      path: core/package.json
      description: ./dispatch export and the ACP SDK dependency
    - type: test
      path: core/src/__tests__/dispatch-agents.test.ts
      description: Settings round-trip, custom launch, registry parsing, effort selection and brief text, ported from desktop/test
    - type: file
      path: desktop/src/agents/agents.ts
      description: Uses @brainfile/core/dispatch; IPC unchanged
    - type: test
      path: core/src/__tests__/browser-entry.test.ts
      description: The browser entry still pulls in no node-only module
  validation:
    commands:
      - npm run build -w core && npm run test:ci -w core
      - cd desktop && npm run typecheck && npm test
  constraints:
    - No behaviour change in the desktop
    - Record the package choice with decide before writing code
createdAt: "2026-10-14T22:14:58.639Z"
---

## Description
Move everything that starts and talks to an ACP agent out of the desktop's agents process (agents.ts, lines 98–905) into a node-only core subpath, `@brainfile/core/dispatch`. It sits beside `./repo`, with `@agentclientprotocol/sdk` as a dependency, and it is not exported from the browser entry. A new workspace package is the other choice. Record the choice with decide before you start: this is the first runtime dependency core takes besides js-yaml (2026-08-11 boundary spec).

What moves, as is:
- The agents Brainfile knows (KNOWN: Claude Code, Codex, Antigravity, Cursor, Grok) and how each starts: the npm server install with the real node binary, the Antigravity download, `realNode`, `agentEnv`, `which`.
- Custom agents (custom.ts, `agentServers` in Zed's shape; desktop/src/shared/agentServers.ts) and the ACP registry (registry.ts) with its cache.
- Settings (settings.ts): `bypass`, `modes`, `agentServers`, and each repository's `permissions`. The file stays where it is: core reads `BRAINFILE_DATA_DIR`, else the platform's data folder (~/Library/Application Support/Brainfile on a Mac, $XDG_DATA_HOME/brainfile on Linux). The CLI and the desktop then share dispatch.json, models.json and agents/ with no migration.
- Model, mode and effort probing (models.json cache, effort.ts, `modesOf`, `applyMode`, `learnEfforts`).
- The session: `open`, `turn`, `hear`, `stepsOf`, `replyOf`, `close`, the idle timeout, and Startups (startup.ts) so stop reaches a run that is still starting.
- Permissions as policy: BOARD_TOOL auto-allow, the repository's policy, and `requestPermission` taking an `ask(PermissionAsk) => Promise<optionId|null>` callback. The desktop answers it in the band; a terminal runner answers it at a prompt.
- The brief (`brief`, `standingDecisions`, `finish`, `workplace`).
- `brainfileMcp()`, which starts `brainfile mcp` with the real node binary and PATH and HOME passed.

The desktop's agents.ts keeps its IPC handlers and calls core. It must behave exactly as before.
