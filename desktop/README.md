# Brainfile Desktop

Every repository's board in one window. There is no server: a project is a
folder you add, and its board is found, read and written exactly the way the
`brainfile` CLI does it — `.brainfile/` on disk, the `brainfile` branch
worktree, or a board shared under `refs/brainfile/*`, checked out on demand.

The app is not part of the npm workspaces and is never published. Installing,
building or testing the CLI and core does not touch it.

## Run

```bash
cd desktop
npm install
npm run dev        # Vite with HMR for the window; Electron restarts on main/host changes,
                   # once no agent is at work, so merging a hand-off never ends another
npm run build      # core, typecheck, window and Electron bundles
npm start          # run the build
npm run package    # Brainfile.app in release/mac-arm64/ (see Install)
```

The app carries its own `brainfile`. `brainfile init` from the app, and the
board server every agent it starts gets (the chat, a lead, a hand-off), run
the CLI shipped with the app, with the app's binary as node, so they never
depend on, or disagree with, whichever `brainfile` is installed on your PATH;
an agent's shell gets it first on its PATH too. The packaged app ships it in
its Resources; when it cannot be found, the chat or the lead says so. The
merge driver that sync registers is still the `brainfile` on your PATH
(`npm i -g brainfile`), since git runs it. The app asks your login shell for
PATH, so opened from Finder or the Dock it finds git, `node`, `npx` and the
agents' CLIs where your terminal does.

## Hand-offs

Hand to… runs the agent in its own git worktree on the branch
`dispatch/<task-id>`, forked from where the task lands: the trunk, unless
`landsOn` says otherwise (below). The trunk is the branch named by
`git config brainfile.trunk`, else origin's default branch, else `main`.
The agent commits there. A task whose contract only asks for research, a
review or a link gets a read-only checkout and no branch. When the task reaches Review
you can see the diff, open it in your editor, merge it or send it back, and
the worktree is removed on merge or discard.

