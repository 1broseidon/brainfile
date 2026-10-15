/**
 * `npm run link:dev`: the phone link's real server, on port 47211, with a
 * fake desk behind it, for working on the phone in the iOS Simulator without
 * the app. Bundled and started by scripts/link-dev.mjs.
 *
 * - Two projects, copied fresh on every run from test/fixtures/link into a
 *   temporary folder and read and written by the real board host, run in
 *   this process: `brainfile`, shared as 1broseidon/brainfile (ref `board`),
 *   and `notes`, local only. Writes are real and land on the copies.
 * - A fake agent process: claude and codex. A dispatch or an ask starts a
 *   run that goes from starting to editing, asks permission (Allow once,
 *   Always, Reject), then finishes with a short reply, as AgentEvents over a
 *   few seconds. A dispatch also moves its task as an agent would.
 * - Two hand-offs on `brainfile` (devReviews.ts): task-7 can merge (+42 −7,
 *   three commits, into main; Merge checks for two seconds, then it lands
 *   and the task is completed), task-5 would conflict in src/a.ts (Merge
 *   sends it back to Codex, whose run settles it). Discard drops either.
 * - The link store lives in the same temporary folder and is kept between
 *   runs, so a phone linked once stays linked (`--fresh` starts over).
 *
 * The pairing link is printed, with a QR for a real phone, and with
 * `--link <file>` written to that file; a new one follows whenever it is
 * spent or runs out.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import QRCode from 'qrcode';
import { BoardHolds, linkDesk, type LinkCall } from './bridge';
import { LinkServer } from './server';
import { LinkStore } from './store';
import { deskAddresses, deskName } from './addresses';
import { inProcessHost } from './inProcess';
import { liveRuns } from '../agents/live';
import { DevReviews } from './devReviews';
import type { AgentEvent, AgentId, AgentInfo, AgentMethod, AgentRun, LinkProject, LinkView, PermissionAsk, ProjectState, Result } from '../shared/api';

const DEV_PORT = 47211;
/** How long a run waits for its permission ask before it carries on as if allowed. */
const ASK_WAIT_MS = 30_000;

function option(name: string): string | undefined {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : undefined;
}

const linkFile = option('--link') ? path.resolve(option('--link')!) : null;
const port = Number(option('--port') ?? DEV_PORT);
const fixture = process.env.BRAINFILE_LINK_FIXTURE ?? path.resolve(__dirname, '..', '..', 'test', 'fixtures', 'link');
const base = path.join(os.tmpdir(), 'brainfile-link-dev');

if (process.argv.includes('--fresh')) fs.rmSync(path.join(base, 'link.json'), { force: true });

// ── The projects: fresh copies of the fixture, every run ─────────────────────

const SHARED: Record<string, Pick<LinkProject, 'repo' | 'ref'>> = {
  brainfile: { repo: { owner: '1broseidon', name: 'brainfile' }, ref: 'board' },
  notes: {},
};

const projectsDir = path.join(base, 'projects');
fs.rmSync(projectsDir, { recursive: true, force: true });
const folders = Object.keys(SHARED).map((name) => {
  const folder = path.join(projectsDir, name);
  fs.cpSync(path.join(fixture, name), path.join(folder, '.brainfile'), { recursive: true });
  return folder;
});

const host = inProcessHost(() => require('../host/host'));

async function projects(): Promise<LinkProject[]> {
  return Promise.all(
    folders.map(async (folder) => ({
      id: folder,
      name: path.basename(folder),
      path: folder,
      state: await host.call<ProjectState>('locate', folder),
      ...SHARED[path.basename(folder)],
    }))
  );
}

// ── A fake agents process ─────────────────────────────────────────────────────

const AGENTS: AgentInfo[] = [
  { id: 'claude', name: 'Claude Code', available: true, note: 'your login' },
  { id: 'codex', name: 'Codex', available: true, note: 'your login' },
];

const nameOf = (agentId: string) => AGENTS.find((agent) => agent.id === agentId)?.name ?? agentId;

