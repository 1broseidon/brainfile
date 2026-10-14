Research for task-48: how much of the desktop link the phone can have through
GitHub refs alone, without the chat. No code changes.

Verdict: it holds, with three corrections to the findings recorded on the task.
Everything the link gives except the chat and boards kept only on the desk can
go through GitHub. A hand-off would start in about 10–35 s, and an answer to an
ask would take about 5–20 s each way. The work should be a plan under spec-17
(drafted as plan-1, status draft, on the board).

## Corrections to the findings on the task

1. **The desktop does not watch the remote the way the task assumed.** In the
   default `push` mode it never fetches on its own. It fetches only when it
   syncs after its own commit, or on Sync now (`core/src/repo/autosync.ts`,
   `desktop/src/host/host.ts:788-802`). In `full` mode the 60 s timer
   (`FULL_SYNC_INTERVAL_MS`, `host.ts:108`) skips a fetch when the last one is
   under 60 s old, so a change can take about 2 minutes to show. That timer
   also only runs for boards the window or a linked phone holds open (`holds`,
   `desktop/src/main/main.ts:58-62`). So a hand-off request left on the board
   would usually never be seen. The relay needs its own watcher, separate from
   board sync.
2. **Board sync is not a lock.** `syncBoard` fetches, merges with the
   field-level driver and pushes without force. It has no retry, and a
   conflict it cannot resolve stops for a person (`core/src/repo/boardSync.ts:365-516`).
   A claim made through it is merged, not refused. In the end the lock is not
   needed: with sealed requests (below) only the paired desk can read a
   request, and `reserve()` / `liveDispatch()` already allow one live hand-off
   per task (`desktop/src/agents/agents.ts:1001-1032`).
3. **Do not push `dispatch/<task-id>` for the review.** The branch is never
   pushed today (`desktop/src/agents/worktree.ts`; the agent's brief forbids
   it). Pushing it would put a branch per hand-off in the repository's branch
   list, could start CI on push, and still would not show uncommitted work.
   The desk already computes `ReviewView` for the link (`shared/api.ts:380-402`):
   ahead, the first 12 commits and files, +/−, uncommitted, merged. That is
   small, so it goes in the relay payload instead. This gives the same view as
   the link, includes uncommitted work, and needs no compare call. (Checked
   anyway: compare works on bare SHAs, `compare/<sha>...<sha>`, and would
   work for an unpushed-as-branch ref too.) decision-2 is unaffected.

Also: the desktop's Hand to… writes only `assignee`. Only the chat's start
writes a `dispatch:` record (`agents.ts:1110-1133`, `DispatchRecord` with
`by: 'chat'`, `shared/api.ts:321-329`). Core has no type for `dispatch`; it
keeps it as an unknown key, and the CLI shows it only in `--json`.

## What GitHub allows (subtask 1)

Checked against the docs and with live calls on 1broseidon/brainfile.

- **Refs outside `refs/heads`.** `POST git/refs` takes any name that starts
  with `refs/` and has two slashes. `PATCH git/refs/{ref}` takes
  `force: true`. Boards already live at `refs/brainfile/*` and the phone
  already writes them this way, so `refs/brainfile-live/*` works the same.
  Still to try once on a scratch repository: creating a ref three levels deep
  and force-updating it from a fine-grained token with Contents: write.
- **Discovery is safe.** `listRemoteBoards` keeps only `refs/brainfile/<name>`
  with no further slash (`core/src/repo/boardRepo.ts:262-272`), and board
  sync fetches exact refs, never a glob (`boardSync.ts:449`). The phone looks
  for boards with `matching-refs/brainfile/`, which ends in a slash.
  `refs/brainfile-live/…` matches none of these. A flat
  `refs/brainfile/<x>-live` would be taken for a board, so the side refs must
  stay in their own namespace.
- **ETags.** `GET git/matching-refs/…` returns an ETag. Sending it back gave
  `304 Not Modified`, and `x-ratelimit-used` did not go up (checked: 6 before,
  6 on the 304, 7 on the next 200). The docs say this holds only for requests
  that carry an `Authorization` header. GraphQL has no conditional requests,
  so the payload is read only after an ETag poll says the ref moved, as the
  phone already does for boards (`brainfile-mobile/src/data/read.ts:43-54,155-165`).
