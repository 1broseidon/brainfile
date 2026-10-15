/**
 * The agents process: an Electron utility process that starts the person's
 * own coding agents over the Agent Client Protocol and keeps them apart from
 * the board host, so an agent that thinks for minutes never holds up a read.
 *
 * Brainfile is a dispatcher, not a chat app (design.md, Dispatch). An agent
 * gets the repository as its working directory and Brainfile's own MCP server
 * (`brainfile mcp`), so it reads and changes the board through the same tools
 * as the CLI; what it changes reaches the window as ordinary board changes.
 * Starting an agent and talking to it is core's (@brainfile/core/dispatch,
 * decision-18): the agents it knows, custom agents and the registry, the
 * settings, sessions, permissions and the brief. This process keeps the runs,
 * answers asks in the band, and hands off, leads, reviews and lands.
 * A hand-off gets its own worktree and branch instead (core's repo/worktree.ts, spec-14).
 * The chat's agents also get the desk (desk.ts, spec-16): `dispatch`, `runs`
 * and `stop`, so a chat can hand work off the way Hand to… does. Handing off
 * a document with children starts its lead instead (lead.ts, decision-15):
 * an agent with the desk scoped to that tree, which checks the plan, hands
 * the children off in order inside rules the app holds, and is woken when
 * one ends or lands. Discuss
 * (discuss.ts, task-35) is a chat about one task that may change its spec and
 * record decisions, and nothing else. Besides the agents it knows, it starts
 * any ACP server the person names in Settings (custom.ts in core, task-47),
 * the way Zed's agent_servers do.
 */
import * as fs from 'fs';
import * as path from 'path';
import type * as acp from '@agentclientprotocol/sdk';
import { findV2Task, getV2Dirs, readBoardConfig, readTasksDir, type Task } from '@brainfile/core';
import {
  AgentRegistry,
  Startups,
  agentEnv,
  agentOf as agentOfIn,
  allAgents as allAgentsIn,
  applyMode,
  brief,
  close as closeSession,
  dataDir,
  getSettings,
  listAgents,
  listModels,
  listModes,
  nameOf as nameOfIn,
  open as openSession,
  policyFor,
  readSettings,
  setSettings,
  standingDecisions,
  turn as takeTurn,
  wasStopped,
  whyNot,
  type OpenOptions as SessionOptions,
  type PermissionRule,
  type Session,
  type SessionContext,
} from '@brainfile/core/dispatch';
import {
  branchesOf,
  discardReview,
  handOffTarget,
  keepBranch,
  landReview,
  locateBoard,
  offerEpicBranch,
  onlyReads,
  prepareEpicBranch,
  prepareTarget,
  prepareWorktree,
  readyToMerge,
  refreshTarget,
  releaseReader,
  reviewOf,
  runChecks,
  sendBackNote,
  uncommittedIn,
  unlanded,
  type Landing,
  type Refresh,
  type Worktree,
} from '@brainfile/core/repo';
import { DESK_ENV, DeskBridge, deskTools } from './desk';
import { chatPermission, discussContext, discussMode, discussPermission, discussPreamble, type DiscussWork } from './discuss';
import { liveRuns } from './live';
import { DEFAULT_LIMIT, Leads, treeOf, workOf as openWork, type Lead, type LeadTurn, type Tree, type TreeDoc } from './lead';
import { isReview } from '../shared/columns';
import type {
  AgentEvent,
  AgentHostMethod,
  AgentId,
  AgentMessage,
  AgentRequest,
  AgentRun,
  AgentServer,
  BranchesView,
  ChatTurn,
  DispatchRecord,
  DispatchSettings,
  LeadRecord,
  HostReply,
  LiveAgents,
  MergeTo,
  ModelOption,
  PermissionAsk,
  Result,
  ReadyView,
  ReviewView,
} from '../shared/api';

const parentPort = process.parentPort;
/** dispatch.json, models.json and agents/: Electron's userData, which main passes as BRAINFILE_DATA_DIR. */
const DATA_DIR = dataDir();
const registry = new AgentRegistry(DATA_DIR);

function send(message: AgentMessage): void {
  parentPort.postMessage(message);
}

function emit(event: AgentEvent): void {
  send({ kind: 'event', event });
  if (event.kind === 'run') markBusy();
}

/**
 * In development, how many agents are at work, in the file the dev loop
 * names: a rebuild waits for them to finish instead of ending them, so
 * merging one hand-off into the app's own code never stops another.
 */
const BUSY_FILE = process.env.BRAINFILE_DEV_BUSY;
function markBusy(): void {
  if (!BUSY_FILE) return;
  const working = [...runs.values()].filter((r) => r.state === 'starting' || r.state === 'working' || r.state === 'waiting').length;
  try {
    fs.writeFileSync(BUSY_FILE, String(working));
  } catch {
    /* the dev loop restarts as before */
  }
}

// ── Agents and settings (core's, in this app's data folder) ──────────────────

/** Every agent there is to start: the known ones, then the person's own. */
const allAgents = () => allAgentsIn(DATA_DIR);
const agentOf = (agentId: AgentId) => agentOfIn(DATA_DIR, agentId);
/** An agent's name in a sentence, even once a custom one has been removed. */
const nameOf = (agentId: AgentId) => nameOfIn(DATA_DIR, agentId);

async function changeSettings(patch: Partial<DispatchSettings>): Promise<DispatchSettings> {
  const now = setSettings(DATA_DIR, patch);
  // Sessions already open change mode now, not on their next start.
  await Promise.all([...sessions.values()].map((session) => applyMode(ctx, session)));
  return now;
}

// ── Sessions ─────────────────────────────────────────────────────────────────

