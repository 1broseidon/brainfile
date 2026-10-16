/**
 * `brainfile dispatch` (task-81, spec-16-7): hand-offs from the command line
 * and from MCP, over core's Runner (task-80) with the board's own files as
 * its board.
 *
 * - `dispatch <ids…|--column|--parent>` queues the work: `dispatch:` on each
 *   task, its agent as assignee. Whichever runner works the queue on this
 *   machine (`brainfile run`, the desktop) starts it; `--now` runs it here in
 *   the foreground until it ends.
 * - `dispatch status` is the queue, the claims and the live runs, from the
 *   board and every runner's run files.
 * - `dispatch stop <run-id|task-id>` stops a run, whichever runner has it;
 *   named by an epic, it stops the epic's lead.
 * - `dispatch <epic>` queues a lead for it (decision-15, task-83): a runner
 *   that takes up leads (`brainfile run`, the desktop) runs it; `--now` runs
 *   it here. `dispatch pause|resume <epic>` pause and resume it, whichever
 *   runner leads it, through its record on the epic.
 * - `agents` lists the agents, which are installed here, and their models.
 *
 * The MCP tools (dispatch_tool.ts, agents_tool.ts) call the same functions.
 * An agent's server is told its role (BRAINFILE_AGENT_ROLE): a worker never
 * dispatches or stops (decision-15), and a lead reaches only its own tree
 * (BRAINFILE_LEAD_SCOPE). The command line keeps to the same role when an
 * agent runs it in its own shell, whose environment carries it too: and no
 * agent starts a runner from inside its turn (`run`, `dispatch --now`). That
 * is a rule for agents, not a security boundary: anyone on the machine can
 * run this CLI.
 *
 * Each command makes a runner for its own length and lets it go after: its
 * runner file goes, and its board writes, which the runner's board debounces,
 * are committed before it returns (flushBoardCommits).
 */
import chalk from 'chalk';
import {
  claimHeld,
  docRole,
  findV2Task,
  getV2Dirs,
  readBoardConfig,
  readDispatchRecord,
  readLeadRecord,
  readTasksDir,
  type DispatchBy,
  type DispatchRunner,
  type DispatchUntil,
  type Task,
} from '@brainfile/core';
import {
  STOP_GRACE_MS,
  Runner,
  allAgents,
  dataDir as dispatchDataDir,
  fileBoard,
  leadAbove,
  leadRefusalOnBoard,
  listAgents,
  nameOf,
  readModels,
  whyNot,
  type AgentId,
  type AgentRole,
  type AgentRun,
  type RunnerOptions,
} from '@brainfile/core/dispatch';
import { flushBoardCommits, isClaimLost, isRunEnded, isRunLost, liveRunners, projectOfBoard, readRunFile, unlanded } from '@brainfile/core/repo';
import * as path from 'path';
import { type Logger, defaultLogger } from '../utils/logger';
import { CLIError } from '../utils/cli-error';
import { callerAccess, refuseInAgent } from '../utils/agent-role';
import { resolveCliBrainfilePath } from '../utils/brainfile-path';
import { assertV2Brainfile } from '../utils/v2-only';
import { runLoop } from './run';

export const DISPATCH_COMMAND_HELP = `
Examples:
  brainfile dispatch task-12 --agent codex            Queue task-12 for Codex
  brainfile dispatch task-12 task-13 --agent claude --model opus --effort high
  brainfile dispatch --column todo --agent claude     Every open task in To Do
  brainfile dispatch --parent epic-3 --agent codex    The epic's open children
  brainfile dispatch task-12 --agent codex --now      Queue it and run it here until it ends
  brainfile dispatch status                           The queue, the claims and what is running
  brainfile dispatch stop task-12                     Stop the run on task-12 (or name its run id)
  brainfile dispatch epic-3 --agent claude            Queue a lead for epic-3: it hands off its children in order
  brainfile dispatch pause epic-3                     Pause epic-3's lead; resume carries on, stop ends it

Queued work waits on the board for a runner: \`brainfile run\`, or Brainfile's
window. A task whose dependsOn are open, or complete with their branch not
landed, stays queued until they have landed. At most dispatch.maxRunning in
the board's config (else 3) run at once on a repository.

With no --agent, a task goes to the agent it was last handed to, else its
assignee when that is an agent. \`brainfile agents\` lists them.

An epic, or any task with open children, gets a lead (an agent that writes no
code): it checks the plan, then hands the children off in order, inside the
rules the runner holds. In its tree, only the lead and you hand off.
`.trimEnd();

/** What the caller is to the board: the role its MCP server was started with. No role (a person) may do everything. */
export interface Access {
  role?: AgentRole;
  /** A lead's epic: it reaches only the tasks under it. */
  scope?: string;
}

