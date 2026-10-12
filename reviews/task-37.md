Light review of spec-16 phase 1 (e7280cc, merged in 2ad5bc9).

Verdict: critical follow-ups task-38 and task-39, filed under spec-16.

- task-38: desktop/src/agents/agents.ts:846 awaits the host write after the
  desk's busy check, without reserving or rechecking the task. Concurrent
  calls can start two agents in the same dispatch/<task-id> worktree.
  Confirmed with the actual deskTools and a deferred start: both calls
  succeeded and two runs started. This violates decision-2.
- task-39: desktop/src/agents/agents.ts:798 awaits open before assigning the
  session's run in turn. stopRun (:964) cannot find that starting session;
  turn (:664) later resets the stopped run to working and sends its prompt.
  Confirmed by tracing the startup and cancellation paths.

Scope: dispatch, runs, stop, socket authorization, host recording, and chat
hand-off events. No code changes. Verification used source inspection,
cymbal caller analysis and an in-memory concurrency reproduction; the
Electron app and installed agent harnesses were not run.

Next: review and address task-38 and task-39 before relying on concurrent
dispatch or stopping an agent during startup.
