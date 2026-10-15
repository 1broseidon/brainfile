/**
 * Output schemas for the consolidated MCP tools.
 *
 * Each tool declares one of these as `outputSchema`, and every non-error
 * success path returns the matching object as `structuredContent` alongside
 * the `content` text block it already emitted. The text block is never
 * removed, so clients that read only `content` are unaffected.
 *
 * Three SDK behaviours (v2.0.0) shape everything here — all verified against
 * the installed `@modelcontextprotocol/server` runtime:
 *
 * 1. Declaring `outputSchema` makes `structuredContent` MANDATORY on every
 *    result that is not `isError: true`. `McpServer.validateToolOutput`
 *    throws `Output validation error: … no structured content was provided`
 *    otherwise. Adding a schema to a tool therefore means auditing *every*
 *    success `return` in that tool, not just the main one.
 *
 * 2. Output validation is SKIPPED when `isError: true`, so error paths need
 *    neither `structuredContent` nor schema conformance. Error returns are
 *    left exactly as they were.
 *
 * 3. Root shape decides whether the two protocol eras agree. The 2025-era
 *    wire codec re-wraps `structuredContent` as `{result: …}` whenever the
 *    ADVERTISED schema root is not `type: "object"`, while the 2026-era codec
 *    is identity — so a non-object root would hand the two eras different
 *    bytes. Unions are still safe: the SDK's `standardSchemaToJsonSchema`
 *    injects `type: "object"` for any `oneOf`/`anyOf` whose members are all
 *    object-shaped (`isProvablyObjectShapedRoot`). Every union below is a
 *    union of objects for exactly that reason — adding a non-object member
 *    (a bare `z.string()`, say) would silently split the eras apart.
 *
 * Enum-ish fields that originate in hand-editable YAML (notably `priority`)
 * are typed `z.string()` rather than `z.enum([...])`. A board carrying
 * `priority: urgent` would otherwise fail output validation and turn a
 * working call into an error result.
 */
import { z } from 'zod';

// ── shared fragments ───────────────────────────────────────────────────────

/** A task as projected into list/search results (never the raw task file). */
const taskSummaryShape = {
  id: z.string(),
  title: z.string(),
  priority: z.string().optional(),
  tags: z.array(z.string()).optional(),
  assignee: z.string().optional(),
};

// `column` is the column *id* (same as `get_task`), so a subsequent `task_move`
// can pass the value back without resolving titles.

const subtaskSchema = z.looseObject({
  id: z.string(),
  title: z.string(),
  completed: z.boolean().optional(),
});

// ── list_tasks ─────────────────────────────────────────────────────────────

/**
 * `related: true | "all"` (spec-10): open tasks on the boards named under
 * `related:`. `status` is `found`, `missing` (not on this machine) or
 * `no-board`; `note` says the same for people.
 */
const relatedListingSchema = z.object({
  alias: z.string(),
  path: z.string(),
  status: z.string(),
  note: z.string(),
  title: z.string().optional(),
  tasks: z.array(z.object({
    ...taskSummaryShape,
    ref: z.string(),
    column: z.string(),
    neededBy: z.array(z.string()).optional(),
  })),
  notFound: z.array(z.string()),
  neededBy: z.record(z.string(), z.array(z.string())),
});

/**
 * `tree: true` (spec-12): open work as an outline, flattened in reading order.
 * Flat rather than recursive so both protocol eras advertise a plain object
 * schema; `depth`, `parentId` and `children` carry the nesting.
 */
const outlineEntrySchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.string(),
  column: z.string(),
  depth: z.number(),
  parentId: z.string().optional(),
  children: z.array(z.string()),
  offPattern: z.boolean().optional(),
  detachedFrom: z.string().optional(),
});

export const listTasksOutputSchema = z.object({
  tasks: z.array(z.object({
    ...taskSummaryShape,
    column: z.string(),
    type: z.string().optional(),
    parentId: z.string().optional(),
    /** For a decision: current, superseded, rejected, stale or proposed. */
    status: z.string().optional(),
  })),
  count: z.number(),
  tree: z.array(outlineEntrySchema).optional(),
  related: z.array(relatedListingSchema).optional(),
});

// ── get_task ───────────────────────────────────────────────────────────────

