/**
 * `@brainfile/core/dispatch`: the data folder, settings round-tripping
 * through dispatch.json, custom agents' launch, the ACP registry, effort
 * selection, startups, permissions as policy, a turn's reply and steps, and
 * a hand-off's brief. Moved from the desktop with its suites
 * (desktop/test/agentServers, registry, effort, startup).
 */
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';
import { execFileSync, spawnSync } from 'child_process';
import {
  AgentRegistry,
  BOARD_TOOL,
  Startups,
  agentEnv,
  agentOf,
  allAgents,
  applyMode,
  brainfileMcp,
  brief,
  close,
  customId,
  customLaunch,
  dataDir,
  defaultEffort,
  effortSelect,
  effortToSet,
  extractRegistryArchive,
  finish,
  flatSelect,
  forgetChanged,
  getSettings,
  hear,
  keepingEfforts,
  leftFor,
  listAgents,
  modelOption,
  modesOf,
  nameOf,
  policyFor,
  readModels,
  readSettingsFile,
  registryEntries,
  registryPlatform,
  remember,
  replyOf,
  requestPermission,
  resolveCommand,
  setSettings,
  settingsFile,
  settingsOf,
  standingDecisions,
  stepsOf,
  turn,
  unlessAborted,
  useBrainfile,
  whyNot,
  within,
  workplace,
  writeSettings,
  type AgentRun,
  type PermissionAsk,
  type Session,
  brainfileOnPath,
  realNode,
} from '../dispatch';
import { getV2Dirs } from '../workspace';

let base: string;

beforeEach(() => {
  base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bf-dispatch-')));
});

afterEach(() => {
  fs.rmSync(base, { recursive: true, force: true });
});

/** An executable script in a folder of its own, printing its arguments and the env it was given. */
function server(dir: string, name: string): string {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  fs.writeFileSync(file, '#!/bin/sh\nprintf "%s\\n" "$@"\nprintf "MUSE_KEY=%s\\n" "$MUSE_KEY"\nprintf "HOME=%s\\n" "$HOME"\n');
  fs.chmodSync(file, 0o755);
  return file;
}

describe("the board's brainfile", () => {
  afterEach(() => useBrainfile(null));
  const env = (servers: ReturnType<typeof brainfileMcp>) => Object.fromEntries((servers[0] as { env: { name: string; value: string }[] }).env.map((e) => [e.name, e.value]));

  test('brainfileMcp runs the launch its caller names, with what its env adds and the role', () => {
    const servers = brainfileMcp({ role: 'lead', scope: 'epic-1' }, { command: '/Apps/Brainfile', args: ['/Apps/cli/dist/cli.js'], env: { ELECTRON_RUN_AS_NODE: '1' } });
    expect(servers).toHaveLength(1);
    expect(servers[0]).toMatchObject({ name: 'brainfile', command: '/Apps/Brainfile', args: ['/Apps/cli/dist/cli.js', 'mcp'] });
    expect(env(servers)).toMatchObject({ ELECTRON_RUN_AS_NODE: '1', BRAINFILE_AGENT_ROLE: 'lead', BRAINFILE_LEAD_SCOPE: 'epic-1', HOME: os.homedir() });
  });

  test("a process's own brainfile is what its agents get: their server runs it, and its shim is first on their PATH", () => {
    const shim = path.join(base, 'bin');
    useBrainfile(() => ({ launch: { command: '/Apps/Brainfile', args: ['/Apps/cli.js'], env: { ELECTRON_RUN_AS_NODE: '1' } }, shim }));
    const servers = brainfileMcp({ role: 'chat' });
    expect(servers[0]).toMatchObject({ command: '/Apps/Brainfile', args: ['/Apps/cli.js', 'mcp'] });
    expect(env(servers).PATH.split(':')[0]).toBe(shim);
    expect(agentEnv().PATH?.split(':')[0]).toBe(shim);
    // A launch the caller names still comes first.
    expect(brainfileMcp(undefined, { command: 'node', args: ['cli.js'] })[0]).toMatchObject({ command: 'node', args: ['cli.js', 'mcp'] });
  });

  test("one that cannot be had fails the board's server with why, rather than give the agent another; agents keep the PATH they had", () => {
    useBrainfile(() => "Brainfile's own command line is not in the app");
    expect(() => brainfileMcp({ role: 'chat' })).toThrow("Brainfile's own command line is not in the app");
    expect(agentEnv().PATH?.endsWith(process.env.PATH ?? '')).toBe(true);
  });
});

describe('the data folder', () => {
  it('is BRAINFILE_DATA_DIR when set, else the platform’s own', () => {
    expect(dataDir({ BRAINFILE_DATA_DIR: '/data' }, 'darwin', '/Users/me')).toBe('/data');
    expect(dataDir({}, 'darwin', '/Users/me')).toBe('/Users/me/Library/Application Support/Brainfile');
    expect(dataDir({}, 'linux', '/home/me')).toBe('/home/me/.local/share/brainfile');
    expect(dataDir({ XDG_DATA_HOME: '/xdg' }, 'linux', '/home/me')).toBe('/xdg/brainfile');
    expect(dataDir({ APPDATA: 'C:\\Users\\me\\AppData\\Roaming' }, 'win32', 'C:\\Users\\me')).toBe(path.join('C:\\Users\\me\\AppData\\Roaming', 'Brainfile'));
  });
});

