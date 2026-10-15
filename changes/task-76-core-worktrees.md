---
kind: Changed
---
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
