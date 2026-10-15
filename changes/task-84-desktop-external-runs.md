---
kind: Changed
---
- The desktop works the queue while it is open. A hand-off queued by
  `brainfile dispatch`, an MCP client or the chat starts there, an epic's
  lead included, unless `brainfile run` in a terminal claims it first.
- The desktop shows runs started outside it. A run that `brainfile run`,
  `dispatch --now` or an MCP client works on this machine gets the row's
  line and a tab in the dock, marked `in a terminal`; Stop reaches it, and
  Ready to merge is asked again when it ends. The phone hears them too.
- An ask from a run in a terminal shows in the desktop's band, saying where
  it waits. Allow or Deny writes `.brainfile/state/runs/<run-id>.answer.json`,
  which that runner applies within a second, taking its own prompt down.
- The desktop's chat hands work off through its `brainfile mcp` (`dispatch`,
  `dispatch_status`, `dispatch_stop`, `dispatch_lead`). The desk, the app's
  own small MCP server for the chat, is gone.
- Core: `Runner.answerAsk` answers another runner's ask through its answer
  file, which the owning runner applies and then calls `cancelAsk`.
  `Runner.others` lists other runners' run files, ended and lost ones
  included. The `fromOf` option names the chat turn behind a hand-off started
  from the queue. `writeRunAnswer`, `readRunAnswer`, `removeRunAnswer` and
  `runAnswerPath` are in `@brainfile/core/repo`; `pruneRunFiles` removes
  answers whose run has ended. `DESK_TOOL` is gone.
