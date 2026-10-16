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
 * settings, sessions, permissions and the brief. A hand-off's life is core's
 * Runner (task-80): the request and the claim on the task, its worktree and
 * branch (core's repo/worktree.ts, spec-14), its run file under
 * `.brainfile/state/runs/`, stopping and landing. This process is its
 * adapter: it answers asks in the band, writes the board through the host,
 * and leads, reviews and opens pull requests. Its Runner works each open
 * board's queue (task-84), leads included, so a hand-off asked for anywhere
 * on this machine (the chat, `brainfile dispatch`, an MCP client) starts
 * here while the window is open, unless a terminal's `brainfile run` takes
 * it first; and the runs another runner works show here too (external.ts),
 * with their asks in the band.
 * The chat hands work off through its brainfile mcp (role chat, task-81):
 * `dispatch` queues, this Runner starts it, and the reply says so from the
 * run's `from`. Handing off a document with children starts its lead instead
 * (core's lead.ts, decision-15, task-83): the Runner runs it, an agent whose
 * brainfile mcp reaches only that tree, which checks the plan, hands the
 * children off in order inside rules the Runner holds, and is woken when one
 * ends or lands; this process shows it (the Lead block, its dock tab) and
 * passes on the board's changes and the person's pause, resume and stop. Discuss
 * (core's dispatch/discuss.ts, task-35, decision-19) is a chat about one task that may change its spec and
 * record decisions, and nothing else. Beside Merge, a hand-off may be opened
 * as a pull request (decision-16): its branch is pushed here, GitHub is asked
 * through main (which holds the person's credentials), and the pull request
 * is followed until it merges (pullRequests.ts). Besides the agents it knows, it starts
 * any ACP server the person names in Settings (custom.ts in core, task-47),
 * the way Zed's agent_servers do.
 */
import * as fs from 'fs';
import { findV2Task, getV2Dirs } from '@brainfile/core';
import {
  AgentRegistry,
  Runner,
  agentOf as agentOfIn,
  allAgents as allAgentsIn,
  applyMode,
  chatPermission,
  close as closeSession,
  dataDir,
  discussContext,
  discussMode,
  discussPermission,
  discussPreamble,
  discussWork,
  getSettings,
  listAgents,
  listModels,
  listModes,
  nameOf as nameOfIn,
  open as openSession,
  readTree,
  setSettings,
  standingDecisions,
  turn as takeTurn,
  whyNot,
  workOf as openWork,
  type OpenOptions as SessionOptions,
  type PermissionRule,
  type RunnerBoard,
  type Session,
} from '@brainfile/core/dispatch';
import {
  branchesOf,
  discardReview,
  keepBranch,
  locateBoard,
  prepareEpicBranch,
  readyToMerge,
  reviewOf,
  unpushed,
  withOpenPullRequest,
  type ClaimTaken,
} from '@brainfile/core/repo';
import { followHandOffPullRequest, openHandOffPullRequest, type PullRequestForge } from '@brainfile/core/forge';
import { ExternalRuns } from './external';
import { liveRuns } from './live';
import { PullRequestWatch } from './pullRequests';
import type {
  AgentEvent,
  AgentForgeMethod,
  AgentHostMethod,
  AgentId,
  AgentMessage,
  AgentRequest,
  AgentRun,
  AgentServer,
  BranchesView,
  ChatTurn,
  DispatchSettings,
  HostReply,
  LiveAgents,
  MergeTo,
  ModelOption,
  PermissionAsk,
  PullRequestRecord,
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
  const working = runner.list().filter((r) => LIVE_STATES.has(r.state)).length;
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

// ── Sessions and runs (core's Runner) ────────────────────────────────────────

const asks = new Map<string, { ask: PermissionAsk; resolve: (optionId: string | null) => void }>();

const LIVE_STATES = new Set(['starting', 'working', 'waiting']);

/** The board writes a hand-off makes, through main and the host, so they commit like any other. */
const hostBoard: RunnerBoard = {
  request: (projectId, taskId, request) => callHost<Result>('recordDispatch', projectId, taskId, request),
  async claim(projectId, taskId, claim, options) {
    const taken = await callHost<Result<ClaimTaken>>('claimDispatch', projectId, taskId, claim, options);
    return taken.ok ? taken.value : { ok: false, held: false, error: taken.error };
  },
  release: (projectId, taskId, holder, outcome) => callHost<Result>('releaseDispatch', projectId, taskId, holder, outcome),
  note: (projectId, taskId, text) => callHost<Result>('noteTask', projectId, taskId, text),
  settleLanded: (projectId, taskId) => callHost<Result<{ completed: boolean; left: number }>>('settleLanded', projectId, taskId),
  park: (projectId, taskId) => callHost<Result>('parkInReview', projectId, taskId),
  lead: (projectId, epicId, action) => callHost<Result>('markLead', projectId, epicId, action),
  complete: (projectId, taskId) => callHost<Result>('completeTask', projectId, taskId),
};

/** How long a chat turn that has ended still owns a hand-off it asked for that starts now. */
const TURN_ENDED_MS = 60_000;

/**
 * Every run this process makes, its sessions and its hand-offs' lives: the
 * request and claim on the task, run files, stop, the queue and landing.
 * Asks are answered in the band; its epics' leads (decision-15) run in it,
 * each change shown in the window. It works each open board's queue
 * (task-84), leads queued anywhere included, and sends a landing that fails
 * back by starting its agent here.
 */
const runner: Runner = new Runner({
  dataDir: DATA_DIR,
  runner: 'desktop',
  board: hostBoard,
  leads: true,
  sendBack: 'start',
  ask(ask) {
    emit({ kind: 'permission', ask });
    return new Promise((resolve) => asks.set(ask.id, { ask, resolve }));
  },
  cancelAsk: (askId) => answerPermission(askId, null),
  onRun: (run) => emit({ kind: 'run', run }),
  onLead: (lead) => emit({ kind: 'lead', lead }),
  fromOf: (projectId, _taskId, request) => (request?.by === 'chat' ? chatTurnAt(projectId, Date.parse(request.at)) : undefined),
});

/**
 * The board's chat turn that was under way when a request was written: the
 * turn a hand-off the chat queued through its brainfile mcp comes from, so
 * its reply says `task-N handed to codex` (task-84).
 */
function chatTurnAt(projectId: string, at: number): string | undefined {
  if (!Number.isFinite(at)) return undefined;
  return runner
    .list()
    .filter((r) => r.kind === 'ask' && !r.taskId && r.projectId === projectId && r.startedAt <= at && (r.endedAt === undefined || (at <= r.endedAt && Date.now() - r.endedAt < TURN_ENDED_MS)))
    .sort((a, b) => b.startedAt - a.startedAt)[0]?.id;
}

/** Runs another runner on this machine works, read through this Runner (task-84). */
const external = new ExternalRuns({
  others: (projectId) => runner.others(projectId),
  answer: (runId, askId, optionId, projectId) => runner.answerAsk(runId, askId, optionId, projectId),
  emit,
});

/** How often boards with a run from elsewhere still going are read again, so one whose runner went away without a word is said. */
const EXTERNAL_LOOK_MS = 5_000;
setInterval(() => {
  for (const projectId of external.going()) external.look(projectId);
}, EXTERNAL_LOOK_MS).unref();
const leads = runner.leads;
const sessions = runner.sessions;
const startups = runner.startups;
const ctx = runner.ctx;

function update(run: AgentRun, patch: Partial<AgentRun>): void {
  runner.update(run, patch);
}

interface OpenOptions extends Omit<SessionOptions, 'mcpServers' | 'rule' | 'keepsMode' | 'release' | 'role' | 'leadScope'> {
  /** The board's chat: its brainfile mcp hands work off (role chat, task-81). */
  chat?: boolean;
  /** The task a discussion is about: it reads, and changes only that task's spec. */
  discuss?: string;
}

/**
 * Opens a session (core's open) with what this app adds: the role its
 * brainfile mcp is told, and the rule and mode a discussion and the chat keep.
 */
function open(projectId: string, agentId: AgentId, key: string, model?: string, options: OpenOptions = {}): Promise<Session> {
  const { chat = false, discuss, ...rest } = options;
  // A discussion changes the task's spec and nothing else; the board's chat manages the board and hands
  // code to hand-offs (decision-14): what their rule refuses is refused before anyone is asked.
  const rule: PermissionRule | undefined = discuss
    ? (call) => discussPermission(call.title ?? '', call.kind)
    : chat
      ? (call) => chatPermission(call.title ?? '', call.kind, call.rawInput)
      : undefined;
  return openSession(ctx, projectId, agentId, key, model, {
    ...rest,
    // What its board server lists (task-81): the chat dispatches, a discussion never does. A lead's session is core's (the Runner's).
    ...(discuss ? { role: 'discuss' as const } : chat ? { role: 'chat' as const } : {}),
    rule,
    // A discussion and the board's chat never run in bypass, and only read when they can.
    keepsMode: discuss || chat ? discussMode : undefined,
  });
}

/**
 * The person's answer in the band (or on a phone): to one of this window's
 * asks, or through its runner's answer file to another's (task-84). One
 * that cannot be written stays up, to answer where it is waiting.
 */
function answer(askId: string, optionId: string | null): void {
  if (external.has(askId)) void external.answer(askId, optionId);
  else answerPermission(askId, optionId);
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

function newRun(projectId: string, agentId: AgentId, kind: AgentRun['kind'], taskId?: string, extra: Pick<AgentRun, 'model' | 'effort' | 'from' | 'threadId'> = {}): AgentRun {
  return runner.newRun(projectId, agentId, kind, taskId, extra);
}

// ── Dispatch and ask ─────────────────────────────────────────────────────────

/** The live hand-off on a task, if any, whichever runner on this machine has it. */
function liveDispatch(projectId: string, taskId: string): AgentRun | undefined {
  return runner.liveDispatch(projectId, taskId);
}

/**
 * The person's hand-off (Hand to…): a task with open children gets a lead
 * (decision-15); any other, the request on the task and an agent in its
 * worktree, through the runner. Inside a led tree the person's hand-off is
 * theirs to make.
 */
async function dispatch(projectId: string, taskId: string, agentId: AgentId, model?: string, effort?: string): Promise<Result<AgentRun>> {
  const guarded = runner.guard(projectId, taskId, 'person');
  if (!guarded.ok) return guarded;
  if (leadsChildren(projectId, taskId)) {
    const started = await runner.lead(projectId, taskId, { agent: agentId, model, effort, by: 'person' });
    if (!started.ok) return started;
    return started.value.run ? { ok: true, value: started.value.run } : { ok: false, error: `${taskId}'s lead did not start` };
  }
  const started = await runner.dispatch(projectId, taskId, { agent: agentId, model, effort, by: 'person' });
  return started.ok ? { ok: true, value: started.value.run } : started;
}

// ── Leads (decision-15) ──────────────────────────────────────────────────────

/** A task with open children of its own is led, not worked. */
function leadsChildren(projectId: string, taskId: string): boolean {
  const tree = readTree(projectId, taskId);
  return !!tree && !tree.epic.done && openWork(tree).length > 0;
}

/** What a git step came to, as a Result: what it threw is the error. */
function attempt<T>(work: () => T): Result<T> {
  try {
    return { ok: true, value: work() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** A lead paused here, or one another runner leads, or one on the board no runner leads: resumed, here when none leads it. */
async function resumeLead(projectId: string, epicId: string): Promise<Result> {
  const resumed = await runner.resumeLead(projectId, epicId, { here: true });
  return resumed.ok ? { ok: true, value: undefined } : resumed;
}

// ── Main: the host's board writes and the forge ──────────────────────────────

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

/** A call on main's GitHub client: the person's credentials stay there (decision-16). */
function callForge<T>(method: AgentForgeMethod, ...args: unknown[]): Promise<T> {
  const id = nextHostId++;
  return new Promise((resolve) => {
    hostPending.set(id, resolve as (result: unknown) => void);
    send({ kind: 'forge', id, method, args });
  });
}

const forge: PullRequestForge = {
  openPullRequest: (repo, pr) => callForge('openPullRequest', repo, pr),
  pullRequestState: (repo, number, force) => callForge('pullRequestState', repo, number, force),
};

const ASK_PREAMBLE =
  'You are the dispatcher for this repository’s Brainfile board. Use the brainfile MCP tools to answer and to manage the board: add, sort, move, split and close tasks. ' +
  'If those tools are not available, use the `brainfile` command line in this directory instead (`brainfile list`, `brainfile add`, `brainfile move`, `brainfile --help`); do not edit the board’s files by hand. ' +
  'To have work done, hand it to a coding agent with the brainfile tools: `dispatch` hands a task off, and this app starts it at once in its own worktree, as Hand to… does (name the agent, model and effort as the line ahead of the person\u2019s message says); `dispatch_status` says what is running and queued, `dispatch_stop` stops a run, and `dispatch_lead` pauses or resumes an epic\u2019s lead. ' +
  'You manage the board; you never change code or run commands, other than the `brainfile` command line and git commands that only read: edits and other commands are refused. Read the code freely to write good tasks. ' +
  'Asked for code work, write the task, or update the one in context: what to do, the files it touches, and a contract whose validation commands prove it is done. Hand it off with dispatch when the person asked for it done; otherwise say it is ready to hand off. ' +
  'Asked to plan an epic, add the epic, then its children under it (parentId), each with dependsOn naming the children that must land first and a draft contract with deliverables and validation commands; add them in that order, so each dependency exists when it is named. Leave priority unset unless the person said how urgent it is. ' +
  'To take an epic, or any task with children, through to the end, dispatch the epic itself: a lead checks the plan and hands its children off in order, and inside a led epic only its lead hands off. ' +
  'Otherwise, ask the person before dispatching more than three tasks at once, and never dispatch a task whose dependsOn are still open. Reply briefly, in a sentence or two, with the answer itself. Do not list or mention what you changed on the board or handed off, or that you changed nothing: the window shows the board\u2019s changes and hand-offs under your reply.\n\n';

/**
 * Who a hand-off from the chat goes to, each turn, as Hand to… would choose:
 * the chat's own agent and model unless the person names another, then the
 * person's model and effort for that agent on this board.
 */
function handOffsTo(agentId: AgentId, model: string | undefined, effort: string | undefined, models: Partial<Record<AgentId, string>>, efforts: Partial<Record<AgentId, string>>): string {
  const said = (id: AgentId, m?: string, e?: string) => `agent "${id}"${m ? `, model "${m}"` : ''}${m && e ? `, effort "${e}"` : ''}`;
  const others = allAgents()
    .filter((a) => a.id !== agentId && !whyNot(a) && models[a.id])
    .map((a) => said(a.id, models[a.id], efforts[a.id]));
  return `[Hand-offs: unless the person names another agent, ${said(agentId, model, effort)}.${others.length ? ` For another agent, the person's choice: ${others.join('; ')}.` : ''}]\n\n`;
}

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
  const run = newRun(projectId, agentId, 'ask', undefined, { model, effort, threadId });
  void (async () => {
    try {
      const existing = sessions.get(key);
      const session = existing ?? (await startups.open(run.id, (signal) => open(projectId, agentId, key, model, { chat: true, effort, signal }), close));
      if (!session) return;
      // A thread picked up again after its session was let go carries its own past.
      const past = existing || earlier.length === 0
        ? ''
        : `Earlier in this conversation:\n${earlier.map((t) => `${t.who === 'you' ? 'Person' : 'You'}: ${t.text}`).join('\n')}\n\n`;
      const located = locateBoard(projectId, { materialize: false });
      const decisions = !existing && located.found ? `${standingDecisions(located.brainfilePath).trim()}\n\n` : '';
      const looking = located.found ? lookingAt(located.brainfilePath, context) : '';
      await turn(session, run, (existing ? '' : ASK_PREAMBLE + (decisions.trim() ? decisions : '') + past) + handOffsTo(agentId, model, effort, models, efforts) + looking + text);
    } catch (err) {
      update(run, { state: 'failed', error: err instanceof Error ? err.message : String(err), endedAt: Date.now() });
    }
  })();
  return { ok: true, value: { ...run } };
}

/**
 * One turn in a discussion of a task (task-35): a chat thread about that one
 * task, at any stage of its life, whose agent reads freely and changes only
 * the task's spec and the board's decisions, with the person's agreement. It
 * hands nothing off: the person hands the task off. The first turn carries the task
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
  const run = newRun(projectId, agentId, 'ask', taskId, { model, effort, threadId });
  void (async () => {
    try {
      const existing = sessions.get(key);
      let preamble = '';
      if (!existing) {
        const located = locateBoard(projectId, { materialize: false });
        if (!located.found) throw new Error(`No board in ${projectId}`);
        // Read before the agent starts, so a task that has gone says so at once.
        preamble = discussPreamble({ ...discussContext(located.brainfilePath, taskId), work: discussWork(projectId, taskId, runner) });
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
  if (to?.to === 'pull-request') {
    // Its branch into its target, as a pull request (decision-16): it lands when that merges on the forge.
    const opened = await openPullRequest(projectId, taskId);
    return opened.ok ? { ok: true, value: { message: `Opened pull request #${opened.value.number} into ${opened.value.base}` } } : opened;
  }
  const release = leads.landing(projectId, taskId);
  const landed = await landAndSettle(projectId, taskId, to?.to === 'branch' ? to.branch : undefined).finally(release);
  // The lead over it hears how it went (decision-15).
  leads.wake(projectId, taskId, landed.ok ? `${taskId} was merged by the person: ${landed.value.message}` : `${taskId} did not merge: ${landed.error.split('\n')[0]}`);
  return landed;
}

/**
 * Lands a hand-off, then settles its task on the board (the runner's land):
 * done, unless subtasks are left. A conflict, or a check that fails once its
 * target is in, goes back to an agent first (decision-12). `into` lands it
 * on another branch than its own target.
 */
async function landAndSettle(projectId: string, taskId: string, into?: string): Promise<Result<{ message: string }>> {
  const landed = await runner.land(projectId, taskId, into ? { into } : {});
  return landed.ok ? { ok: true, value: { message: landed.message } } : { ok: false, error: landed.error };
}

/** An epic's own branch kept as a branch (decision-16): its worktree goes, the branch stays, and the epic is done. */
async function keepAsBranch(projectId: string, taskId: string): Promise<Result<{ message: string }>> {
  const kept = settle(projectId, taskId, () => keepBranch(projectId, taskId));
  if (!kept.ok) return kept;
  const done = await callHost<Result>('completeTask', projectId, taskId);
  leads.wake(projectId, taskId, `${taskId} was kept as a branch by the person: ${kept.value.message}`);
  return done.ok ? { ok: true, value: { message: `${kept.value.message}; ${taskId} is done` } } : { ok: true, value: { message: `${kept.value.message}. ${taskId} stays open: ${done.error}` } };
}

/**
 * Opens the hand-off as a pull request (decision-16): an agent still at it
 * refuses, as Merge does; the rest is core's, which pushes the branch, asks
 * GitHub through main and writes `pullRequest:` on the task through the host.
 */
async function openPullRequest(projectId: string, taskId: string): Promise<Result<PullRequestRecord>> {
  const busy = runner.busy(projectId, taskId);
  if (busy) return { ok: false, error: busy };
  const opened = await openHandOffPullRequest(projectId, taskId, { github: forge, record: (record, note) => recordPullRequest(projectId, taskId, record, note) });
  if (opened.ok) leads.wake(projectId, taskId, `${taskId} was opened as pull request #${opened.value.number} into ${opened.value.base}: it lands when that merges on GitHub`);
  return opened;
}

async function recordPullRequest(projectId: string, taskId: string, record: PullRequestRecord, note: string): Promise<void> {
  const written = await callHost<Result>('recordPullRequest', projectId, taskId, record, note);
  if (!written.ok) throw new Error(written.error);
}

const pullRequests = new PullRequestWatch({
  open: (projectId) => [...withOpenPullRequest(projectId)],
  follow: (projectId, taskId) => followHandOffPullRequest(projectId, taskId, { github: forge, record: (record, note) => recordPullRequest(projectId, taskId, record, note) }),
  settle: (projectId, taskId) => callHost<Result>('settleLanded', projectId, taskId),
  busy: (projectId, taskId) => !!runner.busy(projectId, taskId),
  said: (projectId, taskId, text) => leads.wake(projectId, taskId, text),
});

/**
 * The board's hand-offs that can merge now; one an agent is still at is not
 * ready yet, and one opened as a pull request waits on the forge. Asking is
 * also when those pull requests are followed (at most once a minute each).
 */
function ready(projectId: string): Result<ReadyView[]> {
  void pullRequests.check(projectId);
  try {
    return { ok: true, value: readyToMerge(projectId).filter((r) => !liveDispatch(projectId, r.taskId)) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Merge and discard wait for the agent: its worktree is not taken from under it. */
function settle(projectId: string, taskId: string, act: (title?: string) => { message: string }): Result<{ message: string }> {
  const busy = runner.busy(projectId, taskId);
  if (busy) return { ok: false, error: busy };
  try {
    const located = locateBoard(projectId, { materialize: false });
    const title = located.found ? findV2Task(getV2Dirs(located.brainfilePath), taskId, true)?.doc.task.title : undefined;
    return { ok: true, value: act(title) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Stops a run: one of this process's, or another runner's on this machine through its run file (task-80). */
async function stopRun(runId: string): Promise<void> {
  await runner.stop(runId, external.projectOf(runId));
}

/**
 * What is running and asking now, and what ended lately, whichever runner on
 * this machine runs it (task-84): for the window when it opens, and a phone
 * that connects mid-run or comes back (task-40).
 */
function live(): LiveAgents {
  return {
    runs: liveRuns([...runner.list(), ...external.list()]),
    asks: [...[...asks.values()].map((pending) => pending.ask), ...external.asks()],
  };
}

/**
 * A board changed: its queue is worked again (a request the chat, a terminal
 * or an MCP client wrote), its leads hear it, and its runs from elsewhere
 * are read.
 */
function boardChanged(projectId: string): void {
  runner.boardChanged(projectId);
  void runner.work(projectId);
  external.look(projectId);
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
  pauseLead: (projectId: string, epicId: string) => runner.pauseLead(projectId, epicId),
  resumeLead,
  stopLead: (projectId: string, epicId: string) => runner.stopLead(projectId, epicId),
  boardChanged,
  runsChanged: (projectId: string) => external.look(projectId),
  live,
  review,
  readyToMerge: ready,
  mergeReview: checkThenMerge,
  discardReview: (projectId: string, taskId: string) => settle(projectId, taskId, () => discardReview(projectId, taskId)),
  branches: (projectId: string): Result<BranchesView> => attempt(() => branchesOf(projectId)),
  openPullRequest,
  unpushed: (projectId: string): Result<ReturnType<typeof unpushed>> => attempt(() => unpushed(projectId)),
  answerPermission: answer,
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
  runner.close();
});

/** How long letting go may take when main lets go of this process, before it goes anyway. */
const QUIT_MS = 5_000;

// Let go of the agents when main lets go of this process (a reload, a quit),
// so none of them is left running on its own: each hand-off ends stopped and
// its claim says so, through the host, which main stops only after this
// process, so the next launch starts none of them again by itself.
process.on('SIGTERM', () => {
  const late = new Promise((resolve) => setTimeout(resolve, QUIT_MS));
  void Promise.race([runner.quit(), late]).finally(() => process.exit(0));
});