/** Whether the role may dispatch, stop and land: a person, the chat and a lead; never a worker or a discussion (decision-15). */
export function mayDispatch(access: Access = {}): boolean {
  return !access.role || access.role === 'chat' || access.role === 'lead';
}

/** Who asks, as the request records it. */
export function byOf(kind: DispatchRunner, access: Access = {}): DispatchBy {
  if (access.role === 'lead') return 'lead';
  if (access.role === 'chat') return 'chat';
  return kind === 'desktop' ? 'person' : kind;
}

// ── The board and its runner ────────────────────────────────────────────────

export interface Place {
  filePath: string;
  /** The project as runners name it: the repository's main checkout. */
  projectId: string;
  /** The board's `.brainfile/`, where run and runner files are. */
  dotDir: string;
}

export function placeOf(filePath: string): Place {
  assertV2Brainfile(filePath);
  return { filePath, projectId: projectOfBoard(filePath), dotDir: path.dirname(path.resolve(filePath)) };
}

/**
 * A runner for one command or call: the board's files as its board, and a
 * landing that fails goes back through the queue, since this process does
 * not stay to run the agent.
 */
export function openRunner(kind: DispatchRunner, options: Partial<RunnerOptions> = {}): Runner {
  return new Runner({ dataDir: dispatchDataDir(), runner: kind, board: fileBoard(), ask: async () => null, sendBack: 'queue', ...options });
}

/** Work with a runner, then let it go: its runner file goes, and what it wrote on the board is committed. */
export async function withRunner<T>(kind: DispatchRunner, work: (runner: Runner) => Promise<T> | T, options: Partial<RunnerOptions> = {}): Promise<T> {
  const runner = openRunner(kind, options);
  try {
    return await work(runner);
  } finally {
    runner.close();
    flushBoardCommits();
  }
}

/** Whether another runner is up on this machine for this board (a file in state/runners that is not lost). */
export function runnerUp(place: Place, runner: Runner): boolean {
  return liveRunners(place.dotDir).some((r) => !(r.host === runner.host && r.pid === runner.pid));
}

// ── A lead's tree ───────────────────────────────────────────────────────────

/** Whether the task sits anywhere under `root`, open or completed. */
export function inTree(filePath: string, taskId: string, root: string): boolean {
  const dirs = getV2Dirs(filePath);
  const seen = new Set<string>();
  let id: string | undefined = taskId;
  while (id && !seen.has(id)) {
    seen.add(id);
    const parent: string | undefined = findV2Task(dirs, id, true)?.doc.task.parentId;
    if (parent === root) return true;
    id = parent;
  }
  return false;
}

/** Why the caller may not touch this task; null when it may. A lead reaches only its tree. */
export function outOfScope(filePath: string, taskId: string, access: Access): string | null {
  if (access.role !== 'lead') return null;
  if (!access.scope) return 'This lead was started with no tree (BRAINFILE_LEAD_SCOPE): it can hand off nothing';
  return inTree(filePath, taskId, access.scope) ? null : `${taskId} is not under ${access.scope}: a lead reaches only its own tree`;
}

/** Refuses a role that may not do this, or a task outside a lead's tree. */
export function guard(filePath: string, taskId: string, access: Access, verb: string): void {
  if (!mayDispatch(access)) throw new CLIError(`A ${access.role} cannot ${verb}: only a person, the board's chat or an epic's lead does (decision-15)`);
  const out = outOfScope(filePath, taskId, access);
  if (out) throw new CLIError(out);
}

// ── Agents ──────────────────────────────────────────────────────────────────

/** The agent a name means, in any case: by ID (`codex`, `custom:Muse Code`), by name (`Muse Code`), or a custom one's name alone. */
export function agentNamed(dataDir: string, named: string): AgentId | undefined {
  const agents = allAgents(dataDir);
  const want = named.trim().toLowerCase();
  return (
    agents.find((a) => a.id.toLowerCase() === want)?.id ??
    agents.find((a) => a.name.toLowerCase() === want || a.id.toLowerCase() === `custom:${want}`)?.id
  );
}

export interface AgentsReport {
  agents: {
    id: string;
    name: string;
    /** Installed on this machine, so it can start here. */
    available: boolean;
    note: string;
    /** The models it offered when last asked; empty until it has been started once. */
    models: { value: string; name: string; efforts?: string[] }[];
  }[];
}

