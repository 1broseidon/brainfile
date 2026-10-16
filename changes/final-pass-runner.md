---
kind: Fixed
---
- A queued hand-off whose worktree could not be made (a `landsOn` branch
  that is nowhere, no trunk) no longer vanishes with its claim: its run is
  made first and fails saying why, so the window and `brainfile run` show
  it and its lead hears it, and the task's log says `Not started: …`. An
  epic's branch under another epic's branch is made after the outer one,
  instead of failing because the outer did not exist yet.
- A lead until review finishes its epic when its last unlanded child is
  landed from outside it (`brainfile land`, the MCP's land, another runner):
  the landing wakes a lead in its own runner, notes `Landed on <branch>` on
  the task so a lead in another runner sees a board change, and the lead's
  next look at the board tells a child that has landed since from one that
  had not.
- A claim given back while another runner was writing the same task file is
  tried again, a few times with a wait between; one the board keeps refusing
  is said in the task's log, rather than left held by a live runner for its
  life with the task out of the queue and no word.
- Quitting the window during a landing no longer re-runs the task on the
  next launch: the landing's checks are ended with their whole process
  group, the hand-off's claim goes back as `review` and the task is parked
  in Review for you to merge, and a lost claim whose run file says the agent
  had finished is not taken for a new try.
- The window's board host commits what its last writes left (a hand-off's
  release and note as the app quits) before it exits, and the app gives it a
  moment to; before, they were folded into the next launch's first commit.
- `brainfile dispatch --now` on a task that waits on another says so once
  and runs it here once that has landed, while something of the run is still
  going; one still waiting when nothing more is going stays queued and is
  said so, and the command exits with status 1 when nothing asked for could
  run here. Dispatching a task already queued with the same request says
  `already queued` and writes nothing; `dispatch stop <epic>` on a lead no
  runner had taken up says its request was taken off the board, not that it
  was stopped.
- A worker's MCP `review action=land` and `pull_request` are refused with
  the command line's sentence (decision-15), rather than a schema error or a
  pull request's `open` quietly turned into `status`; and a worker is no
  longer sent to `brainfile pr`, which it cannot run.
- Run ids carry the runner's process as well as when it started, so two
  runners started in the same millisecond never share a run file.
- The CLI bundle is built beside `dist` and moved into place file by file,
  so a `brainfile mcp` started during a rebuild never finds `cli.js` without
  the `cli.mjs` it imports; the window's agents process says when the bundle
  is missing, and the desktop's dev loop builds the CLI (and core, when it
  has no dist) once at start, so the app's own CLI is never stale.
- A runner that stays up for days lets go of the runs that ended long ago as
  it prunes their files, and keeps the ends heard from other runners only
  while their files are.
