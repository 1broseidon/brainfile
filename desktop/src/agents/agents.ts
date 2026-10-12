/**
 * The agents process: an Electron utility process that starts the person's
 * own coding agents over the Agent Client Protocol and keeps them apart from
 * the board host, so an agent that thinks for minutes never holds up a read.
 *
 * Brainfile is a dispatcher, not a chat app (design.md, Dispatch). An agent
 * gets the repository as its working directory and Brainfile's own MCP server
 * (`brainfile mcp`), so it reads and changes the board through the same tools
 * as the CLI; what it changes reaches the window as ordinary board changes.
 */
import { spawn, spawnSync, type ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Readable, Writable } from 'stream';
import * as acp from '@agentclientprotocol/sdk';
import { findV2Task, getV2Dirs, readBoardConfig, readDecisionDocs, summarizeDecision } from '@brainfile/core';
import { locateBoard } from '@brainfile/core/repo';
import type {
  AgentEvent,
  AgentId,
  AgentInfo,
  AgentMessage,
  AgentMode,
  AgentModes,
  AgentRequest,
  AgentRun,
  ChatTurn,
  DispatchSettings,
  ModelOption,
  PermissionAsk,
  RunStep,
  PermissionPolicy,
  Result,
} from '../shared/api';

const parentPort = process.parentPort;
const DATA_DIR = process.env.BRAINFILE_DATA_DIR ?? path.join(os.homedir(), 'Library', 'Application Support', 'Brainfile');
const AGENTS_DIR = path.join(DATA_DIR, 'agents');
const SETTINGS_FILE = path.join(DATA_DIR, 'dispatch.json');
const MODELS_FILE = path.join(DATA_DIR, 'models.json');
/** How long an agent's model list is trusted before it is asked again. */
const MODELS_TTL_MS = 24 * 60 * 60_000;
/** A chat session nobody has used for this long is let go. */
const IDLE_MS = 10 * 60_000;

function send(message: AgentMessage): void {
  parentPort.postMessage(message);
}

function emit(event: AgentEvent): void {
  send({ kind: 'event', event });
}

function which(command: string): string | null {
  const r = spawnSync('/usr/bin/which', [command], { encoding: 'utf-8' });
  return r.status === 0 && r.stdout.trim() ? r.stdout.trim() : null;
}

// ── Which agents, started how ────────────────────────────────────────────────

interface Launch {
  command: string;
  args: string[];
}

interface Known {
  id: AgentId;
  name: string;
  /** The CLI that carries the person's login; without it the agent cannot run a turn. */
  client: string;
  launch(): Promise<Launch>;
}

/** The ACP registry's Antigravity server, downloaded once into the app's folder. */
const ANTIGRAVITY = {
  version: '1.3.0',
  archive: (arch: string) =>
    `https://dl.google.com/agy-extensions/releases/macos/agy-acp-server-1.3.0-darwin-${arch === 'arm64' ? 'arm64' : 'x86_64'}.zip`,
  cmd: 'agy_acp_server.par',
};

async function antigravityServer(): Promise<string> {
  const dir = path.join(AGENTS_DIR, 'antigravity', ANTIGRAVITY.version);
  const bin = path.join(dir, ANTIGRAVITY.cmd);
  if (fs.existsSync(bin)) return bin;
  fs.mkdirSync(dir, { recursive: true });
  const response = await fetch(ANTIGRAVITY.archive(process.arch));
  if (!response.ok) throw new Error(`Could not download Antigravity's ACP server (${response.status})`);
  const zip = path.join(dir, 'server.zip');
  fs.writeFileSync(zip, Buffer.from(await response.arrayBuffer()));
  const unzip = spawnSync('/usr/bin/ditto', ['-x', '-k', zip, dir]);
  fs.rmSync(zip, { force: true });
  if (unzip.status !== 0 || !fs.existsSync(bin)) throw new Error('Could not unpack Antigravity’s ACP server');
  fs.chmodSync(bin, 0o755);
  return bin;
}

