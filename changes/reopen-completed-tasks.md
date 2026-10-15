---
kind: Added
---
- `brainfile restore` reopens a completed task on a v2 board: it comes back
  from `logs/` to a column, leaves the ledger, and its log says why
  (`--reason`). The MCP server has the same as `task_restore`.