const sessions = new Map<string, Session>();
const runs = new Map<string, AgentRun>();
const asks = new Map<string, { ask: PermissionAsk; resolve: (optionId: string | null) => void }>();
/** Runs whose agent is still starting, so stop reaches them before they have a session. */
const startups = new Startups();
let nextId = 1;

/** What core's sessions report to: the runs this process keeps, and asks answered in the band. */
const ctx: SessionContext = {
  dataDir: DATA_DIR,
  sessions,
  update,
  ask(ask) {
    emit({ kind: 'permission', ask });
    return new Promise((resolve) => asks.set(ask.id, { ask, resolve }));
  },
};

const LIVE_STATES = new Set(['starting', 'working', 'waiting']);

function update(run: AgentRun, patch: Partial<AgentRun>): void {
  const was = run.state;
  Object.assign(run, patch);
  emit({ kind: 'run', run: { ...run } });
  // A hand-off that ends wakes the lead over its task (decision-15).
  if (run.kind === 'dispatch' && LIVE_STATES.has(was) && !LIVE_STATES.has(run.state)) void leads.childEnded({ ...run });
}

interface OpenOptions extends Omit<SessionOptions, 'mcpServers' | 'rule' | 'keepsMode' | 'release'> {
  /** Gives a chat session the desk's tools besides the board's. */
  withDesk?: boolean;
  /** The task a discussion is about: it reads, and changes only that task's spec. */
  discuss?: string;
  /** The epic a lead runs (decision-15): its desk is scoped to that tree. */
  lead?: string;
}

/** A chat session's right to the desk; a hand-off, a probe or a discussion has none. */
const deskTokens = new WeakMap<Session, string>();

/**
 * Opens a session (core's open) with what this app adds: the desk for a
 * chat, and the rule and mode a discussion and the chat keep.
 */
async function open(projectId: string, agentId: AgentId, key: string, model?: string, options: OpenOptions = {}): Promise<Session> {
  const { withDesk = false, discuss, lead, ...rest } = options;
  const board = rest.board ?? true;
  const deskToken = board && withDesk ? await grantDesk({ projectId, agentId, model, effort: rest.effort, models: {}, efforts: {}, key, ...(lead ? { lead } : {}) }) : null;
  // A discussion changes the task's spec and nothing else; the board's chat manages the board and hands
  // code to hand-offs (decision-14): what their rule refuses is refused before anyone is asked.
  const rule: PermissionRule | undefined = discuss
    ? (call) => discussPermission(call.title ?? '', call.kind)
    : deskToken
      ? (call) => chatPermission(call.title ?? '', call.kind, call.rawInput)
      : undefined;
  const session = await openSession(ctx, projectId, agentId, key, model, {
    ...rest,
    rule,
    // A discussion and the board's chat (the sessions with the desk) never run in bypass, and only read when they can.
    keepsMode: discuss || deskToken ? discussMode : undefined,
    ...(deskToken ? { mcpServers: [deskMcp(deskToken, projectId)], release: () => desk.revoke(deskToken) } : {}),
  });
  if (deskToken) deskTokens.set(session, deskToken);
  return session;
}

function answerPermission(askId: string, optionId: string | null): void {
  const pending = asks.get(askId);
  if (!pending) return;
  asks.delete(askId);
  emit({ kind: 'permission-done', id: askId });
  pending.resolve(optionId);
}

function close(session: Session): void {
  closeSession(ctx, session);
}

/** One prompt turn on a session; the reply lands whole when the turn ends. */
function turn(session: Session, run: AgentRun, prompt: string): Promise<void> {
  return takeTurn(ctx, session, run, prompt);
}

function newRun(projectId: string, agentId: AgentId, kind: AgentRun['kind'], taskId?: string, extra: Pick<AgentRun, 'model' | 'effort' | 'from'> = {}): AgentRun {
  const run: AgentRun = {
    id: `run-${nextId++}`,
    projectId,
    agentId,
    kind,
    taskId,
    ...(extra.model ? { model: extra.model } : {}),
    // Effort belongs to a chosen model: the agent's default model takes its own.
    ...(extra.model && extra.effort ? { effort: extra.effort } : {}),
    ...(extra.from ? { from: extra.from } : {}),
    state: 'starting',
    activity: 'starting',
    startedAt: Date.now(),
  };
  runs.set(run.id, run);
  emit({ kind: 'run', run: { ...run } });
  return run;
}

// ── Dispatch and ask ─────────────────────────────────────────────────────────

/** The live hand-off on a task, if any. */
function liveDispatch(projectId: string, taskId: string): AgentRun | undefined {
  return [...runs.values()].find(
    (r) =>
      r.kind === 'dispatch' &&
      r.projectId === projectId &&
      r.taskId === taskId &&
      (r.state === 'starting' || r.state === 'working' || r.state === 'waiting' || startups.starting(r.id))
  );
}

/**
 * Tasks a hand-off is being started on, held from its busy check until its
 * run exists: the desk awaits a board write in between, and a second hand-off
 * (from the desk or Hand to…) let through then would share the task's one
 * worktree (decision-2).
 */
const reserved = new Set<string>();

/**
 * Holds the task for one hand-off: a release, to call once its run exists or
 * it has failed, or why the task cannot be had. Checked and taken in one
 * step, with no await between.
 */
function reserve(projectId: string, taskId: string): Result<() => void> {
  const live = liveDispatch(projectId, taskId);
  if (live) return { ok: false, error: `${nameOf(live.agentId)} is already working on ${taskId}` };
  const slot = `${projectId}\n${taskId}`;
  if (reserved.has(slot)) return { ok: false, error: `A hand-off is already starting on ${taskId}` };
  reserved.add(slot);
  return { ok: true, value: () => reserved.delete(slot) };
}

