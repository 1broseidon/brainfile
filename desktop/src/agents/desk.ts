/**
 * The desk (spec-16, phase 1): the app's own small MCP server for its chat
 * agents, so "make a follow-up and hand it to Codex" works from the chat.
 * Three tools: `dispatch` a task through the same path as Hand to… (its own
 * worktree, a tab in the dock, asks in the pane, Review), `runs` (what is
 * running on this Mac) and `stop`.
 *
 * The MCP server itself (desk-mcp.ts) is a small stdio program each chat
 * agent starts. It holds nothing: every call crosses a Unix socket to the
 * agents process, which does the work. The socket is the app's, made for
 * this launch, and every call carries a token the agents process minted for
 * one chat session, so nothing else on the machine can dispatch, and a chat
 * can only dispatch on its own board: the board comes from the token, never
 * from the caller.
 *
 * Only the chat's agents get the desk; a dispatched agent does not, so a
 * hand-off never hands off again (no recursive dispatch in phase 1).
 *
 * Nothing here touches Electron or the board, so it is tested on its own.
 */
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import type { AgentId, AgentRun, Result } from '../shared/api';

export const AGENT_IDS: readonly AgentId[] = ['claude', 'codex', 'antigravity', 'cursor', 'grok'];

/** The env a desk server is started with. */
export const DESK_ENV = { socket: 'BRAINFILE_DESK_SOCKET', token: 'BRAINFILE_DESK_TOKEN', project: 'BRAINFILE_DESK_PROJECT' } as const;

/** One chat session's right to the desk: which board, and who is asking. */
export interface DeskGrant {
  projectId: string;
  /** The chat's own agent and model: what a dispatch uses when it names none. */
  agentId: AgentId;
  model?: string;
  /** The person's model for each agent on this board, as Hand to… would use it. Refreshed every turn. */
  models: Partial<Record<AgentId, string>>;
  /** The chat session's key in the agents process, to find the turn that asked. */
  key: string;
}

export type DeskTool = 'dispatch' | 'runs' | 'stop';

/** What the desk needs from the agents process. */
export interface DeskDeps {
  /** The open task's title, or null when the board has no such open task. */
  findTask(projectId: string, taskId: string): { title: string } | null;
  /** Why the agent cannot be started here, or null when it can. */
  unavailable(agentId: AgentId): string | null;
  /** Starts a hand-off exactly as Hand to… does, and writes on the task who asked. */
  start(
    grant: DeskGrant,
    taskId: string,
    agentId: AgentId,
    model: string | undefined
  ): Promise<Result<{ run: AgentRun; branch: string | null; note?: string }>>;
  /** Every run this app has started since it opened. */
  runs(): AgentRun[];
  stop(runId: string): Promise<void>;
}

const LIVE = new Set(['starting', 'working', 'waiting']);
const isLive = (run: AgentRun) => LIVE.has(run.state);
const TASK_ID = /^[A-Za-z0-9][\w.-]{0,79}$/;
/** How many finished hand-offs on this board `runs` still lists. */
const RECENT = 10;

const str = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value.trim() : undefined);

