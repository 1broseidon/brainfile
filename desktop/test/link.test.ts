/**
 * The phone link, desk side (task-40, brainfile-mobile docs/link.md): the
 * real server on a real socket, and a fake phone in Node speaking the same
 * noise.ts. The desk behind it is the real bridge (linkDesk, BoardHolds)
 * over a fake host and agents process that record what reached them.
 */
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import { WebSocket } from 'ws';
import { bundled } from './bundle.ts';
import { ENDED_MS, ENDED_RUNS, liveRuns } from '../src/agents/live.ts';

type Link = typeof import('../src/link/server.ts') &
  typeof import('../src/link/noise.ts') &
  typeof import('../src/link/store.ts') &
  typeof import('../src/link/bridge.ts') &
  typeof import('../src/link/addresses.ts');

const L = bundled<Link>('src/link/server.ts', 'src/link/noise.ts', 'src/link/store.ts', 'src/link/bridge.ts', 'src/link/addresses.ts');
const { LinkServer, LinkStore, BoardHolds, linkDesk, Initiator, keyPair, sealFrame, FrameReader, fromBase64Url, toBase64Url, MAX_CHUNK, MAX_MESSAGE, checkCall, orderAddresses } = L;

const HERE = '/repos/here';
const THERE = '/repos/there';
const PROJECTS = [
  { id: HERE, name: 'here', path: HERE, state: { status: 'ready', storage: 'linked', dotDir: `${HERE}/.brainfile` }, repo: { owner: '1broseidon', name: 'brainfile' }, ref: 'board' },
  { id: THERE, name: 'there', path: THERE, state: { status: 'ready', storage: 'plain', dotDir: `${THERE}/.brainfile` } },
];

const snapshot = (projectId: string, title = 'a board', extra: Record<string, unknown> = {}) =>
  ({ projectId, title, columns: [], tasks: [], completed: [], typeNames: [], decisions: [], storage: 'plain', sync: {}, integrity: {}, related: [], sources: {}, ...extra }) as never;

let dir: string;
let store: InstanceType<typeof LinkStore>;
let server: InstanceType<typeof LinkServer>;
let holds: InstanceType<typeof BoardHolds>;
let opened: string[];
let closed: string[];
let calls: { to: 'host' | 'agents'; method: string; args: unknown[] }[];
let projects: typeof PROJECTS;
const phones: Phone[] = [];

/** A sealer that is not the identity, so a test can see the key is never written in the clear. */
const sealer = {
  seal: (text: string) => Buffer.from(`sealed:${Buffer.from(text).toString('hex')}`),
  open: (sealed: Buffer) => Buffer.from(sealed.toString().replace(/^sealed:/, ''), 'hex').toString(),
};

function makeServer(limits: Record<string, number> = {}) {
  const log = calls;
  return new LinkServer({
    store,
    desk: linkDesk({
      host: async (method, ...args) => {
        log.push({ to: 'host', method, args });
        return method === 'getTask' ? { ok: true, value: { id: args[1], title: 'A task' } } : { ok: true, value: undefined };
      },
      agents: async (method, ...args) => {
        log.push({ to: 'agents', method, args });
        if (method === 'live') return { runs: [], asks: [] };
        if (method === 'listAgents') return [{ id: 'claude', name: 'Claude Code', available: true, note: 'your login' }];
        return undefined;
      },
      holds,
      projects: async () => projects,
      knows: (id) => projects.some((p) => p.id === id),
    }),
    addresses: (port) => [`127.0.0.1:${port}`, `Desk.local:${port}`],
    name: 'George’s MacBook Pro',
    listenHost: '127.0.0.1',
    limits,
  });
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-link-'));
  store = new LinkStore(path.join(dir, 'link.json'), sealer);
  // Any free port, so a running desk is never in the way.
  store.port = 0;
  // Each test's own lists: a phone let go after a test ends must not land in the next one's.
  const o: string[] = (opened = []);
  const c: string[] = (closed = []);
  calls = [];
  projects = PROJECTS.map((p) => ({ ...p }));
  holds = new BoardHolds({
    open: async (projectId) => {
      o.push(projectId);
      return { ok: true, value: snapshot(projectId) };
    },
    close: async (projectId) => {
      c.push(projectId);
    },
  });
  server = makeServer();
});

