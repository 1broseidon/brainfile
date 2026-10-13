/**
 * Custom agents (task-47): the person's own ACP servers, in Zed's
 * agent_servers shape. They round-trip through dispatch.json, paste across
 * from Zed's settings, start with their args and their env over the app's,
 * and are unavailable when their command is not found.
 */
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { buildSync } from 'esbuild';
import {
  argsFrom,
  argsText,
  cleanServers,
  commandName,
  customId,
  customName,
  envFrom,
  envText,
  isCustom,
  pastedServers,
} from '../src/shared/agentServers.ts';
import { customLaunch, resolveCommand } from '../src/agents/custom.ts';

type SettingsModule = typeof import('../src/agents/settings.ts');

/** settings.ts reads the shared cleaner, so it is bundled first, as the app bundles it. */
async function settingsModule(dir: string): Promise<SettingsModule> {
  const outfile = path.join(dir, 'settings.mjs');
  buildSync({ entryPoints: [path.join(import.meta.dirname, '..', 'src', 'agents', 'settings.ts')], outfile, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
  return import(pathToFileURL(outfile).href) as Promise<SettingsModule>;
}

let base: string;

beforeEach(() => {
  base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bf-custom-')));
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

test('a custom agent’s ID is its name under custom:', () => {
  const id = customId('Muse Code');
  assert.equal(id, 'custom:Muse Code');
  assert.equal(isCustom(id), true);
  assert.equal(isCustom('claude'), false);
  assert.equal(customName(id), 'Muse Code');
});

test('settings round-trip through dispatch.json in Zed’s shape, keeping what they do not name', async () => {
  const { readSettingsFile, settingsOf, writeSettings } = await settingsModule(base);
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
  assert.deepEqual(now.agentServers, {
    'Muse Code': { command: 'muse-acp', args: ['--acp'], env: { MUSE_KEY: 'k' } },
    'Spaced Name': { command: 'spaced', args: [], env: {} },
  });
  assert.equal(now.bypass, true);
  const onDisk = JSON.parse(fs.readFileSync(file, 'utf-8'));
  // As Zed writes it: an entry here pastes into Zed's agent_servers unchanged.
  assert.deepEqual(onDisk.agentServers['Muse Code'], { command: 'muse-acp', args: ['--acp'], env: { MUSE_KEY: 'k' } });
  assert.deepEqual(onDisk.projects, { '/repo': { permissions: 'ask' } });
  assert.deepEqual(settingsOf(readSettingsFile(file)), now);
  // A patch that does not name them leaves them be.
  assert.deepEqual(writeSettings(file, { bypass: false }).agentServers, now.agentServers);
});

test('a file with no agent servers, or a broken one, reads as none', async () => {
  const { readSettingsFile, settingsOf } = await settingsModule(base);
  assert.deepEqual(settingsOf(readSettingsFile(path.join(base, 'missing.json'))), { bypass: false, modes: {}, agentServers: {} });
  const broken = path.join(base, 'broken.json');
  fs.writeFileSync(broken, '{ "agentServers": ');
  assert.deepEqual(settingsOf(readSettingsFile(broken)).agentServers, {});
});

test('an entry is cleaned as it is read: strings only, Zed’s other keys let go, no command no entry', () => {
  assert.deepEqual(
    cleanServers({
      'Muse Code': { type: 'custom', command: 'muse-acp', args: ['--port', 8080, true, null, { x: 1 }], env: { A: 'a', N: 1, O: {} }, default_mode: 'ask' },
      Registry: { type: 'registry' },
      Broken: 'muse-acp',
      'Bad\nName': { command: 'x' },
    }),
    { 'Muse Code': { command: 'muse-acp', args: ['--port', '8080', 'true'], env: { A: 'a', N: '1' } } }
  );
  assert.deepEqual(cleanServers(null), {});
  assert.deepEqual(cleanServers(['muse-acp']), {});
});

test('Zed’s settings paste across: the whole file with comments, the block, the map, or one entry', () => {
  const want = { 'Muse Code': { command: 'muse-acp', args: [], env: {} } };
  const zed = `// Zed settings
{
  "theme": "One Dark", // the theme
  /* the agents */
  "agent_servers": {
    "Muse Code": {
      "type": "custom",
      "command": "muse-acp",
      "args": [],
      "env": {},
    },
  },
}`;
  for (const text of [
    zed,
    '"agent_servers": { "Muse Code": { "command": "muse-acp", "args": [], "env": {} } }',
    '{ "Muse Code": { "command": "muse-acp" } }',
    '"Muse Code": { "command": "muse-acp", "args": [], "env": {} },',
  ]) {
    assert.deepEqual(pastedServers(text), { ok: true, value: want }, text);
  }
  // A URL in a string is not a comment.
  assert.deepEqual(pastedServers('"Remote": { "command": "muse", "args": ["--url", "http://localhost:1/x"] }'), {
    ok: true,
    value: { Remote: { command: 'muse', args: ['--url', 'http://localhost:1/x'], env: {} } },
  });
});

test('a paste Brainfile cannot use says why', () => {
  const error = (text: string) => {
    const result = pastedServers(text);
    return result.ok ? '' : result.error;
  };
  assert.match(error(''), /Paste an entry/);
  assert.match(error('not json at all'), /not JSON/);
  assert.match(error('{ "command": "muse-acp" }'), /its name/);
  assert.match(error('{ "agent_servers": { "Registry": { "type": "registry" } } }'), /No entry with a command/);
});

test('the editor’s arguments are one a line, and its environment KEY=value', () => {
  assert.deepEqual(argsFrom('--acp\n\n  --model opus  \n'), ['--acp', '--model opus']);
  assert.equal(argsText(['--acp', '--model opus']), '--acp\n--model opus');
  assert.deepEqual(envFrom('MUSE_KEY=a=b\n\n LEVEL = 2\nEMPTY='), { ok: true, value: { MUSE_KEY: 'a=b', LEVEL: ' 2', EMPTY: '' } });
  assert.equal(envText({ MUSE_KEY: 'a=b', EMPTY: '' }), 'MUSE_KEY=a=b\nEMPTY=');
  const bad = envFrom('MUSE_KEY');
  assert.equal(bad.ok, false);
  assert.equal(envFrom('1X=y').ok, false);
});

test('the command is found on PATH, or taken as the path it is; otherwise it is not found', () => {
  const bin = path.join(base, 'bin');
  const muse = server(bin, 'muse-acp');
  fs.writeFileSync(path.join(bin, 'not-exec'), 'x');
  const elsewhere = server(path.join(base, 'elsewhere'), 'not-exec');
  const PATH = [path.join(base, 'empty'), bin, path.dirname(elsewhere)].join(path.delimiter);
  assert.equal(resolveCommand('muse-acp', PATH), muse);
  // A file that cannot run is passed over for the next one on PATH.
  assert.equal(resolveCommand('not-exec', PATH), elsewhere);
  assert.equal(resolveCommand('nowhere-acp', PATH), null);
  assert.equal(resolveCommand(muse, ''), muse);
  assert.equal(resolveCommand('~/bin/muse-acp', '', base), muse);
  assert.equal(resolveCommand('./bin/muse-acp', PATH, base), null);
  assert.equal(resolveCommand(bin, PATH), null);
  assert.equal(commandName(muse), 'muse-acp');
  assert.equal(commandName('muse-acp'), 'muse-acp');
});

test('a custom agent starts as given: its args, its env over the app’s, its command on the PATH that results', () => {
  const bin = path.join(base, 'bin');
  server(bin, 'muse-acp');
  const appEnv = { PATH: '/usr/bin:/bin', HOME: '/Users/someone', MUSE_KEY: 'from the app' };
  const entry = { command: 'muse-acp', args: ['--acp', 'two words'], env: { MUSE_KEY: 'its own', PATH: `${bin}:/usr/bin:/bin` } };
  const launch = customLaunch(entry, appEnv);
  assert.ok(launch);
  assert.equal(launch.command, path.join(bin, 'muse-acp'));
  assert.deepEqual(launch.args, ['--acp', 'two words']);
  assert.equal(launch.env.MUSE_KEY, 'its own');
  assert.equal(launch.env.HOME, '/Users/someone');
  // Started the way the agents process starts it, it gets exactly that.
  const ran = spawnSync(launch.command, launch.args, { env: launch.env, encoding: 'utf-8' });
  assert.equal(ran.stdout, '--acp\ntwo words\nMUSE_KEY=its own\nHOME=/Users/someone\n');
  // Its args are its own copy: the entry is not changed by what the launch does.
  launch.args.push('--more');
  assert.deepEqual(entry.args, ['--acp', 'two words']);
});

test('a custom agent whose command is not on PATH cannot start', () => {
  const entry = { command: 'muse-acp', args: [], env: {} };
  assert.equal(customLaunch(entry, { PATH: path.join(base, 'empty') }), null);
  // Its own PATH can be where its command is.
  server(path.join(base, 'own'), 'muse-acp');
  assert.ok(customLaunch({ ...entry, env: { PATH: path.join(base, 'own') } }, { PATH: path.join(base, 'empty') }));
});