describe('settings', () => {
  it('round-trip through dispatch.json in Zed’s shape, keeping what they do not name', () => {
    const file = path.join(base, 'Brainfile', 'dispatch.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ bypass: true, projects: { '/repo': { permissions: 'ask' } } }));
    const now = writeSettings(file, {
      agentServers: {
        'Muse Code': { command: 'muse-acp', args: ['--acp'], env: { MUSE_KEY: 'k' } },
        '  Spaced   Name ': { command: ' spaced ', args: [], env: {} },
        'No command': { command: '  ', args: [], env: {} },
      },
    });
    expect(now.agentServers).toEqual({
      'Muse Code': { command: 'muse-acp', args: ['--acp'], env: { MUSE_KEY: 'k' } },
      'Spaced Name': { command: 'spaced', args: [], env: {} },
    });
    expect(now.bypass).toBe(true);
    const onDisk = JSON.parse(fs.readFileSync(file, 'utf-8'));
    // As Zed writes it: an entry here pastes into Zed's agent_servers unchanged.
    expect(onDisk.agentServers['Muse Code']).toEqual({ command: 'muse-acp', args: ['--acp'], env: { MUSE_KEY: 'k' } });
    expect(onDisk.projects).toEqual({ '/repo': { permissions: 'ask' } });
    expect(settingsOf(readSettingsFile(file))).toEqual(now);
    // A patch that does not name them leaves them be.
    expect(writeSettings(file, { bypass: false }).agentServers).toEqual(now.agentServers);
  });

  it('a file with no agent servers, or a broken one, reads as none', () => {
    expect(settingsOf(readSettingsFile(path.join(base, 'missing.json')))).toEqual({ bypass: false, modes: {}, agentServers: {} });
    const broken = path.join(base, 'broken.json');
    fs.writeFileSync(broken, '{ "agentServers": ');
    expect(settingsOf(readSettingsFile(broken)).agentServers).toEqual({});
  });

  it('a repository’s own policy wins over the app-wide switch', () => {
    expect(policyFor(base, '/repo')).toBe('ask');
    fs.writeFileSync(settingsFile(base), JSON.stringify({ bypass: true, projects: { '/repo': { permissions: 'allow' } } }));
    expect(policyFor(base, '/repo')).toBe('allow');
    expect(policyFor(base, '/other')).toBe('bypass');
  });

  it('a custom agent whose entry changes is asked again for its models', () => {
    setSettings(base, { agentServers: { Muse: { command: 'muse-acp', args: [], env: {} } } });
    remember(base, customId('Muse'), [{ value: 'm', name: 'M' }], null);
    remember(base, 'codex', [{ value: 'gpt', name: 'GPT' }], null);
    setSettings(base, { agentServers: { Muse: { command: 'muse', args: [], env: {} } } });
    expect(readModels(base)[customId('Muse')]).toBeUndefined();
    expect(readModels(base).codex.options).toEqual([{ value: 'gpt', name: 'GPT' }]);
    expect(getSettings(base).agentServers.Muse.command).toBe('muse');
    // Nothing cached for a changed entry leaves the cache file as it is.
    forgetChanged(base, { Other: { command: 'x', args: [], env: {} } }, {});
    expect(Object.keys(readModels(base))).toEqual(['codex']);
  });
});

describe('custom agents', () => {
  it('the command is found on PATH, or taken as the path it is; otherwise it is not found', () => {
    const bin = path.join(base, 'bin');
    const muse = server(bin, 'muse-acp');
    fs.writeFileSync(path.join(bin, 'not-exec'), 'x');
    const elsewhere = server(path.join(base, 'elsewhere'), 'not-exec');
    const PATH = [path.join(base, 'empty'), bin, path.dirname(elsewhere)].join(path.delimiter);
    expect(resolveCommand('muse-acp', PATH)).toBe(muse);
    // A file that cannot run is passed over for the next one on PATH.
    expect(resolveCommand('not-exec', PATH)).toBe(elsewhere);
    expect(resolveCommand('nowhere-acp', PATH)).toBeNull();
    expect(resolveCommand(muse, '')).toBe(muse);
    expect(resolveCommand('~/bin/muse-acp', '', base)).toBe(muse);
    expect(resolveCommand('./bin/muse-acp', PATH, base)).toBeNull();
    expect(resolveCommand(bin, PATH)).toBeNull();
  });

  it('a custom agent starts as given: its args, its env over the app’s, its command on the PATH that results', () => {
    const bin = path.join(base, 'bin');
    server(bin, 'muse-acp');
    const appEnv = { PATH: '/usr/bin:/bin', HOME: '/Users/someone', MUSE_KEY: 'from the app' };
    const entry = { command: 'muse-acp', args: ['--acp', 'two words'], env: { MUSE_KEY: 'its own', PATH: `${bin}:/usr/bin:/bin` } };
    const launch = customLaunch(entry, appEnv);
    expect(launch).not.toBeNull();
    if (!launch) return;
    expect(launch.command).toBe(path.join(bin, 'muse-acp'));
    expect(launch.args).toEqual(['--acp', 'two words']);
    expect(launch.env.MUSE_KEY).toBe('its own');
    expect(launch.env.HOME).toBe('/Users/someone');
    // Started the way a session starts it, it gets exactly that.
    const ran = spawnSync(launch.command, launch.args, { env: launch.env, encoding: 'utf-8' });
    expect(ran.stdout).toBe('--acp\ntwo words\nMUSE_KEY=its own\nHOME=/Users/someone\n');
    // Its args are its own copy: the entry is not changed by what the launch does.
    launch.args.push('--more');
    expect(entry.args).toEqual(['--acp', 'two words']);
  });

  it('a custom agent whose command is not on PATH cannot start', () => {
    const entry = { command: 'muse-acp', args: [], env: {} };
    expect(customLaunch(entry, { PATH: path.join(base, 'empty') })).toBeNull();
    // Its own PATH can be where its command is.
    server(path.join(base, 'own'), 'muse-acp');
    expect(customLaunch({ ...entry, env: { PATH: path.join(base, 'own') } }, { PATH: path.join(base, 'empty') })).not.toBeNull();
  });

  it('is offered after the known agents, by the name it has in dispatch.json', () => {
    const muse = server(path.join(base, 'bin'), 'muse-acp');
    writeSettings(settingsFile(base), { agentServers: { Muse: { command: muse, args: [], env: {} }, Gone: { command: path.join(base, 'nowhere'), args: [], env: {} } } });
    expect(allAgents(base).map((a) => a.id)).toEqual(['claude', 'codex', 'antigravity', 'cursor', 'grok', 'custom:Muse', 'custom:Gone']);
    expect(nameOf(base, 'custom:Muse')).toBe('Muse');
    expect(nameOf(base, 'custom:Removed')).toBe('Removed');
    expect(whyNot(agentOf(base, 'custom:Muse')!)).toBeNull();
    expect(whyNot(agentOf(base, 'custom:Gone')!)).toMatch(/cannot start: .*nowhere is not found/);
    const listed = listAgents(base).filter((a) => a.id.startsWith('custom:'));
    expect(listed).toEqual([
      { id: 'custom:Muse', name: 'Muse', available: true, note: 'muse-acp' },
      { id: 'custom:Gone', name: 'Gone', available: false, note: 'nowhere not found' },
    ]);
  });
});

describe('the ACP registry', () => {
  const npm = { id: 'npm-agent', name: 'Npm Agent', version: '1.2.3', distribution: { npx: { package: '@example/agent@1.2.3', args: ['--acp', 'two words'], env: { AGENT_MODE: 'acp' } } } };
  const binary = { id: 'binary-agent', name: 'Binary Agent', version: '2', distribution: { binary: {
    'darwin-aarch64': { archive: 'https://example.com/agent.tar.gz', cmd: './bin/agent', args: ['acp'], env: { TOKEN: 'value=two' } },
    'darwin-x86_64': { archive: 'https://example.com/intel.zip', cmd: './intel' },
  } } };
  const registry = (agents: unknown[] = [npm, binary]) => ({ version: '1.0.0', agents });
  const fetcher = (impl: (url: string) => Promise<Response>): typeof fetch => ((url: unknown) => impl(String(url))) as typeof fetch;

  // Tests only use synthetic archives and responses, with no network or installed app data.
  it('maps npx and the current platform binary, keeping args and env', () => {
    expect(registryPlatform('darwin', 'arm64')).toBe('darwin-aarch64');
    expect(registryPlatform('win32', 'x64')).toBe('windows-x86_64');
    const entries = registryEntries(registry(), 'darwin-aarch64');
    expect(entries.find((e) => e.id === npm.id)?.server).toEqual({ command: 'npx', args: ['--yes', '@example/agent@1.2.3', '--acp', 'two words'], env: { AGENT_MODE: 'acp' } });
    expect(entries.find((e) => e.id === binary.id)?.server).toEqual({ command: './bin/agent', args: ['acp'], env: { TOKEN: 'value=two' } });
    expect(registryEntries(registry(), 'darwin-x86_64')[0].server.command).toBe('./intel');
    expect(registryEntries(registry(), 'linux-x86_64').map((e) => e.id)).toEqual([npm.id]);
  });

  it('skips malformed entries, and rejects an unsupported schema and unsafe paths', () => {
    const bad = [
      { ...npm, id: 'bad', distribution: { npx: { package: '--shell' } } },
      { ...npm, id: 'bad', distribution: { npx: { package: 'a', args: [3] } } },
      { ...binary, id: 'bad', distribution: { binary: { 'darwin-aarch64': { archive: 'http://example.com/a', cmd: 'a' } } } },
      { ...binary, id: 'bad', distribution: { binary: { 'darwin-aarch64': { archive: 'https://example.com/a', cmd: '../a' } } } },
    ];
    expect(registryEntries(registry([...bad, npm, npm]), 'darwin-aarch64').map((e) => e.id)).toEqual([npm.id]);
    expect(() => registryEntries({ agents: [npm] }, 'darwin-aarch64')).toThrow();
    expect(() => registryEntries({ version: '1.0.0', agents: [] }, 'darwin-aarch64')).toThrow();
  });

  it('keeps its cache across processes, lets it expire, and falls back on network, HTTP and invalid JSON failures', async () => {
    let clock = 1000;
    let calls = 0;
    const service = new AgentRegistry(base, fetcher(async () => { calls++; return Response.json(registry()); }), 'darwin-aarch64', () => clock);
    expect((await service.list()).cached).toBe(false);
    expect((await service.list()).cached).toBe(true);
    expect(calls).toBe(1);
    const cached = new AgentRegistry(base, fetcher(async () => { throw new Error('offline'); }), 'darwin-aarch64', () => clock);
    expect((await cached.list()).agents.length).toBe(2);
    clock += 25 * 60 * 60_000;
    for (const failure of [async () => { throw new Error('offline'); }, async () => new Response('', { status: 503 }), async () => Response.json({ agents: [] })]) {
      const offline = new AgentRegistry(base, fetcher(failure), 'darwin-aarch64', () => clock);
      const view = await offline.list();
      expect(view.agents.length).toBe(2);
      expect(view.cached).toBe(true);
      expect(view.warning).toMatch(/Showing saved agents/);
      expect(await offline.prepare(npm.id)).toEqual({ ok: true, value: registryEntries(registry(), 'darwin-aarch64').find((e) => e.id === npm.id)!.server });
    }
    const saved = JSON.parse(await fsp.readFile(path.join(base, 'acp-registry.json'), 'utf8'));
    expect(saved.fetchedAt).toBe(1000);
  });

  it('first-run offline and a corrupt cache return an empty view with a retry message', async () => {
    await fsp.writeFile(path.join(base, 'acp-registry.json'), '{broken');
    const service = new AgentRegistry(base, fetcher(async () => { throw new Error('offline'); }), 'darwin-aarch64');
    const view = await service.list();
    expect(view.agents).toEqual([]);
    expect(view.warning).toMatch(/retry/);
    expect((await service.prepare('unknown')).ok).toBe(false);
  });

  it('binary Add extracts a nested command, preserves args and env, and reuses it offline', async () => {
    const source = path.join(base, 'source');
    await fsp.mkdir(path.join(source, 'bin'), { recursive: true });
    await fsp.writeFile(path.join(source, 'bin', 'agent'), '#!/bin/sh\nprintf "agent"\n');
    const archive = path.join(base, 'fixture.tar.gz');
    execFileSync('tar', ['-czf', archive, '-C', source, 'bin']);
    const data = await fsp.readFile(archive);
    const withHash = structuredClone(binary);
    Object.assign(withHash.distribution.binary['darwin-aarch64'], { sha256: createHash('sha256').update(data).digest('hex') });
    let downloads = 0;
    const service = new AgentRegistry(base, fetcher(async (url) => {
      if (url.includes('registry.json')) return Response.json(registry([withHash]));
      downloads++;
      return new Response(data);
    }), 'darwin-aarch64');
    const added = await service.prepare(binary.id);
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(path.isAbsolute(added.value.command)).toBe(true);
    expect(added.value.args).toEqual(['acp']);
    expect(added.value.env).toEqual({ TOKEN: 'value=two' });
    expect(execFileSync(added.value.command, { cwd: os.tmpdir(), encoding: 'utf8' })).toBe('agent');
    const offline = new AgentRegistry(base, fetcher(async () => { throw new Error('offline'); }), 'darwin-aarch64');
    expect(await offline.prepare(binary.id)).toEqual(added);
    expect(downloads).toBe(1);
  });

  (process.platform === 'darwin' ? it : it.skip)('extracts zip binary archives on macOS', async () => {
    await fsp.writeFile(path.join(base, 'agent'), '#!/bin/sh\n');
    const archive = path.join(base, 'fixture.zip');
    execFileSync('zip', ['-q', archive, 'agent'], { cwd: base });
    const out = path.join(base, 'out');
    await fsp.mkdir(out);
    await extractRegistryArchive(archive, out);
    expect(await fsp.readFile(path.join(out, 'agent'), 'utf8')).toBe('#!/bin/sh\n');
  });

  it('leaves no installation after a failed download, checksum or command', async () => {
    for (const mode of ['download', 'checksum', 'missing', 'escape']) {
      const dir = fs.mkdtempSync(path.join(base, `${mode}-`));
      const entry = structuredClone(binary);
      if (mode === 'checksum') Object.assign(entry.distribution.binary['darwin-aarch64'], { sha256: 'a'.repeat(64) });
      const service = new AgentRegistry(dir, fetcher(async (url) => {
        if (url.includes('registry.json')) return Response.json(registry([entry]));
        if (mode === 'download') return new Response('', { status: 404 });
        return new Response('fixture');
      }), 'darwin-aarch64', Date.now, async (_archive, out) => {
        if (mode === 'escape') { await fsp.mkdir(path.join(out, 'bin')); await fsp.symlink('/bin/sh', path.join(out, 'bin', 'agent')); }
      });
      const result = await service.prepare(binary.id);
      expect(result.ok).toBe(false);
      // Node's own errors reach a Jest test from another realm, so a missing command says it in general terms here.
      if (!result.ok) expect(result.error).toMatch(mode === 'download' ? /HTTP 404/ : mode === 'checksum' ? /checksum/ : mode === 'escape' ? /Invalid command/ : /ENOENT|Cannot prepare the agent/);
      expect(await fsp.readdir(path.join(dir, 'registry-agents'))).toEqual([]);
    }
  });
});

describe('effort', () => {
  const opus = {
    id: 'model',
    type: 'select',
    category: 'model',
    currentValue: 'opus',
    options: [{ name: 'Claude', options: [{ value: 'opus', name: 'Opus' }, { value: 'sonnet', name: 'Sonnet' }] }],
  };
  const effort = {
    id: 'reasoning_effort',
    type: 'select',
    category: 'thought_level',
    currentValue: 'high',
    options: [
      { value: 'low', name: 'Low' },
      { value: 'medium', name: 'Medium' },
      { value: 'high', name: 'High' },
    ],
  };
  const levels = effort.options;

  it('flattens a grouped model list to its values', () => {
    expect(flatSelect(opus)).toEqual([
      { value: 'opus', name: 'Opus', description: undefined },
      { value: 'sonnet', name: 'Sonnet', description: undefined },
    ]);
  });

  it('takes thought_level as the effort select, even under another id', () => {
    const found = effortSelect([opus, { id: 'mode', type: 'select', category: 'mode', currentValue: 'ask', options: [{ value: 'ask', name: 'Ask' }] }, effort]);
    expect(found).toEqual({ id: 'reasoning_effort', current: 'high', options: levels });
  });

  it('counts an option named effort when the category is absent', () => {
    const found = effortSelect([{ id: 'effort', type: 'select', currentValue: 'medium', options: [{ value: 'medium', name: 'Medium' }] }]);
    expect(found?.id).toBe('effort');
    expect(found?.options.length).toBe(1);
    expect(effortSelect(null)).toBeNull();
  });

  it('starts a new choice on medium', () => {
    expect(defaultEffort(levels)).toBe('medium');
    expect(effortToSet(levels)).toBe('medium');
    expect(effortToSet(levels, 'nope')).toBe('medium');
    expect(effortToSet(levels, 'high')).toBe('high');
  });

  it('keeps no default for a model with no medium, and offers none for one with no levels', () => {
    expect(defaultEffort([{ value: 'high', name: 'High' }])).toBeUndefined();
    expect(effortToSet([{ value: 'high', name: 'High' }], 'low')).toBeUndefined();
    expect(effortToSet([], 'medium')).toBeUndefined();
  });

  it('matches Medium by name when the value is the agent’s own word', () => {
    expect(defaultEffort([{ value: 'med', name: 'Medium' }])).toBe('med');
  });

  it('a freshly listed model keeps the effort levels already asked for it', () => {
    remember(base, 'claude', [{ value: 'opus', name: 'Opus', efforts: levels }], null);
    expect(keepingEfforts(base, 'claude', [{ value: 'opus', name: 'Opus' }, { value: 'haiku', name: 'Haiku', efforts: [] }])).toEqual([
      { value: 'opus', name: 'Opus', efforts: levels },
      { value: 'haiku', name: 'Haiku', efforts: [] },
    ]);
  });

  it('gives up on work that outlasts its time', async () => {
    await expect(within(1, new Promise(() => {}))).rejects.toThrow('timed out');
    await expect(within(1000, Promise.resolve(3))).resolves.toBe(3);
    await expect(within(1000, Promise.reject(new Error('no')))).rejects.toThrow('no');
  });
});

describe('models and modes', () => {
  it('reads the model select and its grouped options', () => {
    const options = [{ id: 'model', name: 'Model', type: 'select', category: 'model', currentValue: 'opus', options: [{ group: 'g', name: 'Claude', options: [{ value: 'opus', name: 'Opus' }] }] }];
    expect(modelOption(options as never)).toEqual({ id: 'model', current: 'opus', options: [{ value: 'opus', name: 'Opus' }] });
    expect(modelOption(null)).toBeNull();
  });

  it('finds the mode that never asks, in session modes or a mode option', () => {
    const modes = modesOf({
      modes: { currentModeId: 'default', availableModes: [{ id: 'default', name: 'Default' }, { id: 'bypassPermissions', name: 'Bypass permissions' }] },
    });
    expect(modes).toEqual({ initial: 'default', options: [{ id: 'default', name: 'Default', description: undefined }, { id: 'bypassPermissions', name: 'Bypass permissions', description: undefined }], bypass: 'bypassPermissions', via: null });
    const viaOption = modesOf({
      configOptions: [{ id: 'approval', name: 'Approval', type: 'select', category: 'mode', currentValue: 'ask', options: [{ value: 'ask', name: 'Ask' }, { value: 'full', name: 'Full access' }] }],
    } as never);
    expect(viaOption).toMatchObject({ initial: 'ask', bypass: 'full', via: { configId: 'approval' } });
    expect(modesOf({})).toBeNull();
  });
});

describe('startups', () => {
  /** A promise and the hands to settle it, for an agent that takes its time to start. */
  function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (err: unknown) => void;
    const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
    return { promise, resolve, reject };
  }

  it('a startup nobody stops opens its session', async () => {
    const startups = new Startups();
    const closed: string[] = [];
    const session = await startups.open('run-1', async () => 'session', (s) => closed.push(s));
    expect(session).toBe('session');
    expect(closed).toEqual([]);
    expect(startups.starting('run-1')).toBe(false);
  });

  it('stop aborts a startup still under way, and the session is never handed over', async () => {
    const startups = new Startups();
    const launch = deferred<string>();
    let seen: AbortSignal | undefined;
    const opening = startups.open('run-1', (signal) => ((seen = signal), unlessAborted(signal, launch.promise)), () => {});
    expect(startups.starting('run-1')).toBe(true);
    expect(startups.stop('run-1')).toBe(true);
    expect(seen?.aborted).toBe(true);
    expect(await opening).toBeNull();
    expect(startups.starting('run-1')).toBe(false);
  });

  it('a session that opens after the stop is closed, not returned', async () => {
    const startups = new Startups();
    const launch = deferred<string>();
    const closed: string[] = [];
    // An open that does not listen to its signal: it finishes regardless.
    const opening = startups.open('run-1', () => launch.promise, (s) => closed.push(s));
    startups.stop('run-1');
    launch.resolve('late session');
    expect(await opening).toBeNull();
    expect(closed).toEqual(['late session']);
  });

  it('a startup that fails because it was stopped is a stop, not a failure', async () => {
    const startups = new Startups();
    const launch = deferred<string>();
    const opening = startups.open('run-1', () => launch.promise, () => {});
    startups.stop('run-1');
    launch.reject(new Error('Codex stopped'));
    expect(await opening).toBeNull();
  });

  it('a startup that fails on its own still fails', async () => {
    const startups = new Startups();
    await expect(startups.open('run-1', async () => { throw new Error('Codex is not installed on this Mac'); }, () => {})).rejects.toThrow(/not installed/);
    expect(startups.starting('run-1')).toBe(false);
  });

  it('stop reaches only a run that is starting', async () => {
    const startups = new Startups();
    const launch = deferred<string>();
    const opening = startups.open('run-1', (signal) => unlessAborted(signal, launch.promise), () => {});
    expect(startups.stop('run-2')).toBe(false);
    launch.resolve('session');
    expect(await opening).toBe('session');
    expect(startups.stop('run-1')).toBe(false);
  });

  it('unlessAborted settles as its promise does until the signal aborts', async () => {
    expect(await unlessAborted(undefined, Promise.resolve(1))).toBe(1);
    const controller = new AbortController();
    expect(await unlessAborted(controller.signal, Promise.resolve(2))).toBe(2);
    const waiting = unlessAborted(controller.signal, new Promise<number>(() => {}));
    controller.abort(new Error('stopped'));
    await expect(waiting).rejects.toThrow(/stopped/);
    await expect(unlessAborted(controller.signal, Promise.resolve(3))).rejects.toThrow(/stopped/);
  });
});

