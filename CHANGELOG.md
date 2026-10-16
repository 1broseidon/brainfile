# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com); versions are synced across
`brainfile` (CLI) and `@brainfile/core`.

## [Unreleased]

## [0.23.0] - 2026-10-16

### Added
- Desktop: handing off an epic, or any task with open children, starts its
  lead. The lead checks the plan first (the children, the files each touches,
  whether the dependencies are right), writes it on the epic, then hands the
  children off in order, woken as each ends or lands, inside rules the app
  holds: dependencies done first, at most three hand-offs at once per
  repository, retries to the contract's `maxRetries`, and only the lead
  dispatches in its tree. Pause, Resume and Stop are in the epic's pane; a
  lead left by a restart resumes from its notes.
- `brainfile dispatch policy [ask|bypass|clear] [--all]`: the repository's
  permission policy in `dispatch.json` (the data folder, shared with the
  window), which decides how far `--until done` and an epic's lead go. Until
  now only the window's Settings wrote it, so from a terminal or an MCP
  client `--until done` always stopped in Review. With no argument it prints
  the policy in force, where it comes from and where the file is. The
  person's own: refused for any agent's role, and no MCP tool.
- `brainfile restore` reopens a completed task on a v2 board: it comes back
  from `logs/` to a column, leaves the ledger, and its log says why
  (`--reason`). The MCP server has the same as `task_restore`.
- A hand-off can land by pull request instead of a merge (decision-16):
  `brainfile pr <task>`, the MCP `pull_request` tool and the desktop's Open
  pull request push the task's branch, and only it, to origin and open a
  GitHub pull request into the branch it lands on, titled with the task's
  title. The task records it as `pullRequest: { number, url, state, base,
  head, at }`; while it is open the hand-off is out of Ready to merge (for
  the phone too) and Merge refuses it. `brainfile pr <task> --status`, and
  the desktop about once a minute, ask where it stands: merged, the task
  completes and its worktree and local branch go (a squash or rebase counts
  when the branch is what the pull request carried); closed without merging,
  it is back in Ready to merge. Core: `openHandOffPullRequest`,
  `openBranchPullRequest` (any head and base), `followHandOffPullRequest`
  and `releaseMergedHandOff` in `@brainfile/core/forge`, and
  `openPullRequest`, `pullRequestState` and `pullRequestFor` on its GitHub
  client, ETag and a minute's memory included.
- Desktop: an open pull request shows as `#12` on its row, in Review and
  under Open pull requests in the feed; an epic's Merge menu offers Open a
  pull request as its fourth choice. When the trunk has commits origin
  lacks (landing never pushes), Ready to merge and the feed say `main is 3
  commits ahead of origin` (core's `unpushed`).
- A pull request is refused when the branch it goes into has landings here
  that origin's copy lacks (Merge lands locally and never pushes), since it
  would carry them too: it names them and says to push that branch first,
  or Merge instead. Once a pull request merges, the local branch it went
  into follows origin's (a fast-forward, or onto a squash that has all it
  had), unless it is checked out or has work origin's lacks; the task's log
  says which. Core: `carriedUnpushed` and `followOrigin`.
- A task can land on a branch other than the trunk: `landsOn: <branch>` on
  it, or on anything above it, is the branch its hand-off forks from and
  merges back into (decision-16). `brainfile patch --lands-on` /
  `--clear-lands-on` and the MCP `task_patch` tool set and clear it, a name
  git would not take as a branch is refused, and `brainfile lint` warns when
  the branch is neither in the repository nor on origin. Core resolves it up
  the tree with `targetOf` / `landsOnOf`, and `@brainfile/core/repo` chooses
  the fork and the landing from the board (`handOffTarget`, `prepareTarget`),
  so the desktop and headless runners agree.