/**
 * `get_task` spreads the raw `Task`, whose TypeScript type carries an open
 * `[key: string]: unknown` index signature so extension fields (`x-otto`,
 * `x-cursor`, …) round-trip. Modelled with `z.looseObject` so the advertised
 * JSON Schema says `additionalProperties: {}` instead of `false` — a closed
 * object would advertise those extension fields as illegal.
 *
 * `id` and `title` are required because `parseTaskContent` returns null for
 * any task file missing either, so a task that reached this point has both.
 * `column` is always set by the handler.
 */
export const getTaskOutputSchema = z.looseObject({
  id: z.string(),
  title: z.string(),
  column: z.string(),
  type: z.string().optional(),
  description: z.string().optional(),
  parentId: z.string().optional(),
  dependsOn: z.array(z.string()).optional(),
  blockedBy: z.array(z.string()).optional(),
  relatedFiles: z.array(z.string()).optional(),
  assignee: z.string().optional(),
  tags: z.array(z.string()).optional(),
  priority: z.string().optional(),
  dueDate: z.string().optional(),
  subtasks: z.array(subtaskSchema).optional(),
  contract: z.looseObject({}).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  completedAt: z.string().optional(),
  position: z.number().optional(),
  archived: z.boolean().optional(),
  /** Set when the task was read from a related board (`alias:id`). */
  board: z.string().optional(),
  ref: z.string().optional(),
  /** `dependsOn`, resolved: `open`, `completed`, `not-found`, `missing`, `no-board`, … */
  dependencies: z.array(z.object({ ref: z.string(), state: z.string(), done: z.boolean() })).optional(),
  /** True while a dependency on a related board is not completed. */
  blocked: z.boolean().optional(),
  /**
   * Its place in the graph (spec-12): canonical type and role, parent (with
   * offPattern when it does not fit), children, the decisions it rests on,
   * restsOnSuperseded, and for a decision the work resting on it.
   */
  graph: z.looseObject({
    id: z.string(),
    type: z.string(),
    role: z.string(),
    glyph: z.string(),
    restsOnSuperseded: z.array(z.string()),
  }).optional(),
});

// ── search ─────────────────────────────────────────────────────────────────

/** `task:` — a single task/log entry rendered with its description and log. */
const searchTaskViewSchema = z.object({
  id: z.string(),
  title: z.string(),
  completedAt: z.string().optional(),
  isLog: z.boolean(),
  description: z.string().optional(),
  log: z.string().optional(),
});

/** `recent: true` — the most recently completed tasks. */
const searchRecentSchema = z.object({
  logs: z.array(z.object({
    id: z.string(),
    title: z.string(),
    completedAt: z.string().optional(),
  })),
  count: z.number(),
});

/**
 * `query:` — ranked matches. With the local index (spec-11) they span board
 * and logs documents, the ledger, plans/ and the project's own docs; without
 * it, board and logs. Current results come first, history (completed work,
 * superseded decisions) after, each hit with its `lane`, `path` and line
 * range. A file's `id` is `path:start-end`.
 */
const searchResultsSchema = z.object({
  results: z.array(z.object({
    ...taskSummaryShape,
    column: z.string().optional(),
    score: z.number(),
    isLog: z.boolean().optional(),
    lane: z.enum(['current', 'history']).optional(),
    source: z.string().optional(),
    path: z.string().optional(),
    startLine: z.number().optional(),
    endLine: z.number().optional(),
    snippet: z.string().optional(),
    type: z.string().optional(),
    status: z.string().optional(),
    claimKey: z.string().optional(),
    completedAt: z.string().optional(),
  })),
  count: z.number(),
  /** `index` when the local index answered, `scan` for the fallback. */
  mode: z.enum(['index', 'scan']).optional(),
});

/**
 * Three genuinely different payloads selected by which input was supplied.
 * The variants' required-field sets don't overlap (`isLog` scalar vs `logs`
 * array vs `results` array), so an untagged union discriminates structurally
 * and no payload had to change to add a tag.
 */
export const searchOutputSchema = z.union([
  searchTaskViewSchema,
  searchRecentSchema,
  searchResultsSchema,
]);

// ── task_add ───────────────────────────────────────────────────────────────