/** A session with no agent behind it: what permissions, modes and turns read and change. */
function fakeSession(extra: Partial<Session> = {}): Session & { calls: unknown[] } {
  const calls: unknown[] = [];
  const connection = {
    setSessionMode: async (params: unknown) => { calls.push(['mode', params]); return {}; },
    setSessionConfigOption: async (params: unknown) => { calls.push(['config', params]); return { configOptions: [] }; },
    prompt: async () => ({ stopReason: 'end_turn' }),
  };
  return {
    key: 'k', projectId: '/repo', agentId: 'claude', child: { kill: () => calls.push('kill') }, connection, sessionId: 's-1',
    run: null, messages: [], messageId: null, breakNext: false, tools: new Map(), idle: null, modes: null, mode: null,
    rule: null, keepsMode: null, release: null, configOptions: null, modelConfigId: null, modelCurrent: null,
    calls,
    ...extra,
  } as unknown as Session & { calls: unknown[] };
}

function fakeRun(extra: Partial<AgentRun> = {}): AgentRun {
  return { id: 'run-1', projectId: '/repo', agentId: 'claude', kind: 'dispatch', state: 'working', activity: 'thinking', startedAt: 0, ...extra };
}

describe('permissions', () => {
  const options = [
    { optionId: 'yes', name: 'Allow', kind: 'allow_once' as const },
    { optionId: 'no', name: 'Reject', kind: 'reject_once' as const },
  ];
  const params = (title: string, kind?: string) => ({ sessionId: 's-1', toolCall: { toolCallId: 't', title, kind }, options }) as never;

  function context() {
    const asked: PermissionAsk[] = [];
    const updates: Partial<AgentRun>[] = [];
    let answer: string | null = 'yes';
    return {
      asked,
      updates,
      answer: (optionId: string | null) => (answer = optionId),
      ctx: {
        dataDir: base,
        update: (run: AgentRun, patch: Partial<AgentRun>) => { Object.assign(run, patch); updates.push(patch); },
        ask: async (ask: PermissionAsk) => { asked.push(ask); return answer; },
      },
    };
  }

  it('names the board’s tools as an agent does', () => {
    for (const title of ['brainfile_list_tasks', 'mcp__brainfile__task_add', 'mcp.brainfile.list_tasks']) expect(BOARD_TOOL.test(title)).toBe(true);
    expect(BOARD_TOOL.test('mcp__desk__dispatch')).toBe(false);
    expect(BOARD_TOOL.test('Edit file')).toBe(false);
  });

  it('allows the board’s own tools unasked, and asks about the rest under ask', async () => {
    const { ctx, asked, updates } = context();
    const run = fakeRun();
    const session = fakeSession({ run });
    expect(await requestPermission(ctx, session, params('mcp__brainfile__task_add'))).toEqual({ outcome: { outcome: 'selected', optionId: 'yes' } });
    expect(asked).toEqual([]);
    expect(await requestPermission(ctx, session, params('Edit core/src/a.ts', 'edit'))).toEqual({ outcome: { outcome: 'selected', optionId: 'yes' } });
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ runId: 'run-1', projectId: '/repo', agentId: 'claude', title: 'Edit core/src/a.ts', kind: 'edit', options });
    // The run waits while it is asked, and works again once answered.
    expect(updates).toEqual([{ state: 'waiting' }, { state: 'working' }]);
  });

  it('a cancelled ask cancels, and a repository that allows is not asked', async () => {
    const { ctx, asked, answer } = context();
    answer(null);
    expect(await requestPermission(ctx, fakeSession(), params('Run npm test', 'execute'))).toEqual({ outcome: { outcome: 'cancelled' } });
    fs.writeFileSync(settingsFile(base), JSON.stringify({ projects: { '/repo': { permissions: 'allow' } } }));
    expect(await requestPermission(ctx, fakeSession(), params('Run npm test', 'execute'))).toEqual({ outcome: { outcome: 'selected', optionId: 'yes' } });
    expect(asked).toHaveLength(1);
  });

  it('a session’s own rule answers first: refused before anyone is asked', async () => {
    const { ctx, asked } = context();
    const session = fakeSession({ rule: (call) => (call.kind === 'edit' ? 'refuse' : call.kind === 'read' ? 'allow' : 'usual') });
    expect(await requestPermission(ctx, session, params('Edit a file', 'edit'))).toEqual({ outcome: { outcome: 'selected', optionId: 'no' } });
    expect(await requestPermission(ctx, session, params('Read a file', 'read'))).toEqual({ outcome: { outcome: 'selected', optionId: 'yes' } });
    expect(asked).toEqual([]);
    await requestPermission(ctx, session, params('Fetch a page', 'fetch'));
    expect(asked).toHaveLength(1);
  });
});

