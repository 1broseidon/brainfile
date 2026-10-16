---
id: task-111
title: "Runner follow-ups from epic-6's review: a slow quit, the lead's messages during wrap-up, a landing hold across processes, a stale dev CLI"
column: todo
position: 10
description: |-
  Left over from the second review of epic-6's fixes (2026-10-15). None blocked the merge.
  - **Quitting past 5 s re-runs hand-offs.** desktop/src/agents/agents.ts: if `runner.quit()` takes longer than QUIT_MS (a pass waiting on a git fetch, or a landing's checks), `process.exit` → `close()` fires a `board.release` that never completes. The claims stay with a dead pid, read as lost on the next launch, and get re-run. Release claims synchronously (or with a tighter path) before exit.
  - **Wrap-up drops the lead's messages.** core/src/dispatch/lead.ts `wrapUp`: while every child is complete but one waits to be merged (until: review), each kick clears `lead.queue`, so a message from the person to the lead is lost. Keep it.
  - **The landing hold is per process.** runner.ts `landingNow` does not stop the desktop's runner from starting a task that an MCP `land` (another process) is landing. Make the hold visible across processes (beside the landing lock).
  - **A lost runner's lead runs are not heard elsewhere** (`hearElsewhere` covers ended runs only), and `heard` never shrinks.
  - **The old `lead:` taken up by `brainfile dispatch resume`** without `--here` restarts fresh instead of carrying on.
  - **No offer after a merge on the forge:** an epic's last child landed by its pull request merging doesn't offer the epic's branch (PullRequestWatch).
  - **`dispatch stop` on a lost run** waits 17 s and then says "Asked … to stop".
  - **`npm run dev` builds neither core nor the CLI,** so the dev app's own CLI can be stale. Build them, or warn when cli/dist is older than its sources.
tags:
  - core
  - dispatch
  - runner
  - follow-up
relatedFiles:
  - core/src/dispatch/runner.ts
  - core/src/dispatch/lead.ts
  - desktop/src/agents/agents.ts
  - desktop/scripts/dev.mjs
createdAt: "2026-10-16T03:41:06.624Z"
---

## Description
Left over from the second review of epic-6's fixes (2026-10-15). None blocked the merge.
- **Quitting past 5 s re-runs hand-offs.** desktop/src/agents/agents.ts: if `runner.quit()` takes longer than QUIT_MS (a pass waiting on a git fetch, or a landing's checks), `process.exit` → `close()` fires a `board.release` that never completes. The claims stay with a dead pid, read as lost on the next launch, and get re-run. Release claims synchronously (or with a tighter path) before exit.
- **Wrap-up drops the lead's messages.** core/src/dispatch/lead.ts `wrapUp`: while every child is complete but one waits to be merged (until: review), each kick clears `lead.queue`, so a message from the person to the lead is lost. Keep it.
- **The landing hold is per process.** runner.ts `landingNow` does not stop the desktop's runner from starting a task that an MCP `land` (another process) is landing. Make the hold visible across processes (beside the landing lock).
- **A lost runner's lead runs are not heard elsewhere** (`hearElsewhere` covers ended runs only), and `heard` never shrinks.
- **The old `lead:` taken up by `brainfile dispatch resume`** without `--here` restarts fresh instead of carrying on.
- **No offer after a merge on the forge:** an epic's last child landed by its pull request merging doesn't offer the epic's branch (PullRequestWatch).
- **`dispatch stop` on a lost run** waits 17 s and then says "Asked … to stop".
- **`npm run dev` builds neither core nor the CLI,** so the dev app's own CLI can be stale. Build them, or warn when cli/dist is older than its sources.
