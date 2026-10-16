---
kind: Added
---
- `brainfile dispatch policy [ask|bypass|clear] [--all]`: the repository's
  permission policy in `dispatch.json` (the data folder, shared with the
  window), which decides how far `--until done` and an epic's lead go. Until
  now only the window's Settings wrote it, so from a terminal or an MCP
  client `--until done` always stopped in Review. With no argument it prints
  the policy in force, where it comes from and where the file is. The
  person's own: refused for any agent's role, and no MCP tool.
