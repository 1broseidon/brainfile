---
id: task-77
title: "Issues from the CLI and MCP: source on a task, list a repository's issues, make a task from one"
column: in-progress
position: 6
description: |-
  The desktop's issues view (task-26) needs main/forge.ts, main/github.ts and shared/issues.ts, and a task made from an issue carries `source:` (decision-4). Core keeps `source` only as an unknown key, and neither `brainfile add` nor `task_add` can set it.

  - Core: `source` becomes a typed Task field. `sourcesOf` (host.ts) and `issueTask`, `linkedTask` and `labelTag` (shared/issues.ts) move to core. Forge detection (forge.ts) and the GitHub issues client (github.ts: pages, the ETag, the once-a-minute TTL) move to a node-only core subpath, with fetch and credentials passed in.
  - One order for credentials, shared by the CLI and the desktop: `gh auth token`, then GH_TOKEN or GITHUB_TOKEN, then the token the person saved. The desktop keeps its token in the Keychain's care. The CLI keeps its auth-store, which `brainfile auth github` writes.
  - CLI: `brainfile add --source <url>`, and `brainfile issues [--import <n>…] [--column <id>]`, which lists open issues and marks those already on the board.
  - MCP: `task_add` takes `source`, and a new `issues` tool (action list | import) is added to the parity map.
  - The desktop calls core for all of this, and its view is unchanged.
tags:
  - core
  - cli
  - mcp
  - issues
  - github
relatedFiles:
  - desktop/src/main/github.ts
  - desktop/src/main/forge.ts
  - desktop/src/shared/issues.ts
  - desktop/src/host/host.ts
  - core/src/types/base.ts
  - cli/src/commands/add.ts
  - cli/src/mcp/tools/task_add_tool.ts
  - cli/src/utils/github-auth.ts
  - cli/src/__tests__/mcp-parity.test.ts
parentId: epic-6
decisions:
  - decision-4
contract:
  status: draft
  deliverables:
    - type: file
      path: core/src/issues.ts
      description: issueTask, linkedTask, labelTag and sourcesOf
    - type: file
      path: cli/src/commands/issues.ts
      description: brainfile issues, with import
    - type: file
      path: cli/src/mcp/tools/issues_tool.ts
      description: "MCP issues: list and import"
    - type: test
      path: cli/src/__tests__/issues.test.ts
      description: List with a fake fetch, import sets source, a second import finds the task already made
    - type: file
      path: cli/src/__tests__/mcp-parity.test.ts
      description: issues mapped to its tool
  validation:
    commands:
      - npm run build && npm test
      - cd desktop && npm run typecheck && npm test
createdAt: "2026-10-14T22:15:23.116Z"
updatedAt: "2026-10-15T17:11:59.875Z"
---

## Description
The desktop's issues view (task-26) needs main/forge.ts, main/github.ts and shared/issues.ts, and a task made from an issue carries `source:` (decision-4). Core keeps `source` only as an unknown key, and neither `brainfile add` nor `task_add` can set it.

- Core: `source` becomes a typed Task field. `sourcesOf` (host.ts) and `issueTask`, `linkedTask` and `labelTag` (shared/issues.ts) move to core. Forge detection (forge.ts) and the GitHub issues client (github.ts: pages, the ETag, the once-a-minute TTL) move to a node-only core subpath, with fetch and credentials passed in.
- One order for credentials, shared by the CLI and the desktop: `gh auth token`, then GH_TOKEN or GITHUB_TOKEN, then the token the person saved. The desktop keeps its token in the Keychain's care. The CLI keeps its auth-store, which `brainfile auth github` writes.
- CLI: `brainfile add --source <url>`, and `brainfile issues [--import <n>…] [--column <id>]`, which lists open issues and marks those already on the board.
- MCP: `task_add` takes `source`, and a new `issues` tool (action list | import) is added to the parity map.
- The desktop calls core for all of this, and its view is unchanged.

## Log
- 2026-10-15T17:38:19.150Z: [claude] Built on parity/task-77 (289f4f1), merged into parity/integration. Task.source typed; core/src/issues.ts; @brainfile/core/forge (remote + GitHub client with public request()); brainfile add --source, brainfile issues [--import], MCP issues tool and task_add source. getGitHubToken now uses the shared order (gh, GH_TOKEN, GITHUB_TOKEN, saved). Awaiting QA.
