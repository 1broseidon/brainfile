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
npm run dev        # Vite with HMR for the window; Electron restarts on main/host changes
npm run build      # core, typecheck, window and Electron bundles
npm start          # run the build
npm run package    # Brainfile.app in release/mac-arm64/ (see Install)
```

`brainfile init` from the app needs the CLI on your PATH (`npm i -g brainfile`);
so does the merge driver that sync registers, and the MCP server agents get.
The app asks your login shell for PATH, so opened from Finder or the Dock it
finds git, `brainfile`, `node`, `npx` and the agents' CLIs where your terminal
does.

## Hand-offs

Hand to… runs the agent in its own git worktree on the branch
`dispatch/<task-id>`. The agent commits there. When the task reaches Review
you can see the diff, open it in your editor, merge it or send it back, and
the worktree is removed on merge or discard.

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

**To update**, quit Brainfile, pull, and package again. Delete the old app
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

Git and the network never run in main or the window, so a slow commit or a
sync waiting on a remote cannot stall the UI. Edits commit the way the TUI's
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
| C | New task |
| J / K, ↑ / ↓, ↵ | Move through tasks, open one |
| S, P, A, L | Status, priority, assignee, labels of the selected task |
| Esc | Back |