- `epicBranch: true` on an epic gives it a branch of its own,
  `dispatch/<epic-id>`, made from the epic's target when its lead starts
  (`prepareBranch`). Its children fork from and land on it, the epic's
  target is brought into it before each hand-off (`bringIn`: in a checkout
  of its own, never the person's, by compare-and-swap), and when the last
  child is done the epic is one item in Ready to merge.
- Desktop: Hand to… says where the hand-off lands, `Lands on main`, with a
  picker of the trunk, branches and recent targets that writes the choice to
  the task. Merge on an epic with its own branch asks where it goes: its
  target, another branch, or kept as a branch, which completes the epic.
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
- The dispatch record on a task is core's: `dispatch:` holds the request
  (`agent`, `model`, `effort`, `by`, `at`, `until`, `role`) and the `claim`
  of the runner that started it, taken by compare-and-swap on the task file
  so two runners never start the same task; a claim from another machine is
  never taken without force. `lint` warns on a malformed record. The
  desktop's hand-offs write it through core.
- `@brainfile/core/repo` has run and runner files under `.brainfile/state/`
  (`runs/<run-id>.json`, `runners/<host>-<pid>.json`), written atomically,
  with a heartbeat that says when a run is lost and pruning of ended runs
  after 30 minutes. Nothing writes them yet.
- `brainfile issues` lists the open issues of the GitHub repository the
  project's origin points at and marks each one a task on the board, open or
  completed, already carries; `--import <n…>` makes a task from each (title,
  body as the description, labels as tags, the issue's page as `source:`),
  in `--column` or the first column that is not done, and finds one already
  made rather than making it twice. The MCP server has the same as `issues`
  (`action` list or import).
- `brainfile add --source <url>` and MCP `task_add`'s `source` make a task
  from an issue by hand, refused when a task already carries that URL.
- `source` is a typed task field in core (`Task.source`,
  `TaskFileInput.source`), with `issueTask`, `linkedTask`, `labelTag`,
  `sourceKey` and `sourcesOf` in the main and browser entries, and forge
  detection and the GitHub issues client (pages, the ETag, the once-a-minute
  read) in the new Node-only `@brainfile/core/forge`, shared by the CLI and
  the desktop app. Both look for GitHub credentials in one order: `gh auth
  token`, then `GH_TOKEN` or `GITHUB_TOKEN`, then the saved token.
- `brainfile fix [--dry-run] [--undo] [--expected <words>]`: the desktop's
  Fix from the command line. It says what is wrong with where the board lives
  in the desktop's words, and what fix would do, then does it while that is
  still the plan shown: only a fix that loses nothing (untrack the code
  branch's old copy, adopt the copy that has everything, forget a lost
  checkout), with every copy backed up first. `--undo` puts it back within 20
  seconds, whether the CLI, an agent or the desktop ran the fix: Undo now
  reads `.brainfile/state/last-fix.json`, not the desktop's memory.
- MCP: `where` reports `fix` (the problems and the plan) and takes
  `action: fix` (with `expected`, the plan's words) or `action: undo`.
- Core: `planFix`, `applyFix`, `undoFix`, `lastFix` and `boardProblems` in
  `@brainfile/core/repo`, moved from the desktop, which now calls them.
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
- `brainfile run [--once] [--max N] [--until review|done]`: a foreground
  runner for a terminal split. It writes its runner file, works the board's
  queue (tasks and epics' leads, and what the leads hand off), prints one line
  per change (`task-74 · codex · editing`, `task-74 in Review`), asks you at
  its prompt one ask at a time, and on Ctrl-C stops its agents and gives
  their tasks back to the queue, its leads' with them. `--once` returns when
  nothing more can start. The desktop and another `brainfile run` share the
  queue through claims. `dispatch --now` now runs through the same loop.
- The TUI's rows say what an agent is doing on a task (`● codex · editing`),
  from the run files, and change as the run does.
- Core: `Runner.letGo()` and `settled()`; `RunnerOptions.until` and
  `maxRunning`; a runner that works a queue keeps its runner file beaten
  while idle; a claim released with no outcome is queued again; a runner
  closing no longer pauses a lead whose turn it stops.
- An epic's lead runs from the CLI and MCP, not only in the desktop.
  `brainfile dispatch <epic>` queues a lead: `dispatch:` with `role: lead` on
  the epic. A runner that takes up leads claims it, so one lead runs a tree
  across processes and machines. `--now` leads it here until it ends. The
  lead's `brainfile mcp` is started as the lead of its epic. The runner
  checks the lead's rules again before it starts what the lead queues.
- `brainfile dispatch pause|resume <epic>` and `dispatch stop <epic>` reach the
  lead through its record, whichever runner leads it. `dispatch status` lists
  the leads. The MCP server adds `dispatch_lead` (pause, resume), and
  `dispatch_stop` takes an epic's id.
- A child's hand-offs are counted in `tries` on its record. Past its
  contract's `maxRetries`, a child the lead asks for waits in Review. A child
  whose contract is still a draft waits for the person, as one the lead added
  does.
- Core: the lead (`Leads`, `planReport`, `readTree`, `leadRefusal`) is in
  `@brainfile/core/dispatch` beside the `Runner`. The Runner gains `lead`,
  `pauseLead`, `resumeLead`, `stopLead`, `guard`, `boardChanged`, `workLed`,
  `queuedLeads`, and the `leads` and `onLead` options. `readLeadRecord` and
  `changeLeadFile` are in core. The desktop's older `lead:` record is read as
  a lead waiting for a runner, and replaced when one claims it.

### Changed
- Desktop: the dock holds the board's agent sessions (its chats, discussions
  and hand-offs), each with its agent and where it stands (at work, Needs
  you, Reply waiting, how a hand-off ended), and opens one where it was
  left. Opening a document no longer makes a tab: the palette lists recent
  documents first.
- Changes are written to `changes/`, one file each, and folded into
  CHANGELOG.md by `npm run version:set` at release, so two branches never
  conflict in the changelog. `npm run changelog` shows the next release.
- Core: starting and talking to ACP agents moves out of the desktop into the
  node-only subpath `@brainfile/core/dispatch` (decision-18), which takes
  `@agentclientprotocol/sdk` as a dependency: the agents Brainfile knows and
  how each starts, custom agents and the ACP registry, the dispatch settings
  and model cache, sessions, permissions and a hand-off's brief. It reads the
  same data folder as the desktop (`BRAINFILE_DATA_DIR`, else the platform's),
  so nothing moves. Internal: the desktop behaves as before, and nothing in
  the browser or main entry loads it.
- Core: hand-off worktrees, their review, Ready to merge, the checks,
  landing by compare-and-swap, discard and the send-back note move from the
  desktop into `@brainfile/core/repo` (`prepareWorktree`, `reviewOf`,
  `readyToMerge`, `landReview`, `sendBackNote` and the rest), so the CLI and
  headless runners hand off and land the way the desktop does.
  `prepareWorktree` takes the branch a hand-off forks from and lands on, the
  trunk unless given.
- Landings run one at a time per repository across processes, not only
  inside the desktop: a lock file in the board's `state/`
  (`.brainfile/state/landing.lock`, with the pid, host and time of its
  holder) is shared by the CLI and the desktop. A landing that finds it held
  waits for it, and one whose holder has ended is taken over.
- The desktop works the queue while it is open. A hand-off queued by
  `brainfile dispatch`, an MCP client or the chat starts there, an epic's
  lead included, unless `brainfile run` in a terminal claims it first.
- The desktop shows runs started outside it. A run that `brainfile run`,
  `dispatch --now` or an MCP client works on this machine gets the row's
  line and a tab in the dock, marked `in a terminal`; Stop reaches it, and
  Ready to merge is asked again when it ends. The phone hears them too.
- An ask from a run in a terminal shows in the desktop's band, saying where
  it waits. Allow or Deny writes `.brainfile/state/runs/<run-id>.answer.json`,
  which that runner applies within a second, taking its own prompt down.
- The desktop's chat hands work off through its `brainfile mcp` (`dispatch`,
  `dispatch_status`, `dispatch_stop`, `dispatch_lead`). The desk, the app's
  own small MCP server for the chat, is gone.
- Core: `Runner.answerAsk` answers another runner's ask through its answer
  file, which the owning runner applies and then calls `cancelAsk`.
  `Runner.others` lists other runners' run files, ended and lost ones
  included. The `fromOf` option names the chat turn behind a hand-off started
  from the queue. `writeRunAnswer`, `readRunAnswer`, `removeRunAnswer` and
  `runAnswerPath` are in `@brainfile/core/repo`; `pruneRunFiles` removes
  answers whose run has ended. `DESK_TOOL` is gone.
- A request the desktop wrote before runners claimed tasks (no claim and no
  `tries`, by the person, the chat or a lead) on a task already in Review or
  done is no longer queued (`answeredBefore`): its hand-off has run, so a
  runner working the queue does not run it again.

### Fixed
- `contract validate` (CLI and MCP) run from another git worktree of the
  repository checks the deliverables and runs the validation commands in that
  worktree, not in the checkout the board was found from, so a hand-off's
  work no longer reads "File not found" or fails a check it passes. It marks
  the contract done and leaves the task open: the work is on its branch, and
  the task completes when that lands. The MCP result says where it checked
  (`checkedIn`).
- Desktop: a task that depends on another now waits until that one's branch
  has landed, not just until it is complete on the board, so the work that
  follows is made from a trunk that has what it builds on. On a board with no
  Review column, a hand-off on its own branch no longer completes its task:
  the task is completed when its branch lands.
- Desktop: a hand-off forks from origin's trunk when the local one is only
  behind it (pull requests merged on the forge and never pulled), and landing
  brings the local trunk up to date, instead of building on and landing onto
  a stale copy. A local trunk with commits of its own is still the one used.
- Desktop: a hand-off's brief carries what the tasks it depends on said when
  they finished, including what they left unwired for it, and asks it to wire
  its part into theirs. An epic's lead makes sure one child puts the pieces
  together and tests the whole, and moves what a child left for later into
  the task that will do it.
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
- Upgrading no longer re-runs old hand-offs: a `dispatch:` record an earlier
  Brainfile wrote (no claim and no `tries`) is answered whatever its column,
  and the window's old `lead:` on an epic waits for you to resume it, listed
  paused, instead of starting. Every request written now carries `tries`.
- A runner never starts an agent it could not claim the task for (a busy or
  missing task file, a board conflict in the window): the start is refused
  and says why, rather than running the task again and again.
- `dispatch stop` and the window's Stop reach another runner's run through
  `state/runs/<run-id>.stop.json`, which that runner honours; it can no
  longer be lost in the runner's own writes, and no runner's process is
  sent SIGTERM any more.
- A task being landed (its checks can take minutes) cannot be started, sent
  to another agent or landed twice meanwhile: "landing in progress".
- A lead taken up from the board when every child is complete but some have
  not landed finishes the epic (landing them first in a bypass repository)
  instead of being refused on every pass.
- Quitting the app stops its hand-offs and gives their claims back as
  stopped, so the next launch does not start them again; handing a stopped
  task off again, or a runner taking up one whose runner went away, carries
  on the same try.
- A runner that stays up tidies `state/runs` every few minutes, not only
  when it first looks at a board.
- An epic with a branch of its own is put up to merge when its last child
  lands with no lead, whatever lands it (`brainfile land`, the MCP's land,
  `brainfile run`, Merge), not only through the window.
- A lead hears when a child another runner ran fails or is stopped; it no
  longer shows as stopped for a moment as it finishes; and two passes over
  the queue can no longer start past the limit together.
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
- A hand-off aimed at a branch other than the trunk counts as landed only
  when its work is in that branch, what it tracks, or origin's copy of it,
  no longer when it is in origin's trunk.
- An epic handed off until done (bypass): a child whose branch conflicts with
  the trunk when it ends is now landed like the others, so the conflict goes
  back to the agent that did it, with a note saying how to settle it
  (decision-12). Before, the lead landed only children that merged cleanly,
  and one that conflicted waited in Review with nothing sent back.
- The board server handed to agents is the `brainfile` on the PATH the runner
  reads and hands its agents. Before, it was looked up on the PATH the process
  was started with, which can find an older `brainfile`.
- The warning for a validation command that `cd`s into the board's own
  workspace now also fires when the workspace is reached through a symlink,
  as macOS's temporary folders are.

## [0.22.1] - 2026-10-13

### Fixed
- A board never commits `state/`, this machine's bookkeeping (`sync.json`,
  `autosync.lock`, `tui.json`, brief checkpoints, the search index), whatever
  its `.gitignore` says. A board that came to track it, from a commit made
  before its `.gitignore` listed `state/`, had every sync rewrite it and the
  next command commit it, reads included: history filled with `list`, `show`
  and `edit: state/...` commits. The next commit or sync untracks it in a
  commit of its own, keeping the files on disk, and adds `state/` to the
  board's `.gitignore` when it is missing.
- A sync that brings in another machine's `state/` (from an older version
  still committing it) no longer stops on a conflict there, and leaves this
  machine's copy as it was.
- `merge-boards` and `adopt` no longer fail with "paths are ignored" on a
  board folder whose `.gitignore` lists `state/`.

## [0.22.0] - 2026-10-12

Memory moves onto the board, and the board learns its own shape. Decisions
with claim families, one search over a local index, a brief that starts
every session, and `check` before acting (spec-11). Every board has epics,
specs, plans, tasks and decisions, and knows how they fit together
(spec-12). A repository has one board, and Brainfile notices when it has two
(spec-15). Boards name their sisters in other repositories (spec-10).
Everything the CLI does to a board has an MCP tool (spec-13), and the TUI
catches up (task-19, task-20).

### Upgrading

- A parent with open children no longer completes, whatever its type (it was
  only epics); `--force` still overrides.
- Decisions are not listed in columns; `list --type decision` lists them.
  `--type adr` now writes a `decision` (`decision-N`); existing `type: adr`
  files read as decisions and keep their IDs, and a board's own `types.adr`
  entry no longer applies.
- `idPrefix` in `types:` now names new IDs; a `strict` board with no
  `types:` map refuses types it doesn't know.
- The SessionStart hook prints a real brief (about 1,600 characters) where
  it printed a reminder.
- `search` answers from a local index on Node 22.13 and later
  (`node:sqlite`); older Node scans as before. `engines` stays `>=20`.
- While two copies of a board disagree, writes are refused until `adopt` or
  `merge-boards` settles it; `migrate --to-branch` always commits the old
  copy's removal from the code branch.
- `contract validate` and `template` exit 1 when they fail; scripts that
  ignored a failed validation will now see it.

### Added

#### Memory and decisions

- `brainfile decide -k <claim.key> "text"` records a decision in its claim
  family (`--kind`, `--stance`/`--subject`, `--holds-while`, `--recheck`,
  `--valid-until`, `--source` with its sha256, `--package name<op>version`,
  `--for` work that rests on it). The family's current decision is
  superseded: status, `supersedes`/`supersededBy` both ways, moved to
  `logs/`. An empty family lists related ones (same parent key, same words).
  `supersede <id> "text"` replaces one by hand; `retire <id> --as
  rejected|stale` lets one go. One board commit per command; no ledger lines.
- `brainfile check "<action>"` (or a decision ID, `--claim-key`,
  `--claim-key-prefix`) answers `use`, `review`, `use_replacement` or
  `no_decision` in recoil's order, with the stance rule and the predicates
  `validUntil`, source unchanged and package version (package.json,
  go.mod, pyproject.toml). Exit codes 0, 2, 3, 0; errors 1.
- A local search index at `.brainfile/state/index.db` (gitignored,
  rebuildable) on Node's own `node:sqlite` with FTS5: board and logs
  documents, the ledger, `plans/` and the project's Markdown, via `git
  ls-files` so `.gitignore` holds. Tracked by size, mtime and sha256; changed
  files replace their chunks. `brainfile index [--rebuild] [--status]`.
- MCP: `decide`, `supersede` and `check` (fourteen tools).
- Core: `decisions` (claim families, stance rule, verdicts; also in
  `@brainfile/core/browser`), `decideFile`, `supersedeDecisionFile`,
  `retireDecisionFile` and the file predicates in the main entry, and the new
  Node-only `@brainfile/core/memory`: `MemoryIndex`, `searchMemory`,
  `composeBrief`, `checkDecision`, `checkClaimKeyPrefix`.
- `/v2/decision.json` documents `sourcePath`, `sourceHash` and
  `packageVersion`.

#### Types and the graph

- Five built-in types that need no `types:` entry: `epic`, `spec`, `plan`,
  `task` (alias `issue`) and `decision` (alias `adr`). `brainfile types`
  prints each with its place in the graph; `types add <name> --like <type>`
  takes a built-in's place (parents, children, completion rule, glyph).
- Containment by `parentId`: epic ▸ spec · plan · task, spec ▸ plan · task,
  plan ▸ task, task ▸ task. `list --tree` prints the outline (`--parent` for a
  subtree); `show` names the parent and children.
- `decisions: [ids]` on work: the decisions it rests on. `add --decisions`,
  `patch --decisions`; `show` lists them with where each stands and says when
  one is superseded, and a decision shows the work resting on it. The reverse
  is computed, never written.
- `patch --parent / --clear-parent` and `--depends-on / --clear-depends-on`;
  `add --depends-on`; `list --type` and `search --type`, aliases included.
- MCP: `task_add` and `task_patch` take `decisions` (and `dependsOn`);
  `list_tasks` takes `tree: true` and lists decisions with `type: "decision"`;
  `get_task` returns `graph`; `search` takes `type`.
- `/v2/decision.json`; `task.json` documents `parentId` and `decisions`;
  `board.json` documents `like`.
- Core: `docTypes` (registry, `resolveDocType`, `parentFit`) and `docGraph`
  (`buildDocGraph`, `docPlace`, `checkDocumentLinks`, `lintDocGraph`), both in
  `@brainfile/core/browser`; `readBoardGraph` and
  `findWorkOnSupersededDecisions` in the main entry.

#### Board integrity

- Brainfile looks for every board a repository has: the `.brainfile/` folder
  in the checkout (tracked by the code branch or not), the `brainfile` branch,
  the remote's `refs/brainfile/<name>`, and checkouts of the board branch
  outside `.brainfile/`. `brainfile where` (and the MCP `where` tool) lists
  them with document counts and last change, says how the two stand (one
  already has everything the other has, or each has changes the other
  lacks), and `--fetch` / `fetch: true` asks the remote first.
- While two boards disagree, every write from the CLI or the MCP tools is
  refused, naming the command that settles it; reads still
  work. A board ahead of or behind the remote is not two boards.
- `where` says how many changes on the remote are not here yet, and reports a
  code branch that still tracks an old copy of `.brainfile/`.
- `brainfile adopt <ref|path>` takes one board as it is; `brainfile
  merge-boards <ref|path>` combines two by document ID on the field-level
  merge, renumbering the newer of two different documents that share an ID
  and rewriting references to it, and adopts outright when one board already
  has everything. Both leave one board on its branch at `.brainfile/`,
  descending from the remote's copy, with the code branch no longer tracking
  `.brainfile/` (one commit).
- `migrate --to-branch` finishes the move: a code branch that tracked the
  board drops `.brainfile/` and ignores it in one commit, built so other staged
  work stays staged; on a board already on its branch it makes that commit if
  the code branch still tracks an old copy; and when a board already lives on
  the branch it says the two are two boards and points to `merge-boards`
  instead of failing on the checkout.
- One home for the board branch: `where` and `lint` report a checkout of it
  outside `.brainfile/`; a checkout whose folder is gone is forgotten before
  the board is checked out (it used to block that) or by `lint --fix`. `lint`
  reports two boards as an error.
- Backups: anything that replaces a board saves it first as
  `refs/brainfile/backups/<UTC time>-folder|branch`. `brainfile backups` lists
  them; `brainfile backups restore <name>` puts one back.

#### Related boards

- `related:` in `brainfile.md` names sister boards in other repositories:
  a short alias for a folder relative to this repository's root, committed
  with the board.
- `alias:task-id` (for example `mobile:task-12`) works anywhere a task ID
  does: `dependsOn`, `show`, and MCP tool arguments. The alias resolves to
  that folder's board exactly as running `brainfile` there would, branch
  worktree included.
- A `dependsOn` on a related board blocks until that task is completed
  there; contract pickup uses the same rule. A folder that is not on this
  machine keeps the reference valid, says so in `show` and `list`, and
  counts as not done.
- `list --related` shows the open tasks on related boards that this board's
  tasks depend on, `--related all` every related board's open tasks; MCP
  `list_tasks` takes the same option. `lint` checks the `related:` map.

#### MCP and the command line

- `brainfile columns`: list (the default, with task counts and `--json`),
  `add <title>` (`--id`, `--after`/`--before`, `--completion`), `rename
  <column> <title>` (the ID stays, so its tasks do), `reorder <columns...>`
  (the ones named first, the rest after) and `remove <column>`, which refuses
  a column that holds tasks unless `--move-to` names where they go; they
  move there without being completed. One board commit per change.
- MCP: eleven more tools, twenty-five in all: `note` (append to a task's log,
  attributed like `brainfile note`), `log` (one task's log, a search, the
  most recent), `columns` (the operations above), `board` (read; set the
  title, agent instructions and `related:` entries), `types` (list with the
  graph; add with `like`, `idPrefix`, `completable`), `template` (list; use),
  `lint` (`fix: true`), `sync` (`pull`/`push`), `where`, `retire` and
  `adr_promote`. Every one has an output schema; every write is one board
  commit. `list_tasks` reports a document's own `status` and filters by it.
- The bundled schemas as MCP resources: `brainfile://schema/board` and
  `brainfile://schema/base`.
- `brainfile mcp` sends server instructions: use these tools for every board
  change, never edit `.brainfile/` by hand, start with `brief`, note as you
  go, `check` before acting; then one line per tool.
- A parity test enumerates the CLI's commands and fails unless each maps to
  a tool, a resource, or an exclusion with a reason (`tui`, `mcp`,
  `merge-driver`, `hooks`, `auth`, `config`, `init`, `migrate`, `restore`,
  `index`).
- Core: `addColumn`, `renameColumn`, `reorderColumns`, `removeColumn`,
  `readBoardSettings` and `updateBoardSettings` (pure, also in
  `@brainfile/core/browser`), and their `*File` forms with
  `summarizeColumns`; `removeColumnFile` moves a column's tasks first or
  refuses.

#### TUI

- The TUI has a decisions view, on `D` and at the type cycle's `decision`
  stop: standing decisions grouped by claim-key family, history (superseded,
  rejected, stale) folded below and opened with `L`. Rows lead with `●`
  (`○` once retired) and say only a kind other than `decision`, `proposed`,
  `review` past `validUntil`, or where a retired one went.
- A decision's detail in the TUI: claim key, kind, stance and subject, holds
  while, recheck, valid until (`review` once past), replaces and replaced by,
  and the open work resting on it, each opened from the detail cursor.
- Work's detail in the TUI lists the decisions it rests on, a retired one
  marked `superseded → decision-2`; its row says `decision changed`.

#### Core

- `@brainfile/core/repo`: the board's git storage, sync, merge driver and
  autosync, moved from the CLI into core for other hosts to use (Node and
  git only; the main and browser entries stay free of git). The CLI behaves
  as before.

### Changed

#### Memory and decisions

- `search` (CLI and MCP) uses the index when Node has `node:sqlite` (22.13
  and later): AND then OR, titles over bodies, current results first and
  history (completed work, superseded decisions) in its own lane, every hit
  with its path and line range, and the project's docs alongside the board.
  Filter tokens work as before. Elsewhere, or with `BRAINFILE_INDEX=off`, the
  scan answers in the same shape. New: `search --json`, `--limit`,
  `--no-history`.
- `brief` prints one budgeted block (about 1,600 characters, `--max-chars`):
  work resting on a superseded decision and decisions whose predicates broke,
  current decisions, your tasks (or the work in flight), what changed since
  your checkpoint, and the docs that bear on your tasks. `--json` adds
  `sections`, `text`, `maxChars` and `truncated`; `lanes` is unchanged.
- The SessionStart hook injects that brief (Claude Code:
  `hookSpecificOutput.additionalContext`) instead of a reminder, from a lean
  entry that loads neither commander, the MCP server nor the TUI (~150ms
  warm).
- `log --recent` and MCP `search recent` leave out decisions retired to
  `logs/`; they were never completed.

#### Types and the graph

- A parent with open children refuses to complete, whatever its type (it was
  only epics); `--force` still overrides. A decision is never completed.
- An off-pattern parent (an epic under a task, anything under a decision) is a
  `lint` warning; on a `strict` board `add`, `patch` and `lint` refuse it. A
  `parentId` or `dependsOn` loop is always refused.
- `--type adr` writes `type: decision` with a `decision-N` ID, no column and
  `status: current`; `--type issue` writes a plain task. Existing `type: adr`
  files read as decisions and keep their IDs.
- A strict board accepts the five built-ins without listing them.
- New IDs use the type's `idPrefix` from `types:`; before, the prefix was
  always the type name whatever `idPrefix` said.
- `list` leaves decisions out of the columns (they have none) and says how
  many; `list --type decision` lists them. `brief` orients against current
  decisions as well as accepted ADRs.

#### Board integrity

- `migrate --to-branch` always commits the old copy's removal from the code
  branch; `--commit` is accepted and hidden.

#### MCP and the command line

- The commander program is built by `createProgram()` in `src/program.ts`;
  `cli.ts` parses it. Nothing changes for the command line.

#### TUI

- The TUI no longer puts decisions in a column (with none they landed in
  `todo`) or retired decisions in the done view. In the decisions view the
  board's mutating keys say how decisions change (`decide`, `supersede`,
  `retire`) instead of acting; `e` still edits.
