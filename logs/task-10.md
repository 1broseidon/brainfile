---
id: task-10
type: task
title: "MCP tools: adopt 2026-07-28 structured output + list caching"
tags:
  - mcp
  - agents
  - dx
relatedFiles:
  - cli/src/mcp/tools
createdAt: "2026-08-12T04:28:46.702Z"
completedAt: "2026-08-12T05:16:12.885Z"
---

## Description
Now that we're on SDK v2 / spec 2026-07-28: our 10 tools return JSON stringified into text content. Adopt outputSchema + structuredContent so agents get typed results instead of parsing strings; set honest ttlMs/cacheScope on list_tasks/search results; consider icons metadata (SEP-973) for tool listings. Small effort, direct agent-experience win, rides the fresh SDK.

## Log
- 2026-08-12T05:16:12.885Z: [reconstructed] Archived body lost to migrate --logs-to-ledger (destructive pre-fix); frontmatter and description restored from ledger record.
