---
id: task-117
title: "Final pass on today's work: the confirmed bugs, fixed before 0.23.0 ships"
column: in-progress
position: 1
description: |-
  The 2026-10-16 final pass over epic-6, spec-18 and tasks 74–78 (three reviews, each bug reproduced). Being fixed on three branches, final/core, final/runner and final/docs, then merged to main and run live once. Each subtask is one finding; tick it when its fix is on main with a test. Anything a builder leaves undone stays unticked here, with a note saying why.

  Context for each (file references are to main at 816fea7):
  1. `runChecks` (core/src/repo/worktree.ts ≈651) kills only the shell on timeout; grandchildren keep the pipes and the landing hangs holding the landing lock. Fix: detached process group, kill the group, resolve on exit.
  2. Landing and bring-in merges run commit hooks (`git merge` without `--no-verify`, worktree.ts ≈800 and ≈440); a commitlint hook refuses every landing.
  3. `open()` in core/src/dispatch/session.ts ≈227 wraps only initialize; a failed newSession leaks the agent process and never calls release.
  4. A queued hand-off that throws after its claim (missing landsOn branch, nested epicBranch, no trunk) leaves no run, no note, no message (runner.ts ≈843, pass() ≈988).
  5. A lead until review never finishes when its last unlanded child is landed from outside the desktop (lead.ts wrapUp/boardChanged; landHeld wakes nothing).
  6. Quitting during an auto-landing orphans the check and re-runs the task next launch (agents.ts ≈678, runner.ts goDown/queued).
  7. `readsGit` lets `git branch -v -m`, `-r -d`, `--list -D` through (readOnly.ts ≈39).
  8. `pr --status` is on the read-only allowlist but completes tasks, moves the base and removes worktrees.
  9. An unknown BRAINFILE_AGENT_ROLE gets full access (agentRoleOf).
  10. `agentEnv()` passes CLAUDECODE, CLAUDE_CODE_*, npm_* and friends to every agent.
  11. Headless until done is impossible: the policy lives only in dispatch.json, written by the desktop alone. New: `brainfile dispatch policy [ask|bypass|clear] [--all]`, documented.
  12. A failed `--ff-only` for a reason other than a moved trunk reruns the checks five times (worktree.ts ≈819).
  13. target.ts ignores a worktrees root; repo-worktree tests left ~100 dangling folders in ~/.brainfile-worktrees (cleaned).
  14. core/cli ship dist/__tests__; engines should be >=20.19.
  15. Release failures (`fileBoard.release` busy) are swallowed in `ended()` (runner.ts ≈1082).
  16. The host flushes its commits only on `exit`; a SIGTERM at quit leaves release writes uncommitted.
  17. `dispatch --now` on a waiting task prints three contradictory lines; re-dispatching a queued task says Queued again and commits; `dispatch stop <epic>` on a lead never started says Stopped.
  18. MCP `review action=land` as a worker fails zod validation instead of the decision-15 sentence; `pull_request` default action for a worker silently becomes status and its hint names a command the worker can't run.
  19. Run ids `run-<ms>-<n>` collide across processes started in the same millisecond.
  20. Dev: build-bundle deletes dist/*.mjs before writing (a `brainfile mcp` started then fails ERR_MODULE_NOT_FOUND); `appBrainfile` checks only cli.js; `npm run dev` never builds the CLI.
  21. Docs: MANUAL counts and stale sections, llms-install.txt tool list, READMEs, design.md, decision-6 → decision-19.
  22. Runner.runs/meta/heard never pruned in a long-lived desktop.
priority: high
tags:
  - final-pass
  - bug
  - core
  - cli
  - desktop
  - docs
relatedFiles:
  - core/src/repo/worktree.ts
  - core/src/dispatch/session.ts
  - core/src/dispatch/readOnly.ts
  - core/src/dispatch/agents.ts
  - core/src/repo/target.ts
  - core/src/dispatch/runner.ts
  - core/src/dispatch/lead.ts
  - cli/src/commands/dispatch.ts
  - desktop/src/agents/agents.ts
  - desktop/src/host/host.ts
  - desktop/scripts/dev.mjs
  - cli/scripts/build-bundle.mjs
subtasks:
  - id: task-117-1
    title: 1 runChecks kills the check's process group on timeout; the landing never hangs
    completed: true
  - id: task-117-2
    title: 2 Landing and bring-in merges pass --no-verify
    completed: true
  - id: task-117-3
    title: 3 A failed newSession kills the agent and releases
    completed: true
  - id: task-117-4
    title: 4 A hand-off that fails after its claim shows a failed run and a note
    completed: true
  - id: task-117-5
    title: 5 A lead until review finishes when its last child lands from anywhere
    completed: true
  - id: task-117-6
    title: "6 Quit during a landing: released as review, check killed, no re-run on launch"
    completed: true
  - id: task-117-7
    title: 7 readsGit allows only read-only git branch forms
    completed: true
  - id: task-117-8
    title: 8 pr --status off the read-only allowlist
    completed: true
  - id: task-117-9
    title: 9 An unknown role is treated as worker, with a warning
    completed: true
  - id: task-117-10
    title: 10 agentEnv drops the host's Claude Code and npm variables
    completed: true
  - id: task-117-11
    title: 11 brainfile dispatch policy, documented, so headless until done works
    completed: true
  - id: task-117-12
    title: 12 A failed fast-forward for another reason is refused once, with git's words
    completed: true
  - id: task-117-13
    title: 13 target.ts takes a worktrees root; tests set BRAINFILE_WORKTREES
    completed: true
  - id: task-117-14
    title: 14 dist/__tests__ excluded from the packages; engines >=20.19
    completed: true
  - id: task-117-15
    title: 15 Release failures retried on busy, else noted
    completed: true
  - id: task-117-16
    title: 16 The host flushes commits on SIGTERM; main waits for it
    completed: true
  - id: task-117-17
    title: 17 dispatch --now, re-dispatch and stop wording
    completed: true
  - id: task-117-18
    title: 18 MCP worker refusals match the CLI
    completed: true
  - id: task-117-19
    title: 19 Run ids carry the pid
    completed: true
  - id: task-117-20
    title: 20 build-bundle writes to a temp dir then renames; appBrainfile checks cli.mjs; dev builds the CLI
    completed: true
  - id: task-117-21
    title: 21 Docs in step with the headless surface
    completed: true
  - id: task-117-22
    title: 22 Runner maps pruned with the run files
    completed: true
  - id: task-117-23
    title: Merged to main, every suite green, one real hand-off through the new runner on this Mac
    completed: true
createdAt: "2026-10-16T04:55:30.520Z"
updatedAt: "2026-10-16T05:47:54.995Z"
---

## Description
The 2026-10-16 final pass over epic-6, spec-18 and tasks 74–78 (three reviews, each bug reproduced). Being fixed on three branches, final/core, final/runner and final/docs, then merged to main and run live once. Each subtask is one finding; tick it when its fix is on main with a test. Anything a builder leaves undone stays unticked here, with a note saying why.

Context for each (file references are to main at 816fea7):
1. `runChecks` (core/src/repo/worktree.ts ≈651) kills only the shell on timeout; grandchildren keep the pipes and the landing hangs holding the landing lock. Fix: detached process group, kill the group, resolve on exit.
2. Landing and bring-in merges run commit hooks (`git merge` without `--no-verify`, worktree.ts ≈800 and ≈440); a commitlint hook refuses every landing.
3. `open()` in core/src/dispatch/session.ts ≈227 wraps only initialize; a failed newSession leaks the agent process and never calls release.
4. A queued hand-off that throws after its claim (missing landsOn branch, nested epicBranch, no trunk) leaves no run, no note, no message (runner.ts ≈843, pass() ≈988).
5. A lead until review never finishes when its last unlanded child is landed from outside the desktop (lead.ts wrapUp/boardChanged; landHeld wakes nothing).
6. Quitting during an auto-landing orphans the check and re-runs the task next launch (agents.ts ≈678, runner.ts goDown/queued).
7. `readsGit` lets `git branch -v -m`, `-r -d`, `--list -D` through (readOnly.ts ≈39).
8. `pr --status` is on the read-only allowlist but completes tasks, moves the base and removes worktrees.
9. An unknown BRAINFILE_AGENT_ROLE gets full access (agentRoleOf).
10. `agentEnv()` passes CLAUDECODE, CLAUDE_CODE_*, npm_* and friends to every agent.
11. Headless until done is impossible: the policy lives only in dispatch.json, written by the desktop alone. New: `brainfile dispatch policy [ask|bypass|clear] [--all]`, documented.
12. A failed `--ff-only` for a reason other than a moved trunk reruns the checks five times (worktree.ts ≈819).
13. target.ts ignores a worktrees root; repo-worktree tests left ~100 dangling folders in ~/.brainfile-worktrees (cleaned).
14. core/cli ship dist/__tests__; engines should be >=20.19.
15. Release failures (`fileBoard.release` busy) are swallowed in `ended()` (runner.ts ≈1082).
16. The host flushes its commits only on `exit`; a SIGTERM at quit leaves release writes uncommitted.
17. `dispatch --now` on a waiting task prints three contradictory lines; re-dispatching a queued task says Queued again and commits; `dispatch stop <epic>` on a lead never started says Stopped.
18. MCP `review action=land` as a worker fails zod validation instead of the decision-15 sentence; `pull_request` default action for a worker silently becomes status and its hint names a command the worker can't run.
19. Run ids `run-<ms>-<n>` collide across processes started in the same millisecond.
20. Dev: build-bundle deletes dist/*.mjs before writing (a `brainfile mcp` started then fails ERR_MODULE_NOT_FOUND); `appBrainfile` checks only cli.js; `npm run dev` never builds the CLI.
21. Docs: MANUAL counts and stale sections, llms-install.txt tool list, READMEs, design.md, decision-6 → decision-19.
22. Runner.runs/meta/heard never pruned in a long-lived desktop.

## Log
- 2026-10-16T05:47:55.259Z: [claude] All 22 fixes are on main (79f82fd, then 6019aff for the lockfiles), from final/core, final/runner and final/docs, each with a test.
- Every suite passes in the checkout's tree: core 1217, CLI 709 + 191, desktop 151, typecheck and bundle clean; the e2e test passes 4/4.
- Item 1: the runner runs its own checks (Runner.check, detached and killed by group on goDown); core's runChecks got the same fix. Two implementations now. Folding them into one (runChecks taking a cancel hook) is filed on task-118.
- Item 9 gave only offerEpicBranch a root; prepareTarget, prepareEpicBranch and refreshTarget make no worktrees, so they need none.
- Live check (task-119), the first live run of the new runner on this Mac:
  - queued from the CLI; the desktop's runner claimed it in about 1 s (tries 1, run id with the pid);
  - the worktree forked from the landsOn branch qa/runner;
  - the agent ran as worker, with the shim first on its PATH and no Claude Code variables;
  - Claude Haiku did the work through the board's MCP tools in about 16 s;
  - the claim ended with outcome review, and the run file says done;
  - `brainfile land` from the CLI merged into qa/runner, removed the worktree and branch, completed the task, and wrote "Landed on qa/runner".
- qa/runner was deleted afterwards. main is not pushed.
