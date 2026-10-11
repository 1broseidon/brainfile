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
npm run package    # unsigned Brainfile.app in release/
```

`brainfile init` from the app needs the CLI on your PATH (`npm i -g brainfile`);
so does the merge driver that sync registers.

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