/** Every agent there is: the known ones and the person's own, which are installed here, and the models each offered. */
export function agentsReport(): AgentsReport {
  const dir = dispatchDataDir();
  const models = readModels(dir);
  return {
    agents: listAgents(dir).map((a) => ({
      id: a.id,
      name: a.name,
      available: a.available,
      note: a.note,
      models: (models[a.id]?.options ?? []).map((m) => ({ value: m.value, name: m.name, ...(m.efforts?.length ? { efforts: m.efforts.map((e) => e.value) } : {}) })),
    })),
  };
}

// ── Queue ───────────────────────────────────────────────────────────────────

export interface DispatchSelect {
  ids?: string[];
  /** Every open task in this column, by id or title. */
  column?: string;
  /** The parent's open children. */
  parent?: string;
}

export interface HandOffOptions {
  agent?: string;
  model?: string;
  effort?: string;
  until?: DispatchUntil;
}

export interface DispatchReport {
  /** `lead`: a lead for an epic, which hands off its children (decision-15). */
  queued: { task: string; agent: string; model?: string; effort?: string; until?: DispatchUntil; waitsOn?: string[]; lead?: boolean }[];
  skipped: { task: string; why: string }[];
  /** Another runner is up on this machine to start it. */
  runnerUp: boolean;
  /** What happened, in a line or a few. */
  said: string;
}

/** The sentence `dispatch` adds when nothing on this machine works the queue. */
export const NO_RUNNER = 'Run `brainfile run` or open Brainfile to start it.';

function openChildren(tasks: Task[], id: string): Task[] {
  return tasks.filter((t) => t.parentId === id);
}

/** The tasks a selection names, the ones named that a lead runs (they have open children), and those it names that cannot be handed off. */
function select(filePath: string, sel: DispatchSelect): { ids: string[]; leads: string[]; skipped: DispatchReport['skipped'] } {
  const dirs = getV2Dirs(filePath);
  const config = readBoardConfig(filePath)?.config;
  const open = readTasksDir(dirs.boardDir).map((d) => d.task);
  const skipped: DispatchReport['skipped'] = [];
  const work = (t: Task) => {
    const role = docRole(t.type, config?.types);
    return role !== 'decision' && role !== 'epic' && openChildren(open, t.id).length === 0;
  };
  const ids: string[] = [];
  const leads: string[] = [];
  for (const id of sel.ids ?? []) {
    const task = open.find((t) => t.id === id);
    if (!task) skipped.push({ task: id, why: findV2Task(dirs, id, true) ? 'it is completed' : 'there is no such task on the board' });
    else if (docRole(task.type, config?.types) === 'decision') skipped.push({ task: id, why: 'a decision is not work' });
    else if (openChildren(open, id).length) leads.push(id);
    else if (!work(task)) skipped.push({ task: id, why: 'it has no open children to lead' });
    else ids.push(id);
  }
  if (sel.column) {
    const want = sel.column.toLowerCase();
    const column = config?.columns?.find((c) => c.id.toLowerCase() === want || (c.title ?? '').toLowerCase() === want);
    if (!column) throw new CLIError(`No column ${sel.column} on this board`, undefined, `Columns: ${(config?.columns ?? []).map((c) => c.id).join(', ')}`);
    ids.push(...open.filter((t) => t.column === column.id && work(t)).map((t) => t.id));
  }
  if (sel.parent) {
    if (!findV2Task(dirs, sel.parent, true)) throw new CLIError(`No ${sel.parent} on this board`);
    ids.push(...openChildren(open, sel.parent).filter(work).map((t) => t.id));
  }
  return { ids: [...new Set(ids)], leads, skipped };
}

/** The dependsOn a task still waits on: open on this board, or complete with its branch not landed (decision-15). */
export function waitsOn(place: Place, task: Task): string[] {
  const dirs = getV2Dirs(place.filePath);
  return (task.dependsOn ?? []).filter((ref) => !ref.includes(':') && (!!findV2Task(dirs, ref) || unlanded(place.projectId, ref)));
}

/**
 * Queues each task for its agent: `dispatch:` written on it, the agent its
 * assignee. One still running, or held by a runner, is skipped and said so;
 * one waiting on its dependencies is queued and said so.
 */
