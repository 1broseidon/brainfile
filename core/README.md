# @brainfile/core

TypeScript library that powers [brainfile](https://www.npmjs.com/package/brainfile): board config parsing, reading/writing task files, contracts, and board state.

Used by the [brainfile CLI](https://www.npmjs.com/package/brainfile); use it directly when building your own tooling on top of brainfile boards.

## Installation

```bash
npm install @brainfile/core
```

Node 20 or newer. `@brainfile/core/dispatch` needs Node 20.19 or newer at
runtime: it `require()`s `@agentclientprotocol/sdk`, which is ESM only, when
the first session opens.

## v2 Architecture: Files & Folders

Brainfile v2 uses a directory-based structure:
- **Board Config**: `.brainfile/brainfile.md` (columns, types, agent instructions)
- **Active Tasks**: `.brainfile/board/*.md` (individual task files)
- **Completion History**: `.brainfile/logs/ledger.jsonl` (unified log) + archived `.md` files

This library exposes low-level file operations to manage this structure efficiently.

## API Reference

### File Operations

Read and write task files directly.

```typescript
import {
  readTaskFile,
  writeTaskFile,
  readTasksDir,
  addTaskFile,
  moveTaskFile,
  completeTaskFile,
  deleteTaskFile,
  appendLog
} from "@brainfile/core";

// Read a single task
const taskDoc = readTaskFile(".brainfile/board/task-1.md");
console.log(taskDoc.task.title); // "Fix login bug"
console.log(taskDoc.body);       // Markdown content

// Read all active tasks
const tasks = readTasksDir(".brainfile/board/");

// Add a new task (auto-generates filename like task-123.md)
const newTask = addTaskFile(".brainfile/board/", {
  title: "New Feature",
  column: "todo",
  type: "task",
  priority: "high"
});

// Move a task to another column
moveTaskFile(".brainfile/board/task-1.md", "in-progress");

// Complete a task (appends to ledger.jsonl, archives file to logs/)
completeTaskFile(".brainfile/board/task-1.md", ".brainfile/logs/");

// Append a log entry to the task file
appendLog(".brainfile/board/task-1.md", "Deployed to staging", "codex");
```

### Board Configuration

Parse the `brainfile.md` configuration file to understand columns, types, and agent instructions.

```typescript
import { Brainfile, readV2BoardConfig } from "@brainfile/core";

// Parse config from string
const configContent = await fs.readFile(".brainfile/brainfile.md", "utf-8");
const parseResult = Brainfile.parseWithErrors(configContent);

if (parseResult.error) {
  console.error("Config error:", parseResult.error);
} else {
  const config = parseResult.board; // BoardConfig object
  console.log("Columns:", config.columns.map(c => c.title));
}

// Or read directly from the v2 brainfile.md path
const board = readV2BoardConfig(".brainfile/brainfile.md");
```

Edit the config: columns, the title, agent instructions and related boards.
The pure forms (`addColumn`, `renameColumn`, `reorderColumns`,
`removeColumn`, `updateBoardSettings`) take a `BoardConfig` and return a new
one, and are in `@brainfile/core/browser` too; the `*File` forms read and
write `brainfile.md`.

```typescript
import { addColumnFile, removeColumnFile, updateBoardSettingsFile } from "@brainfile/core";

addColumnFile(".brainfile/brainfile.md", { title: "In Review", after: "in-progress" });
// A column that holds tasks is refused unless they have somewhere to go.
removeColumnFile(".brainfile/brainfile.md", "in-review", { moveTo: "in-progress" });
updateBoardSettingsFile(".brainfile/brainfile.md", {
  addInstructions: ["Write tests"],
  addRelated: { mobile: "../mobile" },
});
```

### Type Validation

Validate tasks against the defined strict types (e.g., ensuring an "Epic" is in a valid column).

```typescript
import { getBoardTypes, validateType, validateColumn } from "@brainfile/core";

// Get available types from config
const types = getBoardTypes(boardConfig);

// Validate a task's type
const typeError = validateType(boardConfig, "epic");
if (typeError) console.error(typeError);

// Validate if a column allows a specific type
const colError = validateColumn(boardConfig, "todo", "task");
```

### Document types and the graph

Five types are built in (epic, spec, plan, task, decision; `issue` and `adr`
are aliases), each with a role, a glyph and the parents it fits under. A
board's `types:` adds types (optionally `like:` a built-in) and overrides
built-ins. The registry and the graph are pure, so they are also exported from
`@brainfile/core/browser`.

```typescript
import {
  DOC_TYPES,           // { epic: { glyph: '▸', parents: [], children: ['spec','plan','task'], … }, … }
  TYPE_ALIASES,        // { issue: 'task', adr: 'decision' }
  resolveDocType,      // resolveDocType('bug', board.types) → { name, role, glyph, parents, children, idPrefix, completable, … }
  listDocTypes,        // every type a board has, built-ins first
  parentFit,           // parentFit('spec', 'plan') → { fits: false, reason: 'a spec goes under an epic, not under a plan' }
  buildDocGraph,       // the graph of documents you already read
  readBoardGraph,      // …or read board/ and logs/ from disk (Node only)
} from "@brainfile/core";

const { graph } = readBoardGraph(".brainfile/brainfile.md");
graph.tree();                            // the containment outline of open work
graph.restingOn("decision-3");           // work whose decisions: names it (computed)
graph.openWorkOnSupersededDecisions();   // what should say "rests on a superseded decision"
```

### Decisions, the local index, the brief and check

A decision belongs to a claim family (`claimKey`); a family has one current
decision. The pure parts (families, the stance rule, verdicts) are in the
main entry and `@brainfile/core/browser`; writing decisions is in the main
entry. The local index (SQLite FTS5 through Node's own `node:sqlite`, loaded
lazily; `null` where it is missing) and what reads it live in the Node-only
`@brainfile/core/memory`.

```typescript
import { decideFile, groupDecisionsByPrefix, getV2Dirs, readTasksDir } from "@brainfile/core";
import { searchMemory, composeBrief, checkDecision } from "@brainfile/core/memory";

const dirs = getV2Dirs(".brainfile/brainfile.md");
decideFile(dirs, { claimKey: "dependency.http-client", text: "Use undici", stance: "forbids", subject: "axios" });
// → the family's current decision superseded and moved to logs/

const tasks = [...readTasksDir(dirs.boardDir), ...readTasksDir(dirs.logsDir)].map((d) => d.task);
groupDecisionsByPrefix(tasks);           // [{ prefix: 'dependency', families: [{ key, current, history }] }]

searchMemory(dirs.brainfilePath, "http client");   // { mode: 'index' | 'scan', current, history, results }
composeBrief(dirs, "claude", { lastBriefAt: null }).text;   // the session-start block
checkDecision(dirs.brainfilePath, { query: "add axios" });  // { result: { verdict: 'review', … } }
```

### Dispatch: ACP agents, the Runner, leads and Discuss

Starting the person's own coding agents over the Agent Client Protocol is in
the Node-only `@brainfile/core/dispatch` (decision-18), which depends on
`@agentclientprotocol/sdk` and loads it when a session opens: the agents
Brainfile knows and how each starts, custom agents (`agentServers` in Zed's
shape) and the ACP registry, dispatch.json and models.json in the data folder
(`BRAINFILE_DATA_DIR`, else the platform's, the same one the desktop uses),
sessions and their turns, permissions as policy, and a hand-off's brief.

```typescript
import { dataDir, listAgents, open, turn, brief, type SessionContext } from "@brainfile/core/dispatch";

const ctx: SessionContext = {
  dataDir: dataDir(),
  sessions: new Map(),
  update: (run, patch) => Object.assign(run, patch),
  ask: async (ask) => ask.options.find((o) => o.kind === "allow_once")?.optionId ?? null,
};
listAgents(ctx.dataDir);                 // [{ id: 'claude', name: 'Claude Code', available: true, note: 'your login' }, …]
const session = await open(ctx, "/path/to/repo", "claude", "run-1");
await turn(ctx, session, run, brief("/path/to/repo", "task-12"));   // run.state, run.reply, run.steps
```

What runs the sessions is the `Runner`, the one `brainfile run`, `brainfile
dispatch --now`, the MCP tools and the desktop all use (decision-17), so a
hand-off is the same wherever it was asked for. It queues a hand-off
(`queue`: `dispatch:` on the task), claims the task by compare-and-swap so
two runners never start one, starts the agent in its worktree (`start`,
`dispatch`), keeps its run file beating under `.brainfile/state/runs/`,
answers asks (its own through `ask`, another runner's through `answerAsk` and
the answer file), stops a run (`stop`, through the stop file when another
runner has it), works the board's queue up to `dispatch.maxRunning` (`work`,
`workLed`, `queued`, `settled`), lands (`land`, sending a conflict or a
failed check back to the agent up to the contract's `maxRetries`, then
parking the task in Review), and lets go on exit (`letGo`, `quit`). `others`
lists the runs of every other runner on the machine, lost ones included.
`Leads` runs an epic's lead beside it (`lead`, `pauseLead`, `resumeLead`,
`stopLead`), and `guard`, `planReport`, `readTree` and `leadRefusal` hold
the rules a lead cannot bend. `agentRoleOf(env)` reads an agent's role and
scope from `BRAINFILE_AGENT_ROLE` and `BRAINFILE_LEAD_SCOPE`, as `brainfile
mcp` does.

```typescript
import { Runner, dataDir, fileBoard } from "@brainfile/core/dispatch";

const runner = new Runner({
  dataDir: dataDir(),
  runner: "cli",                          // what its claims and run files say: desktop, cli or mcp
  board: fileBoard(),                     // its board writes, each one commit on a tracked board
  leads: true,                            // take up epics' leads queued on the board
  ask: async (ask) => ask.options.find((o) => o.kind === "allow_once")?.optionId ?? null,
});
await runner.queue("/path/to/repo", ["task-12"], { agent: "codex", by: "cli", until: "review" });
await runner.work("/path/to/repo");       // claims what it can and starts it, up to dispatch.maxRunning
await runner.letGo();                     // stop its agents, give their tasks back to the queue
```

Discuss's context and rules are here too, so a discussion is the same in the
desktop's chat, in `brainfile discuss` and in an MCP client given the
`discuss` prompt (decision-19): `discussContext`, `taskInformation`,
`discussWork` (the review from git and the live run from a Runner),
`discussRules` and `discussSession` (the text for a session outside the
window), `discussPermission`, `chatPermission` and `discussMode`.

### Repositories: worktrees, landing, run files and claims

The Node-only `@brainfile/core/repo` is the board's git: where a board lives
and how it is stored, sync and the merge driver, related boards, settling two
boards into one, and, since the desktop's hand-offs moved into core, what a
hand-off does to the repository, so the CLI, headless runners and the desktop
land the same way.

- **Worktrees and landing**: `prepareWorktree` checks a task out on
  `dispatch/<task-id>` under `~/.brainfile-worktrees/`, forked from the
  branch it lands on; `reviewOf` is its branch, commits, files, uncommitted
  work and the files that would conflict; `readyToMerge` and `whyNotMerge`
  say what can land; `landReview` runs the checks with the target brought in
  and merges by compare-and-swap; `sendBackNote` is the note a conflict or a
  failed check leaves; `discardReview` removes the worktree and branch.
  Landings run one at a time per repository across processes under
  `.brainfile/state/landing.lock` (`takeLandingLock`, `readLandingLock`);
  one whose holder has ended is taken over.
- **Where a task lands**: `handOffTarget` and `prepareTarget` read `landsOn`
  up the tree (`{}` is the trunk) and make an epic's own branch when
  `epicBranch: true` and it is not there yet; `prepareEpicBranch` is what a
  lead calls as it starts; `bringIn` and `refreshTarget` bring the target
  into the epic's branch before a hand-off; `lintLandsOn` is `lint`'s check
  that the branch exists.
- **Run and runner files**: `writeRunFile`, `readRunFile`, `listRunFiles`,
  `beatRun` and `pruneRunFiles` for `state/runs/<run-id>.json`;
  `writeRunAnswer`, `readRunAnswer` and `removeRunAnswer` for an ask answered
  from another process; `writeRunStop` and `readRunStop` for a stop asked of
  another runner; `writeRunnerFile`, `listRunners`, `liveRunners` and
  `beatRunner` for `state/runners/<host>-<pid>.json`; `isRunLost`,
  `isRunnerLost` and `isClaimLost` from the heartbeats.
- **Claims**: `takeClaim` takes the runner's claim on a task's `dispatch:`
  record by compare-and-swap on the task file, under
  `state/locks/<file>.lock`; `giveBackClaim` releases it with its outcome;
  `parkInReview` moves a task that has used its retries; `markLead` writes a
  lead's claim.
- **Origin**: `unpushed` says how far a branch is ahead of origin's copy
  (`main is 3 commits ahead of origin`); `carriedUnpushed` is why a pull
  request is refused when its base has landings origin lacks; `followOrigin`
  brings the local base up to origin's once a pull request has merged, when
  nothing would be lost.
- **Fix**: `boardProblems` and `planFix` say what is wrong with where the
  board lives and what would fix it without losing anything; `applyFix` does
  it, every copy backed up first; `undoFix` and `lastFix` put it back within
  `FIX_UNDO_MS` from `state/last-fix.json`, whichever process ran the fix.

### Issues and forges

A task made from an issue keeps the issue's URL as `source:`; an issue is on
the board when any task, open or completed, carries it. The pure parts are in
the main entry and `@brainfile/core/browser`. Which forge a project's origin
points at, and GitHub's open issues, are in the Node-only
`@brainfile/core/forge`, with fetch and the saved token passed in;
credentials are looked for in one order: `gh auth token`, then `GH_TOKEN` or
`GITHUB_TOKEN`, then the saved token.

```typescript
import { addTaskFile, getV2Dirs, issueTask, linkedTask, readTasksDir, sourcesOf } from "@brainfile/core";
import { detectForge, ghCliToken, GitHub } from "@brainfile/core/forge";

const repo = await detectForge(".");                  // { forge: 'github', owner, name, url } or null
const github = new GitHub({ fetch, ghToken: ghCliToken, env: process.env, store: { read: () => null, write: () => {} } });
const listed = await github.listIssues(repo!);       // { ok, value: { issues, auth, rateRemaining, truncated } }

const dirs = getV2Dirs(".brainfile/brainfile.md");
const sources = sourcesOf([...readTasksDir(dirs.boardDir), ...readTasksDir(dirs.logsDir)]);
for (const issue of listed.ok ? listed.value.issues : []) {
  if (!linkedTask(issue, sources)) addTaskFile(dirs.boardDir, issueTask(issue, "todo"), "", dirs.logsDir);
}
```

### Utilities

Helper functions for common tasks.

```typescript
import {
  generateNextFileTaskId,
  taskFileName,
  findBrainfile,
  extractTaskIdNumber
} from "@brainfile/core";

// Auto-detect project root
const brainfileDir = findBrainfile(process.cwd());

// Generate next ID (scans board and logs)
const nextId = generateNextFileTaskId(".brainfile/board", ".brainfile/logs");
// Returns "task-124" if 123 is the highest

// Get standard filename
const filename = taskFileName("task-123"); // "task-123.md"
```

## Types

Key interfaces exported by the package:

```typescript
import type {
  Task,
  Board,
  BoardConfig,
  TypeEntry,
  TypesConfig,
  Contract,
  TaskDocument
} from "@brainfile/core";

// The shape of a task in frontmatter
interface Task {
  id: string;
  title: string;
  type: string;        // e.g., "task", "epic", "decision"
  column: string;      // Column ID
  status?: string;     // Read-only status derived from column
  assignee?: string;
  contract?: Contract; // Agent contract
  // ... other fields
}

// v1 board with embedded tasks
interface Board {
  columns: Column[];
  archive?: Task[];
  // ... inherits BrainfileBase fields (title, agent, etc.)
}

// v2 board config (columns + types, no embedded tasks)
interface BoardConfig {
  columns: ColumnConfig[];
  strict?: boolean;
  types?: TypesConfig;
  // ... inherits BrainfileBase fields (title, agent, etc.)
}

// Per-type configuration (used in strict mode)
interface TypeEntry {
  idPrefix: string;
  completable?: boolean;
  schema?: string;
}

// Map of type name -> type configuration
interface TypesConfig {
  [typeName: string]: TypeEntry;
}

// The parsed file content
interface TaskDocument {
  task: Task;
  body: string;      // Markdown description + logs
  filePath: string;
}

// Agent Contract
interface Contract {
  status: "ready" | "in_progress" | "delivered" | "done" | "failed";
  deliverables: Deliverable[];
  validation?: {
    commands: string[];
  };
}
```

## Contributing

This package is part of the [brainfile](https://github.com/1broseidon/brainfile) monorepo.
Please see the root [CONTRIBUTING.md](../../CONTRIBUTING.md) for development guidelines.

## License

MIT
