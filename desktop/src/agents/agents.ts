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
 * and leads, reviews and opens pull requests.
 * The chat's agents also get the desk (desk.ts, spec-16): `dispatch`, `runs`
 * and `stop`, so a chat can hand work off the way Hand to… does. Handing off
 * a document with children starts its lead instead (core's lead.ts,
 * decision-15, task-83): the Runner runs it, an agent whose brainfile mcp
 * reaches only that tree, which checks the plan, hands the children off in
 * order inside rules the Runner holds, and is woken when one ends or lands;
 * this process shows it (the Lead block, its dock tab) and passes on the
 * board's changes and the person's pause, resume and stop. Discuss
 * (discuss.ts, task-35) is a chat about one task that may change its spec and
 * record decisions, and nothing else. Beside Merge, a hand-off may be opened
 * as a pull request (decision-16): its branch is pushed here, GitHub is asked
 * through main (which holds the person's credentials), and the pull request
 * is followed until it merges (pullRequests.ts). Besides the agents it knows, it starts
 * any ACP server the person names in Settings (custom.ts in core, task-47),
 * the way Zed's agent_servers do.
 */
import * as fs from 'fs';
import * as path from 'path';
import type * as acp from '@agentclientprotocol/sdk';
import { findV2Task, getV2Dirs } from '@brainfile/core';
import {
  AgentRegistry,
  Runner,
  agentOf as agentOfIn,
  allAgents as allAgentsIn,
  applyMode,
  close as closeSession,
  dataDir,
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
  handOffTarget,
  keepBranch,
  locateBoard,
  offerEpicBranch,
  prepareEpicBranch,
  readyToMerge,
  reviewOf,
  uncommittedIn,
  unpushed,
  withOpenPullRequest,
  type ClaimTaken,
} from '@brainfile/core/repo';
import { followHandOffPullRequest, openHandOffPullRequest, type PullRequestForge } from '@brainfile/core/forge';
import { DESK_ENV, DeskBridge, deskTools } from './desk';
import { chatPermission, discussContext, discussMode, discussPermission, discussPreamble, type DiscussWork } from './discuss';
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

/**
 * Every run this process makes, its sessions and its hand-offs' lives: the
 * request and claim on the task, run files, stop, the queue and landing.
 * Asks are answered in the band; its epics' leads (decision-15) run in it,
 * each change shown in the window. It does not work the whole queue yet
 * (task-84): it starts what its leads queue, and leads asked for here.
 */
const runner: Runner = new Runner({
  dataDir: DATA_DIR,
  runner: 'desktop',
  board: hostBoard,
  ask(ask) {
    emit({ kind: 'permission', ask });
    return new Promise((resolve) => asks.set(ask.id, { ask, resolve }));
  },
  cancelAsk: (askId) => answerPermission(askId, null),
  onRun: (run) => emit({ kind: 'run', run }),
  onLead: (lead) => emit({ kind: 'lead', lead }),
  landed: (projectId, taskId) => offerIfLast(projectId, taskId),
});
const leads = runner.leads;
const sessions = runner.sessions;
const startups = runner.startups;
const ctx = runner.ctx;

function update(run: AgentRun, patch: Partial<AgentRun>): void {
  runner.update(run, patch);
}

interface OpenOptions extends Omit<SessionOptions, 'mcpServers' | 'rule' | 'keepsMode' | 'release'> {
  /** Gives a chat session the desk's tools besides the board's. */
  withDesk?: boolean;
  /** The task a discussion is about: it reads, and changes only that task's spec. */
  discuss?: string;
}

/** A chat session's right to the desk; a hand-off, a probe or a discussion has none. */
const deskTokens = new WeakMap<Session, string>();

/**
 * Opens a session (core's open) with what this app adds: the desk for a
 * chat, and the rule and mode a discussion and the chat keep.
 */
async function open(projectId: string, agentId: AgentId, key: string, model?: string, options: OpenOptions = {}): Promise<Session> {
  const { withDesk = false, discuss, ...rest } = options;
  const board = rest.board ?? true;
  const deskToken = board && withDesk ? await grantDesk({ projectId, agentId, model, effort: rest.effort, models: {}, efforts: {}, key }) : null;
  // A discussion changes the task's spec and nothing else; the board's chat manages the board and hands
  // code to hand-offs (decision-14): what their rule refuses is refused before anyone is asked.
  const rule: PermissionRule | undefined = discuss
    ? (call) => discussPermission(call.title ?? '', call.kind)
    : deskToken
      ? (call) => chatPermission(call.title ?? '', call.kind, call.rawInput)
      : undefined;
  const session = await openSession(ctx, projectId, agentId, key, model, {
    ...rest,
    // What its board server lists (task-81): a discussion never hands off. A lead's session is core's (the Runner's).
    ...(discuss ? { role: 'discuss' as const } : deskToken ? { role: 'chat' as const } : {}),
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
      // In a led tree only its lead hands off (decision-15); the lead does so through its brainfile mcp, not the desk.
      const guarded = runner.guard(grant.projectId, taskId, 'chat');
      if (!guarded.ok) return guarded;
      if (leadsChildren(grant.projectId, taskId)) {
        const started = await runner.lead(grant.projectId, taskId, { agent: agentId, model, effort, by: 'chat' });
        if (!started.ok) return started;
        if (!started.value.run) return { ok: false, error: `${taskId}'s lead did not start` };
        return { ok: true, value: { run: started.value.run, branch: null, lead: true } };
      }
      // The request on the task, then the agent started, the task held across both;
      // before a hand-off from an epic's own branch, the epic's target is brought in (decision-16).
      const started = await runner.dispatch(grant.projectId, taskId, {
        agent: agentId,
        model,
        effort,
        by: 'chat',
        from: sessions.get(grant.key)?.run?.id,
      });
      if (!started.ok) return started;
      const { run, worktree, note } = started.value;
      return { ok: true, value: { run, branch: worktree?.branch ?? null, reads: !!worktree && !worktree.branch, ...(note ? { note } : {}) } };
    },
    runs: () => runner.list(),
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
  'To have work done, hand it to a coding agent with the desk tools: the desk\u2019s `dispatch` starts an agent on a task in its own worktree, as Hand to… does (agent and model are optional; by default, you and your model), `runs` says what is running, `stop` stops one. The brainfile tools\u2019 own `dispatch` only queues a task for a runner; use the desk\u2019s. ' +
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
  const run = newRun(projectId, agentId, 'ask', undefined, { model, effort, threadId });
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
  const run = newRun(projectId, agentId, 'ask', taskId, { model, effort, threadId });
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
  await runner.stop(runId);
}

/** What is running and asking now, and what ended lately, for a phone that connects mid-run or comes back (task-40). */
function live(): LiveAgents {
  return {
    runs: liveRuns(runner.list()),
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
  pauseLead: (projectId: string, epicId: string) => runner.pauseLead(projectId, epicId),
  resumeLead,
  stopLead: (projectId: string, epicId: string) => runner.stopLead(projectId, epicId),
  boardChanged: (projectId: string) => runner.boardChanged(projectId),
  live,
  review,
  readyToMerge: ready,
  mergeReview: checkThenMerge,
  discardReview: (projectId: string, taskId: string) => settle(projectId, taskId, () => discardReview(projectId, taskId)),
  branches: (projectId: string): Result<BranchesView> => attempt(() => branchesOf(projectId)),
  openPullRequest,
  unpushed: (projectId: string): Result<ReturnType<typeof unpushed>> => attempt(() => unpushed(projectId)),
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
  runner.close();
  desk.close();
});

// Let go of the agents when main lets go of this process (a reload, a quit),
// so none of them is left running on its own.
process.on('SIGTERM', () => process.exit(0));