/** The desk's three tools over a set of deps. Every answer is a line or two of plain text for the agent. */
export function deskTools(deps: DeskDeps) {
  const liveOn = (projectId: string, taskId: string) =>
    deps.runs().find((r) => r.kind === 'dispatch' && r.projectId === projectId && r.taskId === taskId && isLive(r));
  /**
   * Tasks a dispatch is starting on: held from the busy check until `start`
   * settles, so two calls that overlap its await cannot both start an agent
   * in the task's one worktree (decision-2).
   */
  const starting = new Set<string>();

  async function dispatch(grant: DeskGrant, args: Record<string, unknown>): Promise<Result<string>> {
    const taskId = str(args.taskId);
    if (!taskId || !TASK_ID.test(taskId)) return { ok: false, error: 'dispatch needs a taskId, such as task-12' };
    const named = str(args.agent)?.toLowerCase();
    if (named && !(AGENT_IDS as readonly string[]).includes(named)) {
      return { ok: false, error: `Unknown agent ${named}: use one of ${AGENT_IDS.join(', ')}` };
    }
    const agentId = (named as AgentId | undefined) ?? grant.agentId;
    // Your own model when it is you; else the person's choice for that agent here; else the agent's default.
    const model = str(args.model) ?? (agentId === grant.agentId ? grant.model : grant.models[agentId]);
    if (model && model.length > 200) return { ok: false, error: 'That model ID is too long' };
    const task = deps.findTask(grant.projectId, taskId);
    if (!task) return { ok: false, error: `${taskId} is not an open task on this board. Create it with the brainfile tools first.` };
    const busy = liveOn(grant.projectId, taskId);
    if (busy) return { ok: false, error: `${busy.agentId} is already working on ${taskId}` };
    const slot = `${grant.projectId}\n${taskId}`;
    if (starting.has(slot)) return { ok: false, error: `A hand-off is already starting on ${taskId}` };
    const problem = deps.unavailable(agentId);
    if (problem) return { ok: false, error: problem };
    starting.add(slot);
    let started: Awaited<ReturnType<DeskDeps['start']>>;
    try {
      started = await deps.start(grant, taskId, agentId, model);
    } finally {
      starting.delete(slot);
    }
    if (!started.ok) return started;
    const where = started.value.branch ? ` in its own worktree on ${started.value.branch}` : ' in the repository';
    return {
      ok: true,
      value:
        `Handed ${taskId} ("${task.title}") to ${agentId}${model ? ` (${model})` : ''}. It works${where}, its tab is in the dock, and it moves the task to review when done.` +
        (started.value.note ? ` ${started.value.note}` : ''),
    };
  }

  function runs(grant: DeskGrant): Result<string> {
    const all = deps.runs().filter((r) => r.kind === 'dispatch');
    const live = all.filter(isLive);
    const recent = all
      .filter((r) => !isLive(r) && r.projectId === grant.projectId)
      .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))
      .slice(0, RECENT);
    if (live.length + recent.length === 0) return { ok: true, value: 'Nothing has been handed off since the app opened.' };
    const line = (r: AgentRun) => {
      const board = r.projectId === grant.projectId ? 'this board' : path.basename(r.projectId);
      const minutes = Math.max(0, Math.round(((r.endedAt ?? Date.now()) - r.startedAt) / 60_000));
      const doing = isLive(r) ? `${r.state}, ${r.activity}` : r.state;
      return `- ${r.taskId} · ${r.agentId}${r.model ? ` (${r.model})` : ''} · ${doing} · ${board} · ${minutes}m${r.error ? ` · ${r.error}` : ''}`;
    };
    const parts: string[] = [];
    parts.push(live.length ? `Running on this Mac:\n${live.map(line).join('\n')}` : 'Nothing is running on this Mac.');
    if (recent.length) parts.push(`Finished on this board:\n${recent.map(line).join('\n')}`);
    return { ok: true, value: parts.join('\n\n') };
  }

  async function stop(grant: DeskGrant, args: Record<string, unknown>): Promise<Result<string>> {
    const taskId = str(args.taskId);
    if (!taskId || !TASK_ID.test(taskId)) return { ok: false, error: 'stop needs a taskId, such as task-12' };
    const run = liveOn(grant.projectId, taskId);
    if (!run) return { ok: false, error: `Nothing is running on ${taskId} on this board` };
    await deps.stop(run.id);
    return { ok: true, value: `Stopped ${run.agentId} on ${taskId}. Its worktree stays for review.` };
  }

  return {
    call(grant: DeskGrant, tool: string, args: Record<string, unknown>): Promise<Result<string>> | Result<string> {
      if (tool === 'dispatch') return dispatch(grant, args);
      if (tool === 'runs') return runs(grant);
      if (tool === 'stop') return stop(grant, args);
      return { ok: false, error: `Unknown tool ${tool}` };
    },
  };
}

export type DeskTools = ReturnType<typeof deskTools>;

/** One call over the socket: a line of JSON each way. */
interface DeskCall {
  token: string;
  /** The board the caller was started for; refused when it is not the token's. */
  project?: string;
  tool: string;
  args?: Record<string, unknown>;
}

