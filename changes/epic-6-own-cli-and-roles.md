---
kind: Fixed
---
- Desktop: the agents it starts (the chat, an epic's lead, a hand-off) get
  the app's own `brainfile`, run by the app's binary as node: their board
  server, and the `brainfile` first on their shell's PATH. Before, they got
  whichever `brainfile` was installed, and an older one has no dispatch
  tools, so the chat could not hand off and a lead stalled without a word.
  The packaged app ships its CLI in its Resources; when it cannot be found,
  the chat or the lead says so. Making a board (`brainfile init`) uses it
  too.
- An agent's shell carries its role (`BRAINFILE_AGENT_ROLE`), and the CLI
  keeps to it as `brainfile mcp` does: a worker or a discussion cannot
  dispatch, stop, land, discard or open a pull request from the command
  line, a lead only in its own tree, and no agent runs `brainfile run`,
  `dispatch --now` or `discuss` inside its turn. The chat and a lead run only
  the `brainfile` commands that read without being refused.
- The MCP `pull_request` tool keeps to the role as `review` does: a worker's
  or a discussion's server only asks where one stands.
- `brainfile dispatch`, `run`, `discuss`, `review`, `land`, `discard`,
  `agents`, `pr`, `adopt`, `merge-boards` and `backups` beside a folder of
  the same name run the command instead of opening the TUI on the folder.
- The CLI reads its arguments as node's when an Electron binary runs it as
  node.
