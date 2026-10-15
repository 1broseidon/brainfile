---
kind: Fixed
---
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
