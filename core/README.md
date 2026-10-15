# @brainfile/core

TypeScript library that powers [brainfile](https://www.npmjs.com/package/brainfile): board config parsing, reading/writing task files, contracts, and board state.

Used by the [brainfile CLI](https://www.npmjs.com/package/brainfile); use it directly when building your own tooling on top of brainfile boards.

## Installation

```bash
npm install @brainfile/core
```

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

### Dispatch: ACP agents

Starting the person's own coding agents over the Agent Client Protocol is in
the Node-only `@brainfile/core/dispatch`, which depends on
`@agentclientprotocol/sdk` and loads it when a session opens: the agents
Brainfile knows and how each starts, custom agents (`agentServers` in Zed's
shape) and the ACP registry, dispatch.json and models.json in the data folder
(`BRAINFILE_DATA_DIR`, else the platform's, the same one the desktop uses),
sessions and their turns, permissions as policy, and a hand-off's brief. What
runs the sessions keeps the runs and answers the asks.

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
  type: string;        // e.g., "task", "epic", "adr"
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