/** New payload: `task_add` previously returned only a prose confirmation. */
export const taskAddOutputSchema = z.object({
  id: z.string(),
  title: z.string(),
  /** The canonical type written (absent for a plain task): `adr` comes back as `decision`. */
  type: z.string().optional(),
  /** Off-pattern links on a board that is not strict, and IDs not on the board (spec-12). */
  warnings: z.array(z.string()).optional(),
});

// ── task_move / task_patch ─────────────────────────────────────────────────

/**
 * Both tools branch their TEXT on single-vs-batch, but the structured payload
 * is always the batch shape (a one-element `results` array for a single move),
 * so agents parse one shape regardless of how many IDs they passed.
 */
export const taskMoveOutputSchema = z.object({
  success: z.boolean(),
  successCount: z.number(),
  failureCount: z.number(),
  results: z.array(z.object({
    taskId: z.string(),
    success: z.boolean(),
    message: z.string().optional(),
    warning: z.string().optional(),
    error: z.string().optional(),
  })),
});

export const taskPatchOutputSchema = z.object({
  success: z.boolean(),
  successCount: z.number(),
  failureCount: z.number(),
  results: z.array(z.object({
    taskId: z.string(),
    success: z.boolean(),
    error: z.string().optional(),
    /** Off-pattern links on a board that is not strict, and IDs not on the board (spec-12). */
    warnings: z.array(z.string()).optional(),
  })),
});

// ── task_delete ────────────────────────────────────────────────────────────

/** New payload: `task_delete` previously returned only a prose confirmation. */
export const taskDeleteOutputSchema = z.object({
  id: z.string(),
  deleted: z.literal(true),
});

export const taskRestoreOutputSchema = z.object({
  id: z.string(),
  column: z.string(),
});

// ── subtask ────────────────────────────────────────────────────────────────

/**
 * `toggle` and `update` both key their payload `updated` but carry different
 * item shapes (`{id, completed}` vs `{id, title}`), which is ambiguous without
 * a tag. The tool's own `action` input is echoed into the output to
 * discriminate — an added field, nothing renamed.
 *
 * The singular paths (which used to emit prose only) now emit the same plural
 * array shape, so item count never changes the structure.
 */
export const subtaskOutputSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('add'),
    added: z.array(z.object({ id: z.string(), title: z.string() })),
    count: z.number(),
  }),
  z.object({
    action: z.literal('delete'),
    deleted: z.array(z.string()),
    missing: z.array(z.string()),
    count: z.number(),
  }),
  z.object({
    action: z.literal('toggle'),
    updated: z.array(z.object({ id: z.string(), completed: z.boolean().optional() })),
    count: z.number(),
  }),
  z.object({
    action: z.literal('update'),
    updated: z.array(z.object({ id: z.string(), title: z.string() })),
    count: z.number(),
  }),
]);

// ── contract ───────────────────────────────────────────────────────────────

const deliverableSchema = z.looseObject({
  // Hand-edited YAML often omits `type` (path-only deliverables). Required here
  // would fail output validation on a successful validate after the task was
  // already completed.
  type: z.string().optional(),
  path: z.string(),
  description: z.string().optional(),
});

/**
 * Six heterogeneous actions, tagged by the `action` input the caller already
 * supplied. `pickup`'s payload is genuinely free-text agent-context markdown,
 * so its variant is deliberately thin — an output schema does not have to
 * invent structure that the payload does not have.
 */
export const contractOutputSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('attach'),
    task: z.string(),
    status: z.string(),
  }),
  z.object({
    action: z.literal('pickup'),
    task: z.string(),
    markdown: z.string(),
  }),
  z.object({
    action: z.literal('deliver'),
    task: z.string(),
  }),
  z.object({
    action: z.literal('validate'),
    ok: z.boolean(),
    status: z.string(),
    checkedIn: z.string().optional().describe('The worktree the work was checked in, when not the board\'s checkout; the task stays open until its branch lands'),
    deliverables: z.array(z.looseObject({
      deliverable: deliverableSchema,
      ok: z.boolean(),
      resolvedPath: z.string().optional(),
      error: z.string().optional(),
    })),
    commands: z.array(z.looseObject({
      command: z.string(),
      exitCode: z.number(),
      stdout: z.string(),
      stderr: z.string(),
    })),
    warnings: z.array(z.looseObject({
      command: z.string(),
      message: z.string(),
    })),
  }),
  z.object({
    action: z.literal('graph'),
    attached: z.array(z.string()),
    count: z.number(),
    order: z.array(z.string()),
    graph: z.string(),
  }),
  z.object({
    action: z.literal('activate'),
    activated: z.array(z.string()),
    count: z.number(),
  }),
]);