const LEVELS = (...names: string[]) => names.map((name) => ({ value: name.toLowerCase(), name }));

/** As a real agent lists them once their effort has been asked (task-50): Sonnet offers none, to show a model without levels. */
const MODELS: Record<string, { value: string; name: string; efforts: { value: string; name: string }[] }[]> = {
  claude: [
    { value: 'opus', name: 'Opus', efforts: LEVELS('Low', 'Medium', 'High', 'Max') },
    { value: 'sonnet', name: 'Sonnet', efforts: [] },
  ],
  codex: [{ value: 'gpt-5.5', name: 'GPT-5.5', efforts: LEVELS('Low', 'Medium', 'High', 'XHigh') }],
};

class FakeAgents {
  private readonly runs = new Map<string, AgentRun>();
  private readonly asks = new Map<string, { ask: PermissionAsk; resolve: (optionId: string | null) => void }>();
  private next = 1;
  private readonly reviews = new DevReviews({
    projectId: folders.find((folder) => path.basename(folder) === 'brainfile')!,
    worktrees: path.join(base, 'worktrees'),
    working: (projectId, taskId) => {
      const run = [...this.runs.values()].find((r) => r.kind === 'dispatch' && r.projectId === projectId && r.taskId === taskId && r.endedAt === undefined);
      return run ? nameOf(run.agentId) : null;
    },
    // As the desk sends a landing back: the note in the task's log, then the same agent on it.
    sendBack: async (projectId, taskId, agentId, note) => {
      const noted = await host.call<Result<unknown>>('noteTask', projectId, taskId, note);
      return noted.ok ? this.start({ projectId, taskId, agentId: agentId as AgentId, kind: 'dispatch' }) : noted;
    },
    nameOf,
  });

  constructor(private readonly emit: (event: AgentEvent) => void) {}

  call(method: AgentMethod, args: unknown[]): unknown {
    const [a, b, c, d, e] = args as string[];
    switch (method) {
      case 'listAgents':
        return AGENTS;
      case 'listModels':
        return MODELS[a] ? { ok: true, value: MODELS[a] } : { ok: false, error: `Unknown agent ${a}` };
      case 'live':
        return { runs: liveRuns(this.runs.values()), asks: [...this.asks.values()].map((p) => p.ask) };
      case 'dispatch':
        return this.start({ projectId: a, taskId: b, agentId: c as AgentId, model: d, effort: e, kind: 'dispatch' });
      case 'ask':
        return this.start({ projectId: a, agentId: b as AgentId, text: c, threadId: d, model: e, effort: args[8] as string | undefined, kind: 'ask' });
      case 'stopRun':
        return this.stop(a);
      case 'answerPermission':
        return this.answer(a, (args[1] as string | null) ?? null);
      case 'review':
        return this.reviews.review(a, b);
      case 'readyToMerge':
        return this.reviews.ready(a);
      case 'mergeReview':
        return this.reviews.merge(a, b);
      case 'discardReview':
        return this.reviews.discard(a, b);
      default:
        return { ok: false, error: `link:dev has no ${method}` };
    }
  }

  private update(run: AgentRun, patch: Partial<AgentRun>): void {
    Object.assign(run, patch);
    this.emit({ kind: 'run', run: { ...run } });
  }

  private start(spec: {
    projectId: string;
    agentId: AgentId;
    kind: AgentRun['kind'];
    taskId?: string;
    threadId?: string;
    model?: string;
    effort?: string;
    text?: string;
  }): Result<AgentRun> {
    if (!AGENTS.some((agent) => agent.id === spec.agentId)) return { ok: false, error: `Unknown agent ${spec.agentId}` };
    const run: AgentRun = {
      id: `run-${this.next++}`,
      projectId: spec.projectId,
      agentId: spec.agentId,
      kind: spec.kind,
      ...(spec.taskId ? { taskId: spec.taskId } : {}),
      ...(spec.threadId ? { threadId: spec.threadId } : {}),
      ...(spec.model ? { model: spec.model } : {}),
      ...(spec.model && spec.effort ? { effort: spec.effort } : {}),
      state: 'starting',
      activity: 'starting',
      startedAt: Date.now(),
    };
    this.runs.set(run.id, run);
    this.emit({ kind: 'run', run: { ...run } });
    void this.play(run, spec.text);
    return { ok: true, value: { ...run } };
  }