- **Limits.** REST: 5,000 an hour per user; secondary limits of 900
  points a minute (a GET costs 1, a write costs 5), 80 content-creating
  requests a minute and 500 an hour, and 100 requests at once. GraphQL: 5,000
  points an hour and 2,000 a minute. GitHub does not document a limit for git
  over HTTPS (fetch, ls-remote, push).
- **Compare.** `compare/{base}...{head}` gives `ahead_by`, `behind_by`,
  `total_commits`, commits (up to 250) and files (up to 300, each with
  additions and deletions). It accepts SHAs. Not needed (correction 3).

## The shape

- **What the person asked for goes on the board:** `assignee` and a
  `dispatch:` record on the task. The board's history and the CLI show
  who asked and when.
- **The command and everything in passing go in side refs**, in a namespace of
  their own, per repository and per desk:
  - `refs/brainfile-live/<desk-id>/out`: written by the desk and
    force-pushed. Its tree holds one sealed file per linked phone,
    `<phone-id>.json`.
  - `refs/brainfile-live/<desk-id>/in/<phone-id>`: written by that phone only,
    force-updated. Its tree holds one `inbox.json` of sealed messages.
  - `<desk-id>` is the stable id from the link's hello. `<phone-id>` is the
    first 16 hex digits of the SHA-256 of the phone's public key.
  - Each ref is an orphan commit (no parent), so its history does not grow and
    run churn never enters a board's history.
- **One poll per repository covers both directions:**
  `GET git/matching-refs/brainfile-live/<desk-id>/`, with the ETag. The phone
  and the desk both make it, and it costs nothing while neither side has
  written.
- **The LAN link stays the fast path.** The phone uses the relay only while
  the desk is Away. The existing GitHub fallback (`brainfile-mobile/src/state/source.ts:76-101`)
  then shows the agents block too, instead of hiding it.
- **Not relayed:**
  - the chat and Discuss (they need an LLM);
  - boards kept only on the desk (they never reach GitHub);
  - Merge and Discard (off the phone, as over the link);
  - Sync now;
  - `board` events (on the relay path the phone reads the board from
    GitHub anyway).
- **Tailscale already covers some of this.** The QR lists a Tailscale address
  when the desk has one (`desktop/src/link/addresses.ts`). Someone on Tailscale
  already has the whole link from anywhere, chat included. The relay is for
  everyone else.

## Hand-off request on the task (subtask 2)

A field, not a log line. A log line is append-only text: it cannot be
withdrawn or marked as started, and readers would have to parse it. The field
already exists and the chat writes it, so it is extended instead:

```yaml
assignee: claude
dispatch:
  agent: claude
  model: opus
  effort: high
  by: phone          # chat | window | phone
  at: 2026-10-14T05:23:44Z
  desk: George's MacBook Pro   # the desk asked to run it (phone only)
  state: waiting     # waiting | started | not-started; absent means started (older records)
  startedAt: 2026-10-14T05:24:01Z
```

- **On the phone, Hand to… (desk Away)** writes the board commit with
  `assignee` and `dispatch` (`state: waiting`). Then it writes a sealed
  `handoff` message to its inbox that names the task and the board ref. The
  row shows `Waiting for <desk name>`, and Withdraw clears the record.
- **The desk acts on the sealed message, not on the field.** When the message
  arrives, the desk fetches that board (pull only) and checks that the task
  still says `waiting` for this desk. If it does, the desk sets
  `state: started` and `startedAt`, starts the run, and lets normal sync push.
  If the record is gone (withdrawn), the desk drops the message. A hand-off
  asked for more than 24 hours earlier is not started: the desk sets
  `state: not-started` and notes "Not started: asked more than a day ago".
- **The window's Hand to… should write the record too** (`by: window`). Today
  it does not, so only the chat's hand-offs leave a trace.
- **Core** types `DispatchRecord`, which moves from the desktop's `shared/api.ts`
  to core, together with one helper that sets and clears it. The phone's ops
  stay identical to core's (`brainfile-mobile/tests/parity.test.ts`), so core
  is where the shape is defined. Core does not act on the record.