- The TUI's detail cursor is drawn as a bar as well as reverse video, so it
  shows under `NO_COLOR`; archived documents show their description.
- The TUI's list keeps a child under its parent across columns: it is drawn
  in the parent's tab, says its own column at the row's right edge (`review`),
  and is no longer listed in its own tab with `← epic-1`. A child completed
  into logs/ stays under its open parent as `✓ done`, read-only, until the
  parent is done. Grandchildren nest too. A tab counts what its list holds;
  `m` starts on the document's own column, and the cursor follows a child
  moved or completed under it.

### Fixed

- `contract validate` and `template` exit non-zero when they fail; the
  result was dropped, so a failed contract read as passed (task-15).
- `contract graph` accepts its own flags again.

## [0.21.2] - 2026-10-11

Descriptions come back whole, headings, dividers and all.

### Fixed
- A task description may carry headings and dividers of its own. Reading one
  stopped at its first `## ` heading, so `show`, `list --json`, search and the
  MCP tools returned only the text above it; it now runs to the `## Log` or
  `## Child Tasks` section brainfile writes itself.
- A `---` line inside a multi-line frontmatter value (a description saved by
  `patch`) no longer ends the frontmatter early. Only an unindented `---`
  closes it.
- `patch --description` edits the description where `add` wrote it, in the
  body, instead of adding a second copy to the frontmatter that the body's
  stale one then sat beside.