/**
 * Before a hand-off from an epic's own branch, the epic's target is brought
 * into it (decision-16), so the branch does not drift: what came of it, for
 * startDispatch. Null when its target is not an epic's branch.
 */
async function refreshFor(projectId: string, taskId: string): Promise<Refresh | null> {
  try {
    return await refreshTarget(projectId, taskId);
  } catch {
    return null;
  }
}

/**
 * A conflict bringing the epic's target into its branch goes to an agent, as
 * a landing's does (decision-12): the one the task is handed to merges the
 * target into its own branch first and settles it, and lands it on the
 * epic's branch with its work. The epic's log says so. What its brief adds.
 */
function settleFirst(projectId: string, taskId: string, behind: Refresh | null | undefined): string {
  if (!behind || behind.ok || behind.kind !== 'conflict') return '';
  const { branch, into, files, collided } = behind;
  const epicId = handOffTarget(projectId, taskId).epic?.id;
  if (epicId) void callHost<Result>('noteTask', projectId, epicId, `Bringing ${into} into ${branch} conflicts in ${files.join(', ')}: handed to ${taskId}'s agent to settle on its branch.`);
  const met = collided.map((c) => `${c.sha} ${c.subject}${c.taskId ? ` (${c.taskId})` : ''}`).join('; ');
  return (
    `\n\nBefore you start: ${branch}, which your branch was made from, is behind ${into}, and bringing ${into} in conflicts in ${files.join(', ')}.` +
    (met ? ` On ${into}: ${met}.` : '') +
    ` So, this once, first merge ${into} into your branch (git merge ${into}), keep what both sides meant and commit the merge; then do the task. It lands on ${branch} with your work.`
  );
}

/**
 * A hand-off: its worktree, its brief, and the agent started on it. Hand to…
 * and the chat's `dispatch` both come here; `from` is the chat turn that asked.
 * `behind` is what bringing an epic's target into its branch came to.
 */
function startDispatch(
  projectId: string,
  taskId: string,
  agentId: AgentId,
  model?: string,
  from?: string,
  effort?: string,
  behind?: Refresh | null
): Result<{ run: AgentRun; worktree: Worktree | null }> {
  let prompt: string;
  let worktree: Worktree | null;
  try {
    const located = locateBoard(projectId, { materialize: false });
    const task = located.found ? findV2Task(getV2Dirs(located.brainfilePath), taskId)?.doc.task : undefined;
    // Work waits on what it depends on (decision-15): a dependency still open on this board, or complete with its branch not landed yet.
    const dirs = located.found ? getV2Dirs(located.brainfilePath) : null;
    const waits = dirs ? (task?.dependsOn ?? []).filter((ref) => !ref.includes(':') && (!!findV2Task(dirs, ref) || unlanded(projectId, ref))) : [];
    if (waits.length) return { ok: false, error: `${taskId} waits on ${waits.join(', ')}: hand it off once ${waits.length === 1 ? 'it has' : 'they have'} landed` };
    const contract = task?.contract;
    // It forks from and lands on its target (decision-16): its landsOn, inherited, an epic's own branch, else the trunk.
    const base = prepareTarget(projectId, taskId);
    worktree = prepareWorktree(projectId, taskId, undefined, onlyReads(contract), base);
    prompt = brief(projectId, taskId, worktree, leads.leadOver(projectId, taskId)?.epicId ?? null, base, worktree?.branch ? settleFirst(projectId, taskId, behind) : '');
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  const run = newRun(projectId, agentId, 'dispatch', taskId, { model, effort, from });
  void (async () => {
    try {
      const session = await startups.open(run.id, (signal) => open(projectId, agentId, run.id, model, { at: worktree?.path, effort, signal }), close);
      if (session) await turn(session, run, prompt);
    } catch (err) {
      update(run, { state: 'failed', error: err instanceof Error ? err.message : String(err), endedAt: Date.now() });
    } finally {
      // A read-only checkout keeps nothing: it goes with its run, unless something was left in it.
      if (worktree && !worktree.branch) releaseReader(projectId, taskId);
    }
  })();
  return { ok: true, value: { run: { ...run }, worktree } };
}

/**
 * The person's hand-off (Hand to…): a task with open children gets a lead
 * (decision-15); any other, an agent in its worktree, with who asked on the
 * task. Inside a led tree the person's hand-off is theirs to make.
 */
async function dispatch(projectId: string, taskId: string, agentId: AgentId, model?: string, effort?: string): Promise<Result<AgentRun>> {
  const guarded = leads.guard(projectId, taskId, 'person');
  if (!guarded.ok) return guarded;
  if (leadsChildren(projectId, taskId)) {
    const started = await leads.start(projectId, taskId, agentId, { model, effort, by: 'person' });
    if (!started.ok) return started;
    return started.value.run ? { ok: true, value: started.value.run } : { ok: false, error: `${taskId}'s lead did not start` };
  }
  const behind = await refreshFor(projectId, taskId);
  const handed = handOff(projectId, taskId, agentId, model, effort, behind);
  if (handed.ok) void callHost<Result>('recordDispatch', projectId, taskId, dispatchRecord(agentId, model, effort, 'person'));
  return handed;
}

/** A hand-off with no record and no lead: a send-back is the same hand-off going on. */
function handOff(projectId: string, taskId: string, agentId: AgentId, model?: string, effort?: string, behind?: Refresh | null): Result<AgentRun> {
  const held = reserve(projectId, taskId);
  if (!held.ok) return held;
  try {
    const started = startDispatch(projectId, taskId, agentId, model, undefined, effort, behind);
    return started.ok ? { ok: true, value: started.value.run } : started;
  } finally {
    held.value();
  }
}

function dispatchRecord(agentId: AgentId, model: string | undefined, effort: string | undefined, by: DispatchRecord['by']): DispatchRecord {
  return { agent: agentId, ...(model ? { model } : {}), ...(effort ? { effort } : {}), by, at: new Date().toISOString() };
}

// ── Leads (decision-15) ──────────────────────────────────────────────────────

/** What the lead and its rules read of a document: its place, its dependencies and the files it touches. */
function treeDoc(task: Task, done: boolean, columns: { id: string; title: string }[]): TreeDoc {
  const column = columns.find((c) => c.id === task.column);
  const deliverables = (task.contract?.deliverables ?? []).filter((d) => d.type !== 'research' && d.path).map((d) => d.path);
  const ids = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && !!v.trim()).map((v) => v.trim()) : []);
  return {
    id: task.id,
    title: task.title,
    ...(task.parentId ? { parentId: task.parentId } : {}),
    done,
    ...(column ? { column: column.title, inReview: isReview(column) } : {}),
    dependsOn: ids(task.dependsOn),
    files: [...new Set([...ids(task.relatedFiles), ...deliverables])],
    validation: ids(task.contract?.validation?.commands),
    ...(task.contract?.maxRetries !== undefined ? { maxRetries: task.contract.maxRetries } : {}),
    ...(task.createdAt ? { createdAt: task.createdAt } : {}),
  };
}