describe('modes', () => {
  const modes = { initial: 'default', options: [{ id: 'default', name: 'Default' }, { id: 'plan', name: 'Plan' }, { id: 'bypass', name: 'Bypass permissions' }], bypass: 'bypass', via: null };

  it('follows the settings: bypass, else the mode chosen for the agent, else its own', async () => {
    const session = fakeSession({ modes, mode: 'default' });
    await applyMode({ dataDir: base }, session);
    expect(session.calls).toEqual([]);
    writeSettings(settingsFile(base), { modes: { claude: 'plan' } });
    await applyMode({ dataDir: base }, session);
    expect(session.mode).toBe('plan');
    writeSettings(settingsFile(base), { bypass: true });
    await applyMode({ dataDir: base }, session);
    expect(session.mode).toBe('bypass');
    expect(session.calls).toEqual([['mode', { sessionId: 's-1', modeId: 'plan' }], ['mode', { sessionId: 's-1', modeId: 'bypass' }]]);
  });

  it('a session that keeps its own mode keeps it, through the option that sets it', async () => {
    writeSettings(settingsFile(base), { bypass: true });
    const session = fakeSession({ modes: { ...modes, via: { configId: 'mode' } }, mode: 'default', keepsMode: () => 'plan' });
    await applyMode({ dataDir: base }, session);
    expect(session.calls).toEqual([['config', { sessionId: 's-1', configId: 'mode', value: 'plan' }]]);
  });
});

