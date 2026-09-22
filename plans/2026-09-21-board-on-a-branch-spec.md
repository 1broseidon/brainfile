# Board on a branch — shared board storage on a git ref (binding spec)

Decision (George, 2026-09-21): the board becomes a linked git worktree checked out on an orphan branch of the project's own repository. Every mutation is a commit on that branch, authored as the acting agent. Sync is optional and targets a remote of the user's choosing, which may be a different remote than the code's. In George's words: a pseudo cloud database for free, attached to the project itself.

Precedents: gh-pages (non-code content on an orphan branch, pushed directly); git-bug and git-appraise (issue/review data synced through git refs with no server). Difference from git-bug: we keep a worktree checkout so the board stays plain files agents can read and grep.

## Problem

- Board state is versioned with code. Task status changes by the minute; code is branchy and merges at PR time. Every worktree and branch carries its own stale copy of the board, and updates travel only as commits on the code branch.
- `.brainfile/` is commonly gitignored on purpose (it is ideas and text, not code). Then linked worktrees have no board at all: agents in Orca worktrees of this very repo are blind.
- Across machines the only transport is committing to the code branch, which nobody does to move a task.
- `archive --to github|linear` was tried and killed: a second source of truth and a cloud middleman.
- Evidence: George moves to Linear for sharing across agents and machines despite owning brainfile.

The "one file per document so edits merge" design solved merge conflicts, which were never the pain. Visibility right now is.

## Decision

1. New storage mode `tracked` (earlier draft: `branch`): the board directory is a git repository. Inside a project repo it is a linked worktree on `refs/heads/brainfile` (orphan, unrelated history), hidden from code branches via `.git/info/exclude`. Outside any repo it is a standalone repo rooted at `.brainfile/`. The `BoardRepo` wrapper does not care which; both are `git -C .brainfile`. Verified 2026-09-21 in a scratch repo (see User journeys).
2. Every mutation is exactly one commit on that branch.
3. `brainfile sync` pulls and pushes that one branch to a configured remote. No remote configured means local-only, which already fixes same-machine worktrees.
4. Core stays git-free and network-free (task-9 boundary). Commits and sync live in cli: `cli/src/utils/git-helper.ts` grows into a `BoardRepo` wrapper. Shell out to git as git-helper already does; no new runtime deps.
5. `plain` mode (today: a directory, committed or ignored, no git awareness) keeps working unchanged and stays first-class. `tracked` is the default `init` offers inside a git repo and an opt-in elsewhere.

## Layout

```
repo/                        <- main, or any feature branch / linked worktree
├── src/
└── .brainfile/              <- git worktree of branch "brainfile"; hidden via .git/info/exclude
    ├── .git                 <- gitdir pointer file (linked worktree)
    ├── .gitattributes       <- merge drivers (committed on the board branch)
    ├── .gitignore           <- state/ (per-machine, never synced)
    ├── brainfile.md
    ├── board/task-3.md
    ├── plans/
    ├── logs/ledger.jsonl
    └── state/claude.json

repo/.git/
├── refs/heads/main
├── refs/heads/brainfile     <- the board's history
├── worktrees/brainfile/     <- git's bookkeeping for the linked checkout
├── info/exclude             <- .brainfile/ (written by the CLI; the code branch is never touched)
└── config                   <- brainfile.* keys, shared by all worktrees, never committed
```

Creation is one git command (git >= 2.42 for `--orphan`; fallback: `git switch --orphan` inside a temp worktree):

```bash
git worktree add --orphan -b brainfile .brainfile
```

## Resolution: how any command finds the board

Order, first hit wins:

1. `-f/--file` or explicit path: as today.
2. Existing walk-up discovery (`core/src/utils/files.ts:findBrainfile`): `.brainfile/brainfile.md` found → use it. From the main working tree this is the worktree checkout.
3. New: inside a git repo and step 2 failed (cwd is a linked code worktree, `.brainfile/` absent there): `git worktree list --porcelain`, choose the worktree whose branch equals git config `brainfile.branch` (default `brainfile`), use `<path>/brainfile.md`.
4. New: no such worktree but the branch exists locally or at the configured remote: create the worktree at `<main worktree>/.brainfile` (main worktree = first entry of `git worktree list`; bare-repo layouts with no main worktree use `<common dir>/brainfile/`, which git permits), add `.brainfile/` to `.git/info/exclude`, print the path once, use it.
5. Else: no board. Inside a git repo the walk-up stops at the toplevel and the CLI says so: `no board in this repo: brainfile init, or -g for your home board`. Outside any repo the walk-up may reach `~/.brainfile` and prints a dim `using ~/.brainfile` hint.
6. `-g` / `--global` (or `BRAINFILE_GLOBAL=1`) skips discovery and targets `~/.brainfile`.