function readTree(projectId: string, epicId: string): Tree | null {
  const located = locateBoard(projectId, { materialize: false });
  if (!located.found) return null;
  const dirs = getV2Dirs(located.brainfilePath);
  const columns = readBoardConfig(located.brainfilePath)?.config?.columns ?? [];
  const docs = [
    ...readTasksDir(dirs.boardDir).map((d) => treeDoc(d.task, false, columns)),
    ...readTasksDir(dirs.logsDir).map((d) => treeDoc(d.task, true, columns)),
  ];
  // Only the epic's own children are asked of git: a completed one whose branch is still to land.
  const tree = treeOf(docs, epicId);
  for (const c of tree?.children ?? []) if (c.done && unlanded(projectId, c.id)) c.unlanded = true;
  return tree;
}

/** A task with open children of its own is led, not worked. */
function leadsChildren(projectId: string, taskId: string): boolean {
  const tree = readTree(projectId, taskId);
  return !!tree && !tree.epic.done && openWork(tree).length > 0;
}

/** The most hand-offs at once in a repository: `projects[<repo>].concurrency` in dispatch.json, else 3. */
function limitFor(projectId: string): number {
  const set = readSettings(DATA_DIR).projects?.[projectId]?.concurrency;
  return typeof set === 'number' && set >= 1 ? Math.floor(set) : DEFAULT_LIMIT;
}

const leadKey = (lead: Lead) => `lead:${lead.projectId}\n${lead.epicId}`;

/** One turn of a lead, in its session or a new one: read-only, the board's tools and the desk scoped to its epic. */
function leadTurn(lead: Lead, prompt: (fresh: boolean) => string): LeadTurn {
  const run = newRun(lead.projectId, lead.agentId, 'lead', lead.epicId, { model: lead.model, effort: lead.effort });
  const done = (async () => {
    const key = leadKey(lead);
    try {
      const existing = sessions.get(key);
      const session =
        existing ??
        (await startups.open(run.id, (signal) => open(lead.projectId, lead.agentId, key, lead.model, { withDesk: true, lead: lead.epicId, effort: lead.effort, signal }), close));
      if (session) await turn(session, run, prompt(!existing));
    } catch (err) {
      if (!wasStopped(run)) update(run, { state: 'failed', error: err instanceof Error ? err.message : String(err), endedAt: Date.now() });
    }
    return { ok: run.state === 'done', stopped: run.state === 'stopped', reply: run.reply, error: run.error };
  })();
  return { run: { ...run }, done };
}

const leads = new Leads({
  tree: readTree,
  live: (projectId) => [...runs.values()].filter((r) => r.kind === 'dispatch' && r.projectId === projectId && (LIVE_STATES.has(r.state) || startups.starting(r.id))),
  lastRun: (projectId, taskId) =>
    [...runs.values()].filter((r) => r.kind === 'dispatch' && r.projectId === projectId && r.taskId === taskId).sort((a, b) => b.startedAt - a.startedAt)[0],
  policy: (projectId) => policyFor(DATA_DIR, projectId),
  limit: limitFor,
  turn: leadTurn,
  close(lead) {
    const live = [...runs.values()].find((r) => r.kind === 'lead' && r.projectId === lead.projectId && r.taskId === lead.epicId && LIVE_STATES.has(r.state));
    if (live) void stopRun(live.id);
    const session = sessions.get(leadKey(lead));
    if (session) close(session);
  },
  record: (projectId, epicId, record: LeadRecord | null) => callHost<Result>('recordLead', projectId, epicId, record),
  complete: (projectId, epicId) => callHost<Result>('completeTask', projectId, epicId),
  mergeable(projectId, taskId) {
    try {
      return readyToMerge(projectId).some((r) => r.taskId === taskId && !r.conflicts);
    } catch {
      return false;
    }
  },
  async land(projectId, taskId) {
    const landed = await landAndSettle(projectId, taskId);
    return { ok: landed.ok, said: landed.ok ? `${taskId} was landed: ${landed.value.message}` : `${taskId} could not land: ${landed.error}` };
  },
  branch: (projectId, epicId) => attempt(() => prepareEpicBranch(projectId, epicId)),
  offer: async (projectId, epicId) => attempt(() => offerEpicBranch(projectId, epicId)),
  emit: (lead) => emit({ kind: 'lead', lead }),
  later: (ms, fn) => setTimeout(fn, ms),
});

