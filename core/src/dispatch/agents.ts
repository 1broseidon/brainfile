/**
 * The agents Brainfile starts, and how: the ones it knows (Claude Code,
 * Codex, Antigravity, Cursor, Grok), each its own way, and any ACP server the
 * person names in dispatch.json (custom.ts, task-47), the way Zed's
 * agent_servers do. Servers it installs live in the data folder's agents/.
 */
import { spawn, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type * as acp from '@agentclientprotocol/sdk';
import { commandName, customId, customName, isCustom } from './agentServers';
import { customLaunch } from './custom';
import { getSettings } from './settings';
import type { AgentId, AgentInfo, AgentRole, AgentServer, CustomAgentId } from './types';

/** Where `command` is on PATH: the PATH this process reads and hands its agents, not the one it was started with. */
export function which(command: string): string | null {
  const r = spawnSync('/usr/bin/which', [command], { encoding: 'utf-8', env: process.env });
  return r.status === 0 && r.stdout.trim() ? r.stdout.trim() : null;
}

/** Where installed agent servers live in the data folder. */
const agentsDir = (dataDir: string) => path.join(dataDir, 'agents');

// ── Which agents, started how ────────────────────────────────────────────────

export interface Launch {
  command: string;
  args: string[];
  /** The whole environment, when the agent brings its own (a custom agent's `env`); else the one every agent gets. */
  env?: NodeJS.ProcessEnv;
}

export interface Known {
  id: AgentId;
  name: string;
  /** The CLI that carries the person's login; without it the agent cannot run a turn. */
  client: string;
  launch(dataDir: string): Promise<Launch>;
}

/** The ACP registry's Antigravity server, downloaded once into the app's folder. */
export const ANTIGRAVITY = {
  version: '1.3.0',
  archive: (arch: string) =>
    `https://dl.google.com/agy-extensions/releases/macos/agy-acp-server-1.3.0-darwin-${arch === 'arm64' ? 'arm64' : 'x86_64'}.zip`,
  cmd: 'agy_acp_server.par',
};

async function antigravityServer(dataDir: string): Promise<string> {
  const dir = path.join(agentsDir(dataDir), 'antigravity', ANTIGRAVITY.version);
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
export interface NpmServer {
  pkg: string;
  version: string;
}

export const CLAUDE_ACP: NpmServer = { pkg: '@agentclientprotocol/claude-agent-acp', version: '0.89.1' };
export const CODEX_ACP: NpmServer = { pkg: '@agentclientprotocol/codex-acp', version: '2.2.2' };

const npmServerDir = (dataDir: string, server: NpmServer) => path.join(agentsDir(dataDir), server.pkg.replace('/', '__'), server.version);

/** The installed server's command file, from its own package.json `bin`; null when it is not installed. */
export function npmServerEntry(dataDir: string, server: NpmServer): string | null {
  const pkgDir = path.join(npmServerDir(dataDir, server), 'node_modules', ...server.pkg.split('/'));
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

async function installNpmServer(dataDir: string, server: NpmServer, node: string): Promise<string> {
  const npmCli = path.join(path.dirname(node), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js');
  if (!fs.existsSync(npmCli)) throw new Error(`No npm beside ${node}`);
  const dir = npmServerDir(dataDir, server);
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
  const entry = npmServerEntry(dataDir, server);
  if (!entry) throw new Error(`${server.pkg} installed without a command`);
  return entry;
}

/** How to start an npm agent server: the real node and its installed file; npx only when there is no real node. */
async function npmServer(dataDir: string, server: NpmServer): Promise<Launch> {
  const node = realNode();
  if (!node) return { command: 'npx', args: ['-y', `${server.pkg}@${server.version}`] };
  let entry = npmServerEntry(dataDir, server);
  if (!entry) {
    const key = `${server.pkg}@${server.version}`;
    if (!installing.has(key)) installing.set(key, installNpmServer(dataDir, server, node).finally(() => installing.delete(key)));
    entry = await installing.get(key)!;
  }
  return { command: node, args: [entry] };
}

/** The last line of an agent's error output worth showing. */
export function lastLine(text: string): string {
  return (
    text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !/^at /.test(l))
      .pop() ?? ''
  ).slice(0, 240);
}

/** In the order the picker shows them. */
export const KNOWN: Known[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    client: 'claude',
    launch: (dataDir) => npmServer(dataDir, CLAUDE_ACP),
  },
  {
    id: 'codex',
    name: 'Codex',
    client: 'codex',
    launch: (dataDir) => npmServer(dataDir, CODEX_ACP),
  },
  {
    id: 'antigravity',
    name: 'Antigravity',
    client: 'agy',
    launch: async (dataDir) => ({ command: await antigravityServer(dataDir), args: [] }),
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
export interface Custom {
  id: CustomAgentId;
  name: string;
  server: AgentServer;
}

export type Agent = Known | Custom;

/** The person's own agents, in the order they were added. */
export function customAgents(dataDir: string): Custom[] {
  return Object.entries(getSettings(dataDir).agentServers).map(([name, server]) => ({ id: customId(name), name, server }));
}

/** Every agent there is to start: the known ones, then the person's own. */
export function allAgents(dataDir: string): Agent[] {
  return [...KNOWN, ...customAgents(dataDir)];
}

export function agentOf(dataDir: string, agentId: AgentId): Agent | undefined {
  return isCustom(agentId) ? customAgents(dataDir).find((a) => a.id === agentId) : KNOWN.find((k) => k.id === agentId);
}

/** An agent's name in a sentence, even once a custom one has been removed. */
export function nameOf(dataDir: string, agentId: AgentId): string {
  return agentOf(dataDir, agentId)?.name ?? (isCustom(agentId) ? customName(agentId) : agentId);
}

/** Why the agent cannot start on this Mac, or null when it can. */
export function whyNot(agent: Agent, env?: NodeJS.ProcessEnv): string | null {
  if ('client' in agent) return which(agent.client) ? null : `${agent.name} is not installed on this Mac`;
  return customLaunch(agent.server, env ?? agentEnv()) ? null : `${agent.name} cannot start: ${agent.server.command} is not found on this Mac`;
}

/** How to start the agent: a known one its own way, a custom one as the person wrote it. */
export async function launchOf(dataDir: string, agent: Agent): Promise<Launch> {
  if ('client' in agent) return agent.launch(dataDir);
  const launch = customLaunch(agent.server, agentEnv());
  if (!launch) throw new Error(whyNot(agent) ?? `${agent.name} cannot start`);
  return launch;
}

export function listAgents(dataDir: string): AgentInfo[] {
  const known = KNOWN.map((agent) => {
    const installed = which(agent.client) !== null;
    const downloaded =
      agent.id === 'antigravity'
        ? fs.existsSync(path.join(agentsDir(dataDir), 'antigravity', ANTIGRAVITY.version, ANTIGRAVITY.cmd))
        : agent.id === 'claude'
          ? !!npmServerEntry(dataDir, CLAUDE_ACP)
          : agent.id === 'codex'
            ? !!npmServerEntry(dataDir, CODEX_ACP)
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
  const custom = customAgents(dataDir).map((agent) => {
    const found = whyNot(agent, env) === null;
    const command = commandName(agent.server.command);
    return { id: agent.id, name: agent.name, available: found, note: found ? command : `${command} not found` };
  });
  return [...known, ...custom];
}

// ── The environment an agent gets ────────────────────────────────────────────

export const AGENT_ROLES: readonly AgentRole[] = ['chat', 'lead', 'worker', 'discuss'];
/** The env `brainfile mcp` reads its role from. */
export const AGENT_ROLE_ENV = 'BRAINFILE_AGENT_ROLE';
/** The env a lead's `brainfile mcp` reads its tree from: the epic it leads. */
export const LEAD_SCOPE_ENV = 'BRAINFILE_LEAD_SCOPE';

/** The roles this process was given that it does not know, said once each. */
const unknownRoles = new Set<string>();

/**
 * The role and lead scope an environment gives; no role when it names none.
 * One it names that is not a role (another version's, a typo) is still an
 * agent's: it is a worker, the least access, and stderr says so once, rather
 * than a person's full access by mistake.
 */
export function agentRoleOf(env: NodeJS.ProcessEnv = process.env, warn: (line: string) => void = (line) => process.stderr.write(`${line}\n`)): { role?: AgentRole; scope?: string } {
  const given = (env[AGENT_ROLE_ENV] ?? '').trim();
  if (!given) return {};
  let role = given.toLowerCase() as AgentRole;
  if (!AGENT_ROLES.includes(role)) {
    if (!unknownRoles.has(given)) {
      unknownRoles.add(given);
      warn(`${AGENT_ROLE_ENV}=${given} is not a role (${AGENT_ROLES.join(', ')}): treated as worker`);
    }
    role = 'worker';
  }
  const scope = (env[LEAD_SCOPE_ENV] ?? '').trim();
  return { role, ...(role === 'lead' && scope ? { scope } : {}) };
}

/** The role and lead scope as environment variables, for an agent and the `brainfile mcp` it is given. */
export function roleEnv(role?: { role: AgentRole; scope?: string }): Record<string, string> {
  return { ...(role ? { [AGENT_ROLE_ENV]: role.role } : {}), ...(role?.scope ? { [LEAD_SCOPE_ENV]: role.scope } : {}) };
}

/**
 * What this process was started under and no agent is to inherit: a Claude
 * Code session's own marks (an agent given them runs as nested in it) and
 * npm's, when the process came up through `npm run`. Everything else, the
 * person's keys and tools, is passed on.
 */
const NOT_INHERITED = /^(?:CLAUDECODE|CLAUDE_CODE_.*|CLAUDE_PID|npm_.*|INIT_CWD|NODE_ENV)$/;

/**
 * The environment every agent starts in: this process's, less what it was
 * started under (NOT_INHERITED), with the real node first on PATH, so
 * nothing an agent starts finds a shim instead; ahead of it, the folder with
 * this process's own `brainfile` (useBrainfile), so `brainfile …` in an
 * agent's shell is the same command line its board server is.
 */
export function agentEnv(): NodeJS.ProcessEnv {
  const node = realNode();
  const PATH = withOwnBrainfile(node ? `${path.dirname(node)}:${process.env.PATH ?? ''}` : process.env.PATH ?? '');
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) if (!NOT_INHERITED.test(key)) env[key] = value;
  return { ...env, PATH };
}

/** The first `node` on PATH that is a real binary, not a version-manager shim script. */
export function realNode(): string | null {
  const r = spawnSync('/usr/bin/which', ['-a', 'node'], { encoding: 'utf-8', env: process.env });
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

// ── Which brainfile agents get ───────────────────────────────────────────────

/** How to start brainfile: the command, the arguments ahead of its own (`mcp`, `list`), and what its environment adds. */
export interface BrainfileLaunch {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

/**
 * This process's own brainfile, when it brings one (the desktop's, run by
 * its own binary): the launch, and `shim`, a folder holding a `brainfile`
 * that runs the same. A string says why it cannot be had.
 */
export type OwnBrainfile = { launch: BrainfileLaunch; shim?: string } | string;

let ownBrainfile: (() => OwnBrainfile) | null = null;

/**
 * Agents this process starts get its own brainfile, not the one on PATH: the
 * desktop's board server and shell command are the CLI it was built with,
 * whatever version is installed (or none). Asked for each time an agent
 * starts, so one that was missing is found once it is there. A string from
 * it fails every session that would have the board, with it as the reason.
 * null goes back to the `brainfile` on PATH.
 */
export function useBrainfile(own: (() => OwnBrainfile) | null): void {
  ownBrainfile = own;
}

/** This process's own brainfile, null when it brings none; throws why when it brings one that cannot be had. */
function ownLaunch(): { launch: BrainfileLaunch; shim?: string } | null {
  const own = ownBrainfile?.() ?? null;
  if (typeof own === 'string') throw new Error(own);
  return own;
}

/** PATH with the folder holding this process's own `brainfile` first, when it has one that can be had. */
function withOwnBrainfile(PATH: string): string {
  let shim: string | undefined;
  try {
    shim = ownLaunch()?.shim;
  } catch {
    /* none to be had: the session that needs it says why */
  }
  return shim ? `${shim}:${PATH}` : PATH;
}

/**
 * The `brainfile` on PATH, spelled out in full. Some agents (Codex) start MCP
 * servers with a stripped environment, where a `#!/usr/bin/env node` script
 * finds a version-manager shim that never answers; so the command is the
 * real node binary and the CLI's own file.
 */
export function brainfileOnPath(): BrainfileLaunch | null {
  const bin = which('brainfile');
  if (!bin) return null;
  const file = fs.realpathSync(bin);
  // Only a node script is run with node: a shell shim (this app's own, first on an agent's PATH) or a
  // version manager's binary is run as it is.
  const node = nodeScript(file) ? realNode() : null;
  return node ? { command: node, args: [file] } : { command: bin, args: [] };
}

/** Whether a file is a script node runs: a `.js`/`.mjs`/`.cjs` file, or one whose first line names node. */
function nodeScript(file: string): boolean {
  if (/\.[mc]?js$/.test(file)) return true;
  try {
    const fd = fs.openSync(file, 'r');
    const head = Buffer.alloc(128);
    const read = fs.readSync(fd, head, 0, 128, 0);
    fs.closeSync(fd);
    const first = head.subarray(0, read).toString('utf-8').split('\n')[0];
    return first.startsWith('#!') && /\bnode\b/.test(first);
  } catch {
    return false;
  }
}

/**
 * Brainfile's MCP server: `launch` when the caller names one, else this
 * process's own (useBrainfile), else the `brainfile` on PATH; none when
 * there is none. PATH and HOME are passed for the git calls the board makes.
 * `role` is what the agent is to the board (BRAINFILE_AGENT_ROLE), and a
 * lead's `scope` the epic it leads (BRAINFILE_LEAD_SCOPE): a worker's server
 * lists no dispatch, stop or land. Throws when this process's own brainfile
 * cannot be had, rather than give the agent an older one or none unsaid.
 */
export function brainfileMcp(role?: { role: AgentRole; scope?: string }, launch?: BrainfileLaunch): acp.McpServer[] {
  const found = launch ?? ownLaunch()?.launch ?? brainfileOnPath();
  if (!found) return [];
  const env = [
    { name: 'PATH', value: withOwnBrainfile(process.env.PATH ?? '') },
    { name: 'HOME', value: os.homedir() },
    ...Object.entries({ ...found.env, ...roleEnv(role) }).map(([name, value]) => ({ name, value })),
  ];
  return [{ name: 'brainfile', command: found.command, args: [...found.args, 'mcp'], env }];
}