## [0.21.1] - 2026-09-23

Shared boards stop showing up as a branch on the remote, and the board
records which agent made each change without being told.

### Changed
- `sync` stores the board on the remote as `refs/brainfile/<name>` instead of
  a branch. It is pushed, fetched and kept like any other ref, but hosts list
  only branches, so autosync no longer triggers GitHub's "had recent pushes /
  Compare & pull request" banner, and the board stays out of the branch list
  and `git branch -a`. The last-known remote position is kept under
  `refs/brainfile/remotes/`, where `git fetch --prune` never touches it.
- `--remote-branch` is now `--board-name` (default `board` inside a
  repository), stored as `brainfile.boardName`. The old flag and config key
  still work.
- A fresh clone finds the shared board with one lookup on its first
  `brainfile` command, since a plain clone no longer downloads it. The lookup
  never prompts, gives up after a few seconds, and a miss is remembered for ten
  minutes.
- `sync --json` and `where --json` report `remoteRef` in place of
  `remoteBranch`; `where` also reports `webUrl`.

- Board commits are always authored by your git user. The acting agent is
  recorded on the board instead: a `[codex]` or `[claude]` suffix on the
  commit message, and the `[name]` on notes.

### Added
- Agent detection. Without `--agent` or `BRAINFILE_AGENT`, brainfile names
  the agent from the nearest agent CLI above the command (claude, codex,
  cursor-agent, gemini, opencode and others), falling back to the variables
  agents set for their commands (Codex's `CODEX_THREAD_ID`, Claude Code's
  `CLAUDECODE`) where a sandbox hides the process tree. Commands you type get
  no tag; your notes carry your git `user.name`. `BRAINFILE_DETECT_AGENT=off`
  keeps only explicit names.
