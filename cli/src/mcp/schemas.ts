/**
 * Output schemas for the 11 consolidated MCP tools.
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

export const listTasksOutputSchema = z.object({
  tasks: z.array(z.object({ ...taskSummaryShape, column: z.string() })),
  count: z.number(),
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

/** `query:` — ranked matches across board and logs. */
const searchResultsSchema = z.object({
  results: z.array(z.object({
    ...taskSummaryShape,
    column: z.string().optional(),
    score: z.number(),
    isLog: z.boolean().optional(),
  })),
  count: z.number(),
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
  })),
});

// ── task_delete ────────────────────────────────────────────────────────────

/** New payload: `task_delete` previously returned only a prose confirmation. */
export const taskDeleteOutputSchema = z.object({
  id: z.string(),
  deleted: z.literal(true),
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
export const briefOutputSchema = z.object({
  agent: z.string(),
  mode: z.enum(['full', 'delta']),
  generatedAt: z.string(),
  lastBriefAt: z.string().nullable(),
  peek: z.boolean(),
  lanes: z.array(z.object({
    id: z.string(),
    label: z.string(),
    items: z.array(z.object({
      taskId: z.string().optional(),
      text: z.string(),
      why: z.string(),
      at: z.string().optional(),
    })),
  })),
});
