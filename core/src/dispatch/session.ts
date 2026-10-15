/**
 * An ACP session: one agent started over the Agent Client Protocol, given the
 * repository (or a hand-off's worktree) as its working directory and
 * Brainfile's own MCP server (`brainfile mcp`), so it reads and changes the
 * board through the same tools as the CLI. What runs it (the desktop's agents
 * process, a terminal runner) keeps the runs and answers the asks: it passes
 * a SessionContext, and each turn's progress comes back through `update`.
 */
import { spawn, type ChildProcess } from 'child_process';
import { Readable, Writable } from 'stream';
import type * as acp from '@agentclientprotocol/sdk';
import { locateBoard } from '../repo/locate';
import { agentEnv, agentOf, brainfileMcp, lastLine, launchOf, whyNot } from './agents';
import { customName, isCustom } from './agentServers';
import { effortSelect, effortToSet } from './effort';
import { MODELS_TTL_MS, effortsKnown, keepingEfforts, learnEfforts, modelOption, modesOf, readModels, remember, type ModelCache, type SessionModes } from './models';
import { getSettings, policyFor } from './settings';
import { unlessAborted } from './startup';
import type { AgentId, AgentModes, AgentRun, ModelOption, PermissionAsk, Result, RunStep } from './types';

/** The ACP SDK, loaded when the first session opens: it is ESM only, and reading settings or the registry never needs it. */
function sdk(): typeof import('@agentclientprotocol/sdk') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@agentclientprotocol/sdk');
}

/** A chat session nobody has used for this long is let go. */
export const IDLE_MS = 10 * 60_000;

/**
 * How a session answers a tool it asks to run, before the repository's
 * policy: `allow` and `refuse` are answered at once, `usual` goes on to the
 * policy. A discussion's and the board chat's own rules (decision-14).
 */
export type PermissionRule = (toolCall: acp.ToolCallUpdate) => 'allow' | 'refuse' | 'usual';

export interface Session {
  key: string;
  projectId: string;
  agentId: AgentId;
  child: ChildProcess;
  connection: acp.ClientSideConnection;
  sessionId: string;
  /** The run the current turn belongs to. */
  run: AgentRun | null;
  /**
   * The turn's messages, in order. An agent narrates as it goes ("I'll look
   * at the board…"), then calls tools, then answers; only the last message
   * is the reply.
   */
  messages: string[];
  /** The message the last chunk belonged to, when the agent says. */
  messageId: string | null;
  /** A tool ran since the last text: the next text starts a new message. */
  breakNext: boolean;
  /** The turn's tool calls by ID, in the order they started. */
  tools: Map<string, { title: string; tool?: string; failed?: boolean; after: number }>;
  idle: NodeJS.Timeout | null;
  /** The agent's permission modes, and the one the session is in. */
  modes: SessionModes;
  mode: string | null;
  /** The session's own rule for what it may do, asked before its policy; null for a hand-off or a probe. */
  rule: PermissionRule | null;
  /** The mode the session keeps whatever the settings say (a discussion's, the chat's); null to follow the settings. */
  keepsMode: ((modes: AgentModes) => string) | null;
  /** Called once the agent has gone: what was set up for the session (the desk's grant) is let go. */
  release: (() => void) | null;
  /** Config options the session last reported. A probe reads each model's effort from them. */
  configOptions: acp.SessionConfigOption[] | null;
  /** The model select's id, when the agent offers one. */
  modelConfigId: string | null;
  /** The model the session opened on, so a probe can put it back. */
  modelCurrent: string | null;
}

/** What runs sessions gives them: where the data folder is, the open sessions, and where a run's progress and asks go. */
export interface SessionContext {
  /** Settings, the model cache and installed agent servers (dataDir()). */
  dataDir: string;
  /** Open sessions by key: open adds one once it is ready, and one whose agent goes is taken out. */
  sessions: Map<string, Session>;
  /** A run's state changed: its state, activity, reply, steps or error. */
  update(run: AgentRun, patch: Partial<AgentRun>): void;
  /** An agent asks before it acts and the policy is `ask`: the option the person picked, or null to cancel. */
  ask(ask: PermissionAsk): Promise<string | null>;
}

