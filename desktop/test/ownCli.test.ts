/**
 * The app's own command line for its agents (ownCli.ts): where main finds
 * it, packaged and in development; the board server the agents process
 * builds from it (core's brainfileMcp, given it through useBrainfile), run
 * by the app's binary as node; the shim that `brainfile` in an agent's shell
 * reaches, first on its PATH; and the reason it gives when the CLI is not
 * there, which the chat or the lead shows.
 */
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { APP_CLI_ENV, ELECTRON_BIN_ENV, appBrainfile, appCliPath, shimScript, writeShim } from '../src/agents/ownCli.ts';

const require = createRequire(import.meta.url);
const { agentEnv, brainfileMcp, useBrainfile } = require('@brainfile/core/dispatch') as typeof import('@brainfile/core/dispatch');

const REPO_CLI = path.resolve(import.meta.dirname, '..', '..', 'cli', 'dist', 'cli.js');
const scratch = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bf-own-cli-')));

afterEach(() => useBrainfile(null));

test('main finds the CLI in the app’s Resources when packaged, and the repository’s own build in development', () => {
  assert.equal(
    appCliPath({ packaged: true, resourcesPath: '/Applications/Brainfile.app/Contents/Resources', appPath: '/Applications/Brainfile.app/Contents/Resources/app.asar' }),
    '/Applications/Brainfile.app/Contents/Resources/cli/dist/cli.js'
  );
  assert.equal(appCliPath({ packaged: false, resourcesPath: '/x/electron/Resources', appPath: '/repo/desktop' }), '/repo/cli/dist/cli.js');
});

test('the agents’ board server is the app’s CLI run by the app’s binary as node, with its role; the shim is first on their PATH', () => {
  const dir = scratch();
  const cli = path.join(dir, 'cli', 'dist', 'cli.js');
  fs.mkdirSync(path.dirname(cli), { recursive: true });
  fs.writeFileSync(cli, '');
  const env = { [APP_CLI_ENV]: cli, [ELECTRON_BIN_ENV]: '/Applications/Brainfile.app/Contents/MacOS/Brainfile' };
  // As the agents process does at its start.
  useBrainfile(() => appBrainfile(env, dir));

  const [server] = brainfileMcp({ role: 'lead', scope: 'epic-6' });
  assert.equal(server.name, 'brainfile');
  assert.equal((server as { command: string }).command, '/Applications/Brainfile.app/Contents/MacOS/Brainfile');
  assert.deepEqual((server as { args: string[] }).args, [cli, 'mcp']);
  const vars = Object.fromEntries((server as { env: { name: string; value: string }[] }).env.map((e) => [e.name, e.value]));
  assert.equal(vars.ELECTRON_RUN_AS_NODE, '1');
  assert.equal(vars.BRAINFILE_AGENT_ROLE, 'lead');
  assert.equal(vars.BRAINFILE_LEAD_SCOPE, 'epic-6');

  const shim = vars.PATH.split(':')[0];
  assert.ok(shim.startsWith(path.join(dir, 'bin') + path.sep), vars.PATH);
  assert.ok(fs.existsSync(path.join(shim, 'brainfile')));
  assert.equal(agentEnv().PATH?.split(':')[0], shim);
  // The person's PATH is kept after it.
  assert.ok(agentEnv().PATH?.endsWith(process.env.PATH ?? ''));
});