Core stays git-free: `findBrainfile` gains a `stopDir` option; cli computes it with `git rev-parse --show-toplevel`.

Config keys live in git config, which linked worktrees share through the common dir and which is never committed: `brainfile.branch`, `brainfile.remote`, `brainfile.remoteBranch`, `brainfile.autosync`.

## Commits

- After each core mutation the frontend calls `boardRepo.commit({ verb, id, summary, agent })`. Message form `<verb> <id>: <summary>`:
  `add task-12: Fix login bug` · `move task-3: todo -> in-progress` · `note task-3: Tests pass on the new cache` · `complete task-3` · `contract deliver task-3`.
- Author: `<agent> <agent@brainfile.local>` when `--agent` or the acting assignee is known, else the git user. Committer: always the git user. `git blame` on a task file then answers who wrote what; `git log -- board/task-3.md` is the task's history.
- Hand edits: before any CLI mutation and before sync, outstanding changes in the worktree are committed as `edit: <files>` by the git user. Nothing is lost and nothing blocks.
- TUI: debounce 2 s, one commit per burst with a combined message. MCP: one commit per tool call. CLI: immediate.
- Budget: <= 30 ms per commit on a board of a few hundred files. Test asserts exactly one commit per CLI mutation.

## Sync

```bash
brainfile sync                      # fetch, merge, push the board branch
brainfile sync --pull | --push
brainfile sync --set-remote origin  # or a URL, or another remote name
```