afterEach(async () => {
  for (const phone of phones.splice(0)) phone.ws.terminate();
  await server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

// ── A phone ────────────────────────────────────────────────────────────────

interface Code {
  k: string;
  s: string;
  a: string[];
  n: string;
}

/** The pairing link, parsed by hand as the phone does. */
function parse(link: string): Code {
  assert.match(link, /^brainfile:\/\/link\?v=1&k=[A-Za-z0-9_-]{43}&s=[A-Za-z0-9_-]{43}&a=[^&]+&n=[^&]+$/);
  const fields = Object.fromEntries(
    link
      .slice('brainfile://link?'.length)
      .split('&')
      .map((pair) => [pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1)])
  );
  return { k: fields.k, s: fields.s, a: fields.a.split(','), n: decodeURIComponent(fields.n) };
}

async function code(): Promise<Code> {
  const result = await server.code();
  assert.ok(result.ok, !result.ok ? result.error : '');
  return parse(result.value.link);
}

type Frame = Record<string, any>;

class Phone {
  ws!: WebSocket;
  hello: Frame | null = null;
  frames: Frame[] = [];
  /** The size of every WebSocket message the desk sent after the handshake. */
  sizes: number[] = [];
  closed: Promise<{ code: number; reason: string }>;
  private session: { send: any; receive: any } | null = null;
  private reader: InstanceType<typeof FrameReader> | null = null;
  private waiters: { match: (f: Frame) => boolean; resolve: (f: Frame) => void }[] = [];
  private nextId = 1;
  private setClosed!: (value: { code: number; reason: string }) => void;

  readonly key: ReturnType<typeof keyPair>;

  constructor(key = keyPair(new Uint8Array(randomBytes(32)))) {
    this.key = key;
    this.closed = new Promise((resolve) => (this.setClosed = resolve));
  }

  /** Opens the socket and sends message 1; resolves with the hello, or null once the desk has closed. */
  open(port: number, desk: Uint8Array, payload: unknown, first?: (initiator: InstanceType<typeof Initiator>) => Uint8Array | string): Promise<Frame | null> {
    phones.push(this);
    this.ws = new WebSocket(`ws://127.0.0.1:${port}/link/1`);
    const initiator = new Initiator(this.key, desk, keyPair(new Uint8Array(randomBytes(32))));
    this.ws.on('close', (code, reason) => this.setClosed({ code, reason: reason.toString() }));
    this.ws.on('error', () => {});
    return new Promise((resolve) => {
      this.ws.on('open', () => this.ws.send(first ? first(initiator) : initiator.writeMessage1(new TextEncoder().encode(JSON.stringify(payload)))));
      this.ws.on('message', (data: Buffer) => {
        const bytes = new Uint8Array(data);
        if (!this.session) {
          const { payload, session } = initiator.readMessage2(bytes);
          this.session = session;
          this.reader = new FrameReader(session.receive);
          this.hello = JSON.parse(new TextDecoder().decode(payload));
          return resolve(this.hello);
        }
        this.sizes.push(bytes.length);
        const frame = this.reader!.push(bytes);
        if (!frame) return;
        const parsed = JSON.parse(new TextDecoder().decode(frame));
        this.frames.push(parsed);
        const waiter = this.waiters.find((w) => w.match(parsed));
        if (waiter) {
          this.waiters.splice(this.waiters.indexOf(waiter), 1);
          waiter.resolve(parsed);
        }
      });
      void this.closed.then(() => resolve(null));
    });
  }

  /** A frame already in, or the next one that matches. */
  next(match: (f: Frame) => boolean, ms = 2000): Promise<Frame> {
    const seen = this.frames.find(match);
    if (seen) {
      this.frames.splice(this.frames.indexOf(seen), 1);
      return Promise.resolve(seen);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no such frame')), ms);
      this.waiters.push({
        match,
        resolve: (f) => {
          clearTimeout(timer);
          this.frames.splice(this.frames.indexOf(f), 1);
          resolve(f);
        },
      });
    });
  }

  event(name: string, ms?: number): Promise<Frame> {
    return this.next((f) => f.event === name, ms);
  }

  send(frame: unknown): void {
    for (const chunk of sealFrame(this.session!.send, new TextEncoder().encode(JSON.stringify(frame)))) this.ws.send(chunk);
  }

  call(call: string, ...args: unknown[]): Promise<Frame> {
    const id = this.nextId++;
    this.send({ id, call, args });
    return this.next((f) => f.id === id);
  }
}