describe('a turn', () => {
  it('splits messages at a new ID or a tool, and replies with the last', () => {
    const session = fakeSession();
    hear(session, 'I will look ', 'm1');
    hear(session, 'at the board.', 'm1');
    session.tools.set('t1', { title: 'list_tasks', tool: 'read', after: 1 });
    session.breakNext = true;
    hear(session, 'Done: task-1 moved.', 'm1');
    session.tools.set('t2', { title: 'note', tool: 'edit', failed: true, after: 2 });
    expect(session.messages).toEqual(['I will look at the board.', 'Done: task-1 moved.']);
    const reply = replyOf(session);
    expect(reply).toBe('Done: task-1 moved.');
    expect(stepsOf(session, reply)).toEqual([
      { kind: 'note', text: 'I will look at the board.' },
      { kind: 'tool', title: 'list_tasks', tool: 'read' },
      { kind: 'tool', title: 'note', tool: 'edit', failed: true },
    ]);
    expect(replyOf(fakeSession())).toBe('');
  });

  it('ends with the reply and steps, and a hand-off’s session closes after it', async () => {
    const released: string[] = [];
    const session = fakeSession({ release: () => released.push('desk') });
    session.connection.prompt = (async () => {
      hear(session, 'All done.', null);
      return { stopReason: 'end_turn' };
    }) as never;
    const sessions = new Map([['k', session]]);
    const run = fakeRun({ state: 'starting' });
    const states: string[] = [];
    await turn({ sessions, update: (r, patch) => { Object.assign(r, patch); states.push(r.state); } }, session, run, 'Do it');
    expect(states).toEqual(['working', 'done']);
    expect(run.reply).toBe('All done.');
    expect(run.endedAt).toBeDefined();
    expect(sessions.size).toBe(0);
    expect(released).toEqual(['desk']);
    expect(session.calls).toContain('kill');
  });

  it('a stopped run is not given its prompt, and a failed turn says why', async () => {
    const session = fakeSession();
    const prompts: string[] = [];
    session.connection.prompt = (async () => { prompts.push('asked'); throw new Error('agent went away'); }) as never;
    const sessions = new Map([['k', session]]);
    const stopped = fakeRun({ state: 'stopped' });
    await turn({ sessions, update: (r, patch) => Object.assign(r, patch) }, session, stopped, 'Do it');
    expect(prompts).toEqual([]);
    const failing = fakeRun({ kind: 'dispatch' });
    await turn({ sessions, update: (r, patch) => Object.assign(r, patch) }, session, failing, 'Do it');
    expect(failing).toMatchObject({ state: 'failed', error: 'agent went away' });
    close({ sessions }, session);
  });
});

