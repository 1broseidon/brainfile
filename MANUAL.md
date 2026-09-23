# brainfile

Markdown task boards for you and your coding agents. Every task, epic, plan
and decision is a plain Markdown file in your repo; you work the board from a
CLI or a TUI, and your agents work it through an MCP server.

For people, it replaces the board in a browser tab with files in the repo,
worked from a CLI or a TUI. For agents, it is a board they can read and work
through an MCP server, with contracts that say what done means.

```console title="Install"
$ npm install -g brainfile
$ brainfile init
```

```console title="Or hand it to your agent"
Install brainfile and set up a board in this repo for me.
1. Run: npm install -g brainfile
2. Run `brainfile init` at the repo root.
3. Add the MCP server to .mcp.json:
   {"mcpServers":{"brainfile":{"command":"npx","args":["brainfile","mcp"]}}}
4. Run `brainfile brief --agent <your name>` and tell me what the board says.
From here on, track work on the board: `brainfile add` before you start,
`brainfile note` as you learn things, `brainfile complete` when you are done.
```

## Overview

A board is a `.brainfile/` directory next to your code. Its config is one file,
each active document is one file, and completed work goes to a log. That is the
whole data model.

```
.brainfile/
├── brainfile.md        # board config: columns, agent instructions, document types
├── board/              # active documents, one file each
│   ├── task-1.md
│   └── epic-1.md
└── logs/               # completion history
    ├── ledger.jsonl    # append-only completion record
    └── task-2.md       # archived documents
```

The CLI edits those files for you, and so does the MCP server — an agent with
`brainfile mcp` attached can list the board, add and move tasks, pick up a
contract and mark it delivered, with the same rules a person gets. Because a
task is a file, `git blame`, pull requests and code review already work on it.

> Contracts are the part built for agents: a task can carry deliverables,
> validation commands and constraints. An agent picks the contract up, does the
> work, delivers, and validation runs the commands and checks the files. Nothing
> is done until it passes.

## Install

brainfile is an npm package; it needs Node 20 or newer. `npm install -g
brainfile` puts the command on your PATH, and `brainfile init` creates the
board. The other routes are below.

#### npx — no global install

```console
$ npx brainfile init
$ npx brainfile list
```

Every command works through `npx`. The MCP configuration above uses it so the
server tracks whatever version npm resolves, and nothing has to be on the PATH.

#### Upgrading from a single brainfile.md — the v1 layout

```console
$ brainfile migrate
$ brainfile migrate --logs-to-ledger   # also backfill logs/*.md into ledger.jsonl
```

Older boards kept every task inside one `brainfile.md`. `migrate` splits that
into `.brainfile/brainfile.md` plus one file per task, keeps backups, and
refuses to overwrite its own outputs unless you pass `--force`.

#### chain — the rest of the toolkit

