/**
 * What a phone may ask of the desk (link.md, Calls): only the calls in the
 * table, their arguments checked cheaply before anything runs, and answered
 * by the same host and agents processes the window uses. Nothing here is a
 * second implementation: a call goes where the window's would.
 *
 * Boards are held, not just opened. The window and every phone each hold the
 * boards they have open; the host opens a board for its first holder and
 * closes it after its last, so a phone letting go never closes the window's
 * board, nor the window a phone's.
 */
import { AGENT_METHODS, type AgentMethod, type BoardSnapshot, type HostMethod, type LinkProject, type Result } from '../shared/api';

type Check = (value: unknown) => boolean;

const text: Check = (v) => typeof v === 'string';
const id: Check = (v) => typeof v === 'string' && v.length > 0 && v.length <= 4096;
/** Something said: a note, a subtask, a turn in the chat. */
const line: Check = (v) => typeof v === 'string' && v.trim().length > 0;
const optional =
  (check: Check): Check =>
  (v) =>
    v === undefined || v === null || check(v);
const texts: Check = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string');
const number: Check = (v) => typeof v === 'number' && Number.isFinite(v);

/** An object with only these keys, each passing its check (absent keys are checked as undefined). */
function shape(fields: Record<string, Check>): Check {
  return (v) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
    const record = v as Record<string, unknown>;
    return Object.keys(record).every((key) => key in fields) && Object.entries(fields).every(([key, check]) => check(record[key]));
  };
}

const PRIORITY: Check = (v) => v === 'low' || v === 'medium' || v === 'high' || v === 'critical';

const NEW_TASK = shape({
  title: line,
  column: id,
  description: optional(text),
  priority: optional(PRIORITY),
  assignee: optional(text),
  tags: optional(texts),
  type: optional(id),
  parentId: optional(id),
  source: optional(text),
});

/** A patch's fields may be cleared with null, as the window's are. */
const TASK_PATCH = shape({
  title: (v) => v === undefined || line(v),
  description: optional(text),
  priority: optional(PRIORITY),
  assignee: optional(text),
  tags: optional(texts),
  dueDate: optional(text),
  parentId: optional(id),
});

const NEW_DECISION = shape({ title: line, claimKey: optional(text), description: optional(text) });
const EARLIER: Check = (v) => Array.isArray(v) && v.every(shape({ who: (w) => w === 'you' || w === 'agent', text }));
const MODELS: Check = (v) => !!v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every((m) => typeof m === 'string');

/**
 * The calls, each with its arguments in order (link.md, Calls). `project`
 * marks a call whose first argument is a project, which must be one of the
 * desk's.
 */
const CALLS = {
  projects: { args: [] },
  openBoard: { args: [id], project: true },
  closeBoard: { args: [id], project: true },
  getTask: { args: [id, id], project: true },
  addTask: { args: [id, NEW_TASK], project: true },
  moveTask: { args: [id, id, id, optional(number)], project: true },
  patchTask: { args: [id, id, TASK_PATCH], project: true },
  toggleSubtask: { args: [id, id, id], project: true },
  addSubtask: { args: [id, id, line], project: true },
  completeTask: { args: [id, id], project: true },
  noteTask: { args: [id, id, line], project: true },
  decide: { args: [id, NEW_DECISION], project: true },
  syncNow: { args: [id], project: true },
  listAgents: { args: [] },
  listModels: { args: [id] },
  live: { args: [] },
  dispatch: { args: [id, id, id, optional(id)], project: true },
  ask: { args: [id, id, line, id, optional(id), optional(EARLIER), optional(texts), optional(MODELS)], project: true },
  stopRun: { args: [id] },
  answerPermission: { args: [id, optional(id)] },
  review: { args: [id, id], project: true },
  // The phone forgets this desk: the server answers it, as Forget in Settings.
  forget: { args: [] },
} satisfies Record<string, { args: Check[]; project?: boolean }>;

export type LinkCall = keyof typeof CALLS;

export const NOT_ALLOWED = 'Not allowed';
export const BAD_ARGUMENTS = 'Bad arguments';
export const UNKNOWN_PROJECT = 'Unknown project';

/**
 * A call as the phone sent it, checked: the call is on the list and each
 * argument has its shape. A null where an optional argument may be left
 * out is passed on as left out, so the callee's defaults apply.
 */