A task can land somewhere other than the trunk: `landsOn: release/0.38.0` on
it, or on anything above it, and its hand-off forks from that branch (yours,
else origin's) and merges back into it. Hand to… says where under the
agents, `Lands on main`, and its picker (the trunk, your branches, the ones
used lately) writes the choice to the task, so it holds for the next
hand-off too. Set `epicBranch: true` on an epic and the first hand-off
under it (its lead's, or your own Hand to… on a child) makes
`dispatch/<epic-id>` from the epic's target; every child forks from and
merges into that branch, which the runner brings the target into before each
hand-off. When the last child is done the epic is one item in Ready to
merge, and its Merge asks where the branch goes: its target, another
branch, a pull request, or kept as a branch.

Beside Merge, when the project's origin is on GitHub, Open pull request
pushes the hand-off's branch (only that branch) and opens a pull request
into where it lands, titled with the task's title. The task records it as
`pullRequest:`, it leaves Ready to merge and shows its number on its row,
in Review and in the feed, and the app follows it about once a minute:
merged on GitHub, the task completes and its worktree and local branch go;
closed without merging, it is back in Ready to merge. Merge itself never
pushes, so when the trunk has commits origin lacks, Ready to merge and the
feed say `main is 3 commits ahead of origin`.

Hand an epic off, or any task with open children, and the agent leads it
instead: it reads the children and the code they touch, fixes the
dependencies where two would collide or one needs another's work, writes the
plan on the epic, and hands the children off in order, each in its own
worktree. The runner keeps it to the rules: nothing before what it depends
on is done and landed, at most `dispatch.maxRunning` at once per repository
(else three), retries to the contract's maxRetries. It is woken when a child
ends or is merged, and the epic is done with its last child. Pause, Resume
and Stop are in the epic's pane.

Discuss, beside it, talks the task over first. The chat opens on the task
with the project's agent, which reads the task, its parent, its decisions and
the code, asks and pushes back, and with your agreement changes the task's
description, subtasks or contract, noting what was agreed in its log. It
writes no code and hands nothing off: when you hand the task off, the agent
gets the spec as the discussion left it.

None of this needs the window (decision-17). Hand to…, Merge, the lead and
Discuss call `@brainfile/core`, and the CLI and the MCP server call the same:
`brainfile dispatch`, `run`, `review`, `land`, `discard`, `pr` and `discuss`,
and the `dispatch*`, `review`, `pull_request` and `discuss` tools. The window
is one runner among them: while it is open it works the board's queue, so a
task `brainfile dispatch` or an agent queued starts here unless a terminal's
`brainfile run` claims it first; a run started elsewhere shows on its row and
in the dock, marked `in a terminal`, its ask can be answered in the band, and
Stop reaches it. Every agent the app starts carries its role
(`BRAINFILE_AGENT_ROLE`: chat, lead, worker or discuss), which its board
server and the `brainfile` in its shell keep to.

## Add agents

In Settings → Agents → Custom agents, expand **Add an agent**, choose an
agent from the official ACP registry, and click **Add**. Compatible agents
are listed for this computer. The entry is saved in `dispatch.json` with
its command, arguments and environment, and can be edited like a manual
entry. An existing agent with the same name is never replaced by this action.

Npm distributions use `npx --yes` with the registry's versioned package;
Node.js and npx must be on your PATH. Binary distributions download and
extract into `registry-agents/` in the app's data folder, checking the
registry's SHA-256 checksum when supplied. Their commands are absolute paths
so they work from any repository or hand-off worktree. macOS's `tar` handles
both zip and tar archives. Adding an entry does not sign in to the agent.

The registry is saved as `acp-registry.json` in the app's data folder and
refreshed after 24 hours. If the refresh fails, the saved registry remains
available. Already downloaded binaries can be added offline; new downloads
and uncached npm packages need a connection. With no saved registry, the
dropdown shows a retry action; manual entry and Paste from Zed remain
available.

## Issues

When a project's `origin` is on GitHub, the band gets an Issues view (I):
the repository's open issues, those not on the board first. Make task adds
one to the board's first column with its title, body and labels (as tags),
and writes the issue's URL on the task as `source:`. An issue whose URL is
already on a task, open or completed, is listed under On the board with that
task instead of being offered again.

Issues are read with the gh CLI's login when it is signed in, else
`GH_TOKEN` / `GITHUB_TOKEN`, else a token saved in Settings (sealed by the
Keychain); with none, public repositories still answer. GitHub is asked when
the view opens, when the window comes back, every five minutes while it is
open, and on refresh, never more than once a minute per repository unless
you refresh, and an unchanged list costs no rate limit. Detection lives in
`src/main/forge.ts`, so another forge is one more matcher there.

## Install

`npm run package` builds `release/mac-arm64/Brainfile.app` for this Mac:
Apple silicon, signed ad hoc, not notarized. The core it builds against needs
the repository root installed first.

```bash
npm install                    # at the repository root, once
cd desktop && npm install      # once
npm run package
ditto release/mac-arm64/Brainfile.app /Applications/Brainfile.app
```

The window and the four Electron bundles are all Vite and esbuild output, so
the app carries no `node_modules`: `app.asar` holds `dist/`, the `.js` files
of `dist-electron/` and `package.json`, about 3 MB of a 240 MB app (the rest
is Electron). The board host and agents processes run from inside it. The
version is the app's own (`version` in this `package.json`), not the CLI's.

**It shares everything with `npm run dev`.** Both are called Brainfile, so
both use `~/Library/Application Support/Brainfile`: the same projects,
settings, agent threads and layout. Run one at a time. Two at once fight over
localStorage, and both would commit and sync the same boards. A second copy
of the installed app (another `Brainfile.app`, or `open -n`) hands over to
the first, but a dev run is a different binary it cannot see: quit one before
starting the other.

**A release updates itself.** An app from a release (a `desktop-v*` tag on
GitHub) checks for the next one a little after it starts and every six
hours, shows a dot on the settings key when one is out, and installs it in
place from Settings › Updates: the download is checked against a manifest
signed with Brainfile's update key, the bundle swapped where it stands, and
the app restarted once no agent is at work. A dev run never updates itself;
`BRAINFILE_PREVIEW_UPDATE=0.2.0 npm run dev` shows the badge and the section
as if 0.2.0 were out.

**To release**, set the version in this `package.json`, write its notes in
`notes/<version>.md`, commit, and push a `desktop-v<version>` tag: the
Desktop release workflow builds Apple silicon and Intel zips and disk
images, signs and notarizes them when the repository has the `APPLE_*`
secrets, signs the update manifest with `BRAINFILE_UPDATE_KEY`, and
publishes the release, never marked latest (the CLI's releases keep that).

**To update a build of your own**, quit Brainfile, pull, and package again. Delete the old app
before copying the new one: an app written over in place can keep the old
signature in macOS's cache and be killed at launch.

```bash
npm install && cd desktop && npm install && npm run package
rm -rf /Applications/Brainfile.app
ditto release/mac-arm64/Brainfile.app /Applications/Brainfile.app
```

Each build is signed afresh, so macOS asks again for any protected folder
(Documents, Desktop, Downloads) the app, or an agent it started, was allowed
into before.

## Shape

| Process | Source | Job |
| --- | --- | --- |
| Main | `src/main/` | Window, the list of added projects (`projects.json` in the app's data folder), bridging the window to the host |
| Board host | `src/host/` | Electron utility process. Every file read, write, watch, commit and sync, through `@brainfile/core` and `@brainfile/core/repo` |
| Window | `src/renderer/` | Svelte 5. Sees only the shapes in `src/shared/api.ts` |

Board git and sync never run in main or the window, so a slow commit or a
sync waiting on a remote cannot stall the UI. Main makes only short
asynchronous calls of its own: `git remote get-url` and GitHub's issues API,
for the Issues view. Edits commit the way the TUI's
do: one commit per burst, then a push a few seconds later when the board has
a remote. Changes from the CLI, agents or a sync show up as soon as the files
change.

## Keys

| Key | |
| --- | --- |
| ⌘K | Command menu and task search |
| ⌘O | Add project |
| ⌘1–⌘9 | Switch project |
| ⌘B | Show or hide the projects rail |
| V | List / board |
| D | Decisions |
| I | Issues, when the origin is on GitHub |
| C | New task |
| J / K, ↑ / ↓, ↵ | Move through tasks, open one |
| S, P, A, L | Status, priority, assignee, labels of the selected task |
| Esc | Back |