- **The CLI** `show` prints one line, for example
  `Hand-off: claude · opus · high, asked from the phone, waiting for George's MacBook Pro`,
  or `… started 05:24`. Lint accepts the field.

## The payloads (subtask 3)

Every message in either direction is sealed, as described under Trust below.
The plaintext shapes:

**Desk to phone, `out/<phone-id>.json`:**
```jsonc
{
  "v": 1, "at": 1760420000000,
  "runs": [ /* AgentRun, kind 'dispatch' only, for this repository's
               projects; no steps; reply cut to 2,000 characters;
               the rule from agents/live.ts (open, plus ended in the last
               30 min, at most 50) */ ],
  "asks": [ /* PermissionAsk, open, for those runs */ ],
  "reviews": { "task-15": { /* ReviewView */ } },  // hand-offs ended and not merged or discarded
  "agents": [ /* AgentInfo */ ], "models": { "claude": [ /* ModelOption */ ] },
  "acks": 41   // the highest inbox seq the desk has handled from this phone
}
```

- **When the desk pushes:**
  - on a run state change (`starting`, `working`, `waiting`, `done`,
    `failed`, `stopped`), on a new ask, and when an ask or a review changes;
    changes are gathered for 3 s, then pushed;
  - on a change to `activity` alone (`· editing`), at most once every 30 s;
  - never while nothing has changed.
- **How:** `git hash-object`, `mktree`, `commit-tree`, then
  `git push --force <remote> <sha>:refs/brainfile-live/<desk>/out`. The
  checkout is not touched, and the credentials are the ones board sync
  already uses.
- **Size:** a few KB. The cap is 256 KB per phone; past it, the oldest
  ended runs are dropped first.

**Phone to desk, `in/<phone-id>`, `inbox.json`:** a list of messages
`{seq, at, op, …}`.
- **Ops:**
  - `handoff {project, task, agent, model?, effort?}`;
  - `withdraw {project, task}`;
  - `answer {askId, optionId | null}`;
  - `stop {runId}`.
- **seq** goes up by one with each message, counted per phone and per
  repository.
- **Clearing:** the phone keeps a message until `acks` covers it, then drops
  it on its next write.
- **Cost:** each write is three API calls (tree, commit, ref with force).

## Trust (subtask 4)

Use the pairing. Do not make it a per-board opt-in.

- **The key.** Both sides already hold each other's static X25519 public keys,
  from the QR and from Noise message 1 (`desktop/src/link/store.ts`,
  `brainfile-mobile/src/link/store.ts`). Each derives
  `K = HKDF-SHA256(X25519(own secret, other's public), salt "brainfile-relay/1", info desk_pub ‖ phone_pub)`.
  The label keeps K separate from Noise's own use of the same DH. Both sides
  already ship `@noble/hashes` and `@noble/ciphers` for `noise.ts`.
- **Seal, not only sign.** Each file and message is
  `XChaCha20-Poly1305(K, random 24-byte nonce, plaintext, AD = "<repo>|<desk-id>|<phone-id>|<direction>")`.
  - A MAC alone would stop forgery but would publish ask titles (commands,
    paths), replies and file lists to everyone who can read the repository.
  - Sealing costs the same and also lets the phone trust the `out` file: a
    collaborator who can push could otherwise forge an ask to collect an
    answer, or forge a run's state.
  - The AD ties a sealed message to its repository, so it cannot be replayed
    in another one.
- **Replay.** The desk keeps the last `seq` per phone and repository in
  `link.json`, and refuses anything at or below it. `at` is used only for the
  24-hour limit on hand-offs. An answer or a Stop names an `askId` or a
  `runId` that only exists while that ask or run does.