- `where` and `sync --set-remote` say where the board is stored on the remote
  and, for GitHub remotes, link to its history
  (`https://github.com/<owner>/<repo>/commits/refs/brainfile/board`).

### Upgrading
- Boards shared by 0.21.0 move themselves: the first `sync` merges the
  `brainfile` branch from the remote, publishes it under `refs/brainfile/`,
  and deletes the branch (only if nobody pushed to it in the meantime).
  Upgrade every machine that shares the board; a 0.21.0 machine keeps pushing
  to the branch.

## [0.21.0] - 2026-09-22

Share a board without a service. Inside a git repository the board now lives
on its own `brainfile` branch: still ordinary files in `.brainfile/`, every
change a commit, kept out of your code and pull requests, and shared through
any git remote you choose. Nothing leaves your machine until you choose one.

### Added
- Board on a branch. Inside a git repository `brainfile init` stores
  `.brainfile/` as a worktree on an orphan `brainfile` branch, hidden from the
  code branch via `.git/info/exclude`. Outside one, `init --tracked` makes the
  board its own small repository, and `-g` targets a home board at
  `~/.brainfile`. Every change from the CLI, the MCP tools and the TUI is one
  commit authored as the acting agent; hand edits commit as `edit: <files>`.
- `brainfile where`: where the board lives, how it is stored, who else has
  it, and how many changes are waiting to be sent. Offline and read-only.