/** What a git step came to, as a Result: what it threw is the error. */
function attempt<T>(work: () => T): Result<T> {
  try {
    return { ok: true, value: work() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** A lead left on the epic by a restart, or a paused one: resumed. */
async function resumeLead(projectId: string, epicId: string): Promise<Result> {
  const located = locateBoard(projectId, { materialize: false });
  const epic = located.found ? findV2Task(getV2Dirs(located.brainfilePath), epicId)?.doc.task : undefined;
  const record = (epic as { lead?: LeadRecord } | undefined)?.lead;
  const fromBoard = record?.agent ? { agentId: record.agent, model: record.model, effort: record.effort, by: record.by } : undefined;
  return leads.resume(projectId, epicId, fromBoard);
}

// ── The desk: the chat's own dispatch tools (spec-16) ────────────────────────

/** The app's own binary, run as node: no node needed on the Mac, and it reads app.asar. */
const ELECTRON_BIN = process.env.BRAINFILE_ELECTRON_BIN ?? process.execPath;
const DESK_SCRIPT = path.join(__dirname, 'desk-mcp.js');

const hostPending = new Map<number, (result: unknown) => void>();
let nextHostId = 1;

/** A board write through main and the host, so it commits like any other. */
function callHost<T>(method: AgentHostMethod, ...args: unknown[]): Promise<T> {
  const id = nextHostId++;
  return new Promise((resolve) => {
    hostPending.set(id, resolve as (result: unknown) => void);
    send({ kind: 'host', id, method, args });
  });
}

const desk = new DeskBridge(
  deskTools({
    findTask(projectId, taskId) {
      const located = locateBoard(projectId, { materialize: false });
      if (!located.found) return null;
      const found = findV2Task(getV2Dirs(located.brainfilePath), taskId);
      return found ? { title: found.doc.task.title } : null;
    },
    agents: () => allAgents().map(({ id, name }) => ({ id, name })),
    unavailable(agentId) {
      const agent = agentOf(agentId);
      return agent ? whyNot(agent) : `Unknown agent ${agentId}`;
    },
    async start(grant, taskId, agentId, model, effort) {
      if (grant.lead) {
        // A lead hands off its own children, inside the rules it cannot bend (decision-15).
        const may = leads.mayDispatch(grant.projectId, grant.lead, taskId);
        if (!may.ok) return may;
      } else {
        const guarded = leads.guard(grant.projectId, taskId, 'chat');
        if (!guarded.ok) return guarded;
        if (leadsChildren(grant.projectId, taskId)) {
          const started = await leads.start(grant.projectId, taskId, agentId, { model, effort, by: 'chat' });
          if (!started.ok) return started;
          if (!started.value.run) return { ok: false, error: `${taskId}'s lead did not start` };
          return { ok: true, value: { run: started.value.run, branch: null, lead: true } };
        }
      }
      // Before each hand-off from an epic's own branch, the epic's target is brought in (decision-16).
      const behind = await refreshFor(grant.projectId, taskId);
      // Who asked goes on the task first, as Hand to… sets the assignee first.
      // The task is held across that write, so nothing else starts on it meanwhile.
      const held = reserve(grant.projectId, taskId);
      if (!held.ok) return held;
      let written: Result;
      let started: ReturnType<typeof startDispatch>;
      try {
        written = await callHost<Result>('recordDispatch', grant.projectId, taskId, dispatchRecord(agentId, model, effort, grant.lead ? 'lead' : 'chat'));
        started = startDispatch(grant.projectId, taskId, agentId, model, sessions.get(grant.key)?.run?.id, effort, behind);
      } finally {
        held.value();
      }
      if (!started.ok) return started;
      if (grant.lead) leads.dispatched(grant.projectId, grant.lead, taskId);
      return {
        ok: true,
        value: { run: started.value.run, branch: started.value.worktree?.branch ?? null, reads: !!started.value.worktree && !started.value.worktree.branch, ...(written.ok ? {} : { note: `The board record was not written: ${written.error}` }) },
      };
    },
    runs: () => [...runs.values()],
    stop: stopRun,
  })
);

/** A chat session's token for the desk; null when the desk cannot listen, and the chat goes on without it. */
async function grantDesk(grant: Parameters<DeskBridge['grant']>[0]): Promise<string | null> {
  try {
    await desk.listen();
    return desk.grant(grant);
  } catch {
    return null;
  }
}

/** The desk's MCP server for one chat session: the app's binary as node, the socket, the session's token and its board. */
function deskMcp(token: string, projectId: string): acp.McpServer {
  return {
    name: 'desk',
    command: ELECTRON_BIN,
    args: [DESK_SCRIPT],
    env: [
      { name: 'ELECTRON_RUN_AS_NODE', value: '1' },
      { name: DESK_ENV.socket, value: desk.socketPath },
      { name: DESK_ENV.token, value: token },
      { name: DESK_ENV.project, value: projectId },
      { name: DESK_ENV.agents, value: JSON.stringify(allAgents().map((a) => a.id)) },
    ],
  };
}

const ASK_PREAMBLE =
  'You are the dispatcher for this repository’s Brainfile board. Use the brainfile MCP tools to answer and to manage the board: add, sort, move, split and close tasks. ' +
  'If those tools are not available, use the `brainfile` command line in this directory instead (`brainfile list`, `brainfile add`, `brainfile move`, `brainfile --help`); do not edit the board’s files by hand. ' +
  'To have work done, hand it to a coding agent with the desk tools: `dispatch` starts an agent on a task in its own worktree, as Hand to… does (agent and model are optional; by default, you and your model), `runs` says what is running, `stop` stops one. ' +
  'You manage the board; you never change code or run commands, other than the `brainfile` command line and git commands that only read: edits and other commands are refused. Read the code freely to write good tasks. ' +
  'Asked for code work, write the task, or update the one in context: what to do, the files it touches, and a contract whose validation commands prove it is done. Hand it off with dispatch when the person asked for it done; otherwise say it is ready to hand off. ' +
  'Asked to plan an epic, add the epic, then its children under it (parentId), each with dependsOn naming the children that must land first and a draft contract with deliverables and validation commands; add them in that order, so each dependency exists when it is named. Leave priority unset unless the person said how urgent it is. ' +
  'To take an epic, or any task with children, through to the end, dispatch the epic itself: the app starts a lead that checks the plan and hands its children off in order, and inside a led epic only its lead hands off. ' +
  'Otherwise, ask the person before dispatching more than three tasks at once, and never dispatch a task whose dependsOn are still open. Reply briefly, in a sentence or two, with the answer itself. Do not list or mention what you changed on the board or handed off, or that you changed nothing: the window shows the board\u2019s changes and hand-offs under your reply.\n\n';

/**
 * What the person has open as they ask, so "this" and "it" mean something:
 * each document's ID, type and title, one line. Empty when nothing is open.
 */
function lookingAt(brainfilePath: string, ids: string[]): string {
  const dirs = getV2Dirs(brainfilePath);
  const lines = ids
    .map((id) => findV2Task(dirs, id, true))
    .filter((found): found is NonNullable<typeof found> => !!found)
    .map(({ doc, isLog }) => `${doc.task.id} (${doc.task.type ?? 'task'}${isLog ? ', completed' : ''}): "${doc.task.title}"`);
  return lines.length ? `[The person has ${lines.join(' and ')} open on the board as they ask this.]\n\n` : '';
}

async function ask(
  projectId: string,
  agentId: AgentId,
  text: string,
  threadId: string,
  model?: string,
  earlier: ChatTurn[] = [],
  context: string[] = [],
  models: Partial<Record<AgentId, string>> = {},
  effort?: string,
  efforts: Partial<Record<AgentId, string>> = {}
): Promise<Result<AgentRun>> {
  const key = `ask:${threadId}:${agentId}:${model ?? ''}:${effort ?? ''}`;
  const run = newRun(projectId, agentId, 'ask', undefined, { model, effort });
  run.threadId = threadId;
  void (async () => {
    try {
      const existing = sessions.get(key);
      const session = existing ?? (await startups.open(run.id, (signal) => open(projectId, agentId, key, model, { withDesk: true, effort, signal }), close));
      if (!session) return;
      const deskToken = deskTokens.get(session);
      if (deskToken) desk.update(deskToken, { models, efforts, model, effort });
      // A thread picked up again after its session was let go carries its own past.
      const past = existing || earlier.length === 0
        ? ''
        : `Earlier in this conversation:\n${earlier.map((t) => `${t.who === 'you' ? 'Person' : 'You'}: ${t.text}`).join('\n')}\n\n`;
      const located = locateBoard(projectId, { materialize: false });
      const decisions = !existing && located.found ? `${standingDecisions(located.brainfilePath).trim()}\n\n` : '';
      const looking = located.found ? lookingAt(located.brainfilePath, context) : '';
      await turn(session, run, (existing ? '' : ASK_PREAMBLE + (decisions.trim() ? decisions : '') + past) + looking + text);
    } catch (err) {
      update(run, { state: 'failed', error: err instanceof Error ? err.message : String(err), endedAt: Date.now() });
    }
  })();
  return { ok: true, value: { ...run } };
}

/** The task's branch, worktree and live hand-off, for a discussion: git that cannot be read leaves just the hand-off. */
function workOf(projectId: string, taskId: string): DiscussWork {
  let review: ReviewView | null = null;
  try {
    review = reviewOf(projectId, taskId);
  } catch {
    /* not a repository, or git refused: said as no branch */
  }
  const live = liveDispatch(projectId, taskId);
  return {
    review,
    uncommittedFiles: review?.uncommitted ? uncommittedIn(review.path).files : [],
    working: live ? { agent: nameOf(live.agentId), state: live.state, model: live.model, effort: live.effort } : undefined,
  };
}

/**
 * One turn in a discussion of a task (task-35): a chat thread about that one
 * task, at any stage of its life, whose agent reads freely and changes only
 * the task's spec and the board's decisions, with the person's agreement. It
 * has no desk: the person hands the task off. The first turn carries the task
 * as a block the person does not see, ahead of what they said.
 */
async function discuss(
  projectId: string,
  agentId: AgentId,
  text: string,
  threadId: string,
  taskId: string,
  model?: string,
  earlier: ChatTurn[] = [],
  effort?: string
): Promise<Result<AgentRun>> {
  const key = `discuss:${threadId}:${agentId}:${model ?? ''}:${effort ?? ''}`;
  const run = newRun(projectId, agentId, 'ask', taskId, { model, effort });
  run.threadId = threadId;
  void (async () => {
    try {
      const existing = sessions.get(key);
      let preamble = '';
      if (!existing) {
        const located = locateBoard(projectId, { materialize: false });
        if (!located.found) throw new Error(`No board in ${projectId}`);
        // Read before the agent starts, so a task that has gone says so at once.
        preamble = discussPreamble({ ...discussContext(located.brainfilePath, taskId), work: workOf(projectId, taskId) });
        if (earlier.length) preamble += `Earlier in this discussion:\n${earlier.map((t) => `${t.who === 'you' ? 'Person' : 'You'}: ${t.text}`).join('\n')}\n\n`;
      }
      const session = existing ?? (await open(projectId, agentId, key, model, { discuss: taskId, effort }));
      await turn(session, run, preamble + text);
    } catch (err) {
      update(run, { state: 'failed', error: err instanceof Error ? err.message : String(err), endedAt: Date.now() });
    }
  })();
  return { ok: true, value: { ...run } };
}

// ── Review ───────────────────────────────────────────────────────────────────

function review(projectId: string, taskId: string): Result<ReviewView | null> {
  try {
    return { ok: true, value: reviewOf(projectId, taskId) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Merge lands the hand-off (decision-12): an agent still at it refuses, and
 * so does a hand-off starting on it; the rest is landReview's, in the task's
 * worktree, with the contract's validation as its check. A check that fails
 * merges nothing and says the command and its last lines. `to` is where an
 * epic's own branch goes (decision-16): its target, another branch, or kept.
 */
async function checkThenMerge(projectId: string, taskId: string, to?: MergeTo): Promise<Result<{ message: string }>> {
  if (to?.to === 'keep') return keepAsBranch(projectId, taskId);
  const release = leads.landing(projectId, taskId);
  const landed = await landAndSettle(projectId, taskId, to?.to === 'branch' ? to.branch : undefined).finally(release);
  // The lead over it hears how it went (decision-15).
  leads.wake(projectId, taskId, landed.ok ? `${taskId} was merged by the person: ${landed.value.message}` : `${taskId} did not merge: ${landed.error.split('\n')[0]}`);
  return landed;
}

/**
 * Lands a hand-off, then settles its task on the board: done, unless
 * subtasks are left (then it goes back to work). A conflict, or a check that
 * fails once its target is in, goes back to an agent first (decision-12).
 * `into` lands it on another branch than its own target.
 */
async function landAndSettle(projectId: string, taskId: string, into?: string): Promise<Result<{ message: string }>> {
  const landing = await land(projectId, taskId, into);
  if (landing.ok) {
    const located = locateBoard(projectId, { materialize: false });
    const open = located.found ? findV2Task(getV2Dirs(located.brainfilePath), taskId) : null;
    if (!open) return { ok: true, value: { message: landing.message } };
    const settled = await callHost<Result<{ completed: boolean; left: number }>>('settleLanded', projectId, taskId);
    if (settled.ok && settled.value.completed) offerIfLast(projectId, taskId);
    if (!settled.ok) return { ok: true, value: { message: `${landing.message}. ${taskId} stays open: ${settled.error}` } };
    return {
      ok: true,
      value: { message: settled.value.completed ? landing.message : `${landing.message}. ${taskId} stays open: ${settled.value.left} subtask${settled.value.left === 1 ? '' : 's'} left` },
    };
  }
  if (landing.kind === 'conflict' || landing.kind === 'check') {
    const back = await sendBackLanding(projectId, taskId, landing);
    if (back.sent) return { ok: false, error: back.said };
    return { ok: false, error: `${landing.error} ${back.said}${landing.kind === 'check' ? `\n${landing.output}` : ''}` };
  }
  return { ok: false, error: landing.error };
}

/**
 * Sends a landing that failed back to the agent that did the work (task-63):
 * a note in the task's log saying what collided or what failed, and how to
 * settle it (core's sendBackNote, which also says whether it may go back
 * again), then the same agent and model on the same branch.
 */
async function sendBackLanding(
  projectId: string,
  taskId: string,
  landing: Extract<Landing, { kind: 'conflict' | 'check' }>
): Promise<{ sent: boolean; said: string }> {
  const located = locateBoard(projectId, { materialize: false });
  const found = located.found ? findV2Task(getV2Dirs(located.brainfilePath), taskId) : null;
  if (!found) return { sent: false, said: 'Settle it in its worktree, or send it back with a note.' };
  const { task } = found.doc;
  const back = sendBackNote(found.doc, landing);
  if (!back.ok) return { sent: false, said: back.said };
  const last = [...runs.values()].filter((r) => r.kind === 'dispatch' && r.projectId === projectId && r.taskId === taskId).at(-1);
  const named = (id: string | undefined) => (id && allAgents().some((a) => a.id === id && !whyNot(a)) ? (id as AgentId) : null);
  const agentId = named(last?.agentId) ?? named(task.assignee) ?? allAgents().find((a) => !whyNot(a))?.id ?? null;
  if (!agentId) return { sent: false, said: 'No agent is at hand to settle it.' };
  const { note, round } = back;
  const noted = await callHost<Result>('noteTask', projectId, taskId, note);
  if (!noted.ok) return { sent: false, said: `It could not be sent back: ${noted.error}` };
  const started = handOff(projectId, taskId, agentId, last?.model, last?.effort);
  if (!started.ok) return { sent: false, said: `It could not be sent back: ${started.error}` };
  const what = landing.kind === 'conflict' ? `conflicts with ${landing.into} in ${landing.files.slice(0, 3).join(', ')}` : `failed \`${landing.command}\``;
  return { sent: true, said: `${taskId} ${what}: sent back to ${nameOf(agentId)} to settle (${round})` };
}

/**
 * The last child of an epic with a branch of its own landed on it, with no
 * lead over it: the epic is put up to merge (decision-16). A lead does this
 * itself when it finishes.
 */
function offerIfLast(projectId: string, taskId: string): void {
  if (leads.leadOver(projectId, taskId)) return;
  try {
    const epic = handOffTarget(projectId, taskId).epic;
    const tree = epic ? readTree(projectId, epic.id) : null;
    if (epic && tree && !tree.epic.done && tree.children.length && tree.children.every((c) => c.done && !c.unlanded)) offerEpicBranch(projectId, epic.id);
  } catch {
    /* git refused: the epic stays as it is, for the person */
  }
}

/** An epic's own branch kept as a branch (decision-16): its worktree goes, the branch stays, and the epic is done. */
async function keepAsBranch(projectId: string, taskId: string): Promise<Result<{ message: string }>> {
  const kept = settle(projectId, taskId, () => keepBranch(projectId, taskId));
  if (!kept.ok) return kept;
  const done = await callHost<Result>('completeTask', projectId, taskId);
  leads.wake(projectId, taskId, `${taskId} was kept as a branch by the person: ${kept.value.message}`);
  return done.ok ? { ok: true, value: { message: `${kept.value.message}; ${taskId} is done` } } : { ok: true, value: { message: `${kept.value.message}. ${taskId} stays open: ${done.error}` } };
}

/** One landing of a task's hand-off, with its contract's checks; `into` lands it elsewhere than its target. */
async function land(projectId: string, taskId: string, into?: string): Promise<Landing> {
  const live = liveDispatch(projectId, taskId);
  if (live) return { ok: false, kind: 'refused', error: `${nameOf(live.agentId)} is still working on ${taskId}` };
  if (reserved.has(`${projectId}\n${taskId}`)) return { ok: false, kind: 'refused', error: `A hand-off is starting on ${taskId}` };
  let title: string | undefined;
  let commands: string[] = [];
  try {
    const located = locateBoard(projectId, { materialize: false });
    const task = located.found ? findV2Task(getV2Dirs(located.brainfilePath), taskId, true)?.doc.task : undefined;
    title = task?.title;
    commands = (task?.contract?.validation?.commands ?? []).map((c) => c.trim()).filter(Boolean);
  } catch (err) {
    return { ok: false, kind: 'refused', error: err instanceof Error ? err.message : String(err) };
  }
  return landReview(projectId, taskId, { title, check: commands.length ? (at) => runChecks(at, commands, agentEnv()) : undefined, ...(into ? { into } : {}) });
}

/** The board's hand-offs that can merge now; one an agent is still at is not ready yet. */
function ready(projectId: string): Result<ReadyView[]> {
  try {
    return { ok: true, value: readyToMerge(projectId).filter((r) => !liveDispatch(projectId, r.taskId)) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Merge and discard wait for the agent: its worktree is not taken from under it. */
function settle(projectId: string, taskId: string, act: (title?: string) => { message: string }): Result<{ message: string }> {
  const live = liveDispatch(projectId, taskId);
  if (live) return { ok: false, error: `${nameOf(live.agentId)} is still working on ${taskId}` };
  if (reserved.has(`${projectId}\n${taskId}`)) return { ok: false, error: `A hand-off is starting on ${taskId}` };
  try {
    const located = locateBoard(projectId, { materialize: false });
    const title = located.found ? findV2Task(getV2Dirs(located.brainfilePath), taskId, true)?.doc.task.title : undefined;
    return { ok: true, value: act(title) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function stopRun(runId: string): Promise<void> {
  const run = runs.get(runId);
  if (!run) return;
  for (const [id, pending] of asks) if (pending.ask.runId === runId) answerPermission(id, null);
  const session = [...sessions.values()].find((s) => s.run?.id === runId);
  update(run, { state: 'stopped', endedAt: Date.now() });
  // Still starting: there is no session yet, so the startup is what stops.
  startups.stop(runId);
  if (session) {
    await session.connection.cancel({ sessionId: session.sessionId }).catch(() => {});
    if (run.kind === 'dispatch') close(session);
  }
}

/** What is running and asking now, and what ended lately, for a phone that connects mid-run or comes back (task-40). */
function live(): LiveAgents {
  return {
    runs: liveRuns(runs.values()),
    asks: [...asks.values()].map((pending) => pending.ask),
  };
}

// ── Dispatch ─────────────────────────────────────────────────────────────────

const handlers: Record<AgentRequest['method'], (...args: any[]) => unknown> = {
  listAgents: () => listAgents(DATA_DIR),
  agentRegistry: () => registry.list(),
  prepareRegistryAgent: (id: string) => registry.prepare(id),
  listModels: (agentId: AgentId) => listModels(ctx, agentId),
  listModes: (agentId: AgentId) => listModes(ctx, agentId),
  getSettings: () => getSettings(DATA_DIR),
  setSettings: changeSettings,
  dispatch,
  ask,
  discuss,
  stopRun,
  leads: () => leads.views(),
  pauseLead: (projectId: string, epicId: string) => leads.pause(projectId, epicId),
  resumeLead,
  stopLead: (projectId: string, epicId: string) => leads.stop(projectId, epicId),
  boardChanged: (projectId: string) => leads.boardChanged(projectId),
  live,
  review,
  readyToMerge: ready,
  mergeReview: checkThenMerge,
  discardReview: (projectId: string, taskId: string) => settle(projectId, taskId, () => discardReview(projectId, taskId)),
  branches: (projectId: string): Result<BranchesView> => attempt(() => branchesOf(projectId)),
  answerPermission,
};

parentPort.on('message', async (event: { data: AgentRequest | HostReply }) => {
  if ('kind' in event.data) {
    hostPending.get(event.data.id)?.(event.data.result);
    hostPending.delete(event.data.id);
    return;
  }
  const { id, method, args } = event.data;
  let result: unknown;
  try {
    result = await handlers[method](...args);
  } catch (err) {
    result = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  send({ kind: 'reply', id, result });
});

process.on('exit', () => {
  for (const session of sessions.values()) session.child.kill();
  desk.close();
});

// Let go of the agents when main lets go of this process (a reload, a quit),
// so none of them is left running on its own.
process.on('SIGTERM', () => process.exit(0));