const deskKey = (c: Code) => fromBase64Url(c.k);
const port = () => server.port!;

/** A phone paired with a fresh code, its hello in. */
async function paired(name = 'iPhone 16 Pro'): Promise<Phone> {
  const c = await code();
  const phone = new Phone();
  const hello = await phone.open(port(), deskKey(c), { pair: c.s, phone: name });
  assert.ok(hello, 'the desk said hello');
  return phone;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Pairing ────────────────────────────────────────────────────────────────

test('a phone with the open code is let in, kept as linked, and told who the desk is', async () => {
  let changes = 0;
  server = new LinkServer({ ...(server as any).options, onChange: () => changes++ });
  const c = await code();
  assert.equal(c.k, toBase64Url(store.key().public));
  assert.deepEqual(c.a, [`127.0.0.1:${port()}`, `Desk.local:${port()}`]);
  assert.equal(c.n, 'George’s MacBook Pro');
  assert.equal(store.on, true, 'showing a code turned the link on');

  const phone = new Phone();
  const hello = await phone.open(port(), deskKey(c), { pair: c.s, phone: 'iPhone 16 Pro' });
  assert.deepEqual(hello, { desk: store.deskId, name: 'George’s MacBook Pro', addresses: [`127.0.0.1:${port()}`, `Desk.local:${port()}`], protocol: 1 });
  const linked = store.phone(toBase64Url(phone.key.public));
  assert.equal(linked?.name, 'iPhone 16 Pro');
  assert.equal(server.view().paired?.name, 'iPhone 16 Pro');
  assert.equal(server.view().phones[0].connected, true);
  assert.ok(changes > 0);
  // Projects come unasked, on connect.
  const first = await phone.event('projects');
  assert.deepEqual(first.projects, PROJECTS);

  // The secret is spent: a second phone with the same code is refused.
  const late = new Phone();
  assert.equal(await late.open(port(), deskKey(c), { pair: c.s, phone: 'iPad' }), null);
  assert.equal((await late.closed).code, 4403);
});

test('a linked phone comes back with an empty payload', async () => {
  const first = await paired();
  first.ws.close();
  await first.closed;
  const before = store.phone(toBase64Url(first.key.public))!.lastSeen;
  await sleep(5);
  const again = new Phone(first.key);
  const hello = await again.open(port(), store.key().public, {});
  assert.equal(hello?.desk, store.deskId);
  assert.ok(store.phone(toBase64Url(first.key.public))!.lastSeen > before);
  await again.event('projects');
});

test('a wrong, expired or retired secret is 4403, and only an accepted pairing spends one', async () => {
  server = makeServer({ codeMs: 80 });
  const c = await code();
  const wrong = new Phone();
  assert.equal(await wrong.open(port(), deskKey(c), { pair: toBase64Url(randomBytes(32)), phone: 'x' }), null);
  assert.equal((await wrong.closed).code, 4403);
  const garbled = new Phone();
  await garbled.open(port(), deskKey(c), { pair: 'not base64!', phone: 'x' });
  assert.equal((await garbled.closed).code, 4403);
  // The refusals did not spend it.
  const good = new Phone();
  assert.ok(await good.open(port(), deskKey(c), { pair: c.s, phone: 'x' }));

  const old = await code();
  await code();
  const retired = new Phone();
  await retired.open(port(), deskKey(old), { pair: old.s, phone: 'x' });
  assert.equal((await retired.closed).code, 4403, 'a new code retires the old');

  const fresh = await code();
  await sleep(120);
  const expired = new Phone();
  await expired.open(port(), deskKey(fresh), { pair: fresh.s, phone: 'x' });
  assert.equal((await expired.closed).code, 4403);
  assert.equal(store.phones().length, 1);
});

test('a key the desk does not know, with no pairing, is 4401', async () => {
  const c = await code();
  const stranger = new Phone();
  assert.equal(await stranger.open(port(), deskKey(c), {}), null);
  assert.equal((await stranger.closed).code, 4401);
});

test('garbage is 4400: not a handshake, a text message, a payload that is not JSON, the wrong desk key', async () => {
  const c = await code();
  const noise = new Phone();
  await noise.open(port(), deskKey(c), null, () => new Uint8Array(randomBytes(120)));
  assert.equal((await noise.closed).code, 4400);
  const text = new Phone();
  await text.open(port(), deskKey(c), null, () => 'hello');
  assert.equal((await text.closed).code, 4400);
  const notJson = new Phone();
  await notJson.open(port(), deskKey(c), null, (i) => i.writeMessage1(new TextEncoder().encode('pair me')));
  assert.equal((await notJson.closed).code, 4400);
  const elsewhere = new Phone();
  await elsewhere.open(port(), keyPair(new Uint8Array(randomBytes(32))).public, { pair: c.s });
  assert.equal((await elsewhere.closed).code, 4400);
  // After the handshake, a text message is still an error.
  const phone = await paired();
  phone.ws.send('{"id":1,"call":"projects"}');
  assert.equal((await phone.closed).code, 4400);
});

test('message 1 waits ten seconds at most (here, less)', async () => {
  server = makeServer({ helloMs: 60 });
  await code();
  const ws = new WebSocket(`ws://127.0.0.1:${port()}/link/1`);
  const closedWith = await new Promise<number>((resolve) => ws.on('close', (code) => resolve(code)));
  assert.equal(closedWith, 4400);
});

test('only /link/1: another protocol is 4409, anything else is closed', async () => {
  await code();
  const newer = new WebSocket(`ws://127.0.0.1:${port()}/link/2`);
  assert.equal(await new Promise((resolve) => newer.on('close', (code) => resolve(code))), 4409);
  const other = new WebSocket(`ws://127.0.0.1:${port()}/`);
  const status = await new Promise((resolve) => {
    other.on('unexpected-response', (_req, res) => resolve(res.statusCode));
    other.on('error', () => resolve('error'));
  });
  assert.equal(status, 404);
});

test('ten failed handshakes in a minute, and that address waits', async () => {
  const c = await code();
  for (let i = 0; i < 10; i++) {
    const bad = new Phone();
    await bad.open(port(), deskKey(c), { pair: 'nope' });
    assert.equal((await bad.closed).code, 4403);
  }
  // Even the right code is turned away now.
  const good = new Phone();
  assert.equal(await good.open(port(), deskKey(c), { pair: c.s, phone: 'x' }), null);
  assert.deepEqual(await good.closed, { code: 4400, reason: 'Wait a minute' });
});

test('at most eight sockets', async () => {
  await code();
  const open: WebSocket[] = [];
  for (let i = 0; i < 8; i++) {
    const ws = new WebSocket(`ws://127.0.0.1:${port()}/link/1`);
    await new Promise((resolve) => ws.on('open', resolve));
    open.push(ws);
  }
  const ninth = new WebSocket(`ws://127.0.0.1:${port()}/link/1`);
  const status = await new Promise((resolve) => {
    ninth.on('unexpected-response', (_req, res) => resolve(res.statusCode));
    ninth.on('open', () => resolve('open'));
  });
  assert.equal(status, 503);
  for (const ws of open) ws.terminate();
});

test('a WebSocket message over 65,535 bytes closes the socket', async () => {
  const phone = await paired();
  phone.ws.send(new Uint8Array(MAX_MESSAGE + 1));
  assert.equal((await phone.closed).code, 1009);
});

// ── Calls ──────────────────────────────────────────────────────────────────

test('a call off the list is Not allowed; bad arguments and unknown projects are said so', async () => {
  const phone = await paired();
  for (const call of ['deleteTask', 'removeProject', 'settleBoards', 'mergeReview', 'setSettings', 'discuss', 'constructor', '__proto__', 42]) {
    assert.deepEqual(await phone.call(call as string, HERE, 'task-1'), { id: (phone as any).nextId - 1, error: 'Not allowed' });
  }
  assert.equal((await phone.call('getTask', HERE)).error, 'Bad arguments', 'one argument short');
  assert.equal((await phone.call('getTask', HERE, 7)).error, 'Bad arguments');
  assert.equal((await phone.call('moveTask', HERE, 'task-1', 'done', 1, 'extra')).error, 'Bad arguments');
  assert.equal((await phone.call('addTask', HERE, { title: 'x', column: 'todo', evil: true })).error, 'Bad arguments');
  assert.equal((await phone.call('getTask', '/etc', 'task-1')).error, 'Unknown project');
  assert.deepEqual(calls, [], 'none of it reached the desk');

  // What is allowed goes where the window's would.
  assert.deepEqual((await phone.call('getTask', HERE, 'task-1')).value, { ok: true, value: { id: 'task-1', title: 'A task' } });
  assert.deepEqual((await phone.call('listAgents')).value, [{ id: 'claude', name: 'Claude Code', available: true, note: 'your login' }]);
  assert.deepEqual((await phone.call('live')).value, { runs: [], asks: [] });
  assert.deepEqual((await phone.call('projects')).value, PROJECTS);
  assert.deepEqual(await phone.call('stopRun', 'run-3'), { id: (phone as any).nextId - 1, value: null });
  await phone.call('decide', HERE, { title: 'Use undici', claimKey: 'dependency.http-client' });
  await phone.call('ask', HERE, 'claude', 'What is next?', 't-1', null, null, ['task-1']);
  await phone.call('answerPermission', 'ask-1', null);
  assert.deepEqual(calls, [
    { to: 'host', method: 'getTask', args: [HERE, 'task-1'] },
    { to: 'agents', method: 'listAgents', args: [] },
    { to: 'agents', method: 'live', args: [] },
    { to: 'agents', method: 'stopRun', args: ['run-3'] },
    { to: 'host', method: 'decide', args: [HERE, { title: 'Use undici', claimKey: 'dependency.http-client' }] },
    // A null for an optional argument is passed on as left out, so the callee's defaults apply.
    { to: 'agents', method: 'ask', args: [HERE, 'claude', 'What is next?', 't-1', undefined, undefined, ['task-1']] },
    // answerPermission's null declines.
    { to: 'agents', method: 'answerPermission', args: ['ask-1', null] },
  ]);
});

test('checkCall: the shapes, cheaply', () => {
  assert.deepEqual(checkCall('closeBoard', [HERE]), { ok: true, call: 'closeBoard', args: [HERE], projectId: HERE });
  assert.deepEqual(checkCall('listAgents', undefined), { ok: true, call: 'listAgents', args: [], projectId: null });
  assert.equal(checkCall('patchTask', [HERE, 'task-1', { priority: null, tags: ['a'] }]).ok, true);
  assert.equal(checkCall('patchTask', [HERE, 'task-1', { priority: 'urgent' }]).ok, false);
  assert.equal(checkCall('noteTask', [HERE, 'task-1', '   ']).ok, false);
  assert.equal(checkCall('decide', [HERE, { title: 'x', claimKey: 3 }]).ok, false);
  assert.equal(checkCall('ask', [HERE, 'claude', 'hi', 't', 'opus', [{ who: 'you', text: 'a' }], [], { codex: 'gpt-5.5' }]).ok, true);
  assert.equal(checkCall('ask', [HERE, 'claude', 'hi', 't', 'opus', [{ who: 'them', text: 'a' }]]).ok, false);
  assert.equal(checkCall('hasOwnProperty', []).ok, false);
});

test('a null in every call is an optional argument left out, never one that is needed', () => {
  const args = (call: string, given: unknown[]) => {
    const checked = checkCall(call, given);
    assert.ok(checked.ok, `${call} is allowed`);
    return checked.args;
  };
  assert.deepEqual(args('moveTask', [HERE, 'task-1', 'done', null]), [HERE, 'task-1', 'done', undefined]);
  assert.deepEqual(args('dispatch', [HERE, 'task-1', 'claude', null]), [HERE, 'task-1', 'claude', undefined]);
  assert.deepEqual(args('ask', [HERE, 'claude', 'hi', 't', null, null, null, { codex: 'gpt-5.5' }]), [HERE, 'claude', 'hi', 't', undefined, undefined, undefined, { codex: 'gpt-5.5' }]);
  assert.deepEqual(args('answerPermission', ['ask-1', null]), ['ask-1', null], 'a choice: it declines');
  for (const [call, given] of [
    ['openBoard', [null]],
    ['getTask', [HERE, null]],
    ['addTask', [HERE, null]],
    ['patchTask', [HERE, 'task-1', null]],
    ['noteTask', [HERE, 'task-1', null]],
    ['decide', [HERE, null]],
    ['listModels', [null]],
    ['dispatch', [HERE, null, 'claude']],
    ['ask', [HERE, 'claude', null, 't']],
    ['stopRun', [null]],
    ['answerPermission', [null, 'allow_once']],
  ] as const) {
    assert.equal(checkCall(call, [...given]).ok, false, `${call} needs it`);
  }
});

test('live: the runs not ended, and those that ended in the last 30 minutes, the latest 50', () => {
  const now = 10 * ENDED_MS;
  const run = (id: string, endedAt?: number) => ({ id, projectId: HERE, agentId: 'claude', kind: 'ask', state: endedAt === undefined ? 'working' : 'done', activity: 'thinking', startedAt: 0, ...(endedAt === undefined ? {} : { endedAt, reply: `reply ${id}` }) }) as never;
  const told = liveRuns([run('working'), run('old', now - ENDED_MS - 1), run('lately', now - ENDED_MS), run('just', now - 1)], now);
  assert.deepEqual(told.map((r: { id: string }) => r.id), ['working', 'lately', 'just']);
  assert.equal((told[2] as { reply?: string }).reply, 'reply just', 'with its reply');
  const many = Array.from({ length: ENDED_RUNS + 10 }, (_, i) => run(`run-${i}`, now - ENDED_RUNS - 10 + i));
  const latest = liveRuns([...many, run('working')], now).map((r: { id: string }) => r.id);
  assert.equal(latest.length, ENDED_RUNS + 1);
  assert.equal(latest[0], 'run-10', 'the ten that ended first are left out');
  assert.equal(latest.at(-1), 'working');
});

// ── Events ─────────────────────────────────────────────────────────────────

test('board events reach a phone only for boards it opened, one per board per 500 ms, the latest winning', async () => {
  const phone = await paired();
  const other = await paired('Pixel 9');
  assert.deepEqual((await phone.call('openBoard', HERE)).value, { ok: true, value: snapshot(HERE) });
  server.board(snapshot(HERE, 'first'));
  assert.equal((await phone.event('board')).snapshot.title, 'first');
  server.board(snapshot(HERE, 'second'));
  server.board(snapshot(HERE, 'third'));
  server.board(snapshot(THERE, 'not opened'));
  const started = Date.now();
  const paced = await phone.event('board', 1500);
  assert.equal(paced.snapshot.title, 'third', 'the latest wins');
  assert.ok(Date.now() - started >= 400, 'and waits its turn');
  await sleep(50);
  assert.equal(phone.frames.filter((f) => f.event === 'board').length, 0, 'second was never sent, nor the board not opened');
  assert.equal(other.frames.filter((f) => f.event === 'board').length, 0, 'nor anything to the phone that opened nothing');

  // Agent events go to every phone.
  const run = { kind: 'run', run: { id: 'run-1', projectId: THERE, agentId: 'claude', kind: 'ask', state: 'working', activity: 'editing', startedAt: 1 } };
  server.agent(run as never);
  assert.deepEqual((await phone.event('agent')).agent, run);
  assert.deepEqual((await other.event('agent')).agent, run);

  // And the projects, whenever they change.
  await phone.event('projects');
  await other.event('projects');
  projects = projects.filter((p) => p.id !== HERE);
  await server.projectsChanged();
  assert.deepEqual((await phone.event('projects')).projects.map((p: { id: string }) => p.id), [THERE]);
  assert.deepEqual((await other.event('projects')).projects.map((p: { id: string }) => p.id), [THERE]);
  server.board(snapshot(HERE, 'removed'));
  await sleep(600);
  assert.equal(phone.frames.filter((f) => f.event === 'board').length, 0, 'a board gone from the desk is no longer sent');
});

test('boards are held: neither a phone nor the window closes one the other still has open', async () => {
  await holds.open('window', HERE);
  const phone = await paired();
  await phone.call('openBoard', HERE);
  await phone.call('openBoard', THERE);
  assert.deepEqual(opened, [HERE, HERE, THERE], 'the host is asked to open each time; it opens once');

  // The phone lets go of HERE: the window still holds it.
  await phone.call('closeBoard', HERE);
  assert.deepEqual(closed, []);
  server.board(snapshot(HERE, 'after close'));
  await sleep(50);
  assert.equal(phone.frames.filter((f) => f.event === 'board').length, 0, 'and hears no more of it');

  // The phone goes: THERE, which only it held, closes.
  phone.ws.close();
  await phone.closed;
  await sleep(20);
  assert.deepEqual(closed, [THERE]);

  // A phone holds HERE; the window closing it leaves it open for the phone.
  const second = await paired('Pixel 9');
  await second.call('openBoard', HERE);
  await holds.close('window', HERE);
  assert.deepEqual(closed, [THERE]);
  await second.call('closeBoard', HERE);
  assert.deepEqual(closed, [THERE, HERE]);
});

test('Forget sends bye, closes with 4410, and the phone is no longer let in', async () => {
  const phone = await paired();
  const key = toBase64Url(phone.key.public);
  const view = server.forget(key);
  assert.deepEqual(view.phones, []);
  assert.deepEqual(await phone.event('bye'), { event: 'bye', reason: 'forgotten' });
  assert.equal((await phone.closed).code, 4410);
  const back = new Phone(phone.key);
  assert.equal(await back.open(port(), store.key().public, {}), null);
  assert.equal((await back.closed).code, 4401);
});

test('forget from the phone: answered, then bye and 4410, and the phone is gone from the store', async () => {
  const phone = await paired();
  const other = await paired('Pixel 9');
  const key = toBase64Url(phone.key.public);
  assert.deepEqual(await phone.call('forget'), { id: (phone as any).nextId - 1, value: {} });
  assert.deepEqual(await phone.event('bye'), { event: 'bye', reason: 'forgotten' });
  assert.equal((await phone.closed).code, 4410);
  assert.equal(store.phone(key), undefined);
  assert.deepEqual(store.phones().map((p) => p.name), ['Pixel 9'], 'only this phone goes');
  assert.deepEqual(server.view().phones.map((p) => [p.name, p.connected]), [['Pixel 9', true]]);
  assert.deepEqual(calls, [], 'nothing reached the desk');
  assert.equal(other.frames.some((f) => f.event === 'bye'), false);
  const back = new Phone(phone.key);
  assert.equal(await back.open(port(), store.key().public, {}), null);
  assert.equal((await back.closed).code, 4401);
});

test('a frame larger than one message goes in chunks, both ways', async () => {
  const phone = await paired();
  await phone.call('openBoard', HERE);
  const big = 'x'.repeat(MAX_CHUNK * 2 + 1000);
  server.board(snapshot(HERE, 'big', { tasks: [{ id: 'task-1', description: big }] }));
  const frame = await phone.event('board');
  assert.equal(frame.snapshot.tasks[0].description, big);
  assert.ok(phone.sizes.length >= 3 && phone.sizes.every((n) => n <= MAX_MESSAGE), 'each WebSocket message within 65,535 bytes');
  // The phone's own large frame is put back together on the desk.
  const answer = await phone.call('noteTask', HERE, 'task-1', big);
  assert.deepEqual(answer.value, { ok: true });
  assert.equal((calls.at(-1)!.args[2] as string).length, big.length);
});

test('a phone back on another network replaces its old socket', async () => {
  const first = await paired();
  const again = new Phone(first.key);
  assert.ok(await again.open(port(), store.key().public, {}));
  assert.equal((await first.closed).code, 1000);
  assert.equal(server.view().phones[0].connected, true);
});

test('off closes every socket and stops listening; the phones stay linked', async () => {
  const phone = await paired();
  const view = await server.setOn(false);
  assert.equal(view.on, false);
  assert.equal(view.port, null);
  assert.equal((await phone.closed).code, 1001);
  assert.equal(store.phones().length, 1);
  await server.setOn(true);
  assert.ok(server.port);
});

test('the switch and a code pressed together make one server, on one port', async () => {
  const probe = (await import('node:net')).createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const free = (probe.address() as { port: number }).port;
  await new Promise((resolve) => probe.close(resolve));
  store.port = free;
  const [view, result] = await Promise.all([server.setOn(true), server.code(), server.setOn(true)]);
  assert.ok(result.ok);
  assert.equal(view.port, free);
  assert.equal(store.port, free, 'a second server would have moved to the next port');
});

// ── The store and the addresses ────────────────────────────────────────────

test('the desk key is made once, sealed at rest, and found again; the port is remembered', async () => {
  const pair = store.key();
  const file = fs.readFileSync(path.join(dir, 'link.json'), 'utf-8');
  assert.ok(!file.includes(toBase64Url(pair.secret)), 'the secret is never in the clear');
  const again = new LinkStore(path.join(dir, 'link.json'), sealer);
  assert.deepEqual(again.key().public, pair.public);
  assert.equal(again.deskId, store.deskId);

  // A port in use: the next one is taken and remembered.
  const blocker = (await import('node:net')).createServer();
  await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve));
  const taken = (blocker.address() as { port: number }).port;
  store.port = taken;
  await server.setOn(true);
  assert.notEqual(server.port, taken);
  assert.equal(store.port, server.port);
  assert.equal(new LinkStore(path.join(dir, 'link.json'), sealer).port, server.port);
  blocker.close();

  // While the Keychain cannot seal, nothing changes: the key and the phones wait for it.
  store.link('a-phone', 'iPhone');
  const locked = new LinkStore(path.join(dir, 'link.json'), {
    seal: () => { throw new Error('The Keychain is not available'); },
    open: () => { throw new Error('The Keychain is not available'); },
  });
  assert.throws(() => locked.key(), /Keychain/);
  assert.equal(locked.phones().length, 1);
  assert.deepEqual(new LinkStore(path.join(dir, 'link.json'), sealer).key().public, pair.public);

  // A key that no longer opens is replaced, and the phones linked to it go.
  const broken = new LinkStore(path.join(dir, 'link.json'), { ...sealer, open: () => { throw new Error('Keychain reset'); } });
  assert.notDeepEqual(broken.key().public, pair.public);
  assert.deepEqual(broken.phones(), []);
});

test('addresses: LAN first (Wi-Fi and Ethernet before the rest), then .local, then Tailscale; never internal or link-local', () => {
  const v4 = (address: string, internal = false) => ({ address, family: 'IPv4', internal, netmask: '', mac: '', cidr: null });
  const interfaces = {
    lo0: [v4('127.0.0.1', true)],
    bridge100: [v4('192.168.64.1')],
    utun4: [v4('100.101.102.103')],
    en0: [v4('192.168.1.20'), { ...v4('fe80::1'), family: 'IPv6' }],
    en7: [v4('169.254.10.2')],
    en1: [v4('10.0.0.5')],
  };
  assert.deepEqual(orderAddresses(interfaces as never, 47210, 'Georges-MacBook-Pro'), [
    '192.168.1.20:47210',
    '10.0.0.5:47210',
    '192.168.64.1:47210',
    'Georges-MacBook-Pro.local:47210',
    '100.101.102.103:47210',
  ]);
  assert.deepEqual(orderAddresses({}, 47210, null), []);
});