  /** Starting, editing, a permission ask, then done: what a real turn sends, over a few seconds. */
  private async play(run: AgentRun, text?: string): Promise<void> {
    const live = () => run.endedAt === undefined;
    await sleep(800);
    if (!live()) return;
    this.update(run, { state: 'working', activity: 'editing' });
    if (run.kind === 'dispatch' && run.taskId) await host.call('moveTask', run.projectId, run.taskId, 'in-progress');
    await sleep(1600);
    if (!live()) return;
    const file = run.taskId ? `.brainfile/board/${run.taskId}.md` : 'README.md';
    const ask: PermissionAsk = {
      id: `ask-${this.next++}`,
      runId: run.id,
      projectId: run.projectId,
      agentId: run.agentId,
      title: `Edit ${file}`,
      kind: 'edit',
      options: [
        { optionId: 'allow_once', name: 'Allow once', kind: 'allow_once' },
        { optionId: 'allow_always', name: 'Always', kind: 'allow_always' },
        { optionId: 'reject_once', name: 'Reject', kind: 'reject_once' },
      ],
    };
    this.update(run, { state: 'waiting' });
    const answered = new Promise<string | null>((resolve) => this.asks.set(ask.id, { ask, resolve }));
    this.emit({ kind: 'permission', ask });
    say(`  ${run.id} asks: ${ask.title} (${ask.id})`);
    const timeout = setTimeout(() => {
      say(`  ${ask.id} unanswered for ${ASK_WAIT_MS / 1000}s: allowing it`);
      this.answer(ask.id, 'allow_once');
    }, ASK_WAIT_MS);
    const choice = await answered;
    clearTimeout(timeout);
    if (!live()) return;
    const allowed = choice !== null && choice.startsWith('allow');
    this.update(run, { state: 'working', activity: allowed ? 'editing' : 'thinking' });
    await sleep(1200);
    if (!live()) return;
    let reply: string;
    if (run.kind === 'dispatch' && run.taskId) {
      reply = allowed ? `Done: ${run.taskId} is in Review.` : `Left ${run.taskId} as it was.`;
      if (allowed) {
        await host.call('noteTask', run.projectId, run.taskId, `Done by ${run.agentId} (link:dev)`);
        await host.call('moveTask', run.projectId, run.taskId, 'review');
      }
    } else {
      reply = allowed ? `Looked at the board${text ? ` about “${text.slice(0, 60)}”` : ''}: task-2 is next.` : 'Left it as it was.';
    }
    this.update(run, { state: 'done', reply, steps: [{ kind: 'tool', title: ask.title, tool: 'edit', ...(allowed ? {} : { failed: true }) }], endedAt: Date.now() });
  }

  private answer(askId: string, optionId: string | null): void {
    const pending = this.asks.get(askId);
    if (!pending) return;
    this.asks.delete(askId);
    this.emit({ kind: 'permission-done', id: askId });
    pending.resolve(optionId);
  }