- `brainfile sync [--pull|--push] [--set-remote <name|url>] [--remote-branch
  <name>] [--autosync off|push|full]`: fetch, merge and push the board branch,
  entirely inside `.brainfile/`. No remote is ever assumed; a URL is
  registered as remote `board`, so a private board can sit next to public
  code.
- Autosync. Once a remote is set, changes are pushed a few seconds after each
  edit from a background process; `full` also fetches before stale reads.
  `brief` (CLI and MCP) syncs first unless `--offline`. The TUI header shows
  `synced 12s ago`, `local only`, or `not synced · saved locally`.
- A clone gets the board on its first `brainfile` command, says so, and sends
  changes back to the remote it came from.
- `brainfile merge-driver`, selected by `.gitattributes` on the board branch.
  Frontmatter merges field by field (the later `updatedAt` wins, ties go to
  the incoming side), log and note lists union by timestamp, `ledger.jsonl`
  merges by line, and a task completed on one machine while edited on another
  stays completed with the edit appended to its archive. The driver is
  registered as `brainfile merge-driver` only when none is configured, so a
  custom one (for example an absolute path when `brainfile` is not on PATH)
  is kept.
- `brainfile migrate --to-branch [--commit]` moves an existing board onto the
  branch: history included when it was committed with the code, uncommitted
  edits and new files included always, every file checked by content before
  the old copy is removed, and a full rollback on failure. `--to-plain`
  reverses it.