brainfile is one of the [chain.sh](https://chain.sh) tools. One command installs
the set:

```console
$ curl -fsSL https://chain.sh/bootstrap.sh | sh
```

## Quickstart

The session below is real output from 0.20.0, run in an empty directory.

```console
$ brainfile init
Brainfile initialized successfully!

  Created: /tmp/demo/.brainfile/brainfile.md
  Created: /tmp/demo/.brainfile/board/
  Created: /tmp/demo/.brainfile/logs/

$ brainfile add -t "Swap the parser cache" -p high --tags perf --files core/parser.ts
Task added successfully!

  ID:       task-1
  Title:    Swap the parser cache
  Column:   To Do
  Priority: high
  Tags:     perf
  Files:    1 linked

$ brainfile add -t "Write the migration note" --assignee claude --with-contract --ready --deliverable "docs:MIGRATION.md:Notes for 0.20" --validation "npm test"
Task added successfully!

  ID:       task-2
  Title:    Write the migration note
  Column:   To Do
  Assignee: claude

$ brainfile move -t task-1 -c in-progress
Task moved successfully!

  Task:   task-1 - Swap the parser cache
  From:   To Do
  To:     In Progress

$ brainfile note -t task-1 "Bounded by bytes, not entries"
Log entry added.
  Task: task-1
  - 2026-09-20T19:03:56.862Z: Bounded by bytes, not entries

$ brainfile complete -t task-1
Task completed!

  Task:        task-1 - Swap the parser cache
  CompletedAt: 2026-09-20T19:03:57.055Z
  Moved to:    logs/task-1.md
```

The second task carried a contract, so an agent can claim it. `pickup` moves
the task to the in-progress column, marks the contract in progress and prints
the brief the agent works from:

```console
$ brainfile contract pickup -t task-2
```

```markdown
# Contract pickup: task-2

## Task
- **ID**: task-2
- **Title**: Write the migration note
- **Column**: in-progress
- **Contract status**: in_progress

## Deliverables
- `docs` `MIGRATION.md` — Notes for 0.20

## Constraints
- (none)

## Relevant files
- (none)

## Validation
- `npm test`
```

After those six commands the directory looks like this. Nothing here is
generated or opaque; open any of it in an editor.

```console
$ find .brainfile -type f | LC_ALL=C sort
.brainfile/.gitignore
.brainfile/board/task-2.md
.brainfile/brainfile.md
.brainfile/logs/ledger.jsonl
.brainfile/logs/task-1.md
```

## The board on disk

Three kinds of file, all Markdown with YAML frontmatter, all meant to be read
and edited by hand when that is quicker than a command.

### brainfile.md — the config

`init` writes `.brainfile/brainfile.md`. It holds configuration only: the columns, the standing
instructions an agent should read, and any custom document types. Tasks never
live in it.

```yaml
---
schema: https://brainfile.md/v2/board.json
title: My Project
agent:
  instructions:
    - Task files are individual .md files in board/
    - Completed tasks are in logs/
    - Preserve all IDs
    - Make minimal changes
columns:
  - id: todo
    title: To Do
  - id: in-progress
    title: In Progress
---

# My Project

Add your project description here.

> Note: Completing a task moves it to `logs/` via `brainfile complete`.
```

`agent.instructions` is what `brainfile brief` shows an agent on its first
visit, alongside any accepted decision records. Put the guidance you would
otherwise repeat in every prompt there.

### board/ — one document per file

The file name is the ID. Everything the board knows about a document is in the
frontmatter; the body is free Markdown for the description and notes. This is
`board/task-2.md`, the task the quickstart handed to an agent, after pickup:

```yaml
---
id: task-2
title: Write the migration note
column: in-progress
position: 1
assignee: claude
contract:
  status: in_progress
  deliverables:
    - type: docs
      path: MIGRATION.md
      description: Notes for 0.20
  validation:
    commands:
      - npm test
  metrics:
    readyAt: "2026-09-20T19:03:56.451Z"
    pickedUpAt: "2026-09-20T19:03:57.257Z"
    reworkCount: 0
createdAt: "2026-09-20T19:03:56.453Z"
updatedAt: "2026-09-20T19:03:57.257Z"
---
```

| Field | Meaning |
| --- | --- |
| `id` | Unique across the board. The prefix comes from the type: `task-`, `epic-`, `adr-`, `plan-`. Never regenerate one. |
| `type` | `task` (default), `epic`, `adr` or `plan`, plus any type you define. |
| `title`, `column`, `position` | Where the card sits. `column` is a column id from the config. |
| `priority` | `low`, `medium`, `high` or `critical`. |
| `tags`, `assignee`, `dueDate` | Free-form. `assignee` is how `brief` and the TUI's `@name` filter find an agent's work. |
| `parentId` | The epic or plan this document belongs to. `list --parent` follows it. |
| `relatedFiles` | Paths an agent should read first. |
| `subtasks` | `{ id, title, completed }` rows, managed with `subtask`. |
| `contract` | Deliverables, validation and constraints. See [Contracts](#contracts). |

### logs/ — what got done

`complete` does two things: it appends one JSON line to `ledger.jsonl` and moves
the task file to `logs/`. The ledger is the record; the file is the archive.
`log`, `search` and the MCP `search` tool read both. After the quickstart,
`logs/ledger.jsonl` holds one line:

```json
{"id":"task-1","type":"task","title":"Swap the parser cache","filesChanged":["core/parser.ts"],"createdAt":"2026-09-20T19:03:56.245Z","completedAt":"2026-09-20T19:03:57.055Z","cycleTimeHours":0,"summary":"- 2026-09-20T19:03:56.862Z: Bounded by bytes, not entries","priority":"high","tags":["perf"],"relatedFiles":["core/parser.ts"]}
```

Notes added with `note` become the `summary`, so the ledger reads as a
changelog written while the work happened rather than after.

### Document types

`task`, `epic`, `adr` and `plan` are built in. Epics group tasks through
`parentId` and refuse to complete while children are active unless you pass
`--force`. ADRs are decisions: `adr promote` marks one accepted and moves it to
`logs/`, where `brief` keeps surfacing it. Plans are first-class documents with
a free-form `status`, and tasks link to the plan they implement.

Add your own under `types:` in the config, or with `brainfile types add`. A
type gets an ID prefix, a completable flag and an optional schema. With
`strict: true` on the board, every document must declare a known type.

> The JSON Schemas the frontmatter points at are served from this domain and
> never move: [/v2/board.json](/v2/board.json), [/v2/task.json](/v2/task.json),
> [/v2/contract.json](/v2/contract.json), [/v2/epic.json](/v2/epic.json),
> [/v2/adr.json](/v2/adr.json), with [/v2/index.json](/v2/index.json) as the
> directory. `brainfile schema board` prints the bundled copy without a network.

## Choosing a command

| The question | Use |
| --- | --- |
| Start a board in this repo | `init` |
| See the board and work it by keyboard | `tui` |
| Create a task | `add` |
| Advance a task to another column | `move` |
| Change a task's fields | `patch` |
| Finish a task and record it | `complete` |
| Read the whole board | `list` |
| Read one task in full | `show` |
| Find something, active or done | `search` |
| Write down what you learned while working | `note` |
| Break a task into steps | `subtask` |
| Hand work to an agent, with deliverables and validation | `contract` |
| Orient an agent at the start of a session | `brief` |
| Let an agent work the board as tools | `mcp` |
| Keep an agent updating the board | `hooks` |
| Read what was done on a task | `log` |
| Record a plan or a decision | `plan`, `adr` |
| Export finished work to GitHub or Linear, or bring it back | `archive`, `restore` |
| Share the board with another machine or person | `sync` |
| See where the board lives and who has it | `where` |
| Upgrade a v1 board, or move a board onto its own branch | `migrate` |

> Every command that touches a task takes `-t <id>`. Every command finds the
> board by walking up from the current directory to the repository root,
> preferring `.brainfile/brainfile.md`; inside a git repository it then looks
> for the worktree on the board branch and checks it out if the branch exists
> but has no directory yet (see [Sharing a board](#sharing-a-board)). Legacy
> names `brainfile.md`, `.brainfile.md` and `.bb.md` still resolve. Pass
> `-f <path>` to point at another board, or `-g` for the home board in
> `~/.brainfile`. Custom types, task templates, linting, the schemas and the
> config file are in [Commands](#commands).

## Commands

Twenty-eight commands, in four groups. `-t <id>` names the task and
`-f <path>` the board; everything else is per-command, and every flag is as
printed by `brainfile <command> --help`. Expand a row for its flags. Commands
that accept `--json` say so; `list` does not have one yet, so scripts and
agents should use `show --json`, `brief --json` or the MCP tools instead.

### The board

#### init — Create .brainfile/ in the current directory

```console
$ brainfile init
$ brainfile init --force    # overwrite an existing config
$ brainfile init --plain    # a plain directory, even inside a git repository
$ brainfile init --here     # inside a repository: this directory, not its root
$ brainfile init -g         # the home board at ~/.brainfile
```

Writes `brainfile.md` with two columns and the default agent instructions,
creates `board/` and `logs/`, and adds a `.gitignore` that excludes `state/`,
where per-agent brief state lives.

Inside a git repository the board is created at the repository root as a
worktree on its own `brainfile` branch, hidden from the code branch through
`.git/info/exclude`; outside one, `--tracked` makes it its own repository.
Either way every change becomes a commit. `--plain` opts out. See
[Sharing a board](#sharing-a-board).

#### list — List tasks, optionally filtered

```console
$ brainfile list
$ brainfile list -c todo
$ brainfile list -t urgent             # by tag
$ brainfile list --parent epic-1
$ brainfile list --contract ready      # ready | in_progress | delivered | done | failed
```

Prints every column with its tasks, priorities and tags.

#### show — Full details of one task

```console
$ brainfile show -t task-2
$ brainfile show -t task-2 --json
```

`--json` prints the document's frontmatter as one object, timestamps included.

#### add — Create a document

```console
$ brainfile add -t "Fix login bug" -p high --tags bug,auth --files src/auth.ts
$ brainfile add -t "Auth epic" --type epic --child "OAuth flow" --child "Session hardening"
$ brainfile add -t "OAuth flow" --parent epic-1
```

| Flag | Meaning |
| --- | --- |
| `-t, --title` | Required. |
| `-c, --column` | Defaults to `todo`. |
| `-d, --description` | Written to the Markdown body. |
| `-p, --priority` | `low`, `medium`, `high`, `critical`. |
| `--tags`, `--subtasks`, `--files` | Comma-separated. |
| `--assignee`, `--due-date` | A name; a `YYYY-MM-DD` date. |
| `--type` | `epic`, `adr`, `plan` or a custom type. Sets the ID prefix. |
| `--parent` | Parent ID. `--child <title>` creates children under the new document, repeatable. |
| `--with-contract` | Attach a draft contract. Add `--ready` to make it dispatchable at once. |
| `--deliverable`, `--validation`, `--constraint` | Contract parts, each repeatable. See [Contracts](#contracts). |

#### move — Change a task's column

```console
$ brainfile move -t task-1 -c in-progress
```

Column names and ids both work.

#### patch — Partial update of a task's fields

```console
$ brainfile patch -t task-1 -p critical --assignee codex
$ brainfile patch -t task-1 --tags perf,cache        # replaces the tag list
$ brainfile patch -t task-1 --clear-due-date
```

Takes `--title`, `-d`, `-p`, `--tags`, `--assignee` and `--due-date`, plus
`--clear-tags`, `--clear-assignee`, `--clear-due-date` and `--clear-priority`.
`-p none` also removes the priority.

#### complete — Finish a task

```console
$ brainfile complete -t task-1
$ brainfile complete -t epic-1 --force   # even if children are still active
```

Appends to `logs/ledger.jsonl`, moves the file to `logs/`, and records cycle
time from `createdAt`.

#### delete — Remove a task permanently

```console
$ brainfile delete -t task-3 --force
```

`--force` is required; there is no prompt and no undo. Prefer `complete`.

#### subtask — Add, toggle, update or delete subtasks

```console
$ brainfile subtask -t task-1 --add "Write tests"
$ brainfile subtask -t task-1 --toggle sub-1
$ brainfile subtask -t task-1 --update sub-1 --title "Write unit tests"
$ brainfile subtask -t task-1 --delete sub-1
```

#### search — Search active tasks and completed logs

```console
$ brainfile search parser
$ brainfile search parser -c in-progress
```

Matches titles, descriptions and log entries across the board and the ledger.

#### note — Append a timestamped line to a task's log

```console
$ brainfile note -t task-1 "Bounded by bytes, not entries"
$ brainfile note -t task-1 --agent codex "Tests pass on the new cache"
```

Each note is tagged with who wrote it: `--agent` when given, otherwise the
agent running the command if brainfile can tell (see [Who did
what](#who-did-what)), otherwise your git `user.name`. Notes stay with the task
and become the ledger `summary` when it completes.

#### log — Read completed work

```console
$ brainfile log --recent
$ brainfile log -t task-1
$ brainfile log -s "cache"
```

#### tui — The interactive board

```console
$ brainfile tui
```

Columns, detail view, filters and every write operation from the keyboard. See
[The TUI](#the-tui).

### Agents

#### brief — What changed since this agent last checked in

```console
$ brainfile brief --agent claude
$ brainfile brief --agent claude --peek    # read without marking seen
$ brainfile brief --agent claude --json
$ brainfile brief --agent claude --offline # skip the sync a shared board does first
```

The first brief for a name prints the board title, the agent instructions and
accepted ADRs, then the agent's tasks. Later briefs are deltas: new notes, task
changes and completions since the last one. State is per agent, kept in
`.brainfile/state/` and ignored by git. A shared board syncs before the brief
so it reflects other machines; a sync failure is one warning line, never an
error.

#### contract — pickup, deliver, validate, attach, graph, activate

```console
$ brainfile contract pickup -t task-2
$ brainfile contract deliver -t task-2
$ brainfile contract validate -t task-2
$ brainfile contract attach -t task-5 --ready --deliverable "file:src/x.ts" --validation "npm test"
$ brainfile contract activate --parent epic-1     # every draft under the epic → ready
$ brainfile contract graph --show
```

The whole lifecycle is in [Contracts](#contracts).

#### mcp — Start the MCP server

```console
$ brainfile mcp
```

Speaks MCP over stdio; your agent launches it, you never run it by hand. Tools
and setup are in [For agents](#for-agents).

#### hooks — Install reminder hooks into a coding agent

```console
$ brainfile hooks install claude-code
$ brainfile hooks install cursor --scope project
$ brainfile hooks list
$ brainfile hooks uninstall cline --scope all
```

Supports `claude-code`, `cursor` and `cline`, at `user` (default) or `project`
scope. The hooks nudge the agent to update the board after it edits files and
tell it a board exists when a session starts.

### Structure

#### plan — First-class plan documents

```console
$ brainfile plan add -t "Thin-frontend refactor" --status draft
$ brainfile plan list --status active
$ brainfile plan show plan-1 --json
$ brainfile plan link plan-1 -t task-42
```

`add` takes `-c`, `--description`, `--tags`, `--parent` and a free-form
`--status`. `link` sets the task's `parentId` to the plan, so
`list --parent plan-1` finds a plan's tasks. On a strict board, add a `plan`
entry under `types:` first.

#### adr — Decision records

```console
$ brainfile add -t "Use SQLite for the index" --type adr
$ brainfile adr promote -t adr-1
```

`promote` marks the ADR accepted and moves it to `logs/`. Accepted decisions
appear in every agent's first `brief`.

#### types — Inspect and add document types

```console
$ brainfile types
$ brainfile types list --json
$ brainfile types add spec --id-prefix spec --completable false --schema ./spec.json
```

#### template — Create tasks from templates

```console
$ brainfile template --list
$ brainfile template --use bug-report --title "Login times out" -c todo
```

Three templates ship: `bug-report`, `feature-request` and `refactor`, each with
a default priority, tags and a subtask checklist.

### Maintenance

#### lint — Validate the config, fix what it can

```console
$ brainfile lint
$ brainfile lint --fix
$ brainfile lint --check   # non-zero exit for CI
```

`--fix` also folds a legacy `rules:` block into `agent.instructions`.

#### schema — The bundled JSON Schemas

```console
$ brainfile schema               # list
$ brainfile schema board --json
$ brainfile schema update        # check brainfile.md for a newer version
```

Bundled with the CLI, so validation works offline. Update checks run at most
once a day and never block.

#### migrate — Upgrade a v1 board, or change how it is stored

```console
$ brainfile migrate --dir ./old-project
$ brainfile migrate --to-branch            # move the board onto its own branch
$ brainfile migrate --to-branch --commit   # ...and commit its removal from the code branch
$ brainfile migrate --to-plain             # back to a plain directory
```

Flags: `--dir`, `--force`, `--logs-to-ledger`, `--to-branch`, `--to-plain`,
`--commit`. `--to-branch` keeps the board's history when it was committed on
the code branch (`git subtree split`), imports a gitignored one as a fresh
branch, and folds a standalone board repository into the surrounding
repository. Board changes not yet committed come along as one more commit on
the branch. If any step fails, the migration undoes itself and the repository
is left as it was. `--to-plain` leaves the branch intact.

#### where — Where the board lives and who has it

```console
$ brainfile where
$ brainfile where --json
```

Prints the board's location, how it is stored (plain files, a branch of this
repository, or its own repository), the remote it is shared through, when it
last synced, and how many changes are waiting to be sent. It never touches
the network, so it is always safe to run.

#### sync — Share a board through a git remote

```console
$ brainfile sync                                  # fetch, merge, push
$ brainfile sync --pull                           # one direction
$ brainfile sync --set-remote origin              # the code remote
$ brainfile sync --set-remote git@host:me/boards.git --board-name myproject
$ brainfile sync --autosync full                  # off | push | full
```

Fetches the board, fast-forwards or merges with the board-aware merge driver,
and pushes it to `refs/brainfile/<name>` on the remote. Runs entirely inside the board directory; the code tree is
never touched. `--set-remote` in a repository that has no board yet checks the
board out from that remote. Details in [Sharing a board](#sharing-a-board).

#### archive, restore — Export completed work, or bring it back

```console
$ brainfile archive -t task-1                    # same as complete
$ brainfile archive -t task-1 --to github
$ brainfile archive --all --to linear --dry-run
$ brainfile restore -t task-1 -c todo
```

Exports create an issue in the configured GitHub repo or Linear team; set the
destination with `config set archive.github.owner`, `archive.github.repo` or
`archive.linear.teamId`, and `archive.default` for the default target.

#### auth — GitHub and Linear credentials

```console
$ brainfile auth github            # OAuth device flow
$ brainfile auth github --token ghp_…
$ brainfile auth linear --token lin_api_…
$ brainfile auth status
$ brainfile auth logout --all
```

#### config — The user-level config file

```console
$ brainfile config path            # ~/.config/brainfile/config.json
$ brainfile config list
$ brainfile config set archive.default github
```

Holds archive destinations, auth and the schema update timestamp. Nothing about
a specific board lives here.

## Contracts

A contract is the part of a task an agent is accountable for: what files to
produce, what commands must pass, and what rules to respect. It lives under
`contract:` in the task's frontmatter and moves through a fixed set of states.

```
draft --activate--> ready --pickup--> in_progress --deliver--> delivered --validate--> done
                      ^                                                              |
                      +--------------- rework: set ready again <--- failed <---------+
```

| Status | Meaning |
| --- | --- |
| `draft` | Written but not dispatchable. `add --with-contract` starts here unless you pass `--ready`. |
| `ready` | Claimable. `list --contract ready` is the queue. |
| `in_progress` | An agent picked it up. The task moves to the in-progress column. |
| `delivered` | The agent says it is done. |
| `done` / `failed` | The result of `validate`. To rework a failed one, add `feedback` and set `status` back to `ready` in the task file; the next pickup bumps `reworkCount`. |
| `blocked` | Waiting on something outside the board. |

### Writing one

Deliverables are `type:path:description`, with the description optional and the
type one of `file`, `test`, `docs`, `design` or `research`. Validation commands
run from the repo root. Constraints are prose the agent reads at pickup.

```console
$ brainfile add -t "Add rate limiting" --assignee codex -p high \
    --with-contract --ready \
    --deliverable "file:src/rateLimiter.ts:Token bucket implementation" \
    --deliverable "test:src/__tests__/rateLimiter.test.ts:Unit tests" \
    --validation "npm test -- rateLimiter" \
    --validation "npm run build" \
    --constraint "Non-blocking; no new dependencies"
```

`contract attach` adds one to a task that already exists, with the same flags.
`contract graph` attaches several at once with `--depends-on` between them, so
a research task, an implementation and its tests become a small dependency
graph; `--show` prints it.

### Running one

The agent claims it, works from the pickup brief, and delivers. Then whoever
owns the board validates: every deliverable path must exist and every
validation command must exit zero.

```console
$ brainfile contract pickup -t task-7      # → in_progress, prints the brief
$ brainfile contract deliver -t task-7     # → delivered
$ brainfile contract validate -t task-7    # → done, or failed with the reason
```

Each transition is recorded under `contract.metrics`: `readyAt`,
`pickedUpAt`, `deliveredAt`, `duration` and `reworkCount` sit on the task file
and go into the ledger when the task completes.

> Draft contracts are how you plan a batch without dispatching it. Write them
> under an epic, review the set, then `contract activate --parent epic-1` turns
> all of them ready in one step.

## Sharing a board

The short version:

| Where you run `init` | Where the board lives | Who has it |
| --- | --- | --- |
| A folder without git | `.brainfile/`, plain files | This machine |
| Inside a git repository | `.brainfile/`, saved as commits on a separate `brainfile` branch | This machine, until you run `sync --set-remote` |
| Anywhere, with `-g` | `~/.brainfile/`, its own small repository | This machine, until you run `sync --set-remote` |

In every case the board is ordinary files in `.brainfile/` that you and your
agents read directly. Nothing leaves the machine until you name a remote, and
`brainfile where` always tells you where the board is, how it is stored, who
else has it, and whether any changes are waiting to be sent:

```console
$ brainfile where
Board     .brainfile/
Stored    as commits on the 'brainfile' branch of this repository
          Kept out of your code branch, its commits and pull requests.
Shared    through origin (git@github.com:me/app.git)
          Stored there as refs/brainfile/board, not a branch, so it stays out of branch lists and pull requests.
          On the web: https://github.com/me/app/commits/refs/brainfile/board
          Last synced 2m ago. Nothing waiting to be sent.
          Changes are sent automatically after each edit.
          Anyone who can read origin can read this board.
```

A board is a folder of Markdown. That is what makes it easy to read, and what
made it hard to share: committed next to the code, every task move lands on a
feature branch and a pull request; gitignored, it never leaves the machine.
So the board lives on its own git branch instead, and the code branch never
sees it.

### The branch

`brainfile init` inside a repository creates `.brainfile/` as a linked
worktree on an orphan branch named `brainfile` (`git config brainfile.branch`
renames it). The directory is hidden through `.git/info/exclude`, so `git
status` on the code branch stays clean and the board never appears in a pull
request. Every command that changes the board makes one commit on that branch,
authored by your git user, so `git log` inside `.brainfile/` is the board's
history:

```console
$ git -C .brainfile log --format='%an  %s' -3
george  move task-7: review [codex]
george  note task-7: Bounded by bytes, not entries [claude]
george  add: Swap the parser cache
```

Files edited by hand are committed as `edit: <files>` before the next command
runs, so they are never folded into someone else's commit.

#### Who did what

When an agent makes the change, the commit message ends with its name in
brackets, and notes carry the same name. brainfile works out the agent in
this order:

1. `--agent <name>` or `BRAINFILE_AGENT`, when the agent says who it is.
2. The nearest agent CLI above the command: `claude`, `codex`,
   `cursor-agent`, `gemini`, `opencode`, `goose`, `droid`, `crush`, `aider`,
   `cline`, `amp`, `qwen` or `copilot`.
3. Variables agents set for the commands they run, for sandboxes that hide
   the process tree (Codex's `CODEX_THREAD_ID`, Claude Code's `CLAUDECODE`).

Commands you type yourself get no tag, and your notes carry your git
`user.name`. Desktop apps and editors don't count as agents, because their
built-in terminals are yours. `BRAINFILE_DETECT_AGENT=off` keeps only names
given explicitly.

The branch is hidden, not secret. A plain `git push` sends only your code
branch, but `git push --all`, `--mirror` and mirroring tools push every local
branch, the board included. Once the board is on a remote, anyone who can read
that remote can read it. The point is a clean main, not privacy; for private
notes next to public code use a separate remote (below).

Two worktrees of the repository share the board directly. A clone gets it the
first time you run `brainfile` there: brainfile asks the remote once for a
shared board, checks it out into `.brainfile/`, says so (`Checked out the
shared board from origin into .brainfile/`), and sends changes back to the
remote it came from. If the remote has no board, brainfile does not ask again
for ten minutes; `sync --set-remote` always asks. Someone who never runs
`brainfile` never sees the folder.

Outside a repository, `init --tracked` makes the board its own small
repository; the home board `brainfile init -g` is always one. Both take the
same `sync` commands.

### The remote

The board never syncs anywhere until you choose a remote, because boards are
often private notes living next to public code:

| You want | Run |
| --- | --- |
| The team sees the board with the code | `brainfile sync --set-remote origin` |
| A private board next to public code | `brainfile sync --set-remote git@host:me/boards.git` |
| One private repository holding many boards | `--set-remote <url> --board-name <project>` |

A URL is registered as a git remote named `board`.

On the remote the board is stored as `refs/brainfile/<name>`, a git ref that
is not a branch. It is pushed, fetched and kept like any other ref, but hosts
only list branches, so it never shows up in the branch list, a "recent
pushes" banner or a pull request, and a plain `git clone` or `git fetch` does
not download it. On GitHub, `brainfile where` prints a link to the board's
history. The name defaults to `board` inside a repository, the folder name
for a standalone board, and `home` for the home board, so one "boards"
repository can carry a board per project. The setting is git config
(`brainfile.remote`, `brainfile.boardName`), so it is per clone and never
committed.

Boards shared by 0.21.0 were pushed as a `brainfile` branch. The first `sync`
from a newer version merges that branch in, publishes the board under
`refs/brainfile/`, and deletes the old branch from the remote. Upgrade every
machine that shares the board: a 0.21.0 machine keeps pushing to the branch.

`sync` fetches, fast-forwards or merges, then pushes. Once a remote is set,
every mutation schedules a push a few seconds later in the background
(`brainfile.autosync = push`). `full` also fetches before a read when the last
sync is older than a minute; `off` leaves everything to explicit `sync`.
`brief` always syncs first unless `--offline`. Network failures are one line
on stderr; a mutation never fails because the network did. The TUI shows
`synced 12s ago` in its header while a remote is set.

### Conflicts

Two machines moving the same task is a merge, not a problem. `.gitattributes`
on the board branch routes board files through the `brainfile merge-driver`
git driver, which merges frontmatter field by field: a field changed on one
side takes that side; changed on both, the later `updatedAt` wins, and a tie
goes to the incoming side so every machine converges on the same answer. Log
entries and note lists union, ordered by timestamp. `ledger.jsonl` merges by
line union, so two completions keep both records. A task completed on one
machine and edited on another stays completed, with the edit appended to the
archived file as a log entry.

Anything else, such as two rewrites of the same description paragraph, is left
with ordinary git markers inside `.brainfile/`; `sync` names the file and
stops pushing until it is resolved.

### Moving an existing board

`brainfile migrate --to-branch` moves a board that is committed with the code
onto the branch with its history, or imports a gitignored one as a fresh
branch. `--commit` also commits the removal from the code branch. `migrate
--to-plain` reverses it. Neither touches any other file in the repository.

## The TUI

`brainfile tui` opens the board in the terminal: columns across, a detail view
for the selected document, and a filter line. It edits the same files the CLI
does, so changes made elsewhere show up on `r`.

| Keys | Action |
| --- | --- |
| `j` `k` `↑` `↓` | Move within a column. `g` and `G` jump to the ends, `ctrl-d` and `ctrl-u` page. |
| `h` `l` `←` `→` `tab` | Move between columns. |
| `↵` | Open the selected document. In the detail view, open a child. `esc` goes back. |
| `t` | Cycle the document type shown. `L` toggles the done view. |
| `/` | Filter. `p:high`, `#tag` or `t:tag`, `@name`, `type:epic`, `contract:ready`, `due:overdue`. |
| `a` `n` | Add a task. `N` adds and opens it for editing. |
| `m` `c` `e` | Move, complete, edit. |
| `p` | Set priority. In the detail view, jump to the parent. |
| `space` | Collapse a group. In the detail view, toggle a subtask. |
| `d` `y` `A` | Delete, copy the ID, archive. |
| `r` `?` `q` | Reload, help, quit. |

Editing opens `$EDITOR` on the task file. Set `NO_COLOR` to drop colour.

## For agents

The board is a directory of Markdown, so any agent that can read files can read
it. Three things make it a working surface rather than a reference: the MCP
server, the per-agent brief, and hooks.

### The MCP server

Add this to `.mcp.json` at the repo root (or the equivalent for your agent) and
restart the agent. Eleven tools appear, mirroring the CLI.

```console title=".mcp.json"
{
  "mcpServers": {
    "brainfile": {
      "command": "npx",
      "args": ["brainfile", "mcp"]
    }
  }
}
```

| Tool | Does |
| --- | --- |
| `list_tasks` | List board documents, filtered by column, tag or type. |
| `get_task` | One document by ID, in full. |
| `search` | Search tasks and logs, list recent completions, or view one log entry. |
| `task_add` | Create a document. Takes `type`, and contract parts for `with_contract`. |
| `task_move` | Move one task or many to a column. |
| `task_patch` | Update fields on one task or many; `null` removes a field. |
| `task_complete` | Complete to the ledger, or export to GitHub or Linear. |
| `task_delete` | Remove a task. |
| `subtask` | `action=` add, toggle, delete or update, on one subtask, several, or all. |
| `contract` | `action=` attach, pickup, deliver, validate, graph or activate. |
| `brief` | The per-agent delta, with `agent=` and optional `peek`. |

### Start every session with a brief

`brainfile brief --agent <name>` is the orientation call. The first time it
prints the board's standing instructions and accepted decisions; after that it
prints only what changed, so the cost stays small however long the board runs.
`--json` gives the same lanes as data. Have the agent use the same name it
gives as `assignee`, so its tasks show up under "Your Tasks".

### Hooks that keep the board honest

```console
$ brainfile hooks install claude-code
```

Installs three hooks into the agent's settings: after a file edit, a reminder
to update the task; before a prompt, a warning when files changed but the board
did not; at session start, a note that a board exists. `--scope project` writes
them into the repo instead of the user's home.

### Bootstrap files

Three files on this domain are written for agents rather than people:
[/llms.txt](/llms.txt) is the short index, [/llms-full.txt](/llms-full.txt)
is this manual as plain Markdown, and
[/llms-install.txt](/llms-install.txt) is the setup procedure.

## Notes

### One file per document, on purpose

Every task is its own file so that a task's history is its git history and a
merge touches one small file at a time. The board's own branch is what lets
two people, or two agents on different machines, edit at once: their commits
merge field by field (see [Sharing a board](#sharing-a-board)) instead of
colliding on a feature branch. Keep IDs stable; the CLI never reuses one.

### The config never holds tasks

`brainfile.md` is columns, instructions and types. If a legacy board still has
tasks or a `rules:` block in it, `migrate` and `lint --fix` move them where
they belong.

### Ledger first, archive second

`ledger.jsonl` is the record `search`, `log` and `brief` read. The archived
task file in `logs/` is kept for people. If they ever disagree, the ledger wins.

### The library underneath

The CLI is built on [@brainfile/core](https://www.npmjs.com/package/@brainfile/core),
which parses and writes the board format. Use it directly when a tool needs to
read a board without shelling out.
