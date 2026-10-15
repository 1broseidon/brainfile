---
kind: Added
---
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
