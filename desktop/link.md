# The phone link

The desk's half of the link to Brainfile on a phone (task-40). The contract is
brainfile-mobile's [`docs/link.md`](../../brainfile-mobile/docs/link.md),
protocol 1; this side follows it byte for byte, and `src/link/noise.ts` is the
phone's own file, kept identical.

- `src/link/server.ts`: the WebSocket server at `/link/1`, the handshake, close codes and limits.
- `src/link/bridge.ts`: the calls a phone may make, checked, and the boards the window and each phone hold.
- The hello's `features` say what this desk takes beyond protocol 1's first calls: `effort` (a level with `dispatch` and `ask`) and `merge` (`readyToMerge`, `mergeReview`, `discardReview`: the window's own calls, so a phone merges by the window's rules; a phone's merge completes the task, as the window's Merge does, and the window asks its Ready to merge again).
- `live` and the `agent` events carry every run on this Mac, whichever runner works it (task-84): a run `brainfile run` or an MCP client works has `where` (`in a terminal`), and so does its ask, whose id is `<run-id>/<ask-id>`; `answerPermission` answers it as any other, through that runner's answer file, and `stopRun` stops it. Both fields are optional additions a phone may ignore.
- `src/link/store.ts`: `link.json` in the app's data: the desk's key (sealed by the Keychain), its id, port, switch and phones.
- `npm run link:dev`: the real server on port 47211 with a fake desk, for the iOS Simulator (`--link <file>`, `--fresh`). On `brainfile`, task-7 can merge and task-5 would conflict (`src/link/devReviews.ts`).
- `npm test`: a fake phone over a real socket (`test/link.test.ts`) and the shared Noise vectors (`test/noise.test.ts`).

The first time the link listens, macOS may ask to let Brainfile accept incoming connections.