export function checkCall(call: unknown, args: unknown): { ok: true; call: LinkCall; args: unknown[]; projectId: string | null } | { ok: false; error: string } {
  if (typeof call !== 'string' || !Object.hasOwn(CALLS, call)) return { ok: false, error: NOT_ALLOWED };
  const spec: { args: Check[]; project?: boolean } = CALLS[call as LinkCall];
  const given = args === undefined ? [] : args;
  if (!Array.isArray(given) || given.length > spec.args.length || !spec.args.every((check, i) => check(given[i]))) {
    return { ok: false, error: BAD_ARGUMENTS };
  }
  const passed = given.map((value) => (value === null ? undefined : value));
  // answerPermission's null is a choice, not an omission: it declines.
  if (call === 'answerPermission' && given.length > 1) passed[1] = given[1];
  return { ok: true, call: call as LinkCall, args: passed, projectId: spec.project ? (given[0] as string) : null };
}

/** The desk as the link server sees it: the window's API, for one phone at a time. */
export interface LinkDesk {
  /** The desk's projects, each with where it is shared. */
  projects(): Promise<LinkProject[]>;
  /** One of the desk's projects. */
  knows(projectId: string): boolean;
  /** A checked call, answered as the window's would be. `holder` names the phone, for the boards it holds. */
  call(holder: string, call: LinkCall, args: unknown[]): Promise<unknown>;
  /** A phone has gone: whatever it held is let go. */
  release(holder: string): Promise<void>;
}

/** Who holds each board open. The host opens a board for its first holder and closes it after its last. */
export class BoardHolds {
  private readonly held = new Map<string, Set<string>>();

  constructor(
    private readonly host: {
      open(projectId: string): Promise<Result<BoardSnapshot>>;
      close(projectId: string): Promise<void>;
    }
  ) {}

  async open(holder: string, projectId: string): Promise<Result<BoardSnapshot>> {
    const holders = this.held.get(projectId) ?? new Set<string>();
    holders.add(holder);
    this.held.set(projectId, holders);
    const result = await this.host.open(projectId);
    // Not opened, so not held: there is nothing for a later close to let go.
    if (!result.ok) {
      holders.delete(holder);
      if (holders.size === 0 && this.held.get(projectId) === holders) this.held.delete(projectId);
    }
    return result;
  }

  /** Lets go of the holder's board; the host closes it only when nobody else holds it. */
  async close(holder: string, projectId: string): Promise<void> {
    const holders = this.held.get(projectId);
    holders?.delete(holder);
    if (holders?.size) return;
    this.held.delete(projectId);
    await this.host.close(projectId);
  }

  async release(holder: string): Promise<void> {
    const mine = [...this.held].filter(([, holders]) => holders.has(holder)).map(([projectId]) => projectId);
    await Promise.all(mine.map((projectId) => this.close(holder, projectId)));
  }

  /** A project removed from the desk: nobody holds its board any more (the caller closes it). */
  forget(projectId: string): void {
    this.held.delete(projectId);
  }

  holders(projectId: string): string[] {
    return [...(this.held.get(projectId) ?? [])];
  }
}

/**
 * The desk for the link from the processes main already talks to: board
 * calls to the host, agent calls to the agents process, opening and closing
 * through the holds the window shares.
 */
export function linkDesk(parts: {
  host(method: HostMethod, ...args: unknown[]): Promise<unknown>;
  agents(method: AgentMethod, ...args: unknown[]): Promise<unknown>;
  holds: BoardHolds;
  projects(): Promise<LinkProject[]>;
  knows(projectId: string): boolean;
}): LinkDesk {
  return {
    projects: parts.projects,
    knows: parts.knows,
    call(holder, call, args) {
      if (call === 'projects') return parts.projects();
      if (call === 'openBoard') return parts.holds.open(holder, args[0] as string);
      if (call === 'closeBoard') return parts.holds.close(holder, args[0] as string);
      if ((AGENT_METHODS as readonly string[]).includes(call)) return parts.agents(call as AgentMethod, ...args);
      return parts.host(call as HostMethod, ...args);
    },
    release: (holder) => parts.holds.release(holder),
  };
}