- `@brainfile/core`: `findBrainfile` and `resolveBrainfilePath` accept
  `stopAtGitRoot`; `parseFrontmatter` and `serializeFrontmatter` are exported.

### Changed
- `brainfile init` inside a git repository now creates the branch-backed
  board, at the repository root. Pass `--plain` for a plain folder in the
  current directory, as before. Existing boards are untouched until you run
  `migrate --to-branch`.
- Board discovery stops at the repository root instead of walking into
  parent directories, then looks for the board branch. A board kept above a
  repository is no longer picked up from inside it; pass `-f <path>`.
- Storage messages from init, migrate, sync and brief say in plain words where
  the board is, who has it, and that nothing is lost when a sync fails.

## [0.20.0] - 2026-08-13

### Added
- `brainfile brief --agent <name>` — per-agent session orientation: full
  briefing on first run, delta since your last brief after (notes, moves,
  completions, contract changes). Also an MCP tool (count is now 11).
- MCP: all tools declare `outputSchema` and return `structuredContent`
  (spec 2026-07-28); legacy-era clients receive identical JSON as text.
- TUI: `L` toggles the completed-history view, orthogonal to the `t` type
  cycle (they compose); `$EDITOR` handoff for editing documents; NO_COLOR
  support; launch resumes your last column and type filter; `h/l` column keys.