// ── task_complete ──────────────────────────────────────────────────────────

/**
 * New payload: every success path previously returned prose only, with the
 * interesting values (`completedAt`, issue number/id, issue URL) interpolated
 * into the message. They are now also returned as real fields.
 *
 * Tagged by the `destination` input. The default path (no `destination`) and
 * `destination: 'local'` share the `local` variant and are told apart by
 * `archived`.
 */
export const taskCompleteOutputSchema = z.discriminatedUnion('destination', [
  z.object({
    destination: z.literal('local'),
    taskId: z.string(),
    completedAt: z.string().optional(),
    archived: z.boolean(),
  }),
  z.object({
    destination: z.literal('github'),
    taskId: z.string(),
    issueNumber: z.number().optional(),
    issueUrl: z.string().optional(),
  }),
  z.object({
    destination: z.literal('linear'),
    taskId: z.string(),
    issueId: z.string().optional(),
    issueUrl: z.string().optional(),
  }),
]);

/**
 * `brief` — per-agent attention digest.
 *
 * Object root (not a bare array of lanes) so both protocol eras hand clients
 * identical bytes, per note 3 above. `lastBriefAt` is nullable rather than
 * optional: "this agent has never briefed" is a meaningful state a client must
 * be able to distinguish from an omitted field.
 */
const briefLaneSchema = z.object({
  id: z.string(),
  label: z.string(),
  items: z.array(z.object({
    taskId: z.string().optional(),
    text: z.string(),
    why: z.string(),
    at: z.string().optional(),
  })),
});

export const briefOutputSchema = z.object({
  agent: z.string(),
  mode: z.enum(['full', 'delta']),
  generatedAt: z.string(),
  lastBriefAt: z.string().nullable(),
  peek: z.boolean(),
  /** The checkpoint lanes (orientation/assigned/notes/completions, or the delta). */
  lanes: z.array(briefLaneSchema),
  /** spec-11: the session block's lanes (warnings, decisions, tasks, changes, docs). */
  sections: z.array(briefLaneSchema).optional(),
  /** spec-11: the block itself, within maxChars. */
  text: z.string().optional(),
  maxChars: z.number().optional(),
  truncated: z.boolean().optional(),
});

// ── decide / supersede / check (spec-11) ───────────────────────────────────

/** A decision as plain data. Loose: decisions carry hand-editable fields. */
const decisionSummarySchema = z.looseObject({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  claimKey: z.string().optional(),
  kind: z.string().optional(),
  stance: z.string().optional(),
  subject: z.string().optional(),
  supersedes: z.array(z.string()),
  supersededBy: z.string().optional(),
});

export const decideOutputSchema = z.object({
  decision: decisionSummarySchema,
  /** True when the family's current decision already said this; nothing was written. */
  duplicate: z.boolean(),
  /** IDs this decision superseded (now in logs/). */
  superseded: z.array(z.string()),
  familyWasEmpty: z.boolean(),
  /** Other claim families that may say the same thing (only when the family was empty). */
  related: z.array(z.object({
    id: z.string(),
    claimKey: z.string(),
    title: z.string(),
    reason: z.string(),
    coverage: z.number().optional(),
  })),
  linked: z.array(z.string()),
  notFound: z.array(z.string()),
});

const checkResultSchema = z.object({
  query: z.string().optional(),
  claimKey: z.string().optional(),
  verdict: z.enum(['use', 'review', 'use_replacement', 'no_decision']),
  recommendation: z.string(),
  reason: z.string(),
  predicateStatus: z.string(),
  predicates: z.array(z.looseObject({ kind: z.string(), status: z.string(), reason: z.string() })),
  recheck: z.string().optional(),
  advisory: z.string().optional(),
  stance: z.string().optional(),
  subject: z.string().optional(),
  requestedAction: z.string().optional(),
  matched: decisionSummarySchema.optional(),
  current: decisionSummarySchema.optional(),
  replacement: decisionSummarySchema.optional(),
  family: z.array(decisionSummarySchema),
});