const ACTIVITY: Record<string, string> = {
  read: 'reading',
  edit: 'editing',
  delete: 'editing',
  move: 'editing',
  search: 'searching',
  execute: 'running',
  think: 'thinking',
  fetch: 'fetching',
};

export interface OpenOptions {
  /** False for a probe: no board, no tools. */
  board?: boolean;
  /** Where the agent works when not the repository itself: a hand-off's worktree. */
  at?: string;
  /** MCP servers besides the board's: the desk's, for the board's chat. */
  mcpServers?: acp.McpServer[];
  /** What the session may do, sorted before the repository's policy (Session.rule). */
  rule?: PermissionRule;
  /** The mode the session keeps whatever the settings say (Session.keepsMode). */
  keepsMode?: (modes: AgentModes) => string;
  /** Called once the agent has gone or never started (Session.release). */
  release?: () => void;
  /** The effort to set once the model is selected. Unset starts on medium when the model offers it. */
  effort?: string;
  /** Stops the startup: the agent is not spawned, or is killed. */
  signal?: AbortSignal;
}

export async function open(ctx: SessionContext, projectId: string, agentId: AgentId, key: string, model?: string, options: OpenOptions = {}): Promise<Session> {
  const { board = true, at, mcpServers: extra = [], rule = null, keepsMode = null, release = null, effort, signal } = options;
  const { dataDir, sessions } = ctx;
  const agent = agentOf(dataDir, agentId);
  if (!agent) {
    release?.();
    throw new Error(isCustom(agentId) ? `${customName(agentId)} is no longer among your agents` : `Unknown agent ${agentId}`);
  }
  const missing = whyNot(agent);
  if (missing) {
    release?.();
    throw new Error(missing);
  }
  const cwd = at ?? (board ? locateBoard(projectId, { materialize: false }).projectRoot : projectId);
  const launch = await unlessAborted(signal, launchOf(dataDir, agent)).catch((err) => {
    release?.();
    throw err;
  });
  if (signal?.aborted) {
    release?.();
    throw signal.reason;
  }
  const { ClientSideConnection, PROTOCOL_VERSION, ndJsonStream } = sdk();
  const child = spawn(launch.command, launch.args, { cwd, env: launch.env ?? agentEnv(), stdio: ['pipe', 'pipe', 'pipe'] });
  // Kept so a failure can say why, not just that the agent stopped.
  let stderr = '';
  child.stderr?.on('data', (d) => (stderr = (stderr + d).slice(-4000)));
  const why = () => (lastLine(stderr) ? `: ${lastLine(stderr)}` : '');
  signal?.addEventListener('abort', () => child.kill(), { once: true });
  child.on('error', (err) => {
    sessions.delete(key);
    release?.();
    if (session.run) ctx.update(session.run, { state: 'failed', error: `${agent.name} could not start: ${err.message}`, endedAt: Date.now() });
  });

  const session: Session = {
    key,
    projectId,
    agentId,
    child,
    connection: null!,
    sessionId: '',
    run: null,
    messages: [],
    messageId: null,
    breakNext: false,
    tools: new Map(),
    idle: null,
    modes: null,
    mode: null,
    rule,
    keepsMode,
    release,
    configOptions: null,
    modelConfigId: null,
    modelCurrent: null,
  };
  const stream = ndJsonStream(Writable.toWeb(child.stdin!) as WritableStream<Uint8Array>, Readable.toWeb(child.stdout!) as ReadableStream<Uint8Array>);
  session.connection = new ClientSideConnection(
    () => ({
      requestPermission: (params) => requestPermission(ctx, session, params),
      sessionUpdate: async (params) => {
        const u = params.update;
        if (u.sessionUpdate === 'current_mode_update') session.mode = u.currentModeId;
        const run = session.run;
        if (!run) return;
        if (u.sessionUpdate === 'agent_message_chunk' && u.content.type === 'text') hear(session, u.content.text, u.messageId ?? null);
        else if (u.sessionUpdate === 'agent_thought_chunk' && run.activity !== 'thinking') ctx.update(run, { activity: 'thinking', state: 'working' });
        else if (u.sessionUpdate === 'tool_call') {
          session.breakNext = true;
          session.tools.set(u.toolCallId, { title: u.title, tool: u.kind ?? undefined, after: session.messages.length });
          ctx.update(run, { activity: ACTIVITY[u.kind ?? ''] ?? 'working', state: 'working' });
        } else if (u.sessionUpdate === 'tool_call_update') {
          const known = session.tools.get(u.toolCallId);
          if (known && u.title) known.title = u.title;
          if (known && u.status === 'failed') known.failed = true;
        }
      },
    }),
    stream
  );
  child.on('exit', () => {
    sessions.delete(key);
    release?.();
    if (session.run && (session.run.state === 'working' || session.run.state === 'starting' || session.run.state === 'waiting')) {
      ctx.update(session.run, { state: 'failed', error: `${agent.name} stopped${why()}`, endedAt: Date.now() });
    }
  });

  try {
    await unlessAborted(signal, session.connection.initialize({ protocolVersion: PROTOCOL_VERSION, clientCapabilities: {} }));
  } catch (err) {
    child.kill();
    throw new Error(`${agent.name} did not start${why() || `: ${err instanceof Error ? err.message : String(err)}`}`);
  }
  const mcpServers = board ? [...brainfileMcp(), ...extra] : [];
  const created = await unlessAborted(signal, session.connection.newSession({ cwd, mcpServers }));
  session.sessionId = created.sessionId;
  let configOptions = created.configOptions ?? null;
  const models = modelOption(configOptions);
  session.modes = modesOf(created);
  session.mode = session.modes?.initial ?? null;
  session.modelConfigId = models?.id ?? null;
  session.modelCurrent = models?.current ?? null;
  remember(dataDir, agentId, keepingEfforts(dataDir, agentId, models?.options ?? []), session.modes && { initial: session.modes.initial, options: session.modes.options, bypass: session.modes.bypass });
  if (models && model && model !== models.current && models.options.some((o) => o.value === model)) {
    const updated = await unlessAborted(
      signal,
      session.connection.setSessionConfigOption({ sessionId: created.sessionId, configId: models.id, value: model }).catch(() => null)
    );
    if (updated) configOptions = updated.configOptions;
  }
  session.configOptions = configOptions;
  // A chosen model starts at medium unless the person picked another level this model still offers.
  const thought = model ? effortSelect(configOptions) : null;
  const want = thought ? effortToSet(thought.options, effort) : undefined;
  if (board && thought && want && want !== thought.current) {
    await unlessAborted(
      signal,
      session.connection.setSessionConfigOption({ sessionId: created.sessionId, configId: thought.id, value: want }).catch(() => {})
    );
  }
  if (board) await unlessAborted(signal, applyMode(ctx, session));
  sessions.set(key, session);
  return session;
}

