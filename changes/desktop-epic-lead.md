---
kind: Added
---
- Desktop: handing off an epic, or any task with open children, starts its
  lead. The lead checks the plan first (the children, the files each touches,
  whether the dependencies are right), writes it on the epic, then hands the
  children off in order, woken as each ends or lands, inside rules the app
  holds: dependencies done first, at most three hand-offs at once per
  repository, retries to the contract's `maxRetries`, and only the lead
  dispatches in its tree. Pause, Resume and Stop are in the epic's pane; a
  lead left by a restart resumes from its notes.