/** In the order the picker shows them. */
const KNOWN: Known[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    client: 'claude',
    launch: async () => ({ command: 'npx', args: ['-y', '@agentclientprotocol/claude-agent-acp@0.89.1'] }),
  },
  {
    id: 'codex',
    name: 'Codex',
    client: 'codex',
    launch: async () => ({ command: 'npx', args: ['-y', '@agentclientprotocol/codex-acp@2.2.2'] }),
  },
  {
    id: 'antigravity',
    name: 'Antigravity',
    client: 'agy',
    launch: async () => ({ command: await antigravityServer(), args: [] }),
  },
  {
    id: 'cursor',
    name: 'Cursor',
    client: 'cursor-agent',
    launch: async () => ({ command: 'cursor-agent', args: ['acp'] }),
  },
  {
    // Grok Build speaks ACP over stdio itself. It offers no permission
    // modes, so working without asking is answered here, ask by ask.
    id: 'grok',
    name: 'Grok Build',
    client: 'grok',
    launch: async () => ({ command: 'grok', args: ['agent', '--no-leader', 'stdio'] }),
  },
];

function listAgents(): AgentInfo[] {
  return KNOWN.map((agent) => {
    const installed = which(agent.client) !== null;
    const downloaded = agent.id !== 'antigravity' || fs.existsSync(path.join(AGENTS_DIR, 'antigravity', ANTIGRAVITY.version, ANTIGRAVITY.cmd));
    return {
      id: agent.id,
      name: agent.name,
      available: installed,
      note: !installed ? 'not installed' : downloaded ? 'your login' : 'downloads once',
    };
  });
}

// ── Settings ─────────────────────────────────────────────────────────────────

/** dispatch.json: the app-wide settings, and per repository a policy that overrides them. */
interface SettingsFile extends Partial<DispatchSettings> {
  projects?: Record<string, { permissions?: PermissionPolicy }>;
}

function readSettings(): SettingsFile {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8')) as SettingsFile;
  } catch {
    return {};
  }
}

function getSettings(): DispatchSettings {
  const file = readSettings();
  return { bypass: file.bypass === true, modes: file.modes ?? {} };
}

async function setSettings(patch: Partial<DispatchSettings>): Promise<DispatchSettings> {
  const file = { ...readSettings(), ...patch };
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(file, null, 2));
  // Sessions already open change mode now, not on their next start.
  await Promise.all([...sessions.values()].map((session) => applyMode(session)));
  return getSettings();
}

/** A repository's own policy wins; otherwise the app-wide switch decides. */
function policyFor(projectId: string): PermissionPolicy {
  const file = readSettings();
  return file.projects?.[projectId]?.permissions ?? (file.bypass ? 'bypass' : 'ask');
}

// ── Models ───────────────────────────────────────────────────────────────────

type ModelCache = Record<string, { at: number; options: ModelOption[]; modes?: AgentModes | null }>;

function readModels(): ModelCache {
  try {
    return JSON.parse(fs.readFileSync(MODELS_FILE, 'utf-8')) as ModelCache;
  } catch {
    return {};
  }
}

type SelectEntry = { value?: string; name: string; description?: string | null; options?: SelectEntry[] };

/** A select config option's values, its groups flattened. */
function flatSelect(option: acp.SessionConfigOption): { value: string; name: string; description?: string }[] {
  const flat: { value: string; name: string; description?: string }[] = [];
  if (option.type !== 'select') return flat;
  for (const entry of option.options as SelectEntry[]) {
    for (const o of entry.options ?? [entry]) if (o.value) flat.push({ value: o.value, name: o.name, description: o.description ?? undefined });
  }
  return flat;
}

/** The session's model option, if the agent offers one: `category: model`, or an option named model. */
function modelOption(options: acp.SessionConfigOption[] | null | undefined) {
  const option = options?.find((o) => o.category === 'model' || o.id === 'model');
  if (!option || option.type !== 'select') return null;
  return { id: option.id, current: option.currentValue as string, options: flatSelect(option).map(({ value, name }) => ({ value, name })) };
}

/** The modes that never ask: Claude's Bypass permissions, Codex's Full access, Antigravity's YOLO. */
const BYPASS_MODE = /bypass|yolo|full.?access|dont.?ask/i;

/**
 * The session's permission modes, as the agent reports them: ACP session
 * modes, or else a config option of category `mode`. `via` says which one
 * changes it.
 */