  private stop(runId: string): void {
    const run = this.runs.get(runId);
    if (!run || run.endedAt !== undefined) return;
    for (const [id, pending] of this.asks) if (pending.ask.runId === runId) this.answer(id, null);
    this.update(run, { state: 'stopped', endedAt: Date.now() });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function say(line: string): void {
  console.log(line);
}

// ── The server ────────────────────────────────────────────────────────────────

const store = new LinkStore(path.join(base, 'link.json'), {
  // A temporary folder on a development machine: the key is kept as it is.
  seal: (text) => Buffer.from(text),
  open: (sealed) => sealed.toString(),
});
store.port = port;

const holds = new BoardHolds({
  open: (projectId) => host.call('openBoard', projectId),
  close: (projectId) => host.call('closeBoard', projectId),
});

const desk = linkDesk({
  host: (method, ...args) => host.call(method, ...args),
  agents: async (method, ...args) => fake.call(method, args),
  holds,
  projects,
  knows: (projectId) => folders.includes(projectId),
});

let lastView: LinkView | null = null;
const server = new LinkServer({
  store,
  // Each call is said as it arrives, and how it went.
  desk: {
    ...desk,
    async call(holder: string, call: LinkCall, args: unknown[]) {
      const value = await desk.call(holder, call, args);
      const result = value as Result | null;
      const failed = result && typeof result === 'object' && result.ok === false ? ` → ${result.error}` : '';
      say(`  ${holder} ${call}(${args.map((a) => (typeof a === 'string' ? a.replace(projectsDir + path.sep, '') : JSON.stringify(a))).join(', ')})${failed}`);
      return value;
    },
  },
  // The simulator shares the Mac's network, so it can also use the loopback; it goes last.
  addresses: (p) => [...deskAddresses(p), `127.0.0.1:${p}`],
  name: [...`${deskName()} (link:dev)`].slice(0, 64).join(''),
  onChange: (view) => {
    const before = lastView;
    lastView = view;
    for (const phone of view.phones) {
      const was = before?.phones.find((p) => p.key === phone.key);
      if (phone.connected && !was?.connected) say(`  ${phone.name} connected`);
      if (!phone.connected && was?.connected) say(`  ${phone.name} left`);
    }
    for (const was of before?.phones ?? []) if (!view.phones.some((p) => p.key === was.key)) say(`  ${was.name} forgotten`);
    if (view.paired && view.paired.at !== before?.paired?.at) {
      say(`  Linked · ${view.paired.name}`);
      void showCode();
    }
  },
});

const fake = new FakeAgents((event) => server.agent(event));
host.onBoard((snapshot) => server.board(snapshot));

// ── The pairing link ──────────────────────────────────────────────────────────

let renew: NodeJS.Timeout | null = null;

async function showCode(): Promise<void> {
  if (renew) clearTimeout(renew);
  const code = await server.code();
  if (!code.ok) {
    say(`No code: ${code.error}`);
    process.exit(1);
  }
  const { link, expiresAt } = code.value;
  say('');
  say(await QRCode.toString(link, { type: 'terminal', small: true }));
  say(`Pairing link (valid ${Math.round((expiresAt - Date.now()) / 60_000)} min; a new one follows when it is spent or runs out):`);
  say(link);
  say('');
  if (linkFile) {
    fs.mkdirSync(path.dirname(linkFile), { recursive: true });
    fs.writeFileSync(`${linkFile}.tmp`, link);
    fs.renameSync(`${linkFile}.tmp`, linkFile);
  }
  renew = setTimeout(() => void showCode(), expiresAt - Date.now());
}

async function main(): Promise<void> {
  const view = await server.setOn(true);
  if (view.port === null) {
    say(`Could not listen: ${view.error ?? 'no free port'}`);
    process.exit(1);
  }
  const listening = view.port;
  const list = await projects();
  say('Brainfile link:dev · the real link server, a fake desk');
  say(`  listening  ws://0.0.0.0:${listening}/link/1${listening !== port ? ` (${port} was taken)` : ''}`);
  say(`  addresses  ${[...deskAddresses(listening), `127.0.0.1:${listening}`].join('  ')}`);
  say(`  data       ${base}`);
  for (const p of list) say(`  project    ${p.name.padEnd(10)} ${p.repo ? `${p.repo.owner}/${p.repo.name}, ref ${p.ref}` : 'local only'} · ${p.path}`);
  say(`  agents     ${AGENTS.map((a) => a.id).join(', ')} (fake: starting, editing, an ask, done)`);
  say(`  hand-offs  brainfile task-7 can merge, task-5 would conflict (fake: no git)`);
  say(`  phones     ${store.phones().map((p) => p.name).join(', ') || 'none linked yet'}`);
  if (linkFile) say(`  link file  ${linkFile}`);
  await showCode();
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void server.close().then(() => process.exit(0));
  });
}

void main();