test('the shim runs the app’s CLI the same way, with what it is given', () => {
  const dir = scratch();
  const bin = path.join(dir, 'Brainfile Helper');
  // Stands for the app's binary: says whether it runs as node, and what it was asked.
  fs.writeFileSync(bin, '#!/bin/sh\nprintf "%s|" "$ELECTRON_RUN_AS_NODE" "$@"\n', { mode: 0o755 });
  const folder = writeShim(path.join(dir, 'bin'), { command: bin, args: ["/it's/cli.js"], env: { ELECTRON_RUN_AS_NODE: '1' } });
  const r = spawnSync('brainfile', ['dispatch', 'status', '--json'], { encoding: 'utf-8', env: { ...process.env, PATH: `${folder}:${process.env.PATH}` } });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "1|/it's/cli.js|dispatch|status|--json|");
  // Written again only when what it runs changes; another launch gets a folder of its own.
  assert.equal(writeShim(path.join(dir, 'bin'), { command: bin, args: ["/it's/cli.js"], env: { ELECTRON_RUN_AS_NODE: '1' } }), folder);
  assert.notEqual(writeShim(path.join(dir, 'bin'), { command: bin, args: ['/other/cli.js'] }), folder);
  assert.match(shimScript({ command: '/a b/Brainfile', args: ['/c/cli.js'], env: { ELECTRON_RUN_AS_NODE: '1' } }), /^ELECTRON_RUN_AS_NODE='1' exec '\/a b\/Brainfile' '\/c\/cli.js' "\$@"$/m);
});

/** Electron's own binary from node_modules, when it has been downloaded: what a development build runs the CLI with. */
const ELECTRON = path.resolve(import.meta.dirname, '..', 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron');

test('the shim reaches this repository’s own CLI, run by Electron as node, whatever brainfile is installed', { skip: !fs.existsSync(REPO_CLI) && 'cli/dist is not built' }, () => {
  const dir = scratch();
  const runner = fs.existsSync(ELECTRON) ? ELECTRON : process.execPath;
  const own = appBrainfile({ [APP_CLI_ENV]: REPO_CLI, [ELECTRON_BIN_ENV]: runner }, dir);
  assert.ok(typeof own !== 'string' && own.shim, String(own));
  const board = path.join(dir, 'repo', '.brainfile');
  fs.mkdirSync(path.join(board, 'board'), { recursive: true });
  fs.mkdirSync(path.join(board, 'logs'));
  fs.writeFileSync(path.join(board, 'brainfile.md'), '---\ntitle: Scratch\ncolumns:\n  - id: todo\n    title: To Do\n---\n');
  const run = (...args: string[]) => spawnSync('brainfile', args, { cwd: path.join(dir, 'repo'), encoding: 'utf-8', env: { ...process.env, PATH: `${own.shim}:${process.env.PATH}` } });
  const version = JSON.parse(fs.readFileSync(path.resolve(REPO_CLI, '..', '..', 'package.json'), 'utf-8')).version;
  const said = run('--version');
  assert.equal(said.status, 0, said.stderr);
  assert.equal(said.stdout.trim(), version);
  // A command this CLI has (an older installed one has no dispatch), parsed as node parses: the script is not taken for a command.
  const status = run('dispatch', 'status', '--json');
  assert.equal(status.status, 0, status.stderr);
  assert.deepEqual(JSON.parse(status.stdout).queued, []);
});

test('a CLI that is not there is said, and fails the session that would have the board, rather than give it another', () => {
  const dir = scratch();
  const missing = path.join(dir, 'cli', 'dist', 'cli.js');
  const why = appBrainfile({ [APP_CLI_ENV]: missing, [ELECTRON_BIN_ENV]: process.execPath }, dir);
  assert.equal(why, `Brainfile's own command line is not at ${missing}: build it with \`npm run build\` at the repository’s root`);
  const packaged = appBrainfile({ [APP_CLI_ENV]: '/Applications/Brainfile.app/Contents/Resources/cli/dist/cli.js', [ELECTRON_BIN_ENV]: process.execPath }, dir);
  assert.match(String(packaged), /install Brainfile again$/);
  assert.match(String(appBrainfile({}, dir)), /was not handed to its agents process/);

  useBrainfile(() => appBrainfile({ [APP_CLI_ENV]: missing, [ELECTRON_BIN_ENV]: process.execPath }, dir));
  assert.throws(() => brainfileMcp({ role: 'chat' }), { message: why as string });
  assert.ok(!fs.existsSync(path.join(dir, 'bin')));
});