/** The most a call may carry. */
const MAX_LINE = 64 * 1024;

/**
 * The agents process's end: a Unix socket for this launch, in the user's own
 * temporary folder and readable by them alone, answering only calls that
 * carry a token it minted.
 */
export class DeskBridge {
  readonly socketPath: string;
  private readonly tools: DeskTools;
  private grants = new Map<string, DeskGrant>();
  private server: net.Server | null = null;
  private listening: Promise<void> | null = null;

  constructor(tools: DeskTools, socketPath = path.join(os.tmpdir(), `brainfile-desk-${process.pid}-${randomBytes(4).toString('hex')}.sock`)) {
    this.tools = tools;
    this.socketPath = socketPath;
  }

  /** Starts listening, once. */
  listen(): Promise<void> {
    this.listening ??= new Promise<void>((resolve, reject) => {
      const server = net.createServer((socket) => this.serve(socket));
      server.once('error', reject);
      fs.rmSync(this.socketPath, { force: true });
      server.listen(this.socketPath, () => {
        fs.chmodSync(this.socketPath, 0o600);
        this.server = server;
        resolve();
      });
    });
    return this.listening;
  }

  /** A token for one chat session: it can dispatch on its own board and nowhere else. */
  grant(grant: DeskGrant): string {
    const token = randomBytes(24).toString('hex');
    this.grants.set(token, grant);
    return token;
  }

  /** Each turn brings the person's current model choices. */
  update(token: string, patch: Partial<Pick<DeskGrant, 'models'>>): void {
    const grant = this.grants.get(token);
    if (grant) Object.assign(grant, patch);
  }

  revoke(token: string): void {
    this.grants.delete(token);
  }

  close(): void {
    this.server?.close();
    this.server = null;
    this.listening = null;
    this.grants.clear();
    fs.rmSync(this.socketPath, { force: true });
  }

  private serve(socket: net.Socket): void {
    let buffer = '';
    const answer = (result: Result<string>) => {
      socket.end(`${JSON.stringify(result)}\n`);
    };
    socket.setEncoding('utf-8');
    socket.on('error', () => socket.destroy());
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      const end = buffer.indexOf('\n');
      if (end < 0 && buffer.length <= MAX_LINE) return;
      socket.removeAllListeners('data');
      if (end < 0 || end > MAX_LINE) return answer({ ok: false, error: 'Call too large' });
      void this.handle(buffer.slice(0, end)).then(answer);
    });
  }

  private async handle(line: string): Promise<Result<string>> {
    let call: DeskCall;
    try {
      call = JSON.parse(line) as DeskCall;
    } catch {
      return { ok: false, error: 'Not a desk call' };
    }
    const grant = typeof call?.token === 'string' ? this.grants.get(call.token) : undefined;
    if (!grant) return { ok: false, error: 'Not allowed: this desk session has ended or was never granted' };
    if (call.project !== undefined && call.project !== grant.projectId) return { ok: false, error: 'Not allowed: this session belongs to another board' };
    try {
      return await this.tools.call(grant, String(call.tool), call.args && typeof call.args === 'object' ? call.args : {});
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

/** The MCP server's end: one call, one answer. */
export function callDesk(
  socketPath: string,
  call: DeskCall,
  timeoutMs = 60_000
): Promise<Result<string>> {
  return new Promise((resolve) => {
    let buffer = '';
    let settled = false;
    const done = (result: Result<string>) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    const socket = net.createConnection(socketPath, () => socket.write(`${JSON.stringify(call)}\n`));
    socket.setEncoding('utf-8');
    socket.setTimeout(timeoutMs, () => done({ ok: false, error: 'Brainfile did not answer in time' }));
    socket.on('error', (err) => done({ ok: false, error: `Brainfile is not reachable: ${err.message}` }));
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      const end = buffer.indexOf('\n');
      if (end < 0) return;
      try {
        done(JSON.parse(buffer.slice(0, end)) as Result<string>);
      } catch {
        done({ ok: false, error: 'Brainfile answered with something unreadable' });
      }
    });
    socket.on('end', () => done({ ok: false, error: 'Brainfile closed the call without an answer' }));
  });
}
