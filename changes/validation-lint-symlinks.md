---
kind: Fixed
---
- The warning for a validation command that `cd`s into the board's own
  workspace now also fires when the workspace is reached through a symlink,
  as macOS's temporary folders are.