/**
 * Puts a session in the mode the settings ask for: the bypass mode while
 * bypass is on (app-wide or for this repository), else the mode chosen for
 * the agent, else the one it started in, which is its own default.
 */
export async function applyMode(ctx: Pick<SessionContext, 'dataDir'>, session: Session): Promise<void> {
  const modes = session.modes;
  if (!modes) return;
  const chosen = getSettings(ctx.dataDir).modes[session.agentId];
  // A session that keeps its own mode (a discussion, the board's chat: decision-14) never runs in bypass.
  const want = session.keepsMode
    ? session.keepsMode(modes)
    : policyFor(ctx.dataDir, session.projectId) === 'bypass' && modes.bypass
      ? modes.bypass
      : chosen && modes.options.some((m) => m.id === chosen)
        ? chosen
        : modes.initial;
  if (want === session.mode) return;
  try {
    if (modes.via) await session.connection.setSessionConfigOption({ sessionId: session.sessionId, configId: modes.via.configId, value: want });
    else await session.connection.setSessionMode({ sessionId: session.sessionId, modeId: want });
    session.mode = want;
  } catch {
    // The agent refused the change; it keeps the mode it is in.
  }
}

/** Brainfile's own board tools: `brainfile_list_tasks`, `mcp__brainfile__task_add`, `mcp.brainfile.list_tasks`. */
export const BOARD_TOOL = /^(mcp(__|\.))?brainfile[_.]/i;
/** The desk's tools (spec-16): `mcp__desk__dispatch`, `desk.runs`, `mcp.desk.stop`. */
export const DESK_TOOL = /^(mcp(__|\.))?desk(__|[_./])(dispatch|runs|stop)\b/i;

