/**
 * Window state. Boards arrive as snapshots from the host and are replaced
 * whole; the window never edits a snapshot except to show a move before the
 * host confirms it.
 */
import type { AgentId, AgentInfo, AgentRun, Api, BoardSnapshot, ModelOption, PermissionAsk, Project, TaskView } from '../../shared/api';
import { diffBoards, type FeedItem } from './feed';
import { asTree } from './format';

declare global {
  interface Window {
    brainfile: Api;
  }
}

/** Changes this window makes are not news; remember when each board was last written from here. */
const lastLocalWrite: Record<string, number> = {};
const MUTATIONS = ['addTask', 'moveTask', 'patchTask', 'toggleSubtask', 'addSubtask', 'completeTask', 'deleteTask', 'restoreTask'] as const;
const LOCAL_WINDOW_MS = 4000;

// The bridge's object is frozen, so a Proxy over it breaks the proxy
// invariants; wrap the writes in a plain copy instead.
const bridge = window.brainfile;
export const api: Api = { ...bridge };
for (const key of MUTATIONS) {
  const write = bridge[key] as (projectId: string, ...rest: unknown[]) => unknown;
  (api as unknown as Record<string, unknown>)[key] = (projectId: string, ...rest: unknown[]) => {
    lastLocalWrite[projectId] = Date.now();
    return write(projectId, ...rest);
  };
}

export type ViewMode = 'list' | 'board';
export type MenuKind = 'status' | 'priority' | 'assignee' | 'labels';

const VIEW_KEY = 'brainfile.view';
const ACTIVE_KEY = 'brainfile.active';
const LAYOUT_KEY = 'brainfile.layout';
const SEEN_KEY = 'brainfile.feedSeen';
const AGENT_KEY = 'brainfile.lastAgent';
const MODEL_KEY = 'brainfile.models';
const THREADS_KEY = 'brainfile.threads';
const THREADS_KEPT = 30;

export interface Thread {
  id: string;
  agentId: AgentId;
  startedAt: number;
  lines: ChatLine[];
}

function load<T>(key: string, fallback: T): T {
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(key) ?? '{}') };
  } catch {
    return fallback;
  }
}

export interface ChatLine {
  key: string;
  who: 'you' | 'agent';
  text: string;
  at: number;
  failed?: boolean;
}

const LIVE = new Set(['starting', 'working', 'waiting']);
export const isLive = (run: AgentRun | undefined) => !!run && LIVE.has(run.state);
const FEED_LIMIT = 100;

export type Health = 'ok' | 'busy' | 'pending' | 'warn' | 'local';

export function healthOf(board: BoardSnapshot | undefined): Health | null {
  if (!board) return null;
  if (board.sync.warning) return 'warn';
  if (board.sync.busy) return 'busy';
  if (!board.sync.remote) return 'local';
  if (board.sync.pending > 0) return 'pending';
  return 'ok';
}

export const RAIL = { min: 180, max: 420, initial: 232 };
export const TASK_PANE = { min: 380, max: 680, initial: 500 };

function loadLayout(): { rail: number; railOpen: boolean; pane: number } {
  try {
    return { rail: RAIL.initial, railOpen: true, pane: TASK_PANE.initial, ...JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? '{}') };
  } catch {
    return { rail: RAIL.initial, railOpen: true, pane: TASK_PANE.initial };
  }
}

function loadViews(): Record<string, ViewMode> {
  try {
    return JSON.parse(localStorage.getItem(VIEW_KEY) ?? '{}');
  } catch {
    return {};
  }
}