/** One family's verdict, or (with claimKeyPrefix) every family's and the worst. */
export const checkOutputSchema = z.union([
  checkResultSchema.extend({ matchedBy: z.string(), exitCode: z.number() }),
  z.object({
    claimKeyPrefix: z.string(),
    verdict: z.enum(['use', 'review', 'use_replacement', 'no_decision']),
    recommendation: z.string(),
    reason: z.string(),
    decidingClaimKey: z.string().optional(),
    familyCount: z.number(),
    families: z.array(checkResultSchema),
    exitCode: z.number(),
  }),
]);

// ── spec-13: the rest of the CLI ───────────────────────────────────────────

/** `note`: the line appended to a task's log. */
export const noteOutputSchema = z.object({
  taskId: z.string(),
  /** `- <timestamp>: [<who>] <message>`, as written. */
  entry: z.string(),
  agent: z.string().optional(),
  /** True when the task is completed (its file is in logs/). */
  isLog: z.boolean(),
});

/** `log`: one task's log, a search of completed work, or the most recent. */
export const logOutputSchema = z.object({
  mode: z.enum(['task', 'search', 'recent']),
  task: z.object({
    id: z.string(),
    title: z.string(),
    completedAt: z.string().optional(),
    isLog: z.boolean(),
    description: z.string().optional(),
    log: z.string().optional(),
  }).optional(),
  query: z.string().optional(),
  entries: z.array(z.object({
    id: z.string(),
    title: z.string(),
    completedAt: z.string().optional(),
    /** search: where it matched (the title, the log line, or the description). */
    match: z.string().optional(),
    /** recent: only in ledger.jsonl, with no file in logs/. */
    ledgerOnly: z.boolean().optional(),
  })).optional(),
  /** search and recent: how many there are in all (entries may be fewer, see limit). */
  count: z.number().optional(),
});

/** A column as the board config writes it. Loose: columns may carry extension keys. */
const columnConfigSchema = z.looseObject({
  id: z.string(),
  title: z.string(),
  completionColumn: z.boolean().optional(),
  order: z.number().optional(),
});

const columnSummarySchema = columnConfigSchema.extend({ taskCount: z.number() });

/** `columns`: the columns after the action, in order, with task counts. */
export const columnsOutputSchema = z.object({
  action: z.enum(['list', 'add', 'rename', 'reorder', 'remove']),
  columns: z.array(columnSummarySchema),
  /** add, rename, remove: the column. */
  column: columnConfigSchema.optional(),
  /** remove: the tasks moved out first, and where to. */
  moved: z.array(z.string()).optional(),
  movedTo: columnConfigSchema.optional(),
});

/** `board`: the board's own settings, after any change. */
export const boardOutputSchema = z.object({
  title: z.string(),
  /** agent.instructions: what every agent reads on its first brief. */
  instructions: z.array(z.string()),
  /** related: boards in other repos, by short name; reference their tasks as alias:task-id. */
  related: z.array(z.object({ alias: z.string(), path: z.string() })),
  columns: z.array(columnSummarySchema),
  strict: z.boolean(),
  /** Which settings this call changed: title, instructions, related. */
  changed: z.array(z.string()),
});

const typeEntrySchema = z.looseObject({
  idPrefix: z.string(),
  completable: z.boolean().optional(),
  schema: z.string().optional(),
  like: z.string().optional(),
});

/** `types`: every type and its place in the graph (spec-12). */
export const typesOutputSchema = z.object({
  action: z.enum(['list', 'add']),
  strict: z.boolean(),
  /** The board's own types: entries, as written. */
  types: z.record(z.string(), typeEntrySchema),
  graph: z.array(z.looseObject({
    name: z.string(),
    role: z.string(),
    builtIn: z.boolean(),
    configured: z.boolean(),
    like: z.string().optional(),
    idPrefix: z.string(),
    completable: z.boolean(),
    glyph: z.string(),
    parents: z.array(z.string()),
    children: z.array(z.string()),
    work: z.boolean(),
    aliases: z.array(z.string()),
    summary: z.string(),
    schema: z.string().optional(),
  })),
  /** Entries under an alias name (adr, issue), which configure nothing. */
  aliasEntries: z.array(z.string()),
  /** add: the type saved. */
  added: z.object({ name: z.string(), entry: typeEntrySchema }).optional(),
});