- **Unpairing revokes.** The desk derives keys only for the phones in
  `link.json`, so Forget in Settings (or the phone's Forget desktop) ends the
  relay too. The desk then deletes that phone's `in/` ref and its `out` file
  on the next push. A reinstalled desk has a new key, so the phone must scan
  again, as over the link. The phone's secret is in the Keychain
  `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, so it can only seal while the phone is
  unlocked, which is when the app is open.
- **The board record is not trusted.** The desk never starts an agent because
  of `dispatch:` alone, so a collaborator's commit cannot start one. The
  record is what a person reads; the sealed message is what the desk obeys.
- **Per-board opt-in, rejected.** It would let anyone with push access start
  agents on the desk, and that is only safe for a solo private repository.
- **A switch on the desk.** Settings, Phone gets "Reach this desktop through
  GitHub", off by default. When on, the desk publishes refs to the
  repositories of its projects.

## Latency and rate (subtask 5)

**The desk** polls `matching-refs/brainfile-live/<desk-id>/` with the ETag
for each project that has a GitHub repository and a linked phone:
- every 15 s;
- every 5 s while an ask is open or a run a phone started is going.

The desk already has GitHub credentials for issues (gh, then the environment,
then a saved token: `desktop/src/main/github.ts:117-125`). Without them it
falls back to `git ls-remote` every 30 s. A 304 is free, so ten repositories at
15 s are 2,400 requests an hour that cost nothing, and about 40 a minute
against the 900-point secondary limit. Only the desk's own pushes and the
phone's writes cost anything, at 1 point each.

**The phone** adds the same ETag poll per followed repository to its 30 s
board poll. While the app is in front and one of its runs or asks is open, it
polls every 10 s. A changed ref costs one GraphQL read of the sealed file, and
a write costs three REST calls.

**Expected waits:**
- Hand to… until `codex · starting` shows on the row: about 10–35 s.
  - The phone's two commits take about 3 s.
  - The desk's next poll comes within 15 s.
  - The fetch, check and start take about 3 s.
  - The out push takes about 3 s plus the 3 s gathering.
  - The phone's next poll comes within 10 s.
- An ask, from when the agent asks until the desk has the answer: about
  5–20 s, plus however long the person takes to answer. Asks are seen only
  while the app is open, as over the link.

So the answer to the open question is: 15 s by default and 5 s while
something waits, not a minute. Faster polling would cost little, but GitHub
asks for fixed, unhurried polls.

## Recommendation (subtask 6)

Through refs:
- the hand-off;
- runs on rows;
- asks, answers and Stop;
- the review summary;
- the agents and models lists.

Without the desk, straight to the board ref:
- editing a task. This is v1 work left undone, and first: title,
  description, assignee, tags, due date, and adding, renaming and deleting
  subtasks (`brainfile-mobile/src/data/ops.ts` has none of these).

Link only:
- the chat and Discuss;
- boards kept only on the desk;
- Merge and Discard;
- Sync now.

It lands as **a plan under spec-17**, not as subtasks on it. It spans three
repositories' worth of work (core and CLI, the desktop, the phone) and a
protocol document. Proposed tasks, in order:

1. Phone: edit tasks over GitHub (the ops above, with parity tests against
   core). No desktop needed.
2. Core and CLI: `DispatchRecord` in core (`by`, `desk`, `state`,
   `startedAt`), a helper to set and clear it, `show` prints it, lint accepts
   it. The desktop's window Hand to… writes it too.
3. Protocol: `brainfile-mobile/docs/relay.md` beside `link.md`, covering refs,
   key derivation, sealing, seq and acks, payloads, and limits. First, try a
   force-updated `refs/brainfile-live/a/b/c` from a fine-grained token on a
   scratch repository.
4. Desktop: the relay. Settings switch, `out` publisher (debounced push),
   watcher (ETag poll, open, act on handoff, withdraw, answer, stop), seq kept
   in `link.json`, Forget clears refs.
5. Phone: the relay client. While the desk is Away, read `out` for runs,
   asks, reviews and agents, and write `in` for Hand to…, Withdraw, answers
   and Stop. The row says `Waiting for <desk name>` until a run starts.

Decisions to record when the plan is accepted (not recorded here, since this
is a recommendation):
- `mobile.relay.trust`: the relay is sealed with the pairing's key, and a
  board record alone never starts an agent;
- `mobile.relay.refs`: passing state goes in `refs/brainfile-live/<desk>/…`,
  outside `refs/brainfile/*`;
- `desktop.dispatch.record`: every hand-off writes `dispatch:` on its task.