class AppState {
  projects = $state<Project[]>([]);
  loaded = $state(false);
  activeId = $state<string | null>(localStorage.getItem(ACTIVE_KEY));
  boards = $state<Record<string, BoardSnapshot>>({});
  boardErrors = $state<Record<string, string>>({});
  views = $state<Record<string, ViewMode>>(loadViews());
  selectedTaskId = $state<string | null>(null);
  openTaskId = $state<string | null>(null);
  paletteOpen = $state(false);
  composer = $state<{ column?: string } | null>(null);
  showCompleted = $state(false);
  layout = $state(loadLayout());
  /** A problem worth saying, shown in the board's band until it times out. Success is silent. */
  problem = $state<string | null>(null);
  /** The one success that speaks: a reversible step, with its Undo, for a few seconds. */
  undo = $state<{ text: string; run: () => Promise<void> } | null>(null);
  menu = $state<{ kind: MenuKind; taskId: string; x: number; y: number } | null>(null);
  /** The person's own agents, as detected on this Mac, in the picker's order. */
  agents = $state<AgentInfo[]>([]);
  lastAgent = $state<AgentId | null>(localStorage.getItem(AGENT_KEY) as AgentId | null);
  runs = $state<Record<string, AgentRun>>({});
  asks = $state<PermissionAsk[]>([]);
  /** Chat threads per board, newest first, kept on this machine. */
  threads = $state<Record<string, Thread[]>>(load(THREADS_KEY, {}));
  /** The thread in the popover, per board; null is the blank page it opens to. */
  thread = $state<Record<string, string | null>>({});
  chatOpen = $state(false);
  models = $state<Partial<Record<AgentId, ModelOption[]>>>({});
  /** The model chosen for each agent; unset means the agent's own default. */
  modelChoice = $state<Partial<Record<AgentId, string>>>(load(MODEL_KEY, {}));

  /** Whatever was used last, if it is still here; else the first one installed. */
  defaultAgent = $derived<AgentId | null>(
    (this.lastAgent && this.agents.find((a) => a.id === this.lastAgent && a.available)?.id) ||
      this.agents.find((a) => a.available)?.id ||
      null
  );

  /** Changes from outside the window, newest first. */
  feed = $state<FeedItem[]>([]);
  feedSeen = $state(Number(localStorage.getItem(SEEN_KEY) ?? 0));
  unseen = $derived(this.feed.filter((f) => f.at > this.feedSeen).length);

  /** Every board's sync, summed for the strip. */
  health = $derived.by(() => {
    const boards = Object.values(this.boards);
    const count = (h: Health) => boards.filter((b) => healthOf(b) === h).length;
    return { total: boards.length, warn: count('warn'), busy: count('busy'), pending: count('pending'), local: count('local') };
  });

  active = $derived(this.projects.find((p) => p.id === this.activeId) ?? null);
  board = $derived(this.activeId ? (this.boards[this.activeId] ?? null) : null);
  view = $derived<ViewMode>((this.activeId && this.views[this.activeId]) || 'list');

  /** Tasks in the order the list shows them: by column, then as the outline (each parent before its children). */
  orderedTasks = $derived.by(() => {
    const board = this.board;
    if (!board) return [] as TaskView[];
    return board.columns.flatMap((column) => asTree(board.tasks.filter((t) => t.column === column.id)).map((r) => r.task));
  });

  #problemTimer: ReturnType<typeof setTimeout> | null = null;
  #undoTimer: ReturnType<typeof setTimeout> | null = null;

  async init(): Promise<void> {
    api.onProjectsChanged((projects) => {
      this.projects = projects;
    });
    api.onBoardChanged((snapshot) => this.receive(snapshot));
    api.onAgentEvent((event) => {
      if (event.kind === 'run') this.onRun(event.run);
      else if (event.kind === 'permission') this.asks = [...this.asks, event.ask];
      else this.asks = this.asks.filter((a) => a.id !== event.id);
    });
    void api.listAgents().then((agents) => (this.agents = agents));
    this.projects = await api.listProjects();
    this.loaded = true;
    // A board can turn up while the window is away (pushed from another
    // machine, `brainfile init` in a terminal), so look again on return.
    window.addEventListener('focus', () => {
      for (const p of this.projects) if (p.state.status !== 'ready') void this.refreshProject(p.id);
    });
    const first = this.projects.find((p) => p.id === this.activeId) ?? this.projects[0];
    if (first) await this.select(first.id);
    // Every board stays open so search, health and the feed cover the desk.
    for (const p of this.projects) if (p.state.status === 'ready' && !this.boards[p.id]) void this.open(p.id);
  }

  async open(projectId: string): Promise<void> {
    const result = await api.openBoard(projectId);
    if (result.ok) {
      this.boards[projectId] = result.value;
      delete this.boardErrors[projectId];
    } else {
      this.boardErrors[projectId] = result.error;
    }
  }

  /** A fresh snapshot from the host. What changed without this window's hand goes in the feed. */
  receive(snapshot: BoardSnapshot): void {
    const before = this.boards[snapshot.projectId];
    this.boards[snapshot.projectId] = snapshot;
    if (!before || Date.now() - (lastLocalWrite[snapshot.projectId] ?? 0) < LOCAL_WINDOW_MS) return;
    const items = diffBoards(before, snapshot, Date.now());
    if (items.length) this.feed = [...items.reverse(), ...this.feed].slice(0, FEED_LIMIT);
  }

