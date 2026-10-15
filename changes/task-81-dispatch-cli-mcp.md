---
kind: Added
---
- `brainfile dispatch <ids…|--column|--parent> [--agent --model --effort
  --until review|done]` queues tasks for a coding agent: `dispatch:` on each,
  the agent its assignee, for a runner on this machine (`brainfile run`, the
  desktop) to start in its own worktree. It says when no runner is up;
  `--now` runs them here in the foreground until they end.
  `brainfile dispatch status` lists the runners, live runs, queue and claims
  from the board and the run files; `brainfile dispatch stop <run|task>`
  stops a run, whichever runner has it.
- `brainfile review <task>` shows a hand-off's branch, commits, files and
  conflicts; `review --ready` lists what can land. `brainfile land <task>`
  checks with the contract's validation, then lands; a conflict or failed
  check is sent back through the queue. `brainfile discard <task>` throws the
  work away. `brainfile agents` lists the agents, which are installed, and
  their models.
- The MCP server has the same as `dispatch`, `dispatch_status`,
  `dispatch_stop`, `review` (show, ready, land, discard) and `agents`.
- `brainfile mcp` reads `BRAINFILE_AGENT_ROLE` (chat, lead, worker, discuss):
  a worker's or a discussion's server lists no dispatch, stop, land or
  discard, and a lead's reaches only the tree under `BRAINFILE_LEAD_SCOPE`.
  Core's runner starts every hand-off's board server as a worker, and the
  desktop its chat, leads and discussions with their roles.
- Core: `Runner`'s `sendBack: 'queue'` sends a failed landing back through
  the queue rather than starting the agent in the calling process;
  `projectOfBoard` names the project a board belongs to; `brainfileMcp` and
  sessions take a role.