export async function dispatchReport(
  filePath: string,
  sel: DispatchSelect,
  handOff: HandOffOptions,
  options: { kind?: DispatchRunner; access?: Access } = {},
): Promise<DispatchReport> {
  const place = placeOf(filePath);
  const access = options.access ?? {};
  const kind = options.kind ?? 'cli';
  if (!mayDispatch(access)) throw new CLIError(`A ${access.role} cannot dispatch: only a person, the board's chat or an epic's lead does (decision-15)`);
  if (!sel.ids?.length && !sel.column && !sel.parent) throw new CLIError('Name the tasks to hand off, or --column or --parent');
  const dir = dispatchDataDir();
  const named = handOff.agent ? agentNamed(dir, handOff.agent) : undefined;
  if (handOff.agent && !named) throw new CLIError(`Unknown agent ${handOff.agent}`, undefined, `Agents: ${allAgents(dir).map((a) => a.id).join(', ')}`);
  if (handOff.model && handOff.model.length > 200) throw new CLIError('That model ID is too long');

  const { ids, leads, skipped } = select(filePath, sel);
  const dirs = getV2Dirs(filePath);
  return withRunner(kind, async (runner) => {
    const queued: DispatchReport['queued'] = [];
    for (const id of leads) {
      const why = leadWhyNot(place, id, access);
      if (why) {
        skipped.push({ task: id, why });
        continue;
      }
      const task = findV2Task(dirs, id)!.doc.task;
      const record = readLeadRecord(task as Task & { lead?: unknown });
      const agent = named ?? (record?.agent as AgentId | undefined) ?? (task.assignee ? agentNamed(dir, task.assignee) : undefined);
      if (!agent) {
        skipped.push({ task: id, why: 'no agent to lead it: name one with --agent' });
        continue;
      }
      const written = await runner.queue(place.projectId, [id], { agent, model: handOff.model, effort: handOff.effort, by: byOf(kind, access), role: 'lead' });
      if (!written.ok) {
        skipped.push({ task: id, why: written.error.replace(`${id}: `, '') });
        continue;
      }
      const until = readLeadRecord(findV2Task(dirs, id)!.doc.task as Task & { lead?: unknown })?.until;
      queued.push({ task: id, agent, ...(handOff.model ? { model: handOff.model } : {}), ...(handOff.effort ? { effort: handOff.effort } : {}), ...(until ? { until } : {}), lead: true });
    }
    for (const id of ids) {
      const out = outOfScope(filePath, id, access) ?? ledWhyNot(place, id, access);
      if (out) {
        skipped.push({ task: id, why: out });
        continue;
      }
      const busy = runner.busy(place.projectId, id, 'working');
      if (busy) {
        skipped.push({ task: id, why: busy });
        continue;
      }
      const task = findV2Task(dirs, id)!.doc.task;
      const record = readDispatchRecord(task);
      if (claimHeld(record?.claim) && !isClaimLost(place.dotDir, record.claim)) {
        skipped.push({ task: id, why: `a ${record.claim.runner} runner on ${record.claim.host} has it` });
        continue;
      }
      // The agent named, else the one it was last handed to, else its assignee when that is an agent.
      const agent = named ?? (record?.agent as AgentId | undefined) ?? (task.assignee ? agentNamed(dir, task.assignee) : undefined);
      if (!agent) {
        skipped.push({ task: id, why: 'no agent: name one with --agent' });
        continue;
      }
      // A model named goes with the agent named; else the request's own, when it is the same agent.
      const same = !named || named === record?.agent;
      const model = handOff.model ?? (same ? record?.model : undefined);
      const effort = handOff.effort ?? (same && !handOff.model ? record?.effort : undefined);
      const until = handOff.until ?? record?.until;
      const written = await runner.queue(place.projectId, [id], { agent, model, effort, until, by: byOf(kind, access) });
      if (!written.ok) {
        skipped.push({ task: id, why: written.error.replace(`${id}: `, '') });
        continue;
      }
      const waits = waitsOn(place, task);
      queued.push({ task: id, agent, ...(model ? { model } : {}), ...(effort ? { effort } : {}), ...(until ? { until } : {}), ...(waits.length ? { waitsOn: waits } : {}) });
    }
    const up = runnerUp(place, runner);
    return { queued, skipped, runnerUp: up, said: sayQueued(dir, queued, skipped, up) };
  });
}

/**
 * Why an epic cannot be given a lead now: a role that may not start one (a
 * lead hands off only children with none of their own), or a lead already
 * in its tree, here or above it (decision-15).
 */
function leadWhyNot(place: Place, epicId: string, access: Access): string | null {
  if (access.role === 'lead') return `${epicId} has children of its own: hand those off instead`;
  const above = leadAbove(place.projectId, epicId, { self: true });
  if (above?.epicId === epicId) {
    const claim = above.record.claim;
    return claimHeld(claim) && !isClaimLost(place.dotDir, claim) ? `it already has a lead: ${above.record.agent}, in ${claim.runner} on ${claim.host} (pid ${claim.pid})` : 'it already has a lead, waiting for a runner';
  }
  if (above) return `${above.epicId}'s lead runs it`;
  return null;
}

/**
 * Why a task in a led tree may not be queued by this caller: the board's
 * chat never hands off there (decision-15), and a lead only inside its rules
 * (the same ones its runner checks before it starts the task).
 */