  // ── Agents ──────────────────────────────────────────────────────────────

  /** The live dispatch on a task of the board in front, if any. */
  runFor(taskId: string): AgentRun | undefined {
    return Object.values(this.runs).find((r) => r.kind === 'dispatch' && r.taskId === taskId && r.projectId === this.activeId && isLive(r));
  }

  agentName(id: AgentId): string {
    return this.agents.find((a) => a.id === id)?.name ?? id;
  }

  stopRun(runId: string): Promise<void> {
    return api.stopRun(runId);
  }

  remember(agentId: AgentId): void {
    this.lastAgent = agentId;
    localStorage.setItem(AGENT_KEY, agentId);
  }

  async dispatch(taskId: string, agentId: AgentId): Promise<void> {
    if (!this.activeId) return;
    this.remember(agentId);
    await this.patch(taskId, { assignee: agentId });
    const result = await api.dispatch(this.activeId, taskId, agentId, this.modelChoice[agentId]);
    if (!result.ok) this.notify(result.error, 'warn');
  }

  async loadModels(agentId: AgentId): Promise<void> {
    if (this.models[agentId]) return;
    const result = await api.listModels(agentId);
    this.models[agentId] = result.ok ? result.value : [];
  }

  chooseModel(agentId: AgentId, model: string | null): void {
    if (model) this.modelChoice[agentId] = model;
    else delete this.modelChoice[agentId];
    localStorage.setItem(MODEL_KEY, JSON.stringify(this.modelChoice));
  }

  /** The popover opens to a blank page, unless a reply is still on its way. */
  openChat(): void {
    if (this.activeId && !this.liveAsk) this.thread[this.activeId] = null;
    this.chatOpen = true;
  }

  currentThread = $derived.by(() => {
    const id = this.activeId ? this.thread[this.activeId] : null;
    return id && this.activeId ? (this.threads[this.activeId] ?? []).find((t) => t.id === id) ?? null : null;
  });

  private saveThreads(): void {
    localStorage.setItem(THREADS_KEY, JSON.stringify(this.threads));
  }

  private addLine(projectId: string, threadId: string, line: ChatLine): void {
    const list = this.threads[projectId] ?? [];
    this.threads[projectId] = list.map((t) => (t.id === threadId ? { ...t, lines: [...t.lines, line] } : t));
    this.saveThreads();
  }

  async askBoard(text: string, agentId: AgentId): Promise<void> {
    const projectId = this.activeId;
    if (!projectId || !text.trim()) return;
    this.remember(agentId);
    let thread = this.currentThread;
    if (!thread) {
      thread = { id: `t-${Date.now()}`, agentId, startedAt: Date.now(), lines: [] };
      this.threads[projectId] = [thread, ...(this.threads[projectId] ?? [])].slice(0, THREADS_KEPT);
      this.thread[projectId] = thread.id;
    }
    const earlier = thread.lines.filter((l) => !l.failed).map((l) => ({ who: l.who, text: l.text }));
    this.addLine(projectId, thread.id, { key: `you-${Date.now()}`, who: 'you', text: text.trim(), at: Date.now() });
    const result = await api.ask(projectId, agentId, text.trim(), thread.id, this.modelChoice[agentId], earlier);
    if (!result.ok) this.addLine(projectId, thread.id, { key: `err-${Date.now()}`, who: 'agent', text: result.error, at: Date.now(), failed: true });
  }

  private onRun(run: AgentRun): void {
    const before = this.runs[run.id];
    this.runs[run.id] = run;
    const ended = !isLive(run) && (!before || isLive(before));
    if (!ended) return;
    if (run.kind === 'ask' && run.threadId) {
      const text = run.state === 'done' ? run.reply || 'Done.' : run.state === 'stopped' ? 'Stopped.' : (run.error ?? 'It stopped.');
      this.addLine(run.projectId, run.threadId, { key: run.id, who: 'agent', text, at: Date.now(), failed: run.state === 'failed' });
    } else if (run.state === 'failed') {
      this.notify(`${this.agentName(run.agentId)} stopped on ${run.taskId}: ${run.error ?? 'unknown error'}`, 'warn');
    }
  }

