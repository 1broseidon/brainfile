---
id: task-115
title: "A Claude Code session started by Brainfile loads the person's own brainfile MCP server beside the app's: send strictMcpConfig on session/new"
column: in-progress
position: 2
description: |-
  From the final pass (2026-10-16). `~/.claude.json` has a local-scope `brainfile: brainfile mcp` for this repository. Claude Code's ACP adapter (0.89.1) merges the person's user/project/local MCP settings with the servers the client passes, and applies `strictMcpConfig` only when the client sends `_meta.claudeCode.options`; Brainfile sends no `_meta`. So the chat, a lead and Discuss (cwd = the repository root) load two servers named `brainfile`: the app's, and the person's. Today the shim first on PATH makes the person's resolve to the app's CLI with the same inherited role, so the version is right; the cost is a duplicate server process and an ambiguous name. Workers in worktrees (another cwd) don't load it.

  Fix: on `session/new` pass `_meta: { claudeCode: { options: { strictMcpConfig: true } } }` for Claude Code (check the adapter's current field names), so only the servers Brainfile passes are loaded; other agents are unaffected. Test with the fake ACP agent that the meta is sent. Also prune old shim folders under `<dataDir>/bin/` (one per hash, never removed).
tags:
  - acp
  - claude-code
  - mcp
  - desktop
relatedFiles:
  - core/src/dispatch/session.ts
  - core/src/dispatch/agents.ts
createdAt: "2026-10-16T04:50:10.203Z"
dispatch:
  agent: claude
  by: cli
  at: "2026-10-17T05:34:12.893Z"
  tries: 1
  claim:
    host: Georges-Mac-Studio
    runner: desktop
    pid: 12851
    at: "2026-10-17T05:34:15.544Z"
assignee: claude
updatedAt: "2026-10-17T05:34:28.066Z"
---

## Description
From the final pass (2026-10-16). `~/.claude.json` has a local-scope `brainfile: brainfile mcp` for this repository. Claude Code's ACP adapter (0.89.1) merges the person's user/project/local MCP settings with the servers the client passes, and applies `strictMcpConfig` only when the client sends `_meta.claudeCode.options`; Brainfile sends no `_meta`. So the chat, a lead and Discuss (cwd = the repository root) load two servers named `brainfile`: the app's, and the person's. Today the shim first on PATH makes the person's resolve to the app's CLI with the same inherited role, so the version is right; the cost is a duplicate server process and an ambiguous name. Workers in worktrees (another cwd) don't load it.

Fix: on `session/new` pass `_meta: { claudeCode: { options: { strictMcpConfig: true } } }` for Claude Code (check the adapter's current field names), so only the servers Brainfile passes are loaded; other agents are unaffected. Test with the fake ACP agent that the meta is sent. Also prune old shim folders under `<dataDir>/bin/` (one per hash, never removed).