### Changed
- Completing a task now always writes BOTH `logs/ledger.jsonl` and the
  archived markdown, with rollback on failure; `legacyMode` is a no-op.
- TUI panel system (1/2/3) collapsed into the single list; completed work
  is the `L` view; rules panel removed with the rules system.
- Releases are tag-driven: pushing `vX.Y.Z` publishes and creates the
  GitHub Release.

### Fixed
- CLI errors print a clean message + usage instead of a stack trace.
- `migrate --logs-to-ledger` is a non-destructive, idempotent backfill —
  it previously DELETED the markdown archives it migrated.
- `log --recent` includes ledger-only records; `archive --to local`
  completes the task instead of dead-ending; failed overlays no longer
  report documents removed; MCP `contract validate` returns `ok: false`
  on failed checks instead of a tool error; help opened from a detail
  view returns to that detail.

### Removed
- The rules system (adr-2): schema block, core rule operations, and the
  `rules` command. Legacy boards parse fine; `lint --fix` folds rules
  into `agent.instructions`. `[` `]` column keybinds (use `h/l` or tab).

## [0.19.0] - 2026-08-12

### Added
- TUI v3: complete redesign on ink 7 + react 19 via esbuild bundle — dense
  one-row-per-document board, type glyphs, signal-only color, split detail.
- First-class plans: `brainfile plan add/list/show/link`, `plan-N` documents.
- MCP: spec 2026-07-28 (stateless era) via `@modelcontextprotocol/server` v2;
  one stdio server serves both protocol eras.

### Changed
- Core owns all V2 board mutations; CLI, MCP, and TUI are thin frontends with
  parity locked by tests.

### Removed
- V1 board-format support (adr-1); `brainfile migrate` remains the converter.

### Security
- Cleared GHSA-345p-7cg4-v4c7 et al. by leaving the pinned v1 MCP SDK.

## [0.18.1] - 2026-08-11

### Fixed
- First monorepo release: workspaces, tokenless publishing (npm trusted
  publishing / OIDC), commander 14, jest 30.

## [0.18.0] - 2026-08-11

### Changed
- Package renamed `@brainfile/cli` → `brainfile`. Monorepo consolidation at
  github.com/1broseidon/brainfile.
