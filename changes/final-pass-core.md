---
kind: Fixed
---
- A contract check that runs past its time is stopped whole, the shell and
  what it started, and the landing says it timed out; before, only the shell
  was killed, and the landing hung on what the shell left running. A runner
  going down can stop every check still running with `stopChecks()`.
- Landing, and bringing an epic's target into its branch, make their merge
  commits past the repository's commit hooks (`--no-verify`, as commit-tree
  already is): a commit-msg hook (husky, commitlint) refusing "Merge main into
  dispatch/task-N" no longer refuses every landing.
- A checkout on the trunk that will not take the landing's fast-forward for a
  reason other than the trunk moving (a merge of the person's own left in
  progress) is refused once, in git's words, instead of running the checks
  five times and blaming a moving trunk.
- An agent that starts but refuses a session (not logged in, say) is killed
  and let go of; before, its process stayed behind.
- A session that writes no code can no longer rename, delete, copy, force or
  re-point a branch through `git branch` with a listing flag first (`git
  branch -v -m a b`, `git branch -r -d origin/x`): every option must list, and
  a plain word is allowed only in list mode. `brainfile pr --status` no longer
  counts as reading: it can complete the task, move its base and remove its
  worktree.
- An agent whose `BRAINFILE_AGENT_ROLE` names no role this version knows is a
  worker, the least access, and stderr says so once; before it had a person's
  full access.
- Agents no longer inherit the Claude Code session or the `npm run` their
  runner was started under (`CLAUDECODE`, `CLAUDE_CODE_*`, `CLAUDE_PID`,
  `npm_*`, `INIT_CWD`, `NODE_ENV`), which had them run as nested.
- `offerEpicBranch` makes the epic's worktree under the worktrees root it is
  given (`BRAINFILE_WORKTREES` by default), with the hand-offs'; core's
  worktree tests set that root, so they leave nothing in
  `~/.brainfile-worktrees`.
- `@brainfile/core` and `brainfile` say they need Node 20.19 or later (the
  ACP SDK is ESM only), and no longer ship their compiled test fixtures.
