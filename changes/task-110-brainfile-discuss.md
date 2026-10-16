---
kind: Added
---
- `brainfile discuss <task> [--agent --model --effort]` talks a task over
  with an agent in the terminal, under the same rules as the desktop's
  Discuss (decision-19). The session is core's, opened through a runner, its
  `brainfile mcp` in role `discuss`, in the agent's read-only mode when it
  has one. Edits and commands are refused before anyone is asked; any other
  ask comes to the prompt (Allow once, Always, Deny). Ctrl-C ends it: the
  agent notes what was agreed on the task first, and a second Ctrl-C leaves
  at once.
- Core: `discussPermission` takes a surface. In a `session` it allows git
  that only reads, as its rules say; the window's discussion still runs no
  commands. New `readsGit(command)` in `@brainfile/core/dispatch`.