describe('the brief', () => {
  /** A plain board in its own folder, with the tasks and decisions given. */
  function board(files: Record<string, string>, columns = '  - id: todo\n    title: To Do\n  - id: in-progress\n    title: In Progress\n', name = 'project'): string {
    const project = path.join(base, name);
    const dot = path.join(project, '.brainfile');
    fs.mkdirSync(path.join(dot, 'board'), { recursive: true });
    fs.mkdirSync(path.join(dot, 'logs'), { recursive: true });
    fs.writeFileSync(path.join(dot, 'brainfile.md'), `---\ntitle: Test\ncolumns:\n${columns}---\n`);
    for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dot, name), text);
    return project;
  }
  const task = (id: string, extra = '', body = '') => `---\nid: ${id}\ntitle: Do ${id}\ncolumn: todo\n${extra}---\n${body}`;
  const decision = (id: string, claimKey: string) => `---\nid: ${id}\ntitle: Choose ${id}\ntype: decision\nstatus: current\nclaimKey: ${claimKey}\n---\n`;

  it('names the task, its body, its contract and where the work goes', () => {
    const project = board({ 'board/task-1.md': task('task-1', 'contract:\n  status: ready\n  deliverables: []\n', '\n## Description\nMake it so.\n') });
    const text = brief(project, 'task-1');
    expect(text).toMatch(/^You have been handed task-1 on this repository's Brainfile board: "Do task-1"\./);
    expect(text).toContain('Make it so.');
    expect(text).toContain('It carries a contract (status ready).');
    expect(text).toContain('move task-1 to In Progress when you start');
    expect(text).toContain('Then complete task-1.');
    expect(text).toContain('Do the work in this repository.');
    expect(text).not.toContain('which an agent leads');
    expect(() => brief(project, 'task-9')).toThrow('Task task-9 not found');
    expect(() => brief(path.join(base, 'nowhere'), 'task-1')).toThrow(/No board in/);
  });

  it('says the lead reads the board when an epic’s lead hands it off', () => {
    const project = board({ 'board/task-1.md': task('task-1') });
    expect(brief(project, 'task-1', null, 'epic-1')).toContain('This task is part of epic-1, which an agent leads');
    expect(brief(project, 'task-1', null, 'task-1')).not.toContain('which an agent leads');
  });

  it('works on its branch in a worktree, and leaves completing to the landing', () => {
    const project = board({ 'board/task-1.md': task('task-1') });
    const text = brief(project, 'task-1', { path: '/wt/task-1', branch: 'dispatch/task-1', base: 'main', resumed: true });
    expect(text).toContain('at /wt/task-1, on the branch `dispatch/task-1` (started from main)');
    expect(text).toContain('It has been here before');
    expect(text).toContain('saying what you did and that it is on its branch');
    expect(text).toContain('Do not complete task-1: it is completed when its branch lands on the trunk.');
    expect(text).toContain('Do the work in this worktree.');
  });

  it('a read-only checkout changes nothing', () => {
    expect(workplace(null)).toBe('');
    const text = workplace({ path: '/wt/task-1', branch: null, base: 'main', resumed: false });
    expect(text).toContain('read-only checkout of this repository, at /wt/task-1: the tip of main, detached');
    expect(text).toContain('change no files and make no commits');
  });

  it('a branch\'s work is completed when it lands on its target, and work on no branch is completed by its agent', () => {
    const file = path.join(board({}), '.brainfile', 'brainfile.md');
    expect(finish(file, 'task-1', 'release/2.0')).toBe('Do not complete task-1: it is completed when its branch lands on release/2.0.');
    expect(finish(file, 'task-1', null)).toBe('Then complete task-1.');
  });

  it('a board with a review column has the work moved there for a person', () => {
    const project = board({}, '  - id: todo\n    title: To Do\n  - id: review\n    title: Review\n');
    expect(finish(path.join(project, '.brainfile', 'brainfile.md'), 'task-1', 'main')).toBe(
      'Then move task-1 to Review (column id `review`) for review. Do not complete it: a person completes it after looking at the work.'
    );
  });

  it('carries the standing decisions, the first few by name', () => {
    const files: Record<string, string> = {};
    for (let i = 1; i <= 17; i++) files[`board/decision-${i}.md`] = decision(`decision-${i}`, `area.${i}`);
    const project = board(files);
    const text = standingDecisions(path.join(project, '.brainfile', 'brainfile.md'));
    expect(text).toContain('Standing decisions on this board:');
    expect(text).toContain('(area.1): Choose decision-1');
    expect(text).toContain('- and 2 more (`brainfile list --type decision`)');
    expect(text).toContain('run the brainfile check tool');
    expect(standingDecisions(path.join(base, 'missing.md'))).toBe('');
    expect(standingDecisions(path.join(board({}, undefined, 'none'), '.brainfile', 'brainfile.md'))).toBe('');
  });

  it('passes on what the tasks it builds on left for it', () => {
    const log = '\n## Log\n- 2026-10-01T10:00:00Z: Started.\n- 2026-10-01T11:00:00Z: [agent] The parser is in; the CLI flag is left for task-2.\n';
    const project = board({ 'logs/task-1.md': task('task-1', '', log), 'board/task-2.md': task('task-2', 'dependsOn:\n  - task-1\n  - other:task-3\n') });
    const dirs = getV2Dirs(path.join(project, '.brainfile', 'brainfile.md'));
    const text = leftFor(dirs, ['task-1', 'other:task-3']);
    expect(text).toContain('It builds on work already landed.');
    expect(text).toContain('task-1 ("Do task-1"):\n- Started.\n- The parser is in; the CLI flag is left for task-2.');
    expect(leftFor(dirs, undefined)).toBe('');
    expect(brief(project, 'task-2')).toContain('the CLI flag is left for task-2');
  });
});

describe('the brainfile on PATH', () => {
  const PATH = process.env.PATH;
  afterEach(() => {
    process.env.PATH = PATH;
  });

  it('runs a node script with node, and a shell shim (this app\'s own, first on an agent\'s PATH) as it is', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-onpath-'));
    const bin = path.join(dir, 'brainfile');
    fs.writeFileSync(bin, "#!/bin/sh\nELECTRON_RUN_AS_NODE='1' exec /app/Electron /app/cli.js \"$@\"\n", { mode: 0o755 });
    process.env.PATH = `${dir}:${PATH}`;
    expect(brainfileOnPath()).toEqual({ command: bin, args: [] });
    fs.writeFileSync(bin, '#!/usr/bin/env node\nconsole.log(1)\n', { mode: 0o755 });
    const launch = brainfileOnPath()!;
    if (realNode()) expect(launch).toEqual({ command: realNode(), args: [fs.realpathSync(bin)] });
    else expect(launch).toEqual({ command: bin, args: [] });
  });
});
