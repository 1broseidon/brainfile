---
kind: Fixed
---
- `contract validate` (CLI and MCP) run from another git worktree of the
  repository checks the deliverables and runs the validation commands in that
  worktree, not in the checkout the board was found from, so a hand-off's
  work no longer reads "File not found" or fails a check it passes. It marks
  the contract done and leaves the task open: the work is on its branch, and
  the task completes when that lands. The MCP result says where it checked
  (`checkedIn`).
