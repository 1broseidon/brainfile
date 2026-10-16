---
kind: Fixed
---
- An epic handed off until done (bypass): a child whose branch conflicts with
  the trunk when it ends is now landed like the others, so the conflict goes
  back to the agent that did it, with a note saying how to settle it
  (decision-12). Before, the lead landed only children that merged cleanly,
  and one that conflicted waited in Review with nothing sent back.
- The board server handed to agents is the `brainfile` on the PATH the runner
  reads and hands its agents. Before, it was looked up on the PATH the process
  was started with, which can find an older `brainfile`.
