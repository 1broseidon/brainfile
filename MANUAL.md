# brainfile

Markdown task boards for you and your coding agents. Every task, epic, plan
and decision is a plain Markdown file in your repo; you work the board from a
CLI or a TUI, and your agents work it through an MCP server.

No database, no platform, no account. The board diffs, merges and reviews like
the rest of the code, and an agent reads it the way it reads any other file.

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

brainfile is an npm package. It needs Node 20 or newer.

```console title="Install"
$ npm install -g brainfile
$ brainfile init
```

If you are pointing a coding agent at a repo, hand it this instead.

```console title="Or hand it to your agent"
Set up brainfile in this repo for me.
1. Run: npm install -g brainfile
2. Run `brainfile init` at the repo root.
3. Add the MCP server to .mcp.json:
   {"mcpServers":{"brainfile":{"command":"npx","args":["brainfile","mcp"]}}}
4. Run `brainfile brief --agent <your name>` and tell me what the board says.
From here on, track work on the board: `brainfile add` before you start,
`brainfile note` as you learn things, `brainfile complete` when you are done.
```

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

brainfile is one of the [chain.sh](https://chain.sh) tools. The `chain` skill
installs the set for a coding agent in one step:

```console
$ npx skills add 1broseidon/skills --skill chain
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

| Command | Use it when |
| --- | --- |
| `init` | Starting a board in a repo. |
| `tui` | You want to see the board and work it by keyboard. |
| `add`, `move`, `patch`, `complete` | The daily loop: create, advance, edit, finish. |
| `list`, `show`, `search` | Reading the board or the history. |
| `note`, `log` | Writing to a task's log, or reading what was done. |
| `subtask` | Breaking a task into checkable steps. |
| `contract` | Handing work to an agent with deliverables and validation. |
| `brief` | An agent is starting a session and needs what changed since its last one. |
| `mcp`, `hooks` | Wiring brainfile into a coding agent. |
| `plan`, `adr`, `types` | Plans, decisions and custom document types. |
| `template`, `lint`, `schema` | Task templates, config validation, the bundled schemas. |
| `archive`, `restore`, `auth` | Exporting completed work to GitHub or Linear, and bringing it back. |
| `migrate`, `config` | Upgrading a v1 board, and the user-level config file. |

> Every command that touches a task takes `-t <id>`. Every command finds the
> board by walking up from the current directory, preferring
> `.brainfile/brainfile.md` and falling back to `brainfile.md`, `.brainfile.md`
> and `.bb.md`; pass `-f <path>` to point at another one.

## Commands

All flags are as printed by `brainfile <command> --help`. Commands that accept
`--json` say so; `list` does not have one yet, so scripts and agents should use
`show --json`, `brief --json` or the MCP tools instead.

### The board

#### init — Create .brainfile/ in the current directory

```console
$ brainfile init
$ brainfile init --force   # overwrite an existing config
```

Writes `brainfile.md` with two columns and the default agent instructions,
creates `board/` and `logs/`, and adds a `.gitignore` that excludes `state/`,
where per-agent brief state lives.

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

Notes stay with the task and become the ledger `summary` when it completes.

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
```

The first brief for a name prints the board title, the agent instructions and
accepted ADRs, then the agent's tasks. Later briefs are deltas: new notes, task
changes and completions since the last one. State is per agent, kept in
`.brainfile/state/` and ignored by git.

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

#### migrate — Upgrade a v1 board

```console
$ brainfile migrate --dir ./old-project
```

Flags: `--dir`, `--force`, `--logs-to-ledger`.

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

Two files on this domain are written for agents rather than people:
[/llms-install.txt](/llms-install.txt) is the setup procedure, and
[/llms-full.txt](/llms-full.txt) is this manual as plain Markdown.
[/llms.txt](/llms.txt) is the short index.

## Notes

### One file per document, on purpose

Every task is its own file so that two people, or two agents, editing the board
at once produce a merge instead of a conflict, and so that a task's history is
its git history. Keep IDs stable; the CLI never reuses one.

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