let nextAsk = 1;

/**
 * Answers an agent that asks before it acts: the session's own rule first,
 * then the board's tools (and the desk's) unasked, then the repository's
 * policy; under `ask`, the person, through `ctx.ask`.
 */
export async function requestPermission(
  ctx: Pick<SessionContext, 'dataDir' | 'update' | 'ask'>,
  session: Session,
  params: acp.RequestPermissionRequest
): Promise<acp.RequestPermissionResponse> {
  const allowOnce = params.options.find((o) => o.kind === 'allow_once') ?? params.options.find((o) => o.kind.startsWith('allow'));
  // A discussion changes the task's spec and nothing else, and the board's chat manages the board
  // and hands code to hand-offs (decision-14): what their rule refuses is refused before anyone is asked.
  if (session.rule) {
    const verdict = session.rule(params.toolCall);
    if (verdict === 'allow' && allowOnce) return { outcome: { outcome: 'selected', optionId: allowOnce.optionId } };
    if (verdict === 'refuse') {
      const reject = params.options.find((o) => o.kind === 'reject_once') ?? params.options.find((o) => o.kind.startsWith('reject'));
      return reject ? { outcome: { outcome: 'selected', optionId: reject.optionId } } : { outcome: { outcome: 'cancelled' } };
    }
  }
  // The dispatcher's own board tools are not asked about: every change they
  // make is a commit on the board, and the board is what it was asked to manage.
  // The desk's are the app's own too: a hand-off asks in its pane before it acts.
  const boardTool = BOARD_TOOL.test(params.toolCall.title ?? '') || DESK_TOOL.test(params.toolCall.title ?? '');
  if ((boardTool || policyFor(ctx.dataDir, session.projectId) !== 'ask') && allowOnce) {
    return { outcome: { outcome: 'selected', optionId: allowOnce.optionId } };
  }
  const run = session.run;
  const ask: PermissionAsk = {
    id: `ask-${nextAsk++}`,
    runId: run?.id ?? '',
    projectId: session.projectId,
    agentId: session.agentId,
    title: params.toolCall.title ?? 'Run a tool',
    kind: params.toolCall.kind ?? undefined,
    options: params.options.map((o) => ({ optionId: o.optionId, name: o.name, kind: o.kind })),
  };
  if (run) ctx.update(run, { state: 'waiting' });
  const optionId = await ctx.ask(ask);
  if (run && run.state === 'waiting') ctx.update(run, { state: 'working' });
  return optionId ? { outcome: { outcome: 'selected', optionId } } : { outcome: { outcome: 'cancelled' } };
}

export function close(ctx: Pick<SessionContext, 'sessions'>, session: Session): void {
  if (session.idle) clearTimeout(session.idle);
  session.release?.();
  ctx.sessions.delete(session.key);
  session.child.kill();
}

/** A chunk of the agent's text: a new message when its ID changes or a tool has run since. */
export function hear(session: Pick<Session, 'messages' | 'messageId' | 'breakNext'>, text: string, messageId: string | null): void {
  const fresh = session.messages.length === 0 || session.breakNext || (messageId !== null && messageId !== session.messageId);
  if (fresh) session.messages.push('');
  session.messages[session.messages.length - 1] += text;
  session.messageId = messageId;
  session.breakNext = false;
}

/**
 * What the agent did on the way: its tool calls and what it wrote between
 * them, in order, leaving out the reply itself. Capped, so a long turn
 * stays a list to glance at.
 */
