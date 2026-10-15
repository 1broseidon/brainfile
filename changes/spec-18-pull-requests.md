---
kind: Added
---
- A hand-off can land by pull request instead of a merge (decision-16):
  `brainfile pr <task>`, the MCP `pull_request` tool and the desktop's Open
  pull request push the task's branch, and only it, to origin and open a
  GitHub pull request into the branch it lands on, titled with the task's
  title. The task records it as `pullRequest: { number, url, state, base,
  head, at }`; while it is open the hand-off is out of Ready to merge (for
  the phone too) and Merge refuses it. `brainfile pr <task> --status`, and
  the desktop about once a minute, ask where it stands: merged, the task
  completes and its worktree and local branch go (a squash or rebase counts
  when the branch is what the pull request carried); closed without merging,
  it is back in Ready to merge. Core: `openHandOffPullRequest`,
  `openBranchPullRequest` (any head and base), `followHandOffPullRequest`
  and `releaseMergedHandOff` in `@brainfile/core/forge`, and
  `openPullRequest`, `pullRequestState` and `pullRequestFor` on its GitHub
  client, ETag and a minute's memory included.
- Desktop: an open pull request shows as `#12` on its row, in Review and
  under Open pull requests in the feed; an epic's Merge menu offers Open a
  pull request as its fourth choice. When the trunk has commits origin
  lacks (landing never pushes), Ready to merge and the feed say `main is 3
  commits ahead of origin` (core's `unpushed`).