  /** The chat's live turn for the board in front. */
  liveAsk = $derived(Object.values(this.runs).find((r) => r.kind === 'ask' && r.projectId === this.activeId && isLive(r)));

  markFeedSeen(): void {
    this.feedSeen = Date.now();
    localStorage.setItem(SEEN_KEY, String(this.feedSeen));
  }

  /** Open a task on any board. */
  async goTo(projectId: string, taskId: string): Promise<void> {
    if (projectId !== this.activeId) await this.select(projectId);
    this.selectedTaskId = taskId;
    this.openTaskId = taskId;
  }

  async select(projectId: string): Promise<void> {
    this.activeId = projectId;
    this.selectedTaskId = null;
    this.openTaskId = null;
    localStorage.setItem(ACTIVE_KEY, projectId);
    const project = this.projects.find((p) => p.id === projectId);
    if (project?.state.status !== 'ready') return;
    await this.open(projectId);
  }

  async addProject(): Promise<void> {
    const project = await api.addProject();
    if (project) await this.select(project.id);
  }

  async removeProject(projectId: string): Promise<void> {
    await api.removeProject(projectId);
    delete this.boards[projectId];
    if (this.activeId === projectId) {
      const next = this.projects.find((p) => p.id !== projectId);
      this.activeId = null;
      if (next) await this.select(next.id);
    }
  }

  async refreshProject(projectId: string): Promise<void> {
    const project = await api.refreshProject(projectId);
    const before = this.projects.find((p) => p.id === projectId)?.state.status;
    this.projects = this.projects.map((p) => (p.id === projectId ? project : p));
    if (projectId === this.activeId && (before !== 'ready' || project.state.status !== 'ready')) await this.select(projectId);
  }

  setView(mode: ViewMode): void {
    if (!this.activeId) return;
    this.views[this.activeId] = mode;
    localStorage.setItem(VIEW_KEY, JSON.stringify(this.views));
  }

  toggleView(): void {
    this.setView(this.view === 'list' ? 'board' : 'list');
  }

  /** Show a move at once; the host's snapshot replaces it moments later. */
  async moveTask(taskId: string, column: string): Promise<void> {
    const board = this.board;
    if (!board || !this.activeId) return;
    const task = board.tasks.find((t) => t.id === taskId);
    if (!task || task.column === column) return;
    const target = board.columns.find((c) => c.id === column);
    task.column = column;
    const result = await api.moveTask(this.activeId, taskId, column);
    if (!result.ok) this.notify(result.error, 'warn');
    else if (result.value.completed) this.notify(`${taskId} completed in ${target?.title ?? column}`);
  }

  /** Open a property picker for a task, under `anchor` or at the selection. */
  openMenu(kind: MenuKind, taskId: string, anchor?: Element | null): void {
    const rect = anchor?.getBoundingClientRect();
    this.menu = {
      kind,
      taskId,
      x: rect ? rect.left : window.innerWidth / 2 - 120,
      y: rect ? rect.bottom + 4 : window.innerHeight / 3,
    };
  }

  async patch(taskId: string, patch: import('../../shared/api').TaskPatch): Promise<void> {
    if (!this.activeId) return;
    const task = this.board?.tasks.find((t) => t.id === taskId);
    if (task) Object.assign(task, Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v ?? undefined])));
    const result = await api.patchTask(this.activeId, taskId, patch);
    if (!result.ok) this.notify(result.error, 'warn');
  }

  /** Success is silent; only a problem is said. */
  notify(text: string, tone: 'ok' | 'warn' = 'ok'): void {
    if (tone !== 'warn') return;
    this.problem = text;
    if (this.#problemTimer) clearTimeout(this.#problemTimer);
    this.#problemTimer = setTimeout(() => (this.problem = null), 8000);
  }

  offerUndo(text: string, run: () => Promise<void>): void {
    this.undo = { text, run };
    if (this.#undoTimer) clearTimeout(this.#undoTimer);
    this.#undoTimer = setTimeout(() => (this.undo = null), 8000);
  }

  async runUndo(): Promise<void> {
    const undo = this.undo;
    this.undo = null;
    if (undo) await undo.run();
  }

  saveLayout(): void {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(this.layout));
  }

  toggleRail(): void {
    this.layout.railOpen = !this.layout.railOpen;
    this.saveLayout();
  }
}

export const app = new AppState();