function ledWhyNot(place: Place, taskId: string, access: Access): string | null {
  if (access.role === 'lead' && access.scope) {
    const refused = leadRefusalOnBoard(place.projectId, access.scope, taskId);
    return refused ? refused.why : null;
  }
  if (access.role !== 'chat') return null;
  const above = leadAbove(place.projectId, taskId);
  return above ? `${above.epicId}'s lead runs that tree: only the lead hands off its children. Pause or stop it first` : null;
}

function sayQueued(dir: string, queued: DispatchReport['queued'], skipped: DispatchReport['skipped'], up: boolean): string {
  const lines: string[] = [];
  for (const q of queued.filter((q) => q.lead)) {
    lines.push(`Queued a lead for ${q.task}: ${nameOf(dir, q.agent as AgentId)}${q.model ? ` (${q.model}${q.effort ? `, ${q.effort}` : ''})` : ''} checks the plan, then hands off its children in order${q.until === 'done' ? ', landing each' : ''}.`);
  }
  const work = queued.filter((q) => !q.lead);
  if (work.length) {
    const byAgent = new Map<string, string[]>();
    for (const q of work) {
      const who = `${nameOf(dir, q.agent as AgentId)}${q.model ? ` (${q.model}${q.effort ? `, ${q.effort}` : ''})` : ''}${q.until === 'done' ? ', until done' : ''}`;
      byAgent.set(who, [...(byAgent.get(who) ?? []), q.task]);
    }
    lines.push(`Queued ${[...byAgent].map(([who, tasks]) => `${tasks.join(', ')} for ${who}`).join('; ')}.`);
  }
  if (queued.length) {
    const notHere = [...new Set(queued.map((q) => q.agent))].map((id) => allAgents(dir).find((a) => a.id === id)).filter((a) => a && whyNot(a));
    for (const a of notHere) lines.push(`${whyNot(a!)}: a runner on another machine can start it.`);
    for (const q of work.filter((q) => q.waitsOn)) lines.push(`${q.task} waits on ${q.waitsOn!.join(', ')}: it starts once ${q.waitsOn!.length === 1 ? 'that has' : 'they have'} landed.`);
  } else {
    lines.push('Nothing was queued.');
  }
  for (const s of skipped) lines.push(`Skipped ${s.task}: ${s.why}.`);
  if (queued.length && !up) lines.push(NO_RUNNER);
  return lines.join('\n');
}

// ── Status ──────────────────────────────────────────────────────────────────

export interface RunLine {
  id: string;
  task?: string;
  agent: string;
  model?: string;
  effort?: string;
  state: string;
  activity: string;
  /** ISO 8601. */
  startedAt: string;
  runner?: string;
  host?: string;
  pid?: number;
  branch?: string;
  /** What it is asking the person, when it is waiting on an answer. */
  asking?: string;
}

export interface StatusReport {
  /** The most hand-offs at once on this repository. */
  limit: number;
  runners: { runner: string; host: string; pid: number; startedAt: string }[];
  running: RunLine[];
  queued: { task: string; agent: string; model?: string; effort?: string; until?: DispatchUntil; by: string; at: string; waitsOn?: string[] }[];
  /** Tasks a runner holds. `lost`: its runner is gone, so another may take it. */
  claims: { task: string; runner: string; host: string; pid: number; at: string; lost: boolean }[];
  /** Epics' leads (decision-15): waiting for a runner, leading or paused, and where. */
  leads: LeadLine[];
}

export interface LeadLine {
  epic: string;
  agent: string;
  model?: string;
  /** `waiting`: no runner leads it yet (or its runner went away), and one that takes up leads will. */
  state: 'waiting' | 'leading' | 'paused';
  until?: DispatchUntil;
  by: string;
  at: string;
  runner?: string;
  host?: string;
  pid?: number;
}

/** The epics with a lead on the board, as a status line each. */
function leadLines(place: Place, open: Task[], visible: (taskId: string) => boolean): LeadLine[] {
  return open.flatMap((task) => {
    const record = readLeadRecord(task as Task & { lead?: unknown });
    if (!record || !visible(task.id)) return [];
    const claim = record.claim;
    const held = claimHeld(claim) && !isClaimLost(place.dotDir, claim);
    return [{
      epic: task.id,
      agent: record.agent,
      ...(record.model ? { model: record.model } : {}),
      state: record.paused ? 'paused' : held ? 'leading' : 'waiting',
      ...(record.until ? { until: record.until } : {}),
      by: record.by,
      at: record.at,
      ...(held ? { runner: claim!.runner, host: claim!.host, pid: claim!.pid } : {}),
    } satisfies LeadLine];
  });
}