- Algorithm: `git fetch <remote> <remoteBranch>`; fast-forward when possible; if both sides advanced, `git merge --no-edit` (never rewrite other agents' commits); then push. Runs inside the board worktree; the code tree is untouched.
- Auto: `brief` syncs first unless `--offline` or no remote is set. Mutations trigger a debounced push (5 s). `brainfile.autosync = off | push | full`; default `push` once a remote is configured; `full` also fetches before reads when the last fetch is older than 60 s.
- Failure: network errors are a one-line warning on stderr. A mutation never fails because sync failed. Exit code stays 0.
- Privacy default: no remote until the user sets one. Never default to `origin`, because boards are often private text living next to public code. `init` and `migrate` print the one-liner to set a remote; prompt only when interactive.
- `remoteBranch` defaults: `brainfile` for a repo board, the parent folder's basename for a standalone board, `home` for the global board. Printed on `--set-remote` so the one-private-boards-repo pattern never collides silently.
- Remote choices, all plain git: `origin` for a team board; a private repo URL (added as git remote `board`); or one private "boards" repo holding many projects as branches via `brainfile.remoteBranch` (for example remote `boards`, branch `brainfile`, `cymbal`, `recoil`).

## Conflicts

- `.gitattributes` committed on the board branch:
  ```
  logs/ledger.jsonl merge=union
  board/*.md        merge=brainfile
  logs/*.md         merge=brainfile
  brainfile.md      merge=brainfile
  ```
- Driver registered in the shared git config by init/migrate: `merge.brainfile.driver = brainfile merge-driver %O %A %B`.
- Semantics v1: parse base/ours/theirs frontmatter. Per field, changed on one side → take it; changed on both → later `updatedAt` wins, tie → theirs (deterministic). Body: git's three-way text merge; a conflict inside `## Log` or note lists resolves by union ordered by timestamp; elsewhere leave markers, exit 1, and `sync` names the file. Complete-vs-edit: completion wins and the edited text is appended as a log entry on the archived file. Anything unhandled surfaces as an ordinary git conflict inside the worktree for a human.

## Identity

- The `--agent` name is the commit author and already drives brief and notes. The same name on two machines is the same agent from the board's view. brief cursors stay per-machine in `state/`, gitignored inside the worktree. Introduce `name@host` only if dogfooding shows collisions.

## Migration

```bash
brainfile migrate --to-branch [--commit]
brainfile migrate --to-plain
```

- Board tracked on the code branch: `git subtree split --prefix=.brainfile -b brainfile` (history preserved, built-in git), `git rm -r --cached .brainfile`, add `.brainfile/` to `.git/info/exclude` (leave any existing `.gitignore` entry alone), move the directory to `.brainfile.migrating`, `git worktree add .brainfile brainfile`, verify identical trees, delete the aside copy. Print the commit the user should make on the code branch; `--commit` makes it.
- Board ignored or untracked (this repo): `git worktree add --orphan -b brainfile .brainfile.new`, copy files in, commit `import board`, swap directories.
- Standalone tracked board in a folder that later became a repo: `git fetch .brainfile main:brainfile` from the outer repo (local-path fetch, history preserved), replace `.brainfile/.git` with a linked-worktree checkout of that branch.
- Already tracked: no-op.
- `--to-plain`: remove the worktree (or the standalone `.git`), leave the files as a plain directory, remove the exclude entry only if we added it. The branch is left intact.

## Frontend parity and tests

- CLI, MCP, TUI: every mutation → exactly one commit (parity table, same style as the V2 mutation parity tests).
- Sync: two clones plus a bare remote. Move on A, sync, sync on B → visible on B. Both-move on the same task → auto-resolved, ledger carries both records.
- Worktree: create a linked code worktree, run `brainfile list` from it → same board, no sync.
- Privacy: public origin plus private board remote → nothing board-related is ever pushed to origin (assert refs on the bare "origin").
- cli tsc stays ~3 s; no new runtime dependencies.

## Docs

- MANUAL: new "Sharing a board" section. Replace the "one file per document so edits merge" justification with the honest story: worktrees share instantly, machines sync through the remote you choose, conflicts are rare and field-merged. Document `.gitignore`, remote choices, and the private-board-next-to-public-code pattern.

## Non-goals

- Hosted service, realtime push notifications, mobile.
- Web UI: spec-5 follows on this substrate as `brainfile serve` over the synced worktree.
- Two-way Linear or GitHub sync. `archive --to` stays as a one-way export.
- Hidden ref namespaces (`refs/brainfile/*`): v1 uses a plain branch so clones fetch it by default and GitHub can browse it.

## Phases

1. Branch storage: resolution steps 3–4, per-mutation commits, `init --branch`, `migrate --to-branch / --to-plain`. Ships same-machine sharing with zero sync.
2. `sync`, remote config, `.gitattributes`, merge driver, brief auto-sync.
3. Autosync debounce, TUI "synced N s ago" indicator, MANUAL section, spec-5 re-scope.

## Acceptance

- Worktree A moves a task; worktree B lists it moved with no sync step.
- Fresh clone on machine B: after one `sync`, `brainfile brief --agent x` shows the board.
- Both-move conflict resolves without a human; ledger has both records.
- Public repo plus private board remote: origin never receives board refs.
- `npm test` green; cli tsc unchanged.

## Open questions

- Step 4 auto-creating the worktree: decided yes, printing the path once.
- Cross-board brief lane (home-board items assigned to the agent shown inside a project brief): candidate for phase 3, needs dogfood evidence first.
- Debounce values (2 s TUI, 5 s push) are guesses; tune on dogfood.
- Whether `plan` documents should live on the board branch too: yes by default, since `plans/` is inside `.brainfile/`.

## User journeys (talked through 2026-09-21; git mechanics verified in a scratch repo)

### A. Repo with git

| # | Situation | What happens | Cost to user |
|---|-----------|--------------|--------------|
| A1 | New project, `brainfile init` at repo root | Orphan branch + worktree at `.brainfile/`, exclude entry, first commit `init board`. Prints: local-only; how to set a remote. | one command |
| A2 | `init` run in a subdirectory of a repo | Initializes at the toplevel (one board per repo) and says so; `--here` forces a plain board in the subdirectory. | one command |
| A3 | Existing board committed on main | `migrate --to-branch`: subtree split keeps history, `git rm --cached`, exclude entry, worktree swap. User commits the removal on the code branch (`--commit` does it). | one command + one commit |
| A4 | Existing board gitignored (this repo) | `migrate --to-branch`: orphan worktree, import files, one commit. Existing ignore entry may stay. | one command |
| A5 | Daily use in the main tree | Identical UX to today. Each command is a commit authored as the agent; `git -C .brainfile log` is the audit trail. | none |
| A6 | Agents in linked worktrees (Orca) | Any command from a linked worktree finds the board through `git worktree list`. One directory, so the TUI watcher sees every agent's writes. | none |
| A7 | Separate clone on the same machine | No shared git dir, so it behaves like a second machine (A8). | see A8 |
| A8 | Second machine or teammate, board on origin | `git clone` already fetched the branch; the first brainfile command creates the worktree and exclude entry. | clone only |
| A9 | Second machine, board on a private remote | `brainfile sync --set-remote <url>` once: adds remote `board`, fetches, creates the worktree. Verified: author names survive, outer tree stays clean. | clone + one command |
| A10 | Public code, private board | Origin never receives board refs; verified by inspecting the bare remotes. This is the default posture because no remote is ever assumed. | none |
| A11 | Read-only teammate | Pull works; push prints a one-line warning; local commits accumulate until access is granted. | none |
| A12 | Offline | Commits land locally; `sync` later merges. Verified: concurrent add on one side and note on the other merge without conflict. | none |
| A13 | OSS contributor on a fork, public upstream board | Their sync pushes to the fork's board branch; changes reach upstream as a PR between `brainfile` branches. Works with no new machinery; not a v1 focus. | none |
| A14 | CI or bots | `git fetch origin brainfile` then any command; single-branch clones need that fetch. | one line in CI |
| A15 | Bare repo + linked worktrees only | Board worktree lives at `<common dir>/brainfile/`; verified git allows a worktree inside the git dir. | none |
| A16 | Leaving | `migrate --to-plain`; the branch stays until deleted. | one command |
| A17 | Monorepo wanting several boards | v1: one tracked board per repo; nested plain boards still resolve by walk-up. Named branches (`brainfile/<name>`) only if demand appears. | n/a |

### B. Folder without git

| # | Situation | What happens | Cost to user |
|---|-----------|--------------|--------------|
| B1 | `init` in a plain folder | Plain board, exactly today. Offers `--tracked`: `git init` inside `.brainfile/` (standalone repo, branch `main`). Same `BoardRepo`, same commits, same `sync`. | one command |
| B2 | Sync a standalone board | `sync --set-remote <url>`; pushes `main:<remoteBranch>` with `remoteBranch` defaulting to the folder's basename. Verified against the shared bare remote. | one command |
| B3 | The folder later becomes a git repo | `migrate --to-branch` fetches the standalone repo's history into the outer repo as `brainfile` (local-path fetch, verified) and swaps in a linked worktree. Nothing lost. | one command |
| B4 | Never wants git | Plain mode forever; no behavior change, no warnings. This path must stay zero-friction. | none |

### C. Central board: a system-wide todo

| # | Situation | What happens | Cost to user |
|---|-----------|--------------|--------------|
| C1 | Create it | `brainfile init -g` makes `~/.brainfile/` as a standalone tracked board (B1 machinery). | one command |
| C2 | Address it explicitly | `-g` / `--global` on any command, `BRAINFILE_GLOBAL=1` for agents, `brainfile mcp -g` for an agent whose job is personal todo (morning or scheduled agents running in `~`). | a flag |
| C3 | Discovery from a board-less repo | Walk-up stops at the git toplevel: `no board in this repo: brainfile init, or -g for your home board`. A repo never silently writes into the home board. | none |
| C4 | Discovery from `~/Downloads` or similar | Walk-up reaches `~/.brainfile` and prints a dim `using ~/.brainfile` hint. Same as today's behavior, now visible. | none |
| C5 | Two machines | `sync -g --set-remote <private url>`; `remoteBranch` defaults to `home`. Laptop and desktop share the personal board with no service. | one command per machine |
| C6 | Seeing everything at once | `brainfile boards`: current project, home, and every board branch on the configured boards remote via `git ls-remote`. The single private "boards" repo with one branch per project plus `home` is the end state; `serve` over it (spec-5) is the personal command center. | phase 3 |
| C7 | Boundaries | Boards stay independent: no cross-board `parentId`. A home task may point at a repo path in `relatedFiles`. Multi-user machines and mobile are out of scope; spec-5 covers mobile-ish access later. | n/a |
