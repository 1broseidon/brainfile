/**
 * The agents process: an Electron utility process that starts the person's
 * own coding agents over the Agent Client Protocol and keeps them apart from
 * the board host, so an agent that thinks for minutes never holds up a read.
 *
 * Brainfile is a dispatcher, not a chat app (design.md, Dispatch). An agent
 * gets the repository as its working directory and Brainfile's own MCP server
 * (`brainfile mcp`), so it reads and changes the board through the same tools
 * as the CLI; what it changes reaches the window as ordinary board changes.
 * A hand-off gets its own worktree and branch instead (worktree.ts, spec-14).
 * The chat's agents also get the desk (desk.ts, spec-16): `dispatch`, `runs`
 * and `stop`, so a chat can hand work off the way Hand to… does. Discuss
 * (discuss.ts, task-35) is a chat about one task that may change its spec and
 * record decisions, and nothing else. Besides the agents it knows, it starts
 * any ACP server the person names in Settings (custom.ts, task-47), the way
 * Zed's agent_servers do.
 */
import { spawn, spawnSync, type ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Readable, Writable } from 'stream';
import * as acp from '@agentclientprotocol/sdk';
import { findV2Task, getV2Dirs, readBoardConfig, readDecisionDocs, summarizeDecision } from '@brainfile/core';
import { locateBoard } from '@brainfile/core/repo';
import { discardReview, mergeReview, onlyReads, prepareWorktree, readyToMerge, releaseReader, reviewOf, uncommittedIn, type Worktree } from './worktree';
import { DESK_ENV, DeskBridge, deskTools } from './desk';
import { customLaunch } from './custom';
import { AgentRegistry } from './registry';
import { readSettingsFile, settingsOf, writeSettings, type SettingsFile } from './settings';
import { discussContext, discussMode, discussPermission, discussPreamble, type DiscussWork } from './discuss';
import { liveRuns } from './live';
import { Startups, unlessAborted } from './startup';
import { effortSelect, effortToSet } from './effort';
import { commandName, customId, customName, isCustom } from '../shared/agentServers';
import type {
  AgentEvent,
  AgentHostMethod,
  AgentId,
  AgentInfo,
  AgentMessage,
  AgentMode,
  AgentModes,
  AgentRequest,
  AgentRun,
  AgentServer,
  ChatTurn,
  CustomAgentId,
  DispatchRecord,
  DispatchSettings,
  HostReply,
  LiveAgents,
  ModelOption,
  PermissionAsk,
  RunStep,
  PermissionPolicy,
  Result,
  ReadyView,
  ReviewView,
} from '../shared/api';

const parentPort = process.parentPort;
const DATA_DIR = process.env.BRAINFILE_DATA_DIR ?? path.join(os.homedir(), 'Library', 'Application Support', 'Brainfile');
const AGENTS_DIR = path.join(DATA_DIR, 'agents');
const registry = new AgentRegistry(DATA_DIR);
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
  /** The whole environment, when the agent brings its own (a custom agent's `env`); else the one every agent gets. */
  env?: NodeJS.ProcessEnv;
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

/**
 * An agent server published on npm. It is installed once into the app's own
 * folder and run with the real node binary, never through `npx` or a
 * version-manager shim: from Finder a shim like mise's can hang or fail, and
 * `npx` asks the registry and shares a cache other runs may be writing.
 */
interface NpmServer {
  pkg: string;
  version: string;
}

const CLAUDE_ACP: NpmServer = { pkg: '@agentclientprotocol/claude-agent-acp', version: '0.89.1' };
const CODEX_ACP: NpmServer = { pkg: '@agentclientprotocol/codex-acp', version: '2.2.2' };

const npmServerDir = (server: NpmServer) => path.join(AGENTS_DIR, server.pkg.replace('/', '__'), server.version);

/** The installed server's command file, from its own package.json `bin`; null when it is not installed. */
function npmServerEntry(server: NpmServer): string | null {
  const pkgDir = path.join(npmServerDir(server), 'node_modules', ...server.pkg.split('/'));
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf-8')) as { bin?: string | Record<string, string> };
    const bin = typeof manifest.bin === 'string' ? manifest.bin : Object.values(manifest.bin ?? {})[0];
    const entry = bin ? path.join(pkgDir, bin) : null;
    return entry && fs.existsSync(entry) ? entry : null;
  } catch {
    return null;
  }
}

const installing = new Map<string, Promise<string>>();

