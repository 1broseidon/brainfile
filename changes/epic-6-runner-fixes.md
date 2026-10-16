---
kind: Fixed
---
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