export function stepsOf(session: Pick<Session, 'messages' | 'tools'>, reply: string): RunStep[] {
  const steps: RunStep[] = [];
  const tools = [...session.tools.values()];
  session.messages.forEach((message, i) => {
    for (const t of tools.filter((t) => t.after === i)) steps.push({ kind: 'tool', title: t.title, tool: t.tool, ...(t.failed ? { failed: true } : {}) });
    const text = message.trim();
    if (text && text !== reply) steps.push({ kind: 'note', text });
  });
  for (const t of tools.filter((t) => t.after >= session.messages.length)) steps.push({ kind: 'tool', title: t.title, tool: t.tool, ...(t.failed ? { failed: true } : {}) });
  return steps.slice(0, 60);
}

/** The reply: the turn's last message with something in it, not the narration before it. */
export function replyOf(session: Pick<Session, 'messages'>): string {
  for (let i = session.messages.length - 1; i >= 0; i--) {
    const text = session.messages[i].trim();
    if (text) return text;
  }
  return '';
}

/** Read afresh: stop can land across any await. */
export function wasStopped(run: AgentRun): boolean {
  return run.state === 'stopped';
}

/**
 * One prompt turn on a session; the reply lands whole when the turn ends. A
 * hand-off's session closes after its one turn; any other is let go once
 * idle for IDLE_MS.
 */
export async function turn(ctx: Pick<SessionContext, 'sessions' | 'update'>, session: Session, run: AgentRun, prompt: string): Promise<void> {
  session.run = run;
  session.messages = [];
  session.messageId = null;
  session.breakNext = false;
  session.tools = new Map();
  if (session.idle) clearTimeout(session.idle);
  try {
    // Stopped before its turn came: the agent is not given the prompt.
    if (wasStopped(run)) return;
    ctx.update(run, { state: 'working', activity: 'thinking' });
    const result = await session.connection.prompt({ sessionId: session.sessionId, prompt: [{ type: 'text', text: prompt }] });
    if (run.state === 'stopped') return;
    const stopped = result.stopReason === 'cancelled';
    const reply = replyOf(session);
    ctx.update(run, { state: stopped ? 'stopped' : 'done', reply, steps: stepsOf(session, reply), endedAt: Date.now() });
  } catch (err) {
    if (!wasStopped(run)) ctx.update(run, { state: 'failed', error: err instanceof Error ? err.message : String(err), endedAt: Date.now() });
  } finally {
    session.run = null;
    if (run.kind === 'dispatch') close(ctx, session);
    else session.idle = setTimeout(() => close(ctx, session), IDLE_MS);
  }
}

// ── Probing ──────────────────────────────────────────────────────────────────

/** What the agent reports about its sessions, asked once a day: a throwaway session, no tools, then gone. */
export async function probe(ctx: SessionContext, agentId: AgentId): Promise<Result<ModelCache[string]>> {
  const cached = readModels(ctx.dataDir)[agentId];
  if (cached && 'modes' in cached && effortsKnown(cached.options) && Date.now() - cached.at < MODELS_TTL_MS) return { ok: true, value: cached };
  try {
    const session = await open(ctx, ctx.dataDir, agentId, `probe:${agentId}`, undefined, { board: false });
    try {
      await learnEfforts(ctx.dataDir, session);
    } catch {
      // The model list stands. Efforts are asked again the next time the list is stale.
    } finally {
      close(ctx, session);
    }
    return { ok: true, value: readModels(ctx.dataDir)[agentId] ?? { at: Date.now(), options: [], modes: null } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function listModels(ctx: SessionContext, agentId: AgentId): Promise<Result<ModelOption[]>> {
  const result = await probe(ctx, agentId);
  return result.ok ? { ok: true, value: result.value.options } : result;
}

export async function listModes(ctx: SessionContext, agentId: AgentId): Promise<Result<AgentModes | null>> {
  const result = await probe(ctx, agentId);
  return result.ok ? { ok: true, value: result.value.modes ?? null } : result;
}
