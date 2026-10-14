---
id: decision-12
title: A hand-off lands on the trunk from its own worktree, checked first, and a conflict goes back to an…
type: decision
status: current
claimKey: desktop.dispatch.landing
kind: decision
stance: requires
subject: landing from the worktree by compare-and-swap, conflicts to an agent
tags:
  - desktop
  - dispatch
  - git
createdAt: "2026-10-14T15:14:49.143Z"
---

## Description
A hand-off lands on the trunk from its own worktree, checked first, and a conflict goes back to an agent

Merge in Review lands the hand-off on the trunk without merging in the person's checkout. Before it is pressed, Review says whether the branch would conflict with the trunk now (git merge-tree, nothing written). Pressed: the trunk is brought into the task's branch inside its own worktree, the contract's validation (else the repository's checks) runs there, and the trunk moves to the result only from the tip that was checked, a compare-and-swap (git update-ref <trunk> <new> <old>); if the trunk moved meanwhile it starts again from the new tip. Uncommitted work in the worktree still refuses. Landings run one at a time per repository: at this size a serial queue costs nothing and keeps the trunk green. A conflict, or a check that fails once the trunk is in, goes back to an agent instead of stopping at the person: in the desktop, the hand-off's own ACP agent (else the one Hand to… offers first) is sent back with the conflicting files and the tasks whose commits it collided with, settles them in the worktree and runs the checks again. The person sees a conflict only when the agent could not settle it, or when no agent is at hand (the CLI and the phone name the conflicting files, as today). When the person's checkout is on the trunk it follows by fast-forward, which git allows around uncommitted work in other files; if the landing touches a file they have changed, it waits and names the file. Why: Anthropic's "Redesigning source control" (2026-10-13): Claude fixes conflicts faster than people find them, and landing work should not need a person's working copy. Replaying this repository's merges from 2026-08-15 to 2026-10-14 found few text conflicts (4 of 27) but constant tending from merging in the person's folder and through integration branches.
