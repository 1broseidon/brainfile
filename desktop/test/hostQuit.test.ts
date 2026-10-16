/**
 * The board host's last commits on quit (host.ts): main stops it with
 * SIGTERM once the agents process has let go, and what its debounce had not
 * committed yet (the releases and notes that letting go wrote) is committed
 * then, rather than left in the board's working tree for some later change's
 * commit. Run as a child process, as Electron runs it, so the signal is the
 * real thing: without a handler it ends the process with no `exit` event.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildSync } from 'esbuild';

const ROOT = path.resolve(import.meta.dirname, '..');
const GIT_ENV = { GIT_CONFIG_GLOBAL: os.devNull, GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com' };

function git(args: string[], cwd: string): string {
  const r = spawnSync('git', args, { cwd, encoding: 'utf-8', env: { ...process.env, ...GIT_ENV } });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

/** A repository whose board lives on its own branch, so the host commits its writes. */
function gitBoard(project: string): string {
  fs.mkdirSync(project, { recursive: true });
  git(['init', '-q', '-b', 'main'], project);
  fs.writeFileSync(path.join(project, 'README.md'), 'code\n');
  git(['add', '-A'], project);
  git(['commit', '-q', '-m', 'init'], project);
  const dotDir = path.join(project, '.brainfile');
  git(['worktree', 'add', '-q', '--orphan', '-b', 'brainfile', dotDir], project);
  fs.mkdirSync(path.join(dotDir, 'board'));
  fs.mkdirSync(path.join(dotDir, 'logs'));
  fs.writeFileSync(path.join(dotDir, 'brainfile.md'), '---\ntitle: Test\ncolumns:\n  - id: todo\n    title: To Do\n  - id: review\n    title: Review\n---\n');
  fs.writeFileSync(path.join(dotDir, 'board', 'task-1.md'), '---\nid: task-1\ntitle: Task 1\ncolumn: todo\n---\n\nDo it.\n');
  git(['add', '-A'], dotDir);
  git(['commit', '-q', '-m', 'board'], dotDir);
  fs.appendFileSync(path.join(project, '.git', 'info', 'exclude'), '.brainfile/\n');
  return dotDir;
}

test('SIGTERM commits what the host’s last writes left in its debounce, then it exits', async () => {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bf-host-quit-')));
  try {
    const project = path.join(base, 'repo');
    const dotDir = gitBoard(project);
    const hostFile = path.join(base, 'host.cjs');
    buildSync({
      entryPoints: [path.join(ROOT, 'src', 'host', 'host.ts')],
      outfile: hostFile,
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node22',
      external: ['electron', 'bufferutil', 'utf-8-validate'],
      logLevel: 'silent',
    });
    // Electron's parentPort, played by an emitter: the host answers on it, and this script asks as main does.
    const wrapper = path.join(base, 'run-host.cjs');
    fs.writeFileSync(
      wrapper,
      `const { EventEmitter } = require('node:events');
const pending = new Map();
const port = Object.assign(new EventEmitter(), { postMessage(message) { if (message.kind === 'reply') pending.get(message.id)?.(message.result); } });
process.parentPort = port;
require(${JSON.stringify(hostFile)});
let next = 1;
const call = (method, ...args) => new Promise((resolve) => { const id = next++; pending.set(id, resolve); port.emit('message', { data: { id, method, args } }); });
(async () => {
  const opened = await call('openBoard', ${JSON.stringify(project)});
  if (!opened.ok) { console.error(opened.error); process.exit(2); }
  // As the agents process's letting go writes: a note, which the host's debounce (1.2 s) has not committed yet.
  const noted = await call('noteTask', ${JSON.stringify(project)}, 'task-1', 'Stopped as the app quit');
  if (!noted.ok) { console.error(noted.error); process.exit(2); }
  console.log('noted');
  // Main stops the host now.
  process.kill(process.pid, 'SIGTERM');
})();
`
    );
    const child = spawn(process.execPath, [wrapper], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...GIT_ENV } });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (err += chunk.toString()));
    const ended = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => child.on('close', (code, signal) => resolve({ code, signal })));
    // Its own exit, not the signal's.
    assert.deepEqual(ended, { code: 0, signal: null }, err);
    assert.equal(out.trim().split('\n').at(-1), 'noted');
    assert.equal(git(['log', '-1', '--format=%s'], dotDir), 'note task-1');
    assert.equal(git(['status', '--porcelain'], dotDir), '');
    assert.match(fs.readFileSync(path.join(dotDir, 'board', 'task-1.md'), 'utf-8'), /Stopped as the app quit/);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});