/** The queue, the claims and the live runs, from the board and every runner's files on this machine. */
export async function statusReport(filePath: string, options: { access?: Access } = {}): Promise<StatusReport> {
  const place = placeOf(filePath);
  const access = options.access ?? {};
  const visible = (taskId: string | undefined) => !taskId || !outOfScope(filePath, taskId, access);
  const dirs = getV2Dirs(filePath);
  return withRunner('cli', (runner) => {
    const running = runner
      .live(place.projectId)
      .filter((r) => visible(r.taskId))
      .map((r) => runLine(place, r));
    const open = readTasksDir(dirs.boardDir).map((d) => d.task);
    const queued = runner
      .queued(place.projectId)
      .filter(visible)
      .flatMap((id) => {
        const task = open.find((t) => t.id === id);
        const record = task ? readDispatchRecord(task) : null;
        if (!task || !record) return [];
        const waits = waitsOn(place, task);
        return [{
          task: id,
          agent: record.agent,
          ...(record.model ? { model: record.model } : {}),
          ...(record.effort ? { effort: record.effort } : {}),
          ...(record.until ? { until: record.until } : {}),
          by: record.by,
          at: record.at,
          ...(waits.length ? { waitsOn: waits } : {}),
        }];
      });
    const claims = open.flatMap((task) => {
      const record = readDispatchRecord(task);
      const claim = record?.claim;
      if (!claimHeld(claim) || !visible(task.id) || record?.role === 'lead') return [];
      return [{ task: task.id, runner: claim.runner, host: claim.host, pid: claim.pid, at: claim.at, lost: isClaimLost(place.dotDir, claim) }];
    });
    const runners = liveRunners(place.dotDir)
      .filter((r) => !(r.host === runner.host && r.pid === runner.pid))
      .map((r) => ({ runner: r.runner, host: r.host, pid: r.pid, startedAt: new Date(r.startedAt).toISOString() }));
    // A lead sees the leads under it; its own is not among them.
    const leads = leadLines(place, open, (id) => visible(id) && id !== access.scope);
    return { limit: runner.limit(place.projectId), runners, running, queued, claims, leads };
  });
}

function runLine(place: Place, run: AgentRun): RunLine {
  const file = readRunFile(place.dotDir, run.id);
  return {
    id: run.id,
    ...(run.taskId ? { task: run.taskId } : {}),
    agent: run.agentId,
    ...(run.model ? { model: run.model } : {}),
    ...(run.effort ? { effort: run.effort } : {}),
    state: run.state,
    activity: run.activity,
    startedAt: new Date(run.startedAt).toISOString(),
    ...(file ? { runner: file.runner, host: file.host, pid: file.pid } : {}),
    ...(file?.branch ? { branch: file.branch } : {}),
    ...(file?.ask ? { asking: file.ask.title } : {}),
  };
}

// ── Stop ────────────────────────────────────────────────────────────────────

export interface StopReport {
  run: string;
  task?: string;
  agent: string;
  /** It has ended; false when it was asked to and has not yet. */
  stopped: boolean;
  said: string;
}

/**
 * Stops a run by its id or its task's, whichever runner on this machine has
 * it: `stop: true` in its run file, which that runner watches; one that has
 * not ended after the grace is sent SIGTERM. Waits up to `waitMs` to say
 * whether it stopped.
 */
export async function stopReport(filePath: string, ref: string, options: { access?: Access; waitMs?: number } = {}): Promise<StopReport> {
  const place = placeOf(filePath);
  const access = options.access ?? {};
  if (!mayDispatch(access)) throw new CLIError(`A ${access.role} cannot stop a run: only a person, the board's chat or an epic's lead does (decision-15)`);
  return withRunner('cli', async (runner) => {
    const run = runner.live(place.projectId).find((r) => r.id === ref || r.taskId === ref);
    const epic = run ? undefined : findV2Task(getV2Dirs(filePath), ref)?.doc.task;
    if (epic && readLeadRecord(epic as Task & { lead?: unknown })) {
      // An epic's lead: taken off the epic, which the runner leading it follows.
      guard(filePath, ref, access, 'stop a lead');
      const record = readLeadRecord(epic as Task & { lead?: unknown })!;
      const stopped = await runner.stopLead(place.projectId, ref);
      if (!stopped.ok) throw new CLIError(stopped.error);
      return { run: ref, task: ref, agent: record.agent, stopped: true, said: `Stopped ${ref}'s lead. What it handed off goes on, and is yours now.` };
    }
    if (!run) {
      const file = /^run-/.test(ref) ? readRunFile(place.dotDir, ref) : null;
      if (file && isRunEnded(file)) return { run: ref, ...(file.taskId ? { task: file.taskId } : {}), agent: file.agent, stopped: true, said: `${ref} has already ended (${file.state})` };
      throw new CLIError(`Nothing is running on ${ref} on this machine`, undefined, 'See what is: brainfile dispatch status');
    }
    if (run.taskId) guard(filePath, run.taskId, access, 'stop a run');
    const asked = await runner.stop(run.id, place.projectId);
    if (!asked.ok) throw new CLIError(asked.error);
    const who = `${nameOf(runner.dataDir, run.agentId)}${run.taskId ? ` on ${run.taskId}` : ''}`;
    const deadline = Date.now() + (options.waitMs ?? 0);
    let stopped = ended(place, run.id);
    // The runner's grace timer is not held open: waiting here keeps this process up for it.
    while (!stopped && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 200));
      stopped = ended(place, run.id);
    }
    const said = stopped
      ? `Stopped ${who}. Its worktree and branch stay for review.`
      : `Asked ${who} to stop; its runner is sent SIGTERM if it has not stopped within ${Math.round(STOP_GRACE_MS / 1000)} s.`;
    return { run: run.id, ...(run.taskId ? { task: run.taskId } : {}), agent: run.agentId, stopped, said };
  });
}