async function installNpmServer(server: NpmServer, node: string): Promise<string> {
  const npmCli = path.join(path.dirname(node), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js');
  if (!fs.existsSync(npmCli)) throw new Error(`No npm beside ${node}`);
  const dir = npmServerDir(server);
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(path.join(dir, 'package.json'))) fs.writeFileSync(path.join(dir, 'package.json'), '{ "private": true }\n');
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      node,
      [npmCli, 'install', '--prefix', dir, `${server.pkg}@${server.version}`, '--no-audit', '--no-fund', '--omit=dev', '--no-package-lock'],
      { env: { ...process.env, PATH: `${path.dirname(node)}:${process.env.PATH ?? ''}` }, stdio: ['ignore', 'ignore', 'pipe'] }
    );
    let err = '';
    child.stderr?.on('data', (d) => (err = (err + d).slice(-2000)));
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`Could not install ${server.pkg}: ${lastLine(err) || `npm exited ${code}`}`))));
  });
  const entry = npmServerEntry(server);
  if (!entry) throw new Error(`${server.pkg} installed without a command`);
  return entry;
}

/** How to start an npm agent server: the real node and its installed file; npx only when there is no real node. */
async function npmServer(server: NpmServer): Promise<Launch> {
  const node = realNode();
  if (!node) return { command: 'npx', args: ['-y', `${server.pkg}@${server.version}`] };
  let entry = npmServerEntry(server);
  if (!entry) {
    const key = `${server.pkg}@${server.version}`;
    if (!installing.has(key)) installing.set(key, installNpmServer(server, node).finally(() => installing.delete(key)));
    entry = await installing.get(key)!;
  }
  return { command: node, args: [entry] };
}

/** The last line of an agent's error output worth showing. */
function lastLine(text: string): string {
  return (
    text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !/^at /.test(l))
      .pop() ?? ''
  ).slice(0, 240);
}

