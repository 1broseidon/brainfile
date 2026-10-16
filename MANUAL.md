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
`brainfile mcp` attached can do everything the CLI does to a board: list it,
add and move tasks, leave notes, change the columns, pick up a contract and
mark it delivered, with the same rules a person gets. Because a
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
instructions an agent should read, and any document types of your own. Tasks
never live in it, and neither do the built-in types: epic, spec, plan, task and
decision exist without being listed (see [Document types](#document-types)).

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
visit, alongside the decisions that stand. Put the guidance you would
otherwise repeat in every prompt there.

`brainfile columns` adds, renames, reorders and removes columns. Over MCP the
`columns` tool does the same, and `board` sets the title, the instructions
and `related:`, so an agent never edits this file by hand.

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
| `id` | Unique across the board. The prefix comes from the type: `task-`, `epic-`, `spec-`, `plan-`, `decision-`. Never regenerate one. |
| `type` | `task` (default), `epic`, `spec`, `plan` or `decision`, plus any type you define. `issue` and `adr` are accepted and written as `task` and `decision`. |
| `title`, `column`, `position` | Where the card sits. `column` is a column id from the config. |
| `priority` | `low`, `medium`, `high` or `critical`. |
| `tags`, `assignee`, `dueDate` | Free-form. `assignee` is how `brief` and the TUI's `@name` filter find an agent's work. |
| `parentId` | The one parent: a spec's epic, a plan's spec, a task's plan. `list --tree` draws it; `list --parent` follows it. |
| `dependsOn` | Tasks that come first. `mobile:task-12` names a task on a related board. See [Related boards](#related-boards). |
| `decisions` | The decisions this work rests on, e.g. `[decision-3]`. The reverse is worked out, never written on the decision. |
| `relatedFiles` | Paths an agent should read first. |
| `source` | The page of the issue the task was made from, e.g. `https://github.com/o/r/issues/12`. Written by `add --source` and `issues --import`; one task per issue. |
| `landsOn` | The branch a hand-off of this work forks from and merges back into, e.g. `release/0.38.0`. Inherited by everything under it unless something nearer sets its own; absent all the way up means the trunk. `lint` warns when the branch is neither in the repository nor on origin. |
| `epicBranch` | `true` on an epic: its lead makes the epic a branch of its own, `dispatch/<epic-id>`, from the epic's target. Its children fork from and land on that branch, and the epic is merged as one when the last is done. Off by default. |
| `pullRequest` | The pull request the task's hand-off was opened as instead of merged: `{ number, url, state, base, head, at }`, `state` being `open`, `merged` or `closed`. Written by `pr` and the desktop's Open pull request. While `open` the hand-off is not ready to merge; `merged` completes the task, `closed` puts it back. |
| `subtasks` | `{ id, title, completed }` rows, managed with `subtask`. |
| `contract` | Deliverables, validation and constraints. See [Contracts](#contracts). |
| `dispatch` | A hand-off: the `agent`, `model` and `effort` asked for, who asked (`by`: `chat`, `cli`, `mcp`, `lead`, `phone` or `person`), `at`, `until` (`review` or `done`) and `role` (`worker` or `lead`), and the `claim` of the runner that started it (`host`, `runner`, `pid`, `at`), so two runners never start the same task. The run's heartbeat stays in `state/`, never here. |

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

A decision that is superseded, rejected or stale also moves to `logs/`, with
its status and links, but it writes no ledger line: it was never completed.

### state/ — local to this machine

`.brainfile/state/` is ignored by git and never synced. It holds each agent's
brief checkpoint (`<agent>.json`) and the local search index (`index.db`):
SQLite with full-text search over the board, the ledger, `plans/` and the
project's own Markdown. Delete it at any time; it is rebuilt from the files.

### Document types

Every document is a file with frontmatter, so the board is a graph and not only
a list. Five types are built in, each with a place in it:

| Type | Glyph | What it is | Goes under | Holds |
| --- | --- | --- | --- | --- |
| `epic` | ▸ | An outcome worth several pieces of work; done when everything under it is. | top level | spec, plan, task |
| `spec` | ◆ | What to build and why: behaviour, scope, what is not in scope. | epic | plan, task |
| `plan` | ⎘ | How, and in what order; done when its tasks are. | epic, spec | task |
| `task` | | One piece of work a person or an agent can pick up. Alias `issue`. | epic, spec, plan, task | task |
| `decision` | ● | A standing choice. Alias `adr`. Not work: no column, never completed; current until superseded, rejected or stale. | never in the tree | nothing |

`parentId` is the one parent link and the table says which parents fit. A
parent cannot complete while it has open children (`complete --force`
overrides). An off-pattern parent, an epic under a task or anything under a
decision, is a `lint` warning; with `strict: true` on the board, `add`,
`patch` and `lint` refuse it. A loop is always refused.

The other edges are few and named: `dependsOn` orders work; `decisions:` on a
piece of work names the decisions it rests on, and when one is superseded,
open work resting on it says so in `show` and `list`; `supersedes` and
`supersededBy` link decisions to each other.

`issue` and `adr` are accepted wherever a type is (`add --type`, `list --type`,
`search`, the MCP tools) and new documents are written as `task` and
`decision`. Existing `type: adr` files read as decisions and keep their IDs.

#### Decisions

A decision belongs to a claim family through its dotted `claimKey`
(`dependency.http-client`). A family has one current decision: `decide`
records a new one and supersedes the old, which gets `status: superseded`
and `supersededBy`, moves to `logs/`, and is pointed at by the new one's
`supersedes`. A current decision lives in `board/`; a superseded, rejected or
stale one in `logs/`. The body is the decision and why.

```yaml
---
id: decision-3
title: Use undici for HTTP, never axios
type: decision
status: current
claimKey: dependency.http-client
kind: constraint
stance: forbids
subject: axios
holdsWhile: we target Node 20 and later
recheck: when fetch gains retries
validUntil: 2027-06-30
packageVersion: undici>=6
supersedes: decision-1
---
```

| Field | Meaning |
| --- | --- |
| `claimKey` | The family. Dotted segments of lowercase letters, digits, `_` and `-`. |
| `kind` | How firmly it binds: `decision` (default), `preference`, `constraint`, `rule`. |
| `status` | `current`, `superseded`, `rejected` or `stale`. None means current. |
| `stance`, `subject` | What it says about something: `prefers`, `rejects`, `requires` or `forbids` a package, a pattern, a tool. `check` reads them. |
| `holdsWhile`, `recheck` | The condition it holds under, and when or why to look again. |
| `validUntil` | After this date, `check` says review. |
| `sourcePath`, `sourceHash` | A file it rests on and its sha256; a change makes `check` say review. |
| `packageVersion` | A version it rests on, `name<op>version`: `zod>=4.3`, `engines.node>=20`, `go>=1.22`. Read from `package.json`, `go.mod` or `pyproject.toml`. |
| `supersedes`, `supersededBy` | The links between a family's decisions. |

Name your own under `types:` in the config, or with `brainfile types add`. A
type can take a built-in's place with `like:`: it gets that type's parents,
children, completion rule and glyph. One with no `like` behaves as a task.

```yaml
types:
  bug: { like: task }
  rfc: { like: spec, idPrefix: rfc }
```

An entry under a built-in's own name overrides it (`plan: { completable:
false }` stops a plan completing when it reaches a completion column). With
`strict: true`, a document's type must be built in or listed.
`brainfile types` prints every type with its place in the graph.

> The JSON Schemas the frontmatter points at are served from this domain and
> never move: [/v2/board.json](/v2/board.json), [/v2/task.json](/v2/task.json),
> [/v2/contract.json](/v2/contract.json), [/v2/epic.json](/v2/epic.json),
> [/v2/decision.json](/v2/decision.json) and [/v2/adr.json](/v2/adr.json), with
> [/v2/index.json](/v2/index.json) as the directory. `brainfile schema board` prints the bundled copy without a network.

## Choosing a command

| The question | Use |
| --- | --- |
| Start a board in this repo | `init` |
| See the board and work it by keyboard | `tui` |
| Create a task | `add` |
| See the repository's GitHub issues, or make a task from one | `issues` |
| Land a hand-off by GitHub pull request instead of a merge | `pr` |
| Hand tasks to a coding agent, see what is running, stop one | `dispatch`, `dispatch status`, `dispatch stop` |
| Work the queue here, in a terminal, asking you as it goes | `run` |
| Have an epic run by a lead; pause, resume or stop it | `dispatch <epic>`, `dispatch pause`, `dispatch resume`, `dispatch stop` |
| See a hand-off's work, land it or throw it away | `review`, `land`, `discard` |
| See which coding agents are installed, and their models | `agents` |
| Advance a task to another column | `move` |
| Add, rename, reorder or remove a column | `columns` |
| Change a task's fields | `patch` |
| Finish a task and record it | `complete` |
| Read the whole board | `list` |
| See epics, specs, plans and tasks as one outline | `list --tree` |
| Read one task in full | `show` |
| See what this board waits on in other repos | `list --related` |
| Find something, active or done, on the board or in the project's docs | `search` |
| Write down what you learned while working | `note` |
| Break a task into steps | `subtask` |
| Hand work to an agent, with deliverables and validation | `contract` |
| Orient an agent at the start of a session | `brief` |
| Record a decision, or replace one | `decide`, `supersede`, `retire` |
| Ask whether a decision still holds before acting | `check` |
| Let an agent work the board as tools | `mcp` |
| Keep an agent updating the board | `hooks` |
| Read what was done on a task | `log` |
| Record a plan | `plan` |
| See every type and where it fits | `types` |
| Export finished work to GitHub or Linear, or reopen it | `archive`, `restore` |
| Share the board with another machine or person | `sync` |
| See where the board lives and who has it | `where` |
| Fix where it lives when nothing would be lost, or undo that | `fix` |
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

Forty-seven commands, in five groups. `-t <id>` names the task and
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

Writes a short `brainfile.md` with two columns and the default agent
instructions (no `types:`: the five built-in types need none), creates `board/`
and `logs/`, and adds a `.gitignore` that excludes `state/`, where per-agent
brief state lives.

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
$ brainfile list --type spec           # aliases work: issue is task, adr is decision
$ brainfile list --tree                # the outline: epics, specs, plans, tasks
$ brainfile list --tree --parent epic-1
$ brainfile list --type decision       # decisions, current first
$ brainfile list --contract ready      # ready | in_progress | delivered | done | failed
$ brainfile list --related             # open tasks on related boards this board waits on
$ brainfile list --related all         # every open task on every related board
```

Prints every column with its tasks, priorities and tags. A task waiting on a
related board says so on a `Blocked by:` line, and one resting on a superseded
decision says that too. Decisions have no column, so `list` leaves them out
and says how many; `--type decision` lists them with where each stands.

`--tree` prints open work as an outline, nested by `parentId` in column order:

```console
$ brainfile list --tree

My Project — outline

▸ epic-1  Memory and the graph  · In Progress
  ◆ spec-1  Default types  · To Do
    ⎘ plan-1  Build order  · To Do
      · task-1  Registry  · To Do
  · task-3  Index work  · To Do  ⚠ rests on superseded decision-2
```

With a filter it shows the matches and keeps their ancestors, dimmed, for
context; `--parent` shows one document and everything under it.

#### show — Full details of one task

```console
$ brainfile show -t task-2
$ brainfile show -t task-2 --json
$ brainfile show -t mobile:task-12     # a task on a related board
```

`--json` prints the document's frontmatter as one object, timestamps included.
`show` names the document's type, its parent, its children (open or done),
each dependency and whether it is done, and the decisions it rests on with
where each stands; if one is superseded it says "Rests on a superseded
decision". A decision shows its status and the work resting on it. `--json`
adds the same as `graph`.

#### add — Create a document

```console
$ brainfile add -t "Fix login bug" -p high --tags bug,auth --files src/auth.ts
$ brainfile add -t "Auth epic" --type epic --child "OAuth flow" --child "Session hardening"
$ brainfile add -t "Token refresh" --type spec --parent epic-1
$ brainfile add -t "Use SQLite for the index" --type decision
$ brainfile add -t "Build the index" --parent spec-1 --decisions decision-1
$ brainfile add -t "Crash on empty board" --source https://github.com/o/r/issues/12
```

| Flag | Meaning |
| --- | --- |
| `-t, --title` | Required. |
| `-c, --column` | Defaults to `todo`. |
| `-d, --description` | Written to the Markdown body. |
| `-p, --priority` | `low`, `medium`, `high`, `critical`. |
| `--tags`, `--subtasks`, `--files` | Comma-separated. |
| `--assignee`, `--due-date` | A name; a `YYYY-MM-DD` date. |
| `--type` | `epic`, `spec`, `plan`, `task`, `decision` or a type of yours; `issue` and `adr` are aliases. Sets the ID prefix. A decision gets no column. |
| `--parent` | Parent ID; it must fit the type (see [Document types](#document-types)). `--child <title>` creates children under the new document, repeatable. |
| `--depends-on`, `--decisions` | Comma-separated IDs: tasks that come first, decisions the work rests on. |
| `--source` | The URL of the issue the task is made from, kept as `source:`. Refused when a task, open or completed, already carries it. |
| `--with-contract` | Attach a draft contract. Add `--ready` to make it dispatchable at once. |
| `--deliverable`, `--validation`, `--constraint` | Contract parts, each repeatable. See [Contracts](#contracts). |

#### issues — The repository's GitHub issues, and tasks made from them

```console
$ brainfile issues                        # open issues; those on the board show their task
$ brainfile issues --import 12 15         # make a task from each
$ brainfile issues --import 12 -c todo
$ brainfile issues --json
```

Lists the open issues of the GitHub repository the project's `origin` points
at, pull requests left out, most recently updated first, and marks each one a
task on the board (open or completed) already carries as `source:`.
`--import` makes a task from each number: the issue's title, its body as the
description, its labels as tags (`good first issue` becomes
`good-first-issue`), and its page as `source:`, in `-c, --column` or else the
first column that is not done. An issue already on the board is found, not
made again. GitHub is asked with the gh CLI's login (`gh auth token`), then
`GH_TOKEN` or `GITHUB_TOKEN`, then the token `brainfile auth github` saved;
with none, public repositories still answer, on GitHub's smaller rate limit.
The desktop app looks in the same order.

#### pr — A hand-off as a GitHub pull request

```console
$ brainfile pr task-12             # push dispatch/task-12, open a pull request into where it lands
$ brainfile pr task-12 --status    # where it stands; merged completes the task
$ brainfile pr task-12 --json
```

Landing by pull request instead of a merge (decision-16). The task's
hand-off branch, `dispatch/<task>`, is pushed to `origin`, and only that
branch: the trunk is never pushed. A pull request is opened from it into the
branch the task lands on (its `landsOn`, inherited, else the trunk), titled
with the task's title, its body the task's ID, the first lines of its
description and the last of its log, and the task records it as
`pullRequest:`. It is refused, as a merge is, while the worktree has
uncommitted work, the branch has nothing to land, a runner holds the task, or
one is open already; checks are the forge's. While it is open the hand-off is
not ready to merge.

`--status` asks GitHub where it stands. Merged, origin's copy of the target
is fetched, the worktree and the local branch go (a squash or rebase merge
counts when the branch is what the pull request carried; work committed
after it was pushed keeps the worktree, and says so), and the task
completes, unless subtasks are left. Closed without merging, `pullRequest:`
says `closed`, and the hand-off can be merged, or opened again. Credentials
as `issues`; opening one needs them.

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
$ brainfile patch -t spec-3 --parent epic-2
$ brainfile patch -t task-7 --depends-on task-5,task-6 --decisions decision-2
$ brainfile patch -t epic-3 --lands-on release/0.38.0 --epic-branch
```

Takes `--title`, `-d`, `-p`, `--tags`, `--assignee`, `--due-date`, `--parent`,
`--depends-on`, `--decisions`, `--lands-on` and `--epic-branch`, plus
`--clear-tags`, `--clear-assignee`, `--clear-due-date`, `--clear-priority`,
`--clear-parent`, `--clear-depends-on`, `--clear-decisions`,
`--clear-lands-on` and `--clear-epic-branch`. `-p none` also removes the
priority. A new parent must fit the type, as for `add`, and neither link may
loop. `--lands-on` must be a name git takes for a branch; cleared, the task
inherits its parent's target again.

#### complete — Finish a task

```console
$ brainfile complete -t task-1
$ brainfile complete -t epic-1 --force   # even if children are still active
```

Appends to `logs/ledger.jsonl`, moves the file to `logs/`, and records cycle
time from `createdAt`. A parent with open children refuses, whatever its
type, until they are done or you pass `--force`; a decision is never
completed.

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

#### search — Search the board, its history and the project's docs

```console
$ brainfile search parser
$ brainfile search parser -c in-progress
$ brainfile search cache --type adr      # decisions, under either name
$ brainfile search "p:high #auth token"  # filter tokens: p: #tag @user type: due: contract:
$ brainfile search parser --no-history --json
```

Current results come first: open work, current decisions, `plans/` and the
project's own Markdown (README, AGENTS.md, docs/…). History comes after, in
its own lane: completed work, the ledger, and decisions that were superseded,
rejected or let go stale. Every hit has its path and line range; a board
document also has its ID, a file hit's ID is `path:start-end`.

On Node 22.13 and later the local index answers (`.brainfile/state/index.db`,
brought up to date before every search): words are matched all together
first and any of them second, ranked with titles over bodies. On older Node,
or with `BRAINFILE_INDEX=off`, the scan over `board/` and `logs/` answers in
the same shape; nothing else changes. A query that is only filter tokens
(`p:high`) always scans. `--limit` caps each lane (default 20), `--json`
prints `{ mode, query, results, count }` with each hit's `lane`, `source`,
`path`, `startLine` and `endLine`.

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

Columns, decisions, detail view, filters and every write operation from the
keyboard. See [The TUI](#the-tui).

### Agents

#### brief — Decisions, your tasks, what changed, the docs that bear on them

```console
$ brainfile brief --agent claude
$ brainfile brief --agent claude --max-chars 0  # no budget
$ brainfile brief --agent claude --peek         # read without marking seen
$ brainfile brief --agent claude --json
$ brainfile brief --agent claude --offline      # skip the sync a shared board does first
```

One block, about 1,600 characters (`--max-chars`), in lanes:

```
Brainfile brief for claude · My Project (since 3h ago)
! task-12 Build the index: rests on superseded decision-1 (now decision-3)
## Current decisions
- decision-3 dependency.http-client: Use undici for HTTP, never axios (constraint · forbids axios)
## Your tasks
- task-12 Build the index · In Progress · high
## Since your last brief
- task-12 note: [codex] wired the FTS table (2h ago)
- decision-3 decided: Use undici for HTTP, never axios (supersedes decision-1) (3h ago)
## Docs that bear on them
- docs/index.md:12-40 Search index › Design
```

Lines starting with `!` come first: open work resting on a superseded
decision, and current decisions whose `validUntil`, source file or package
version no longer holds. Then the current decisions; the agent's tasks (or,
when nothing is assigned to it, the work in flight); what changed since its
last brief (notes, task changes, completions, decisions made or retired,
config), or on a first brief the latest notes and completions; and, from the
local index, the docs that share the tasks' most distinctive words. When the
budget is tight every lane still gets its first line, shortened if need be,
before any lane gets a second, and a last line says how many more there are.

The checkpoint is per agent, kept in `.brainfile/state/` and ignored by git;
`--peek` reads without moving it. `--json` carries the block as `text`, its
lanes as `sections`, and the checkpoint's own `lanes` as before. A shared
board syncs before the brief so it reflects other machines; a sync failure is
one warning line, never an error. The SessionStart hook prints this block.

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

Speaks MCP over stdio; your agent launches it, you never run it by hand. It
tells the agent to use its tools for every board change and never to edit
`.brainfile/` by hand. Tools and setup are in [For agents](#for-agents).

#### hooks — Install reminder hooks into a coding agent

```console
$ brainfile hooks install claude-code
$ brainfile hooks install cursor --scope project
$ brainfile hooks list
$ brainfile hooks uninstall cline --scope all
```

Supports `claude-code`, `cursor` and `cline`, at `user` (default) or `project`
scope. The hooks nudge the agent to update the board after it edits files, and
when a session starts they hand it its brief: for Claude Code as
`hookSpecificOutput.additionalContext`, for Cline as text. The session-start
hook runs from a lean entry that loads the brief and nothing else, about
150ms warm; it names the agent from `BRAINFILE_AGENT`, else the tool
(`claude`, `cline`), and moves that agent's brief checkpoint.
`BRAINFILE_BRIEF_MAX_CHARS` changes its budget.

### Hand-offs

A hand-off is a task given to a coding agent (Claude Code, Codex,
Antigravity, Cursor, Grok, or an ACP server of your own) that works on it in
its own git worktree, on `dispatch/<task-id>`, forked from where the task
lands (decision-11, decision-16). The work waits on the board: `dispatch`
writes the request on the task, and a runner on this machine starts it. A
runner is `brainfile run` in a terminal, or the Brainfile window; each claims
a task before it starts it, so two never start one task, and each keeps its
runs' progress in `.brainfile/state/runs/`, which every runner on the
machine reads. The Brainfile window shows every run there, whoever started
it, and an ask from a run in a terminal can be answered in the window too:
the answer goes in `.brainfile/state/runs/<run-id>.answer.json`, which that
runner applies within a second, taking its prompt down. These commands are
also MCP tools (see [For agents](#for-agents)).

#### dispatch — Queue tasks for a coding agent

```console
$ brainfile dispatch task-12 --agent codex
$ brainfile dispatch task-12 task-13 --agent claude --model opus --effort high
$ brainfile dispatch --column todo --agent claude      # every open task in To Do
$ brainfile dispatch --parent epic-3 --agent codex     # the epic's open children
$ brainfile dispatch task-12 --agent codex --until done
$ brainfile dispatch task-12 --agent codex --now       # and run it here until it ends
$ brainfile dispatch epic-3 --agent claude             # a lead for the epic
```

Writes `dispatch:` on each task (the agent, model, effort, `until`, who asked
and when) and makes the agent its assignee; one commit on a tracked board.
With no `--agent`, a task goes to the agent it was last handed to, else its
assignee when that is an agent. `--until review` (the default) stops the
work in Review for you; `--until done` lands it on its own where the
repository's permission policy is bypass. A task an agent is still at, or a
runner holds, is skipped and said so; so are decisions. A task named that
has open children (an epic) gets a lead instead: see [Leads](#leads). A task
whose `dependsOn` are open, or
complete with their branch not landed, is queued and waits until they have
landed. At most `dispatch.maxRunning` in the board's config (else the
repository's setting in the app, else 3) run at once on a repository.

When no runner is up on this machine it says so: `Run brainfile run or open
Brainfile to start it.` `--now` runs the tasks here in the foreground
instead, through `brainfile run`'s loop given only these tasks, until each
has ended (and, with `--until done`, landed or been sent back); the agent's
questions come to this terminal, and Ctrl-C lets go of them as `run` does.
`--json` prints what was queued and skipped.

#### run — Work the queue in a terminal

```console
$ brainfile run                 # until Ctrl-C
$ brainfile run --once          # until nothing more can start
$ brainfile run --max 1         # one hand-off at a time from here
$ brainfile run --until done    # a request that names nothing lands on its own
```

A runner in the foreground, to leave open in a terminal split; not a
daemon. While it is up its file in `.brainfile/state/runners/` says so (so
`dispatch` stops saying no runner is up), and it looks at the queue every
second: it claims each queued task, oldest request first, starts its agent
in its worktree, and takes up an epic's lead the same way, then starts the
children the lead hands off inside the lead's rules. At most
`dispatch.maxRunning` run at once on the repository, whichever runner runs
them; `--max N` keeps this one to N of them. The Brainfile window and
another `brainfile run` work the same queue: each task is claimed by one
runner, by compare-and-swap on its file, so two never start one task.

It prints one plain line per change:

```text
task-74 · codex · editing
task-74 · codex · running
task-74 in Review
epic-6 · lead · claude · leading
task-75 · codex · done, landing it
task-75 landed
```

When an agent asks before it acts, the question comes to this prompt, one
at a time, naming the run (`task-74 · codex asks: Run npm test`), with the
agent's own choices by number (Allow once, Always, Deny). An ask whose run
stops is taken down. With no terminal to answer in, it is refused.

Ctrl-C lets go: the agents stop and their run files end, each task it held
goes back to the queue on the board (its request stays, its claim is
cleared) for the next runner, and a lead it ran waits for a runner to take
it up from its notes. Worktrees stay as they are. What it wrote on the
board is committed before it exits. A second Ctrl-C leaves at once; its
claims are then taken again once its process is gone.

`--once` returns when nothing it started is still going and nothing queued
can start, and says what is still queued and what each waits on. A lead it
ran that waits on you (children in Review, or waiting to be handed off) is
let go as on Ctrl-C. `--until review|done` is how far a hand-off goes when
its request names neither.

#### dispatch status, dispatch stop — What is running, and stopping it

```console
$ brainfile dispatch status
$ brainfile dispatch status --json
$ brainfile dispatch stop task-12           # or its run id, run-…
```

`status` is the runners up on this machine, every live hand-off (its task,
agent, model, what it is doing or asking, and which runner has it), the queue
in order with what each task waits on, and the tasks a runner holds, marked
`lost` when its runner has gone so another may take it. It reads the board
and every runner's run files, whichever process started them.

`stop` stops a run by its id or its task's: it is marked `stop` in its run
file, which its runner watches, and if it has not ended within 15 seconds
its runner is sent SIGTERM. The command waits for that. The worktree and
branch stay for review, and the claim is given back.

#### Leads

```console
$ brainfile dispatch epic-3 --agent claude --model opus
$ brainfile dispatch epic-3 --agent claude --now   # lead it here until it ends
$ brainfile dispatch pause epic-3
$ brainfile dispatch resume epic-3
$ brainfile dispatch stop epic-3
```

An epic, or any task with open children, is run by a lead (decision-15): an
agent that writes no code. It checks the plan first (which children touch
the same code, whether the dependencies are right, whether one child wires
the parts together), writes the plan as a note on the epic, then hands the
children off in order, and is woken with a new turn when one ends, lands or
is sent back. Its `brainfile mcp` is started as the lead of that epic, so its
`dispatch`, `dispatch_status` and `dispatch_stop` reach only the tasks under
it; it may read the code and run git commands that only read.

`dispatch <epic>` writes the lead's request on the epic: `dispatch:` with
`role: lead`. A runner that takes up leads (`brainfile run`, the Brainfile
window when you press Resume, or `--now` here) claims it, as it claims a
task, so one lead runs a tree, whichever process or machine; a tree that
already has one, above or under the epic, is refused. The runner holds the
rules the lead cannot bend, and checks them again before it starts what the
lead asks for:

- a child goes only once its `dependsOn` are done and their branches landed;
- at most `dispatch.maxRunning` hand-offs at once on the repository;
- a child is tried at most its contract's `maxRetries` again (once by
  default), counted in `tries` on its record; then it waits in Review for you,
  with a note saying so;
- only children under the epic with none of their own;
- in its tree only the lead and you hand off: the board's chat is refused;
- children it adds after it started, and children whose contract is still a
  draft, wait for you to hand them off, unless the repository's permission
  policy is bypass, where the lead also lands each child that ends in Review.

When the last child is done the epic is completed, or, with a branch of its
own (`epicBranch: true`), waits in Ready to merge. The lead's record comes
off and the lead ends.

`pause` marks the record `paused`: the lead hands off nothing and what
happens waits for its next turn; what is running goes on. `resume` takes that
off and the lead carries on; a lead no runner holds (its runner went away)
waits for one, and takes up from its notes on the epic. `stop` takes the
record off: the lead ends, and what it handed off goes on and is yours. Each
works whichever runner leads it, which follows the epic's record. `dispatch
status` lists the leads: waiting for a runner, leading or paused, and where.

#### review, land, discard — A hand-off's work, and what to do with it

```console
$ brainfile review task-12          # branch, commits, files, conflicts; can it land?
$ brainfile review --ready          # every hand-off that can land now
$ brainfile land task-12            # check, then land on its target
$ brainfile land task-12 --into release/2.0
$ brainfile discard task-12         # throw the worktree and branch away
```

`review` shows the task's branch and where it lands, its commits and the
files they change, files not yet committed in the worktree, and the files
that would conflict with its target now (git's merge-tree, nothing written).
`--ready` lists the hand-offs that can land: commits not yet in their
target, nothing uncommitted, no pull request open, and no agent at them.

`land` lands it as the window's Merge does (decision-12): its contract's
validation runs in its worktree with the target brought in, then it merges,
serially, and the task completes unless subtasks are left. A conflict or a
failed check goes back to the agent that did the work, with a note on the
task saying what collided and how to settle it, queued for a runner, up to
the contract's `maxRetries`; past that the task waits in Review for you, and
`land` exits non-zero. `discard` removes the worktree, uncommitted work and
all, and the branch. Both are refused while an agent is at the task.

#### agents — The coding agents a task can go to

```console
$ brainfile agents
$ brainfile agents --json
```

Every agent Brainfile knows and every one of your own (kept in
`dispatch.json` in the app's data folder, shared with the desktop), whether
it is installed on this machine, and the models each offered when it last
started.

### Structure

#### plan — First-class plan documents

```console
$ brainfile plan add -t "Thin-frontend refactor" --status draft
$ brainfile plan list --status active
$ brainfile plan show plan-1 --json
$ brainfile plan link plan-1 -t task-42
```

`add` takes `-c`, `--description`, `--tags`, `--parent` (an epic or a spec)
and a free-form `--status`. `link` sets the task's `parentId` to the plan, so
`list --parent plan-1` finds a plan's tasks. `plan` is a built-in type, so a
strict board needs no `types:` entry for it.

#### decide, supersede, retire — Decisions

```console
$ brainfile decide -k dependency.http-client "Use undici for HTTP. It ships with Node."
$ brainfile decide -k dependency.http-client --kind constraint \
    --stance forbids --subject axios "Never axios: one HTTP client"
$ brainfile decide -k release.window --valid-until 2026-12-31 \
    --recheck "Ask the release manager" "Release on Tuesdays"
$ brainfile decide -k storage.index --source docs/index.md "Index with SQLite FTS5"
$ brainfile decide -k runtime.node --package "engines.node>=20" --for task-12 "Support Node 20+"
$ brainfile supersede decision-3 "Use fetch: it retries now"
$ brainfile retire decision-4 --as rejected --note "Too costly to run"
```

`decide` needs `-k/--claim-key` and the text (`-` reads stdin; the first line
is the title unless `--title`). When the family already has a current
decision, that one is superseded and moved to `logs/`; when the family was
empty, it lists related families (the same parent key, or the same words) in
case the call already exists under another key. Saying again exactly what the
family's current decision says changes nothing. `--no-supersede` leaves both
current, and `check` will say review. `--source` records the file's sha256
relative to the project root; `--package` a version predicate; `--for` adds
the decision to the listed work's `decisions:`.

`supersede <id>` replaces one decision by hand, keeping its claim key and kind
unless you give others. `retire <id> --as rejected|stale` moves a decision to
`logs/` with that status and an optional `--note`. Each command is one board
commit on a tracked board. `list --type decision` lists them all, current
first; `show` prints one with its chain.

```console
$ brainfile add -t "Use SQLite for the index" --type decision
$ brainfile adr promote -t adr-1
```

ADRs are decisions: `--type adr` writes a `decision`, and an existing
`type: adr` file reads as one and keeps its ID. `promote` marks a legacy ADR
accepted and moves it to `logs/`. Current decisions and accepted ADRs appear
in every `brief`.

#### check — Does a decision still hold?

```console
$ brainfile check "use axios for the retry client"
$ brainfile check decision-3
$ brainfile check --claim-key dependency.http-client
$ brainfile check --claim-key-prefix dependency "add axios"
$ brainfile check "add axios" --json
```

`check` finds the claim family an action touches (a decision ID, a claim key,
or its words: the local index when there is one, a scan of the decisions when
there is not) and answers in this order:

| Verdict | When | Exit |
| --- | --- | --- |
| `review` | The family has two current decisions; or the current one's `validUntil` passed, its source file changed or its package version no longer matches; or the action names the decision's subject next to an adopt or remove cue ("use axios", "drop axios") that goes against its stance (`block_action` for requires and forbids, `ask_operator` for prefers and rejects); or the family has no current decision. | 2 |
| `use_replacement` | The action matched a superseded decision; the current one is named. | 3 |
| `use` | A current decision stands and nothing above applies: act on it (the decision is printed; `use` means follow it, not "go ahead with anything"). | 0 |
| `no_decision` | Nothing on the board speaks to it. | 0 |

`--claim-key-prefix` checks every family under a prefix and gives the worst
verdict. Errors (no board, bad arguments) exit 1. `--json` prints the verdict,
recommendation, reason, the predicates as evaluated and the family.

#### columns — Add, rename, reorder and remove columns

```console
$ brainfile columns                                   # list, with task counts
$ brainfile columns add "In Review" --after in-progress
$ brainfile columns add Shipped --completion
$ brainfile columns rename in-review Review
$ brainfile columns reorder backlog todo in-progress
$ brainfile columns remove review --move-to in-progress
```

Columns are named by ID or title. `add` makes the ID from the title
(`In Review` is `in-review`) unless `--id` gives one, and puts the column
last unless `--after` or `--before` says where; `--completion` marks a column
whose tasks count as done. `rename` changes the title only: the ID stays, so
the tasks in it stay. `reorder` puts the columns you name first, in that
order, and the rest after them. `remove` refuses a column that still holds
tasks unless `--move-to` names where they go; they move there first, without
being completed. The last column is never removed. Every command takes
`--json`, and each change is one board commit on a tracked board.

#### types — Every type and its place in the graph

```console
$ brainfile types
$ brainfile types list --json
$ brainfile types add bug --like task
$ brainfile types add rfc --like spec --id-prefix rfc --schema ./rfc.json
```

```console
$ brainfile types
Strict mode: off

  TYPE      ID          GOES UNDER                 HOLDS
▸ epic      epic-N      top level                  spec · plan · task
◆ spec      spec-N      epic                       plan · task
⎘ plan      plan-N      epic · spec                task
  task      task-N      epic · spec · plan · task  task                alias issue
● decision  decision-N  never in the tree          —                   alias adr · no column, never completed

  bug       bug-N       epic · spec · plan · task  task                like task
```

`--like` takes a built-in's place; without it a type behaves as a task. An
alias name (`adr`, `issue`) cannot be added as a type of its own.

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

`--fix` also folds a legacy `rules:` block into `agent.instructions`. `lint`
also checks the graph: a parent that is missing, loops or does not fit the
type, `decisions:` that name nothing or something other than a decision, and
a `like:` that names no type, and a `dispatch:` record a runner cannot read. Off-pattern links are warnings, and errors on a
strict board. It also checks where the board lives: two boards that disagree
are an error; the board branch checked out away from `.brainfile/`, a checkout
whose folder is gone (`--fix` forgets it), and a code branch still tracking an
old copy are warnings. So is a `landsOn` that names a branch the repository has
neither locally nor on origin.

#### index — The local search index

```console
$ brainfile index            # bring it up to date and say what changed
$ brainfile index --rebuild  # drop it and index from scratch
$ brainfile index --status   # what is in it
```

Never required: every `search`, `brief` and `check` brings the index up to
date first. Unchanged files (same size and modification time) are not read; a
changed file replaces its chunks; a deleted one drops out. Inside git the
project's files come from `git ls-files`, so `.gitignore` is honoured; root
`AGENTS.md` and `CLAUDE.md` are read even when ignored. Markdown and text only,
256 KiB a file at most, never `node_modules`, `dist` and the like, never
`.brainfile/` (the board is indexed on its own terms), never your home
folder. Where Node has no `node:sqlite` (below 22.13) it says so; search,
brief and check scan instead.

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
$ brainfile migrate --to-plain             # back to a plain directory
```

Flags: `--dir`, `--force`, `--logs-to-ledger`, `--to-branch`, `--to-plain`.
`--to-branch` keeps the board's history when it was committed on the code
branch (`git subtree split`), imports a gitignored one as a fresh branch, and
folds a standalone board repository into the surrounding repository. Board
changes not yet committed come along as one more commit on the branch. If any
step fails, the migration undoes itself and the repository is left as it was.
When the code branch tracked the board, one commit on it drops `.brainfile/`
and adds it to `.gitignore` (anything else you had staged stays staged); push
it like any commit. Run on a board already on its branch, it makes that commit
if the code branch still tracks an old copy. If a board already lives on the
`brainfile` branch, this folder and it are two boards, and `--to-branch` says
so and points to `merge-boards`. `--to-plain` leaves the branch intact.

#### where — Where the board lives and who has it

```console
$ brainfile where
$ brainfile where --fetch          # ask the remote for its copy first
$ brainfile where --json
```

Prints the board's location, how it is stored (plain files, a branch of this
repository, or its own repository), the remote it is shared through, when it
last synced, how many changes are waiting to be sent and how many on the
remote are not here yet. It also looks for every other copy of the board in
the repository (see [One board per repository](#one-board-per-repository)) and
says when one disagrees with this one. It touches the network only with
`--fetch`, so it is always safe to run.

#### adopt, merge-boards, backups — Settle two boards into one

```console
$ brainfile adopt refs/brainfile/remotes/origin/board   # take that board as it is
$ brainfile adopt .brainfile                            # keep this folder
$ brainfile merge-boards refs/heads/brainfile           # combine them by document ID
$ brainfile backups                                     # what was saved
$ brainfile backups restore 20261012T205217Z-folder     # put one back
```

When a repository has two boards (see
[One board per repository](#one-board-per-repository)), these make it one.
`adopt <ref|path>` takes the named board as it is. `merge-boards <ref|path>`
combines this board with the named one by document ID, with the same rules
sync uses: frontmatter fields by `updatedAt`, logs unioned in time order,
completion over an edit. One ID on two different documents (created apart,
with unrelated titles) keeps the older; the newer gets the next free ID, a
log line saying so, and every reference to it on its board rewritten. When
one board already has everything the other has, `merge-boards` says so and
adopts it without asking.

Both end the same way: the board on the `brainfile` branch, checked out at
`.brainfile/`, descending from what the branch and the remote's copy had (so
the next `sync` is a plain push), with any other checkout of the branch
removed once its changes are committed. If the code branch still tracked
`.brainfile/`, one commit on it stops tracking the folder and adds it to
`.gitignore`; push that like any commit. Every board that is replaced is saved
first as `refs/brainfile/backups/<UTC time>-folder` or `-branch`; `backups`
lists them and `backups restore <name>` puts one back, backing up what it
replaces. Backups stay on this machine unless you push one by name.

#### fix — Fix where the board lives, when nothing would be lost

```console
$ brainfile fix --dry-run                 # what is wrong, and what fix would do
$ brainfile fix                           # do it
$ brainfile fix --expected "Back up both, then untrack main's copy"
$ brainfile fix --undo                    # put it back, within 20 seconds
```

The desktop app's Fix, from the command line. It says what is wrong with
where the board lives, in the words the desktop's health list uses, and what
fix would do, then does it, as long as that is still the plan it printed
(`--expected` names the plan as `--dry-run` said it, for a script or an
agent). It only offers a fix that loses nothing: the copy it keeps already
has every document every other copy has, each the same or newer. It backs up
every copy first, as `adopt` does, and changes nothing if a backup fails.
Then it does one of three things: stops the code branch tracking an old copy
of `.brainfile/` (one commit, as `migrate --to-branch` makes), adopts the copy
that has everything (two copies, a checkout outside `.brainfile/`, or the
board branch checked out twice), or forgets a checkout whose folder is gone.

An unfinished merge, two copies that each have changes, a board that is its
own repository and a checkout with uncommitted work are never fixed: fix
says so, and `adopt` or `merge-boards` is your call. For 20 seconds after a
fix, `--undo` puts back what it changed, whether the CLI, an agent or the
desktop ran it (the fix is kept in `.brainfile/state/last-fix.json`). It
backs up the board it replaces first, and refuses if the board or the code
branch has moved on since; after that, `backups` has every copy.

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

#### archive, restore — Export completed work, or reopen it

```console
$ brainfile archive -t task-1                    # same as complete
$ brainfile archive -t task-1 --to github
$ brainfile archive --all --to linear --dry-run
$ brainfile restore -t task-1 -c in-progress -r "phase C is left"
```

`restore` reopens work completed too soon: the task comes back from `logs/`
to the column you name, its ledger record goes (completing it again writes a
new one), and its log says it was reopened, with `--reason` if you gave one.
A decision is not reopened: supersede it, or decide again. On a v1 board it
brings a task back from `brainfile-archive.md`.

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

A passing `validate` completes the task. Run from another git worktree of the
same repository (a hand-off's, with the board shared on its branch), it checks
the files and runs the commands in that worktree, where the work is, and
leaves the task open with its contract `done`: the work is on its branch, not
yet where it lands, so the task is completed when the branch lands.

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

### One board per repository

A repository should have one board, and Brainfile notices when it has two: a
`.brainfile/` folder in the checkout (plain files, or still tracked by the code
branch) beside the `brainfile` branch, or a `brainfile` branch with no history
in common with the board on the remote. `where` names both, with how many
documents each holds and when each last changed:

```console
$ brainfile where
...
Boards    Two boards: this folder (7) and origin's (19, newer).
          this folder    7 docs, last change 2026-08-12 /work/app/.brainfile
          origin's      19 docs, last change 2026-10-12 refs/brainfile/remotes/origin/board
          Origin's already has everything this folder has.
          Nothing writes until you choose: brainfile adopt refs/brainfile/remotes/origin/board
```

While two boards disagree, every write (from the CLI, an agent's MCP tools or
the desktop app) is refused with that same sentence and the command that
settles it; reading still works. `adopt` or `merge-boards` settles it (see
[adopt, merge-boards, backups](#adopt-merge-boards-backups--settle-two-boards-into-one)),
or, when one copy already has everything, `fix` (see
[fix](#fix--fix-where-the-board-lives-when-nothing-would-be-lost)).
One board ahead of or behind its own copy on the remote is not two boards,
just unsynced. A checkout of the board branch
outside `.brainfile/`, and a code branch that still tracks an old copy of
`.brainfile/`, are reported too.

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
branch, and commits the old copy's removal from the code branch (with
`.brainfile/` added to `.gitignore`). `migrate --to-plain` reverses it.
Neither touches any other file in the repository.

The branch has one home, `.brainfile/` in the main worktree. A checkout of it
anywhere else is reported by `where` and `lint`; one whose folder is gone is
forgotten when the board is next checked out, or by `lint --fix`.

## Related boards

Work often spans repositories: an app and its mobile client, a service and
its SDK. Each keeps its own board. Name the others under `related:` in
`brainfile.md`, and a task can point at theirs.

```yaml
related:
  mobile: ../hotline-mobile
  sdk: ../hotline-sdk
```

The folder is relative to the root of this repository, not to
`.brainfile/`. The map is committed with the board, so everyone who shares it
gets the same names.

`mobile:task-12` is then a task ID like any other. It works in `dependsOn`,
in `show`, and in the MCP `get_task` tool. brainfile finds that board exactly
as running `brainfile` in `../hotline-mobile` would, branch worktree
included, and only reads it.

```console
$ brainfile show -t mobile:task-12
$ brainfile list --related
```

A task that depends on `mobile:task-12` is blocked until that task is
completed there, meaning it has moved to that board's `logs/`. Until then
`contract pickup` refuses it, `list` marks it `Blocked by: mobile:task-12`,
and `show` lists each dependency with its state. Dependencies on this board
work as they always have.

`list --related` shows the open tasks on related boards that this board's
tasks depend on, with the tasks that need them. `list --related all` shows
every open task on every related board. The MCP `list_tasks` tool takes
`related: true` or `related: "all"` for the same.

To change a task on a related board, run `brainfile` in that folder, or
point the MCP tools at its board with `file`. Nothing here writes to it.

> A related folder that is not on this machine is still a valid reference.
> `show` and `list` say the board is not on this machine, and a dependency
> on it counts as not done. brainfile never clones or fetches it for you.
> `lint` warns about a name `related:` does not have, or a reference that is
> not `name:task-id`.

## The TUI

`brainfile tui` opens the board in the terminal: columns across, a detail view
for the selected document, and a filter line. It edits the same files the CLI
does, so changes made elsewhere show up on `r`.

A task an agent is working on says so on its row, `● codex · editing` (or
`asking` while it waits on an answer, `leading` on an epic whose lead is in
a turn), from the run files every runner on this machine writes
(`brainfile run`, the Brainfile window, `dispatch --now`). The row changes
as the run does, and the words go when it ends.

| Keys | Action |
| --- | --- |
| `j` `k` `↑` `↓` | Move within a column. `g` and `G` jump to the ends, `ctrl-d` and `ctrl-u` page. |
| `h` `l` `←` `→` `tab` | Move between columns. |
| `↵` | Open the selected document. In the detail view, open a child, a decision the work rests on, or a decision's chain and the work resting on it. `esc` goes back. |
| `t` | Cycle the document type shown. `L` toggles the done view. |
| `D` | The decisions view, also the type cycle's `decision` stop. `L` there unfolds the history; `D` again goes back. |
| `/` | Filter. `p:high`, `#tag` or `t:tag`, `@name`, `type:epic`, `contract:ready`, `due:overdue`. |
| `a` `n` | Add a task. `N` adds and opens it for editing. |
| `m` `c` `e` | Move, complete, edit. |
| `p` | Set priority. In the detail view, jump to the parent. |
| `space` | Collapse a group. In the detail view, toggle a subtask. |
| `d` `y` `A` | Delete, copy the ID, archive. |
| `r` `?` `q` | Reload, help, quit. |

Decisions have no column, so they are in none of the column lists, and a
retired one is not in the done view. The decisions view groups the standing
ones by family, the first segment of the claim key, with history (superseded,
rejected, stale) folded below. A row leads with `●`, `○` once retired, and
says only what needs saying: a kind other than `decision`, `proposed` for a
legacy ADR, `review` once `validUntil` has passed, or where a retired one
went (`superseded → decision-2`). A decision's detail shows its claim key,
kind, stance and subject, holds while, recheck, valid until, what it
replaces or what replaced it, and the open work resting on it. Work's detail
lists the decisions it rests on under `rests on`, and its row says
`decision changed` once one of them is superseded, rejected or stale.
Decisions change through `decide`, `supersede` and `retire`: the TUI does
not move, complete or delete one, and `e` still opens its file.

Editing opens `$EDITOR` on the task file. Set `NO_COLOR` to drop colour.

## For agents

The board is a directory of Markdown, so any agent that can read files can read
it. Three things make it a working surface rather than a reference: the MCP
server, the per-agent brief, and hooks.

### The MCP server

Add this to `.mcp.json` at the repo root (or the equivalent for your agent) and
restart the agent. Thirty-five tools appear, one for everything the CLI does
to a board, and a `discuss` prompt.

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
| `list_tasks` | List board documents, filtered by column, tag, type (aliases work) or `status`. `type: "decision"` lists decisions; `tree: true` adds the outline; `related` adds related boards' open tasks. |
| `get_task` | One document by ID, in full, with `graph`: its parent, children and the decisions it rests on. Takes `mobile:task-12` for a related board. |
| `search` | Search the board, its history and the project's docs (current first, history in its own lane, each hit with `path` and line range), list recent completions, or view one log entry. Takes `type`, `limit`, `history`. |
| `brief` | The agent's brief: `text` (budgeted by `maxChars`) and its `sections`, plus the checkpoint `lanes`. Takes `agent=`, `peek`. |
| `check` | `use`, `review`, `use_replacement` or `no_decision` for an action (`query`), a decision, a `claimKey` or a `claimKeyPrefix`, with `exitCode` as the CLI's. |
| `task_add` | Create a document. Takes `type` (aliases work), `parentId`, `dependsOn`, `decisions`, `status`, `source` (an issue's URL, refused when a task already carries it), and contract parts for `with_contract`. |
| `task_patch` | Update fields on one task or many, `parentId`, `dependsOn`, `decisions`, `landsOn` and `epicBranch` included; `null` removes a field. |
| `task_move` | Move one task or many to a column. |
| `task_complete` | Complete to the ledger, or export to GitHub or Linear. A parent with open children and a decision refuse. |
| `task_restore` | Reopen a completed task into a `column`, out of the ledger, with `reason` in its log. |
| `task_delete` | Remove a task. |
| `subtask` | `action=` add, toggle, delete or update, on one subtask, several, or all. |
| `contract` | `action=` attach, pickup, deliver, validate, graph or activate. |
| `note` | Append a line to a task's log, attributed as `brainfile note` does: `agent`, else the agent running the server, else your git `user.name`. |
| `log` | Completed work: one task's log (`task`), a search of it (`query`), or the most recent, ledger-only records included; `limit`. |
| `decide` | Record a decision in its claim family (`claimKey`, `text`, `kind`, `stance`, `subject`, `holdsWhile`, `recheck`, `validUntil`, `source`, `package`, `forWork`); the family's current decision is superseded. |
| `supersede` | Replace a decision by hand (`taskId`, `text`). |
| `retire` | Mark a decision `rejected` or `stale` (`taskId`, `as`, `note`); it moves to `logs/`. |
| `adr_promote` | Accept a legacy `type: adr` document and move it to `logs/`. |
| `columns` | `action=` list (with task counts), add (`title`, `id`, `after` or `before`, `completion`), rename (`column`, `title`), reorder (`order`) or remove (`column`, and `moveTo` when it holds tasks). |
| `board` | Read the title, agent instructions, related boards, columns and `strict`; set `title`, replace `instructions` or edit them with `addInstructions` and `removeInstructions`, and `addRelated` (`alias`, `path`) or `removeRelated`. With no changes it only reads. |
| `types` | Every type with its place in the graph; `action=add` with `name`, `like`, `idPrefix`, `completable`, `schema`. |
| `template` | `action=` list, or use (`template`, `title`, `description`, `column`). |
| `lint` | Check the board, the graph included; `fix: true` fixes what it can. Issues come back as data, with `valid` false only for errors. |
| `sync` | Fetch, merge and push a shared board now; `pull` or `push` for one direction. A plain or unshared board says so in `skipped`. |
| `where` | Where the board lives, how it is stored, the remote it is shared through, when it last synced and how many changes wait to be sent; every other copy of the board in the repository, and `conflict` when one disagrees (writes are refused until `conflict.resolve` runs). `fetch: true` asks the remote first. `fix` has the problems in the desktop's words and `plan`, what `brainfile fix` would do; `action=fix` with `expected` (the plan's `words`) runs it, `action=undo` puts back the last fix within 20 seconds. |
| `pull_request` | A task's hand-off as a GitHub pull request, as `brainfile pr`: `action=open` (default) pushes its branch and opens one into where it lands, recorded as `pullRequest`; `action=status` asks where it stands, and merged completes the task and removes its worktree. |
| `issues` | The open issues of the project's GitHub repository, each with `task` when one on the board carries its URL as `source`; `action=import` with `numbers` (and `column`) makes a task from each, and reports one already on the board with `made: false`. Credentials as `brainfile issues`. |
| `dispatch` | Queue tasks for a coding agent, as `brainfile dispatch`: `task` (one or many), or `column`, or `parent`; `agent`, `model`, `effort`, `until`. An epic named gets a lead. Says what was queued, skipped and waits, and, when no runner is up on this machine, `Run brainfile run or open Brainfile to start it.` |
| `dispatch_status` | The runners up, the live runs, the queue, the claims and the leads, as `brainfile dispatch status`. |
| `dispatch_stop` | Stop a run by its run id or task id (`run`), as `brainfile dispatch stop`; says whether it has ended yet. An epic's id stops its lead. |
| `dispatch_lead` | Pause or resume an epic's lead (`epic`, `action`), as `brainfile dispatch pause` and `resume`, whichever runner leads it. |
| `review` | A hand-off's work: `action=show` (default, `task`), `ready`, `land` (`task`, `into`) or `discard` (`task`), as `brainfile review`, `land` and `discard`. |
| `agents` | The coding agents, which are installed here, and their models, as `brainfile agents`. |
| `discuss` | One task to talk over (`taskId`): the `discuss` prompt's text, for a client without prompts. Read-only. |

Every tool takes `file` to point at another board, and every one that writes
is one board commit on a tracked board. The bundled JSON Schemas are
resources: `brainfile://schema/board` and `brainfile://schema/base`, the
files `brainfile schema` prints.

When a client connects, the server tells it how to work: use these tools for
every board change, never create, edit or delete files under `.brainfile/` by
hand, start with `brief`, leave a `note` as you go, `check` before acting on
something a decision covers; then a line on what each tool is for. Where it
offers `dispatch`, it also says to ask the person before dispatching more
than three tasks at once, and never to dispatch a task whose `dependsOn` are
open.

#### Discussing a task

Any MCP client can talk a task over with you. The server's `discuss` prompt
takes `taskId` and gives the agent what the board says about the task: its
stage, description, subtasks, contract, the decisions it rests on, its latest
notes, the board's other decisions, and its branch, worktree and the agent on
it now, if it was handed off. Then the rules a discussion keeps, the same as
in the desktop's chat (decision-19):

- It changes only this task's description, subtasks and contract, and only
  after you say yes.
- It runs `check` before recording a decision, and records one only after you
  agree to it.
- It adds a `note` saying what was agreed.
- It writes no code and hands nothing off.

The `discuss` tool returns the same text, for clients that do not support
prompts. The client keeps to the rules itself: a server cannot refuse its
own client's edits.

#### Roles

Whoever starts `brainfile mcp` for an agent says what the agent is to the
board in `BRAINFILE_AGENT_ROLE`: `chat`, `lead`, `worker` or `discuss`. The
runner does so for every agent it starts, and the desktop for its chat,
leads and discussions.

| Role | Its server |
| --- | --- |
| none (your own client) | Every tool. |
| `chat` | Every tool. |
| `lead` | Every tool, but `dispatch`, `dispatch_stop`, `dispatch_lead`, `review` and `dispatch_status` reach only the tasks under its epic, named in `BRAINFILE_LEAD_SCOPE`; its `dispatch` refuses what the lead's rules refuse ([Leads](#leads)). |
| `worker` | No `dispatch`, `dispatch_stop` or `dispatch_lead`, and `review` only shows: a hand-off never hands off (decision-15). |
| `discuss` | As a worker. |

```console title=".mcp.json"
{
  "mcpServers": {
    "brainfile": {
      "command": "npx",
      "args": ["brainfile", "mcp"],
      "env": { "BRAINFILE_AGENT_ROLE": "lead", "BRAINFILE_LEAD_SCOPE": "epic-3" }
    }
  }
}
```

This is a rule for agents, not a security boundary: anyone on the machine
can run the CLI.

Some commands have no tool, on purpose: `tui`, `run` and `mcp` (they are the
interfaces; `run` works what the dispatch tools queue), `merge-driver` (git runs it), `hooks` (events the agent host
fires, and your agent's settings), `auth` and `config` (your credentials and
user config), `init` and `migrate` (one-off, and your call) and `index` (a
cache that `search`, `brief` and `check` refresh). Choosing the remote a
board is shared through, and its autosync mode, also stays with you
(`brainfile sync --set-remote`, `--autosync`). A test holds the CLI and the
server to this: a new command fails it until it has a tool or a reason here.

### Start every session with a brief

`brainfile brief --agent <name>` is the orientation call: the decisions that
stand, the agent's tasks, what changed since it last looked, and the docs that
bear on its work, in about 1,600 characters. With the hooks installed it
arrives on its own at session start. Have the agent use the same name it
gives as `assignee`, so its tasks show up under "Your tasks".

### Decide, then check

When an agent settles something (a library, a pattern, a rule), it records it
with `decide` under a claim key, and the next session sees it in the brief.
Before an action that might cut across a settled choice, `check "<action>"`
names the decision that speaks to it and says `use` (follow it), `review`
(ask first), `use_replacement` (that one was replaced: use this) or
`no_decision`. Name the subject next to the verb ("use axios", "drop
axios") so a contradiction of the decision's stance is caught. Next steps are tasks and what happened is a note: a handoff
needs no other type.

### Hooks that keep the board honest

```console
$ brainfile hooks install claude-code
```

Installs three hooks into the agent's settings: after a file edit, a reminder
to update the task; before a prompt, a warning when files changed but the board
did not; at session start, the agent's brief. `--scope project` writes them
into the repo instead of the user's home.

### Orchestration: why a board and not subagents

For one task in one session, a subagent or a shell-out to another coding
agent is simpler, and that is fine. The board earns its place when the work
outlives a conversation:

- **It survives the session.** A hand-off is board state, committed and
  synced, so "continue epic-24" works tomorrow, from another terminal,
  harness or machine. Subagent orchestration dies with its conversation.
- **Across harnesses.** Each task picks its agent and model (Claude Code,
  Codex, Cursor, Grok, Antigravity, any ACP server) through one protocol,
  with the same brief and the same standing decisions.
- **Isolation.** Each hand-off gets its own worktree and branch, and a
  moment for review; subagents and shell-outs share one checkout.
- **Done means done.** A task lands when its contract's validation passes
  with the trunk brought in, goes back to its agent on a conflict or a
  failed check up to `maxRetries`, then waits for a person; not "the
  subagent said so".
- **The orchestrator's context stays clean.** Workers report to the board
  (notes, the ledger); the orchestrator reads status, not transcripts.
- **A record.** Who did what, which files, how long: in the ledger and the
  board's history.

In the desktop app, handing off an epic starts its lead: an agent that
writes no code, checks the plan (the children, the files each touches, the
dependencies between them), then hands the children off in order and is
woken as each ends or lands, inside rules the app holds (dependencies done
first, at most three at once per repository, retries to `maxRetries`). The
same from the command line and any MCP client is the work of epic-6.

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

### The index is a cache

`.brainfile/state/index.db` is built from the files on each machine and never
leaves it: the board branch carries the decisions and tasks, and every machine
indexes them itself. Nothing reads the index that could not be read from the
files, so deleting it costs one rebuild. It needs no native module: Node's own
`node:sqlite`, loaded only when present.

### The library underneath

The CLI is built on [@brainfile/core](https://www.npmjs.com/package/@brainfile/core),
which parses and writes the board format. Use it directly when a tool needs to
read a board without shelling out.