// ── A lead's pause and resume ───────────────────────────────────────────────

export interface LeadReport {
  epic: string;
  /** What the lead does now, as its record says. */
  state: LeadLine['state'];
  said: string;
}

/**
 * Pauses or resumes an epic's lead through its record on the epic, whichever
 * runner leads it (decision-15): paused, it hands off nothing and its events
 * wait; resumed, it carries on, or waits for a runner when none leads it.
 * What is running goes on either way.
 */
export async function leadReport(filePath: string, epicId: string, action: 'pause' | 'resume', options: { access?: Access } = {}): Promise<LeadReport> {
  const place = placeOf(filePath);
  const access = options.access ?? {};
  const epic = findV2Task(getV2Dirs(filePath), epicId)?.doc.task;
  if (!epic) throw new CLIError(`No open ${epicId} on this board`);
  if (!readLeadRecord(epic as Task & { lead?: unknown })) throw new CLIError(`${epicId} has no lead`, undefined, `Give it one: brainfile dispatch ${epicId} --agent <agent>`);
  guard(filePath, epicId, access, `${action} a lead`);
  return withRunner('cli', async (runner) => {
    let said: string;
    if (action === 'pause') {
      const paused = await runner.pauseLead(place.projectId, epicId);
      if (!paused.ok) throw new CLIError(paused.error);
      said = `Paused ${epicId}'s lead: it hands off nothing until resumed; what is running goes on.`;
    } else {
      const resumed = await runner.resumeLead(place.projectId, epicId);
      if (!resumed.ok) throw new CLIError(resumed.error);
      said = `${resumed.value}.${/waits for a runner/.test(resumed.value) ? ` ${NO_RUNNER.replace('start it', 'take it up')}` : ''}`;
    }
    const now = findV2Task(getV2Dirs(filePath), epicId)?.doc.task;
    const line = now ? leadLines(place, [now], () => true)[0] : undefined;
    return { epic: epicId, state: line?.state ?? 'waiting', said };
  });
}

function ended(place: Place, runId: string): boolean {
  const file = readRunFile(place.dotDir, runId);
  return !file || isRunEnded(file) || isRunLost(file);
}

// ── The commands ────────────────────────────────────────────────────────────

export interface DispatchOptions extends HandOffOptions {
  file?: string;
  column?: string;
  parent?: string;
  now?: boolean;
  json?: boolean;
}

/** `brainfile dispatch <ids…|--column|--parent> [--agent --model --effort --until] [--now]`. */
export async function dispatchCommand(ids: string[], options: DispatchOptions, logger: Logger = defaultLogger): Promise<DispatchReport> {
  const filePath = resolveCliBrainfilePath(options.file);
  const until = options.until;
  if (until !== undefined && until !== 'review' && until !== 'done') throw new CLIError(`--until is review or done, not ${until}`);
  const access = callerAccess();
  if (options.now) refuseInAgent(access, 'run a hand-off here with --now');
  const report = await dispatchReport(filePath, { ids, column: options.column, parent: options.parent }, { agent: options.agent, model: options.model, effort: options.effort, until }, { access });
  if (options.json && !options.now) {
    logger.log(JSON.stringify(report, null, 2));
    return report;
  }
  // Run here: the "no runner" line does not apply.
  const said = options.now ? report.said.split('\n').filter((l) => l !== NO_RUNNER).join('\n') : report.said;
  logger.log(report.queued.length ? said : chalk.yellow(said));
  if (options.now && report.queued.length) {
    // `brainfile run`'s loop, given what was just queued: it returns once they have ended and been settled.
    await runLoop(filePath, { only: { tasks: report.queued.filter((q) => !q.lead).map((q) => q.task), leads: report.queued.filter((q) => q.lead).map((q) => q.task) } }, logger);
  }
  return report;
}

