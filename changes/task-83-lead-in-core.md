---
kind: Added
---
- An epic's lead runs from the CLI and MCP, not only in the desktop.
  `brainfile dispatch <epic>` queues a lead: `dispatch:` with `role: lead` on
  the epic. A runner that takes up leads claims it, so one lead runs a tree
  across processes and machines. `--now` leads it here until it ends. The
  lead's `brainfile mcp` is started as the lead of its epic. The runner
  checks the lead's rules again before it starts what the lead queues.
- `brainfile dispatch pause|resume <epic>` and `dispatch stop <epic>` reach the
  lead through its record, whichever runner leads it. `dispatch status` lists
  the leads. The MCP server adds `dispatch_lead` (pause, resume), and
  `dispatch_stop` takes an epic's id.
- A child's hand-offs are counted in `tries` on its record. Past its
  contract's `maxRetries`, a child the lead asks for waits in Review. A child
  whose contract is still a draft waits for the person, as one the lead added
  does.
- Core: the lead (`Leads`, `planReport`, `readTree`, `leadRefusal`) is in
  `@brainfile/core/dispatch` beside the `Runner`. The Runner gains `lead`,
  `pauseLead`, `resumeLead`, `stopLead`, `guard`, `boardChanged`, `workLed`,
  `queuedLeads`, and the `leads` and `onLead` options. `readLeadRecord` and
  `changeLeadFile` are in core. The desktop's older `lead:` record is read as
  a lead waiting for a runner, and replaced when one claims it.
