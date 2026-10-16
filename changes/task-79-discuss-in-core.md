---
kind: Added
---
- `brainfile mcp` serves a `discuss` prompt (argument `taskId`) and a
  `discuss` tool that returns the same text. Either hands the agent the task
  as the board has it, including its branch, worktree and any agent working on
  it now, and the rules of a discussion: change only this task's
  description, subtasks and contract, with the person's yes; run `check`
  before recording a decision; note what was agreed; write no code.
- Core: Discuss's context and rules moved from the desktop to
  `@brainfile/core/dispatch` (`discussContext`, `taskInformation`,
  `workInformation`, `discussRules`, `discussPreamble`, `discussPermission`,
  `chatPermission`, `discussMode`). New: `discussWork(projectId, taskId,
  runner)` reads the review from git and the live run from the Runner.
  `discussSession(ctx)` is the text for a session outside the window.
  `discussRules` takes a surface, `window` (default) or `session`.