/** In the order the picker shows them. */
const KNOWN: Known[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    client: 'claude',
    launch: () => npmServer(CLAUDE_ACP),
  },
  {
    id: 'codex',
    name: 'Codex',
    client: 'codex',
    launch: () => npmServer(CODEX_ACP),
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

/**
 * An agent the person named in Settings (task-47): their own ACP server,
 * kept in dispatch.json's agentServers and run as given.
 */
interface Custom {
  id: CustomAgentId;
  name: string;
  server: AgentServer;
}

type Agent = Known | Custom;

/** The person's own agents, in the order they were added. */
function customAgents(): Custom[] {
  return Object.entries(getSettings().agentServers).map(([name, server]) => ({ id: customId(name), name, server }));
}

/** Every agent there is to start: the known ones, then the person's own. */
function allAgents(): Agent[] {
  return [...KNOWN, ...customAgents()];
}

function agentOf(agentId: AgentId): Agent | undefined {
  return isCustom(agentId) ? customAgents().find((a) => a.id === agentId) : KNOWN.find((k) => k.id === agentId);
}

/** An agent's name in a sentence, even once a custom one has been removed. */
function nameOf(agentId: AgentId): string {
  return agentOf(agentId)?.name ?? (isCustom(agentId) ? customName(agentId) : agentId);
}

/** Why the agent cannot start on this Mac, or null when it can. */
function whyNot(agent: Agent, env?: NodeJS.ProcessEnv): string | null {
  if ('client' in agent) return which(agent.client) ? null : `${agent.name} is not installed on this Mac`;
  return customLaunch(agent.server, env ?? agentEnv()) ? null : `${agent.name} cannot start: ${agent.server.command} is not found on this Mac`;
}

/** How to start the agent: a known one its own way, a custom one as the person wrote it. */
async function launchOf(agent: Agent): Promise<Launch> {
  if ('client' in agent) return agent.launch();
  const launch = customLaunch(agent.server, agentEnv());
  if (!launch) throw new Error(whyNot(agent) ?? `${agent.name} cannot start`);
  return launch;
}

function listAgents(): AgentInfo[] {
  const known = KNOWN.map((agent) => {
    const installed = which(agent.client) !== null;
    const downloaded =
      agent.id === 'antigravity'
        ? fs.existsSync(path.join(AGENTS_DIR, 'antigravity', ANTIGRAVITY.version, ANTIGRAVITY.cmd))
        : agent.id === 'claude'
          ? !!npmServerEntry(CLAUDE_ACP)
          : agent.id === 'codex'
            ? !!npmServerEntry(CODEX_ACP)
            : true;
    return {
      id: agent.id,
      name: agent.name,
      available: installed,
      note: !installed ? 'not installed' : downloaded ? 'your login' : 'downloads once',
    };
  });
  // A custom agent is offered when its command is found, and says so when it is not.
  const env = agentEnv();
  const custom = customAgents().map((agent) => {
    const found = whyNot(agent, env) === null;
    const command = commandName(agent.server.command);
    return { id: agent.id, name: agent.name, available: found, note: found ? command : `${command} not found` };
  });
  return [...known, ...custom];
}

// ── Settings ─────────────────────────────────────────────────────────────────

/** dispatch.json (settings.ts): the app-wide settings, and per repository a policy that overrides them. */
function readSettings(): SettingsFile {
  return readSettingsFile(SETTINGS_FILE);
}

function getSettings(): DispatchSettings {
  return settingsOf(readSettings());
}

async function setSettings(patch: Partial<DispatchSettings>): Promise<DispatchSettings> {
  const before = getSettings().agentServers;
  const now = writeSettings(SETTINGS_FILE, patch);
  if (patch.agentServers) forgetChanged(before, now.agentServers);
  // Sessions already open change mode now, not on their next start.
  await Promise.all([...sessions.values()].map((session) => applyMode(session)));
  return now;
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

/** A custom agent whose entry changed or went is asked again for its models and modes, not answered from the old entry's. */
function forgetChanged(before: Record<string, AgentServer>, after: Record<string, AgentServer>): void {
  const changed = Object.keys(before).filter((name) => JSON.stringify(before[name]) !== JSON.stringify(after[name]));
  const cache = readModels();
  if (!changed.some((name) => customId(name) in cache)) return;
  for (const name of changed) delete cache[customId(name)];
  fs.writeFileSync(MODELS_FILE, JSON.stringify(cache, null, 2));
}

function remember(agentId: AgentId, options: ModelOption[], modes: AgentModes | null): void {
  if (!options.length && !modes) return;
  const cache = readModels();
  cache[agentId] = { at: Date.now(), options, modes };
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(MODELS_FILE, JSON.stringify(cache, null, 2));
}

/** A freshly listed model keeps the effort levels already asked for it. */
function keepingEfforts(agentId: AgentId, options: ModelOption[]): ModelOption[] {
  const prior = readModels()[agentId]?.options ?? [];
  return options.map((option) => (Array.isArray(option.efforts) ? option : { ...option, efforts: prior.find((item) => item.value === option.value)?.efforts }));
}

/** How long a probe may spend asking each model's effort levels before it returns the list it has. */
const EFFORT_SWEEP_MS = 8_000;

/** A model list whose efforts have been asked: each entry carries `efforts`, possibly empty. */
function effortsKnown(options: ModelOption[]): boolean {
  return options.every((option) => Array.isArray(option.efforts));
}

/** Gives up when the work outlasts `ms`. The request itself is left to finish. */
function within<T>(ms: number, work: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out')), Math.max(1, ms));
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * Each model's effort levels, asked on the probe session that listed the models.
 * The agent publishes `thought_level` for the model the session is on, so selecting
 * each model is what makes that model's levels appear. A model the sweep does not
 * reach keeps an empty list. The session is put back on the model it opened on.
 */
async function learnEfforts(session: Session): Promise<void> {
  const cached = readModels()[session.agentId];
  const models = cached?.options ?? [];
  const modes = cached?.modes ?? null;
  const thought = effortSelect(session.configOptions);
  if (!session.modelConfigId || !thought) {
    remember(session.agentId, models.map((model) => ({ value: model.value, name: model.name, efforts: [] })), modes);
    return;
  }
  const current = session.modelCurrent;
  const deadline = Date.now() + EFFORT_SWEEP_MS;
  const filled: ModelOption[] = [];
  for (const model of models) {
    if (model.value === current) {
      filled.push({ value: model.value, name: model.name, efforts: thought.options });
      continue;
    }
    const left = deadline - Date.now();
    if (left <= 0) {
      filled.push({ value: model.value, name: model.name, efforts: [] });
      continue;
    }
    try {
      const response = await within(
        Math.min(1_000, left),
        session.connection.setSessionConfigOption({ sessionId: session.sessionId, configId: session.modelConfigId, value: model.value })
      );
      const levels = effortSelect(response.configOptions);
      filled.push({ value: model.value, name: model.name, efforts: levels?.options ?? [] });
    } catch {
      filled.push({ value: model.value, name: model.name, efforts: [] });
    }
  }
  if (current && current !== filled.at(-1)?.value) {
    await session.connection
      .setSessionConfigOption({ sessionId: session.sessionId, configId: session.modelConfigId, value: current })
      .catch(() => {});
  }
  remember(session.agentId, filled, modes);
}

/** What the agent reports about its sessions, asked once a day: a throwaway session, no tools, then gone. */
async function probe(agentId: AgentId): Promise<Result<ModelCache[string]>> {
  const cached = readModels()[agentId];
  if (cached && 'modes' in cached && effortsKnown(cached.options) && Date.now() - cached.at < MODELS_TTL_MS) return { ok: true, value: cached };
  try {
    const session = await open(DATA_DIR, agentId, `probe:${agentId}`, undefined, { board: false });
    try {
      await learnEfforts(session);
    } catch {
      // The model list stands. Efforts are asked again the next time the list is stale.
    } finally {
      close(session);
    }
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
  /** A chat session's right to the desk; null for a hand-off, a probe or a discussion. */
  deskToken: string | null;
  /** The task a discussion is about (task-35); null for any other session. */
  discuss: string | null;
  /** Config options the session last reported. A probe reads each model's effort from them. */
  configOptions: acp.SessionConfigOption[] | null;
  /** The model select's id, when the agent offers one. */
  modelConfigId: string | null;
  /** The model the session opened on, so a probe can put it back. */
  modelCurrent: string | null;
}

const sessions = new Map<string, Session>();
const runs = new Map<string, AgentRun>();
const asks = new Map<string, { ask: PermissionAsk; resolve: (optionId: string | null) => void }>();
/** Runs whose agent is still starting, so stop reaches them before they have a session. */
const startups = new Startups();
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

/** The environment every agent starts in: the real node first on PATH, so nothing an agent starts finds a shim instead. */
function agentEnv(): NodeJS.ProcessEnv {
  const node = realNode();
  return node ? { ...process.env, PATH: `${path.dirname(node)}:${process.env.PATH ?? ''}` } : process.env;
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

interface OpenOptions {
  /** False for a probe: no board, no tools. */
  board?: boolean;
  /** Where the agent works when not the repository itself: a hand-off's worktree. */
  at?: string;
  /** Gives a chat session the desk's tools besides the board's. */
  withDesk?: boolean;
  /** The task a discussion is about: it reads, and changes only that task's spec. */
  discuss?: string;
  /** The effort to set once the model is selected. Unset starts on medium when the model offers it. */
  effort?: string;
  /** Stops the startup: the agent is not spawned, or is killed. */
  signal?: AbortSignal;
}

async function open(projectId: string, agentId: AgentId, key: string, model?: string, options: OpenOptions = {}): Promise<Session> {
  const { board = true, at, withDesk = false, discuss = null, effort, signal } = options;
  const agent = agentOf(agentId);
  if (!agent) throw new Error(isCustom(agentId) ? `${customName(agentId)} is no longer among your agents` : `Unknown agent ${agentId}`);
  const missing = whyNot(agent);
  if (missing) throw new Error(missing);
  const cwd = at ?? (board ? locateBoard(projectId, { materialize: false }).projectRoot : projectId);
  const deskToken = board && withDesk ? await grantDesk({ projectId, agentId, model, effort, models: {}, efforts: {}, key }) : null;
  const launch = await unlessAborted(signal, launchOf(agent)).catch((err) => {
    if (deskToken) desk.revoke(deskToken);
    throw err;
  });
  if (signal?.aborted) {
    if (deskToken) desk.revoke(deskToken);
    throw signal.reason;
  }
  const child = spawn(launch.command, launch.args, { cwd, env: launch.env ?? agentEnv(), stdio: ['pipe', 'pipe', 'pipe'] });
  // Kept so a failure can say why, not just that the agent stopped.
  let stderr = '';
  child.stderr?.on('data', (d) => (stderr = (stderr + d).slice(-4000)));
  const why = () => (lastLine(stderr) ? `: ${lastLine(stderr)}` : '');
  signal?.addEventListener('abort', () => child.kill(), { once: true });
  child.on('error', (err) => {
    sessions.delete(key);
    if (deskToken) desk.revoke(deskToken);
    if (session.run) update(session.run, { state: 'failed', error: `${agent.name} could not start: ${err.message}`, endedAt: Date.now() });
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
    deskToken,
    discuss,
    configOptions: null,
    modelConfigId: null,
    modelCurrent: null,
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
    if (deskToken) desk.revoke(deskToken);
    if (session.run && (session.run.state === 'working' || session.run.state === 'starting' || session.run.state === 'waiting')) {
      update(session.run, { state: 'failed', error: `${agent.name} stopped${why()}`, endedAt: Date.now() });
    }
  });

  try {
    await unlessAborted(signal, session.connection.initialize({ protocolVersion: acp.PROTOCOL_VERSION, clientCapabilities: {} }));
  } catch (err) {
    child.kill();
    throw new Error(`${agent.name} did not start${why() || `: ${err instanceof Error ? err.message : String(err)}`}`);
  }
  const mcpServers = board ? [...brainfileMcp(), ...(deskToken ? [deskMcp(deskToken, projectId)] : [])] : [];
  const created = await unlessAborted(signal, session.connection.newSession({ cwd, mcpServers }));
  session.sessionId = created.sessionId;
  let configOptions = created.configOptions ?? null;
  const models = modelOption(configOptions);
  session.modes = modesOf(created);
  session.mode = session.modes?.initial ?? null;
  session.modelConfigId = models?.id ?? null;
  session.modelCurrent = models?.current ?? null;
  remember(agentId, keepingEfforts(agentId, models?.options ?? []), session.modes && { initial: session.modes.initial, options: session.modes.options, bypass: session.modes.bypass });
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
  if (board) await unlessAborted(signal, applyMode(session));
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
  const want = session.discuss
    ? discussMode(modes)
    : policyFor(session.projectId) === 'bypass' && modes.bypass
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
/** The desk's tools (spec-16): `mcp__desk__dispatch`, `desk.runs`, `mcp.desk.stop`. */
const DESK_TOOL = /^(mcp(__|\.))?desk(__|[_./])(dispatch|runs|stop)\b/i;

async function requestPermission(session: Session, params: acp.RequestPermissionRequest): Promise<acp.RequestPermissionResponse> {
  const allowOnce = params.options.find((o) => o.kind === 'allow_once') ?? params.options.find((o) => o.kind.startsWith('allow'));
  // A discussion changes the task's spec and nothing else: the rest is refused before anyone is asked.
  if (session.discuss) {
    const verdict = discussPermission(params.toolCall.title ?? '', params.toolCall.kind);
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
  if (session.deskToken) desk.revoke(session.deskToken);
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

/** Read afresh: stop can land across any await. */
function wasStopped(run: AgentRun): boolean {
  return run.state === 'stopped';
}

async function turn(session: Session, run: AgentRun, prompt: string): Promise<void> {
  session.run = run;
  session.messages = [];
  session.messageId = null;
  session.breakNext = false;
  session.tools = new Map();
  if (session.idle) clearTimeout(session.idle);
  try {
    // Stopped before its turn came: the agent is not given the prompt.
    if (wasStopped(run)) return;
    update(run, { state: 'working', activity: 'thinking' });
    const result = await session.connection.prompt({ sessionId: session.sessionId, prompt: [{ type: 'text', text: prompt }] });
    if (run.state === 'stopped') return;
    const stopped = result.stopReason === 'cancelled';
    const reply = replyOf(session);
    update(run, { state: stopped ? 'stopped' : 'done', reply, steps: stepsOf(session, reply), endedAt: Date.now() });
  } catch (err) {
    if (!wasStopped(run)) update(run, { state: 'failed', error: err instanceof Error ? err.message : String(err), endedAt: Date.now() });
  } finally {
    session.run = null;
    if (run.kind === 'dispatch') close(session);
    else session.idle = setTimeout(() => close(session), IDLE_MS);
  }
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

/**
 * Where the hand-off works, when it has its own worktree: the branch, that
 * its work is committed there, and what it must leave to the person.
 */
function workplace(worktree: Worktree | null): string {
  if (!worktree) return '';
  if (!worktree.branch) {
    return (
      `\n\nYou are in a read-only checkout of this repository, at ${worktree.path}: the tip of ${worktree.base ?? 'the trunk'}, detached, with no branch. ` +
      'Read and run what you need, but change no files and make no commits: nothing here is kept, and the checkout goes when you finish. ' +
      'What you find goes on the board, in notes on the task or in tasks you add. Untracked files such as installed dependencies are not here; set them up if you need to build or test. ' +
      'The board is shared: the brainfile tools reach it from here.'
    );
  }
  const from = worktree.base ? ` (started from ${worktree.base})` : '';
  const again = worktree.resumed
    ? ' It has been here before: the branch already carries earlier work on this task. Pick up from there; the task\'s log says what the reviewer asked for.'
    : '';
  return (
    `\n\nYou are working in your own git worktree of this repository, at ${worktree.path}, on the branch \`${worktree.branch}\`${from}. ` +
    'Commit your work on this branch as you go, with clear messages, and leave nothing uncommitted when you finish: a person reviews and merges the branch. ' +
    'Do not switch branches, merge, rebase or push. Untracked files such as installed dependencies are not here; set them up if you need to build or test. ' +
    `The board is shared: the brainfile tools reach it from here.${again}`
  );
}

function brief(projectId: string, taskId: string, worktree: Worktree | null = null): string {
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
    workplace(worktree),
    `\n\nUse the brainfile MCP tools for the board (or, if they are not available, the \`brainfile\` command line here; never edit the board's files by hand): move ${task.id} to In Progress when you start, and when you finish add a short log note to it saying what you did${worktree?.branch ? ' and that it is on its branch' : ''}. ${finish(located.brainfilePath, task.id)} Do the work in ${worktree ? 'this worktree' : 'this repository'}. Finish with a reply of one or two sentences.`,
  ].join('');
}

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
 * A hand-off: its worktree, its brief, and the agent started on it. Hand to…
 * and the chat's `dispatch` both come here; `from` is the chat turn that asked.
 */
function startDispatch(
  projectId: string,
  taskId: string,
  agentId: AgentId,
  model?: string,
  from?: string,
  effort?: string
): Result<{ run: AgentRun; worktree: Worktree | null }> {
  let prompt: string;
  let worktree: Worktree | null;
  try {
    const located = locateBoard(projectId, { materialize: false });
    const contract = located.found ? findV2Task(getV2Dirs(located.brainfilePath), taskId)?.doc.task.contract : undefined;
    worktree = prepareWorktree(projectId, taskId, undefined, onlyReads(contract));
    prompt = brief(projectId, taskId, worktree);
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

async function dispatch(projectId: string, taskId: string, agentId: AgentId, model?: string, effort?: string): Promise<Result<AgentRun>> {
  const held = reserve(projectId, taskId);
  if (!held.ok) return held;
  try {
    const started = startDispatch(projectId, taskId, agentId, model, undefined, effort);
    return started.ok ? { ok: true, value: started.value.run } : started;
  } finally {
    held.value();
  }
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
      // Who asked goes on the task first, as Hand to… sets the assignee first.
      // The task is held across that write, so nothing else starts on it meanwhile.
      const held = reserve(grant.projectId, taskId);
      if (!held.ok) return held;
      let written: Result;
      let started: ReturnType<typeof startDispatch>;
      try {
        const record: DispatchRecord = {
          agent: agentId,
          ...(model ? { model } : {}),
          ...(effort ? { effort } : {}),
          by: 'chat',
          at: new Date().toISOString(),
        };
        written = await callHost<Result>('recordDispatch', grant.projectId, taskId, record);
        started = startDispatch(grant.projectId, taskId, agentId, model, sessions.get(grant.key)?.run?.id, effort);
      } finally {
        held.value();
      }
      if (!started.ok) return started;
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
  'For follow-up work, create the task with the brainfile tools first, then hand it off with dispatch; do not do the work yourself. Ask the person before dispatching more than three tasks at once. ' +
  'Do not change code unless asked. Reply briefly, in a sentence or two, with the answer itself. Do not list or mention what you changed on the board or handed off, or that you changed nothing: the window shows the board\u2019s changes and hand-offs under your reply.\n\n';

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
      if (session.deskToken) desk.update(session.deskToken, { models, efforts, model, effort });
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
  listAgents,
  agentRegistry: () => registry.list(),
  prepareRegistryAgent: (id: string) => registry.prepare(id),
  listModels,
  listModes,
  getSettings,
  setSettings,
  dispatch,
  ask,
  discuss,
  stopRun,
  live,
  review,
  readyToMerge: ready,
  mergeReview: (projectId: string, taskId: string) => settle(projectId, taskId, (title) => mergeReview(projectId, taskId, title)),
  discardReview: (projectId: string, taskId: string) => settle(projectId, taskId, () => discardReview(projectId, taskId)),
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