function modesOf(created: acp.NewSessionResponse): (AgentModes & { via: { configId: string } | null }) | null {
  let options: AgentMode[];
  let initial: string;
  let via: { configId: string } | null = null;
  if (created.modes?.availableModes.length) {
    options = created.modes.availableModes.map((m) => ({ id: m.id, name: m.name, description: m.description ?? undefined }));
    initial = created.modes.currentModeId;
  } else {
    const option = created.configOptions?.find((o) => o.category === 'mode' && o.type === 'select');
    if (!option) return null;
    options = flatSelect(option).map((o) => ({ id: o.value, name: o.name, description: o.description }));
    initial = option.currentValue as string;
    via = { configId: option.id };
  }
  const bypass = options.find((m) => BYPASS_MODE.test(m.id) || BYPASS_MODE.test(m.name))?.id ?? null;
  return { initial, options, bypass, via };
}

function remember(agentId: AgentId, options: ModelOption[], modes: AgentModes | null): void {
  if (!options.length && !modes) return;
  const cache = readModels();
  cache[agentId] = { at: Date.now(), options, modes };
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(MODELS_FILE, JSON.stringify(cache, null, 2));
}

/** What the agent reports about its sessions, asked once a day: a throwaway session, no tools, then gone. */
async function probe(agentId: AgentId): Promise<Result<ModelCache[string]>> {
  const cached = readModels()[agentId];
  if (cached && 'modes' in cached && Date.now() - cached.at < MODELS_TTL_MS) return { ok: true, value: cached };
  try {
    const session = await open(DATA_DIR, agentId, `probe:${agentId}`, undefined, false);
    close(session);
    return { ok: true, value: readModels()[agentId] ?? { at: Date.now(), options: [], modes: null } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function listModels(agentId: AgentId): Promise<Result<ModelOption[]>> {
  const result = await probe(agentId);
  return result.ok ? { ok: true, value: result.value.options } : result;
}

async function listModes(agentId: AgentId): Promise<Result<AgentModes | null>> {
  const result = await probe(agentId);
  return result.ok ? { ok: true, value: result.value.modes ?? null } : result;
}

// ── Sessions ─────────────────────────────────────────────────────────────────

interface Session {
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
  modes: ReturnType<typeof modesOf>;
  mode: string | null;
}

const sessions = new Map<string, Session>();
const runs = new Map<string, AgentRun>();
const asks = new Map<string, { ask: PermissionAsk; resolve: (optionId: string | null) => void }>();
let nextId = 1;

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

function update(run: AgentRun, patch: Partial<AgentRun>): void {
  Object.assign(run, patch);
  emit({ kind: 'run', run: { ...run } });
}

/** The first `node` on PATH that is a real binary, not a version-manager shim script. */
function realNode(): string | null {
  const r = spawnSync('/usr/bin/which', ['-a', 'node'], { encoding: 'utf-8' });
  for (const candidate of (r.stdout ?? '').split('\n').map((l) => l.trim()).filter(Boolean)) {
    try {
      const fd = fs.openSync(candidate, 'r');
      const head = Buffer.alloc(2);
      fs.readSync(fd, head, 0, 2, 0);
      fs.closeSync(fd);
      if (head.toString() !== '#!') return fs.realpathSync(candidate);
    } catch {
      /* try the next */
    }
  }
  return null;
}

/**
 * Brainfile's MCP server, spelled out in full. Some agents (Codex) start MCP
 * servers with a stripped environment, where a `#!/usr/bin/env node` script
 * finds a version-manager shim that never answers; so the command is the
 * real node binary and the CLI's own file, with PATH and HOME passed for the
 * git calls the board makes.
 */
function brainfileMcp(): acp.McpServer[] {
  const bin = which('brainfile');
  if (!bin) return [];
  const cli = fs.realpathSync(bin);
  const node = realNode();
  const env = [
    { name: 'PATH', value: process.env.PATH ?? '' },
    { name: 'HOME', value: os.homedir() },
  ];
  return node ? [{ name: 'brainfile', command: node, args: [cli, 'mcp'], env }] : [{ name: 'brainfile', command: bin, args: ['mcp'], env }];
}

async function open(projectId: string, agentId: AgentId, key: string, model?: string, board = true): Promise<Session> {
  const known = KNOWN.find((k) => k.id === agentId);
  if (!known) throw new Error(`Unknown agent ${agentId}`);
  if (!which(known.client)) throw new Error(`${known.name} is not installed on this Mac`);
  const cwd = board ? locateBoard(projectId, { materialize: false }).projectRoot : projectId;
  const launch = await known.launch();
  const child = spawn(launch.command, launch.args, { cwd, env: process.env, stdio: ['pipe', 'pipe', 'ignore'] });

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
  };
  const stream = acp.ndJsonStream(Writable.toWeb(child.stdin!) as WritableStream<Uint8Array>, Readable.toWeb(child.stdout!) as ReadableStream<Uint8Array>);
  session.connection = new acp.ClientSideConnection(
    () => ({
      requestPermission: (params) => requestPermission(session, params),
      sessionUpdate: async (params) => {
        const u = params.update;
        if (u.sessionUpdate === 'current_mode_update') session.mode = u.currentModeId;
        const run = session.run;
        if (!run) return;
        if (u.sessionUpdate === 'agent_message_chunk' && u.content.type === 'text') hear(session, u.content.text, u.messageId ?? null);
        else if (u.sessionUpdate === 'agent_thought_chunk' && run.activity !== 'thinking') update(run, { activity: 'thinking', state: 'working' });
        else if (u.sessionUpdate === 'tool_call') {
          session.breakNext = true;
          session.tools.set(u.toolCallId, { title: u.title, tool: u.kind ?? undefined, after: session.messages.length });
          update(run, { activity: ACTIVITY[u.kind ?? ''] ?? 'working', state: 'working' });
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
    if (session.run && (session.run.state === 'working' || session.run.state === 'starting' || session.run.state === 'waiting')) {
      update(session.run, { state: 'failed', error: 'The agent stopped', endedAt: Date.now() });
    }
  });

  await session.connection.initialize({ protocolVersion: acp.PROTOCOL_VERSION, clientCapabilities: {} });
  const created = await session.connection.newSession({ cwd, mcpServers: board ? brainfileMcp() : [] });
  session.sessionId = created.sessionId;
  const models = modelOption(created.configOptions);
  session.modes = modesOf(created);
  session.mode = session.modes?.initial ?? null;
  remember(agentId, models?.options ?? [], session.modes && { initial: session.modes.initial, options: session.modes.options, bypass: session.modes.bypass });
  if (models && model && model !== models.current && models.options.some((o) => o.value === model)) {
    await session.connection.setSessionConfigOption({ sessionId: created.sessionId, configId: models.id, value: model }).catch(() => {});
  }
  if (board) await applyMode(session);
  sessions.set(key, session);
  return session;
}

/**
 * Puts a session in the mode the settings ask for: the bypass mode while
 * bypass is on (app-wide or for this repository), else the mode chosen for
 * the agent, else the one it started in, which is its own default.
 */
async function applyMode(session: Session): Promise<void> {
  const modes = session.modes;
  if (!modes) return;
  const chosen = getSettings().modes[session.agentId];
  const want =
    policyFor(session.projectId) === 'bypass' && modes.bypass
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
const BOARD_TOOL = /^(mcp(__|\.))?brainfile[_.]/i;

async function requestPermission(session: Session, params: acp.RequestPermissionRequest): Promise<acp.RequestPermissionResponse> {
  const allowOnce = params.options.find((o) => o.kind === 'allow_once') ?? params.options.find((o) => o.kind.startsWith('allow'));
  // The dispatcher's own board tools are not asked about: every change they
  // make is a commit on the board, and the board is what it was asked to manage.
  const boardTool = BOARD_TOOL.test(params.toolCall.title ?? '');
  if ((boardTool || policyFor(session.projectId) !== 'ask') && allowOnce) {
    return { outcome: { outcome: 'selected', optionId: allowOnce.optionId } };
  }
  const run = session.run;
  const ask: PermissionAsk = {
    id: `ask-${nextId++}`,
    runId: run?.id ?? '',
    projectId: session.projectId,
    agentId: session.agentId,
    title: params.toolCall.title ?? 'Run a tool',
    kind: params.toolCall.kind ?? undefined,
    options: params.options.map((o) => ({ optionId: o.optionId, name: o.name, kind: o.kind })),
  };
  if (run) update(run, { state: 'waiting' });
  emit({ kind: 'permission', ask });
  const optionId = await new Promise<string | null>((resolve) => asks.set(ask.id, { ask, resolve }));
  if (run && run.state === 'waiting') update(run, { state: 'working' });
  return optionId ? { outcome: { outcome: 'selected', optionId } } : { outcome: { outcome: 'cancelled' } };
}

function answerPermission(askId: string, optionId: string | null): void {
  const pending = asks.get(askId);
  if (!pending) return;
  asks.delete(askId);
  emit({ kind: 'permission-done', id: askId });
  pending.resolve(optionId);
}

function close(session: Session): void {
  if (session.idle) clearTimeout(session.idle);
  sessions.delete(session.key);
  session.child.kill();
}

/** One prompt turn on a session; the reply lands whole when the turn ends. */
/** A chunk of the agent's text: a new message when its ID changes or a tool has run since. */
function hear(session: Session, text: string, messageId: string | null): void {
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
function stepsOf(session: Session, reply: string): RunStep[] {
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
function replyOf(session: Session): string {
  for (let i = session.messages.length - 1; i >= 0; i--) {
    const text = session.messages[i].trim();
    if (text) return text;
  }
  return '';
}

async function turn(session: Session, run: AgentRun, prompt: string): Promise<void> {
  session.run = run;
  session.messages = [];
  session.messageId = null;
  session.breakNext = false;
  session.tools = new Map();
  if (session.idle) clearTimeout(session.idle);
  update(run, { state: 'working', activity: 'thinking' });
  try {
    const result = await session.connection.prompt({ sessionId: session.sessionId, prompt: [{ type: 'text', text: prompt }] });
    if (run.state === 'stopped') return;
    const stopped = result.stopReason === 'cancelled';
    const reply = replyOf(session);
    update(run, { state: stopped ? 'stopped' : 'done', reply, steps: stepsOf(session, reply), endedAt: Date.now() });
  } catch (err) {
    update(run, { state: 'failed', error: err instanceof Error ? err.message : String(err), endedAt: Date.now() });
  } finally {
    session.run = null;
    if (run.kind === 'dispatch') close(session);
    else session.idle = setTimeout(() => close(session), IDLE_MS);
  }
}

function newRun(projectId: string, agentId: AgentId, kind: AgentRun['kind'], taskId?: string): AgentRun {
  const run: AgentRun = { id: `run-${nextId++}`, projectId, agentId, kind, taskId, state: 'starting', activity: 'starting', startedAt: Date.now() };
  runs.set(run.id, run);
  emit({ kind: 'run', run: { ...run } });
  return run;
}

// ── Dispatch and ask ─────────────────────────────────────────────────────────

/** How many standing decisions an agent is told about by name; the rest it can list. */
const DECISIONS_SHOWN = 15;

/**
 * The board's standing decisions, one line each, for an agent's first
 * prompt: the choices it should work within (spec-11). Empty when there are
 * none, or when the board cannot be read.
 */
function standingDecisions(brainfilePath: string): string {
  try {
    const types = readBoardConfig(brainfilePath)?.config?.types;
    const current = readDecisionDocs(getV2Dirs(brainfilePath), types)
      .map((doc) => summarizeDecision(doc.task))
      .filter((d) => d.status === 'current');
    if (current.length === 0) return '';
    const lines = current.slice(0, DECISIONS_SHOWN).map((d) => `- ${d.id}${d.claimKey ? ` (${d.claimKey})` : ''}: ${d.title}`);
    if (current.length > DECISIONS_SHOWN) lines.push(`- and ${current.length - DECISIONS_SHOWN} more (\`brainfile list --type decision\`)`);
    return (
      `\n\nStanding decisions on this board:\n${lines.join('\n')}\n` +
      'Work within them. Before going against one, run the brainfile check tool and say so in your reply; record a new lasting choice with decide, which replaces the decision on the same claim key.'
    );
  } catch {
    return '';
  }
}

/**
 * Where finished work goes. A board with a review column wants a person to
 * look before it is done, so the agent moves the task there and leaves
 * completing it to them; a board without one lets the agent complete it.
 */
function finish(brainfilePath: string, taskId: string): string {
  const columns = readBoardConfig(brainfilePath)?.config?.columns ?? [];
  const review = columns.find((c) => /review/i.test(c.id) || /review/i.test(c.title ?? ''));
  return review
    ? `Then move ${taskId} to ${review.title ?? review.id} (column id \`${review.id}\`) for review. Do not complete it: a person completes it after looking at the work.`
    : `Then complete ${taskId}.`;
}

function brief(projectId: string, taskId: string): string {
  const located = locateBoard(projectId, { materialize: false });
  if (!located.found) throw new Error(`No board in ${projectId}`);
  const found = findV2Task(getV2Dirs(located.brainfilePath), taskId);
  if (!found) throw new Error(`Task ${taskId} not found`);
  const { task, body } = found.doc;
  const contract = task.contract
    ? `\n\nIt carries a contract (status ${task.contract.status}). Pick it up with the brainfile MCP contract tool before you start, meet its deliverables and validation, and deliver it when you are done.`
    : '';
  return [
    `You have been handed ${task.id} on this repository's Brainfile board: "${task.title}".`,
    body.trim() ? `\n${body.trim()}` : '',
    contract,
    standingDecisions(located.brainfilePath),
    `\n\nUse the brainfile MCP tools for the board (or, if they are not available, the \`brainfile\` command line here; never edit the board's files by hand): move ${task.id} to In Progress when you start, and when you finish add a short log note to it saying what you did. ${finish(located.brainfilePath, task.id)} Do the work in this repository. Finish with a reply of one or two sentences.`,
  ].join('');
}

async function dispatch(projectId: string, taskId: string, agentId: AgentId, model?: string): Promise<Result<AgentRun>> {
  let prompt: string;
  try {
    prompt = brief(projectId, taskId);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  const run = newRun(projectId, agentId, 'dispatch', taskId);
  void (async () => {
    try {
      const session = await open(projectId, agentId, run.id, model);
      await turn(session, run, prompt);
    } catch (err) {
      update(run, { state: 'failed', error: err instanceof Error ? err.message : String(err), endedAt: Date.now() });
    }
  })();
  return { ok: true, value: { ...run } };
}

const ASK_PREAMBLE =
  'You are the dispatcher for this repository’s Brainfile board. Use the brainfile MCP tools to answer and to manage the board: add, sort, move, split and close tasks. ' +
  'If those tools are not available, use the `brainfile` command line in this directory instead (`brainfile list`, `brainfile add`, `brainfile move`, `brainfile --help`); do not edit the board’s files by hand. ' +
  'Do not change code unless asked. Reply briefly, in a sentence or two, with the answer itself. Do not list or mention what you changed on the board, or that you changed nothing: the window shows the board\u2019s changes under your reply.\n\n';

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
  context: string[] = []
): Promise<Result<AgentRun>> {
  const key = `ask:${threadId}:${agentId}:${model ?? ''}`;
  const run = newRun(projectId, agentId, 'ask');
  run.threadId = threadId;
  void (async () => {
    try {
      const existing = sessions.get(key);
      const session = existing ?? (await open(projectId, agentId, key, model));
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

async function stopRun(runId: string): Promise<void> {
  const run = runs.get(runId);
  if (!run) return;
  for (const [id, pending] of asks) if (pending.ask.runId === runId) answerPermission(id, null);
  const session = [...sessions.values()].find((s) => s.run?.id === runId);
  update(run, { state: 'stopped', endedAt: Date.now() });
  if (session) {
    await session.connection.cancel({ sessionId: session.sessionId }).catch(() => {});
    if (run.kind === 'dispatch') close(session);
  }
}

// ── Dispatch ─────────────────────────────────────────────────────────────────

const handlers: Record<AgentRequest['method'], (...args: any[]) => unknown> = {
  listAgents,
  listModels,
  listModes,
  getSettings,
  setSettings,
  dispatch,
  ask,
  stopRun,
  answerPermission,
};

parentPort.on('message', async (event: { data: AgentRequest }) => {
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
});

// Let go of the agents when main lets go of this process (a reload, a quit),
// so none of them is left running on its own.
process.on('SIGTERM', () => process.exit(0));