/** `template`: the templates, or the task made from one. */
export const templateOutputSchema = z.object({
  action: z.enum(['list', 'use']),
  templates: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    priority: z.string().optional(),
    tags: z.array(z.string()).optional(),
    subtasks: z.array(z.string()),
  })).optional(),
  task: z.object({
    id: z.string(),
    title: z.string(),
    template: z.string(),
    column: z.string(),
  }).optional(),
});

const lintIssueSchema = z.object({
  type: z.enum(['error', 'warning']),
  message: z.string(),
  line: z.number().optional(),
  column: z.number().optional(),
  fixable: z.boolean().optional(),
  code: z.string().optional(),
});

/** `lint`: what it found and what fix changed. */
export const lintOutputSchema = z.object({
  /** No errors (warnings allowed), as the CLI's exit code. */
  valid: z.boolean(),
  issues: z.array(lintIssueSchema),
  errorCount: z.number(),
  warningCount: z.number(),
  fixableCount: z.number(),
  fixed: z.boolean(),
  fixedCount: z.number(),
  /** After a fix: what the config check still finds. */
  remaining: z.array(lintIssueSchema),
});

/** `sync`: fetch, merge and push a shared board (spec-9). */
export const syncOutputSchema = z.object({
  ok: z.boolean(),
  skipped: z.enum(['not-tracked', 'no-remote']).optional(),
  remote: z.string().nullable(),
  remoteRef: z.string().nullable(),
  pulled: z.number(),
  pushed: z.number(),
  conflicts: z.array(z.string()),
  warning: z.string().optional(),
  failure: z.string().optional(),
  movedFromBranch: z.string().optional(),
  autosync: z.string().nullable(),
  /** The CLI's one-line summary. */
  message: z.string(),
});

/** `where`: where the board lives, how it is stored, how fresh it is. */
/** One copy of a board found in the repository (spec-15). */
const boardSightingSchema = z.object({
  kind: z.enum(['folder', 'branch', 'remote', 'code-branch']),
  ref: z.string(),
  label: z.string(),
  path: z.string().optional(),
  remote: z.string().optional(),
  commit: z.string().optional(),
  storage: z.enum(['plain', 'standalone', 'linked']).optional(),
  trackedBy: z.string().optional(),
  docs: z.number(),
  lastChange: z.string().nullable(),
});

export const whereOutputSchema = z.object({
  path: z.string(),
  storage: z.enum(['plain', 'branch', 'repository']),
  branch: z.string().nullable(),
  repository: z.string().nullable(),
  remote: z.string().nullable(),
  remoteUrl: z.string().nullable(),
  remoteRef: z.string().nullable(),
  webUrl: z.string().nullable(),
  autosync: z.enum(['off', 'push', 'full']).nullable(),
  lastSyncSecondsAgo: z.number().nullable(),
  lastSyncOk: z.boolean().nullable(),
  pendingChanges: z.number(),
  behind: z.number(),
  boards: z.array(boardSightingSchema),
  conflict: z.object({
    current: boardSightingSchema,
    other: boardSightingSchema,
    relation: z.enum(['same', 'contains', 'contained', 'diverged', 'unrelated']),
    message: z.string(),
    resolve: z.string(),
  }).nullable(),
  strayWorktrees: z.array(z.object({ path: z.string(), missing: z.boolean() })),
  outsideHome: z.string().nullable(),
  trackedTwice: boardSightingSchema.nullable(),
  /** What is wrong with where the board lives and what Fix would do (task-78); with action fix or undo, what it did. */
  fix: z.object({
    problems: z.array(z.object({ short: z.string(), line: z.string() })),
    plan: z.object({ kind: z.enum(['untrack', 'adopt', 'prune']), words: z.string() }).nullable(),
    applied: z.object({ message: z.string(), backups: z.array(z.string()), undoUntil: z.string().nullable() }).optional(),
    undone: z.string().optional(),
  }),
});

/** `retire`: the decision, now in logs/ with its status. */
export const retireOutputSchema = z.object({
  decision: decisionSummarySchema.extend({ path: z.string() }),
});

/** `adr_promote`: a legacy ADR, accepted and moved to logs/. */
export const adrPromoteOutputSchema = z.object({
  taskId: z.string(),
  title: z.string(),
  status: z.literal('promoted'),
  completedAt: z.string(),
});