/** `brainfile dispatch status`. */
export async function dispatchStatusCommand(options: { file?: string; json?: boolean }, logger: Logger = defaultLogger): Promise<StatusReport> {
  const report = await statusReport(resolveCliBrainfilePath(options.file), { access: callerAccess() });
  logger.log(options.json ? JSON.stringify(report, null, 2) : statusText(report));
  return report;
}

/** The status in plain lines, for the terminal and the MCP text. */
export function statusText(report: StatusReport): string {
  const lines: string[] = [];
  lines.push(
    report.runners.length
      ? `Runners up: ${report.runners.map((r) => `${r.runner} on ${r.host} (pid ${r.pid})`).join(', ')}. At most ${report.limit} at once.`
      : `No runner is up on this machine: ${NO_RUNNER.replace(' to start it', ' to work the queue')} At most ${report.limit} at once.`,
  );
  const minutes = (iso: string) => `${Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000))}m`;
  lines.push('', report.running.length ? `Running (${report.running.length}):` : 'Nothing is running.');
  for (const r of report.running) {
    const what = r.asking ? `asking: ${r.asking}` : r.activity;
    lines.push(`  ${r.task ?? '-'} · ${r.agent}${r.model ? ` (${r.model})` : ''} · ${what} · ${minutes(r.startedAt)} · ${r.id}${r.runner ? ` · ${r.runner} pid ${r.pid}` : ''}`);
  }
  lines.push('', report.queued.length ? `Queued (${report.queued.length}):` : 'Nothing is queued.');
  for (const q of report.queued) {
    lines.push(`  ${q.task} · ${q.agent}${q.model ? ` (${q.model})` : ''}${q.until === 'done' ? ' · until done' : ''} · asked by ${q.by}${q.waitsOn ? ` · waits on ${q.waitsOn.join(', ')}` : ''}`);
  }
  if (report.leads.length) {
    lines.push('', `Leads (${report.leads.length}):`);
    for (const l of report.leads) {
      const where = l.runner ? ` · ${l.runner} on ${l.host} (pid ${l.pid})` : '';
      const state = l.state === 'waiting' ? 'waiting for a runner' : l.state;
      lines.push(`  ${l.epic} · ${l.agent}${l.model ? ` (${l.model})` : ''} · ${state}${l.until === 'done' ? ' · until done' : ''}${where}`);
    }
  }
  if (report.claims.length) {
    lines.push('', `Claimed (${report.claims.length}):`);
    for (const c of report.claims) lines.push(`  ${c.task} · ${c.runner} on ${c.host} (pid ${c.pid})${c.lost ? ' · lost: its runner is gone, another may take it' : ''}`);
  }
  return lines.join('\n');
}

/** `brainfile dispatch stop <run-id|task-id>`. */
export async function dispatchStopCommand(ref: string, options: { file?: string; json?: boolean }, logger: Logger = defaultLogger): Promise<StopReport> {
  const report = await stopReport(resolveCliBrainfilePath(options.file), ref, { access: callerAccess(), waitMs: STOP_GRACE_MS + 2_000 });
  logger.log(options.json ? JSON.stringify(report, null, 2) : report.stopped ? chalk.green(report.said) : chalk.yellow(report.said));
  return report;
}

/** `brainfile dispatch pause <epic>` and `dispatch resume <epic>`. */
export async function dispatchLeadCommand(action: 'pause' | 'resume', epicId: string, options: { file?: string; json?: boolean }, logger: Logger = defaultLogger): Promise<LeadReport> {
  const report = await leadReport(resolveCliBrainfilePath(options.file), epicId, action, { access: callerAccess() });
  logger.log(options.json ? JSON.stringify(report, null, 2) : report.state === 'paused' ? chalk.yellow(report.said) : chalk.green(report.said));
  return report;
}

/** `brainfile agents`. */
export function agentsCommand(options: { json?: boolean }, logger: Logger = defaultLogger): AgentsReport {
  const report = agentsReport();
  if (options.json) {
    logger.log(JSON.stringify(report, null, 2));
    return report;
  }
  logger.log(agentsText(report));
  return report;
}

export function agentsText(report: AgentsReport): string {
  return report.agents
    .map((a) => {
      const head = `${a.id.padEnd(12)} ${a.name} · ${a.note}`;
      const models = a.models.length ? `\n${' '.repeat(13)}models: ${a.models.map((m) => m.value).join(', ')}` : '';
      return head + models;
    })
    .join('\n');
}
