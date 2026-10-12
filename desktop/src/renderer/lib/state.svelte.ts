/**
 * Window state. Boards arrive as snapshots from the host and are replaced
 * whole; the window never edits a snapshot except to show a move before the
 * host confirms it.
 */
import type {
  AgentId,
  AgentInfo,
  AgentModes,
  AgentRun,
  Api,
  BoardSnapshot,
  DispatchSettings,
  EditorInfo,
  ModelOption,
  PermissionAsk,
  Project,
  RunStep,
} from '../../shared/api';
import { diffBoards, type FeedItem } from './feed';

/** How long after a turn ends its last board change is waited for: the commit, the watcher, the snapshot. */
const SETTLE_MS = 900;
import { decisionGroups, outline, visibleRows } from './format';

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

export type ViewMode = 'list' | 'board' | 'decisions';
export type MenuKind = 'status' | 'priority' | 'assignee' | 'labels';

const VIEW_KEY = 'brainfile.view';
const ACTIVE_KEY = 'brainfile.active';
const LAYOUT_KEY = 'brainfile.layout';
const SEEN_KEY = 'brainfile.feedSeen';
const AGENT_KEY = 'brainfile.lastAgent';
const MODEL_KEY = 'brainfile.models';
const PREFS_KEY = 'brainfile.projectPrefs';
const MODEL_NAMES_KEY = 'brainfile.modelNames';
const EDITOR_KEY = 'brainfile.editor';
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
  /** Yours: what you had open as you asked (a task's ID), sent along as context. */
  context?: string[];
  /** The agent's: what it did on the way to this reply, and how long it took. */
  steps?: RunStep[];
  took?: number;
  /** What changed on the board during the turn, read from the board itself, not from the reply. */
  changes?: { id: string; what: string }[];
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
/** The chat popover: sized from its top-left corner; the pane caps it. */
export const CHAT = { minW: 320, minH: 300, w: 360, h: 480 };

type Layout = { rail: number; railOpen: boolean; pane: number; chat: { w: number; h: number } };

function loadLayout(): Layout {
  const initial: Layout = { rail: RAIL.initial, railOpen: true, pane: TASK_PANE.initial, chat: { w: CHAT.w, h: CHAT.h } };
  try {
    return { ...initial, ...JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? '{}') };
  } catch {
    return initial;
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
  /** Settings take the board's place in the pane until a project is picked or Esc. */
  settingsOpen = $state(false);
  settings = $state<DispatchSettings>({ bypass: false, modes: {} });
  /** The editors on this Mac, and the one files open in (unset: the first found). */
  editors = $state<EditorInfo[]>([]);
  editor = $state<string | null>(localStorage.getItem(EDITOR_KEY));
  /** Each agent's permission modes, as it reports them; null when it has none. */
  modes = $state<Partial<Record<AgentId, AgentModes | null>>>({});
  models = $state<Partial<Record<AgentId, ModelOption[]>>>({});
  /** The model last chosen for each agent anywhere: what a project with no choice of its own starts from. */
  modelChoice = $state<Partial<Record<AgentId, string>>>(load(MODEL_KEY, {}));
  /** Each agent's model names as it last reported them, so a choice reads well before the list is asked for again. */
  modelNames = $state<Partial<Record<AgentId, Record<string, string>>>>(load(MODEL_NAMES_KEY, {}));
  /** Per project, the agent last used there and the model last chosen for each agent (null: the agent's default). */
  prefs = $state<Record<string, { agent?: AgentId; models?: Partial<Record<AgentId, string | null>> }>>(load(PREFS_KEY, {}));

  /** The agent last used on this project, if it is still here; else the last used anywhere; else the first installed. */
  agentFor(projectId: string | null): AgentId | null {
    const here = (id: AgentId | null | undefined) => (id && this.agents.find((a) => a.id === id && a.available)?.id) || null;
    return here(projectId ? this.prefs[projectId]?.agent : null) || here(this.lastAgent) || this.agents.find((a) => a.available)?.id || null;
  }

  defaultAgent = $derived<AgentId | null>(this.agentFor(this.activeId));

  /** The model for an agent on a project: the project's own last choice, else the last chosen anywhere; undefined is the agent's default. */
  modelFor(agentId: AgentId, projectId: string | null = this.activeId): string | undefined {
    const mine = projectId ? this.prefs[projectId]?.models : undefined;
    if (mine && agentId in mine) return mine[agentId] ?? undefined;
    return this.modelChoice[agentId];
  }

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

  /**
   * The list's folds, per board: column groups folded shut and parents whose
   * children are hidden. They live here so j / k walk only what is drawn.
   */
  folds = $state<Record<string, { groups: Record<string, boolean>; parents: Record<string, boolean> }>>({});

  folded(kind: 'groups' | 'parents', id: string): boolean {
    return !!(this.activeId && this.folds[this.activeId]?.[kind][id]);
  }

  toggleFold(kind: 'groups' | 'parents', id: string): void {
    if (!this.activeId) return;
    this.folds[this.activeId] ??= { groups: {}, parents: {} };
    // Read back through the state proxy: the literal above is not reactive.
    const mine = this.folds[this.activeId];
    mine[kind][id] = !mine[kind][id];
  }

  /**
   * What j / k step through, in the order the view draws it: the list's
   * outline as it stands (children under their parent, whatever their
   * column; Done when open), the board's cards column by column, or
   * decisions by family.
   */
  orderedTasks = $derived.by((): { id: string }[] => {
    const board = this.board;
    if (!board) return [];
    if (this.view === 'decisions') return decisionGroups(board.decisions).flatMap((g) => g.decisions);
    if (this.view === 'board') return board.columns.flatMap((column) => board.tasks.filter((t) => t.column === column.id));
    const tree = outline(board.columns, board.tasks, board.completed);
    const collapsed = (id: string) => this.folded('parents', id);
    return [
      ...tree.groups.filter((g) => !this.folded('groups', g.column.id)).flatMap((g) => visibleRows(g.rows, collapsed)),
      ...(this.showCompleted ? visibleRows(tree.done, collapsed) : []),
    ].map((row) => row.task);
  });

  #problemTimer: ReturnType<typeof setTimeout> | null = null;
  /** The board as each chat turn found it, to say afterwards what the turn changed. */
  #turnStart = new Map<string, BoardSnapshot>();
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
    void this.refreshAgents();
    void api.getSettings().then((settings) => (this.settings = settings));
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

  /** Which agents are on this Mac: asked at start, and again whenever a picker opens, so one installed since shows up. */
  async refreshAgents(): Promise<void> {
    this.agents = await api.listAgents();
  }

  async refreshEditors(): Promise<void> {
    this.editors = await api.listEditors();
  }

  chooseEditor(id: string): void {
    this.editor = id;
    localStorage.setItem(EDITOR_KEY, id);
  }

  /** The editor files open in, as Settings shows it. */
  editorName = $derived(
    (this.editors.find((e) => e.id === this.editor) ?? this.editors[0])?.name ?? ''
  );

  /** A file in the project in front, opened at a line in the chosen editor. */
  async openFile(file: string, line?: number): Promise<void> {
    if (!this.activeId) return;
    const result = await api.openInEditor(this.activeId, file, line, this.editor ?? undefined);
    if (!result.ok) this.notify(result.error, 'warn');
  }

  agentName(id: AgentId): string {
    return this.agents.find((a) => a.id === id)?.name ?? id;
  }

  stopRun(runId: string): Promise<void> {
    return api.stopRun(runId);
  }

  /** Remembers the agent for this project, and as the last used anywhere. */
  remember(agentId: AgentId, projectId: string | null = this.activeId): void {
    this.lastAgent = agentId;
    localStorage.setItem(AGENT_KEY, agentId);
    if (!projectId) return;
    this.prefs[projectId] = { ...this.prefs[projectId], agent: agentId };
    this.savePrefs();
  }

  private savePrefs(): void {
    localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs));
  }

  async dispatch(taskId: string, agentId: AgentId): Promise<void> {
    if (!this.activeId) return;
    this.remember(agentId);
    await this.patch(taskId, { assignee: agentId });
    const result = await api.dispatch(this.activeId, taskId, agentId, this.modelFor(agentId));
    if (!result.ok) this.notify(result.error, 'warn');
  }

  async loadModels(agentId: AgentId): Promise<void> {
    if (this.models[agentId]) return;
    const result = await api.listModels(agentId);
    this.models[agentId] = result.ok ? result.value : [];
    if (result.ok && result.value.length) {
      this.modelNames[agentId] = Object.fromEntries(result.value.map((m) => [m.value, m.name]));
      localStorage.setItem(MODEL_NAMES_KEY, JSON.stringify(this.modelNames));
    }
  }

  /**
   * A model as people read it: the name the agent gives it, from the list or
   * remembered from the last time it was asked; failing both, its ID without
   * the bracketed options some agents put on it (`grok-4.7[context=256k,…]`).
   */
  modelLabel(agentId: AgentId, value: string): string {
    return (
      this.models[agentId]?.find((m) => m.value === value)?.name ??
      this.modelNames[agentId]?.[value] ??
      (value.replace(/\[.*\]$/, '') || value)
    );
  }

  async loadModes(agentId: AgentId): Promise<void> {
    if (agentId in this.modes) return;
    const result = await api.listModes(agentId);
    this.modes[agentId] = result.ok ? result.value : null;
  }

  async setSettings(patch: Partial<DispatchSettings>): Promise<void> {
    this.settings = { ...this.settings, ...patch };
    this.settings = await api.setSettings($state.snapshot(patch) as Partial<DispatchSettings>);
  }

  /** null is the agent's own default. */
  chooseMode(agentId: AgentId, mode: string | null): void {
    const modes = { ...this.settings.modes };
    if (mode) modes[agentId] = mode;
    else delete modes[agentId];
    void this.setSettings({ modes });
  }

  /** Remembers the model for this project's agent, and as the last chosen anywhere. null is the agent's default. */
  chooseModel(agentId: AgentId, model: string | null): void {
    if (model) this.modelChoice[agentId] = model;
    else delete this.modelChoice[agentId];
    localStorage.setItem(MODEL_KEY, JSON.stringify(this.modelChoice));
    const projectId = this.activeId;
    if (!projectId) return;
    const prefs = this.prefs[projectId] ?? {};
    this.prefs[projectId] = { ...prefs, models: { ...prefs.models, [agentId]: model } };
    this.savePrefs();
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

  private patchLine(projectId: string, threadId: string, key: string, patch: Partial<ChatLine>): void {
    const list = this.threads[projectId] ?? [];
    this.threads[projectId] = list.map((t) =>
      t.id === threadId ? { ...t, lines: t.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) } : t
    );
    this.saveThreads();
  }

  private addLine(projectId: string, threadId: string, line: ChatLine): void {
    const list = this.threads[projectId] ?? [];
    this.threads[projectId] = list.map((t) => (t.id === threadId ? { ...t, lines: [...t.lines, line] } : t));
    this.saveThreads();
  }

  async askBoard(text: string, agentId: AgentId): Promise<void> {
    const projectId = this.activeId;
    if (!projectId || !text.trim()) return;
    this.remember(agentId, projectId);
    let thread = this.currentThread;
    if (!thread) {
      thread = { id: `t-${Date.now()}`, agentId, startedAt: Date.now(), lines: [] };
      this.threads[projectId] = [thread, ...(this.threads[projectId] ?? [])].slice(0, THREADS_KEPT);
      this.thread[projectId] = thread.id;
    }
    const earlier = thread.lines.filter((l) => !l.failed).map((l) => ({ who: l.who, text: l.text }));
    // What is open in the pane goes along, so "this" means it.
    const context = this.openTaskId ? [this.openTaskId] : [];
    this.addLine(projectId, thread.id, {
      key: `you-${Date.now()}`,
      who: 'you',
      text: text.trim(),
      at: Date.now(),
      ...(context.length ? { context } : {}),
    });
    const before = this.boards[projectId];
    const result = await api.ask(projectId, agentId, text.trim(), thread.id, this.modelFor(agentId, projectId), earlier, context);
    if (result.ok && before) this.#turnStart.set(result.value.id, before);
    if (!result.ok) this.addLine(projectId, thread.id, { key: `err-${Date.now()}`, who: 'agent', text: result.error, at: Date.now(), failed: true });
  }

  private onRun(run: AgentRun): void {
    const before = this.runs[run.id];
    this.runs[run.id] = run;
    const ended = !isLive(run) && (!before || isLive(before));
    if (!ended) return;
    if (run.kind === 'ask' && run.threadId) {
      const text = run.state === 'done' ? run.reply || 'Done.' : run.state === 'stopped' ? 'Stopped.' : (run.error ?? 'It stopped.');
      this.addLine(run.projectId, run.threadId, {
        key: run.id,
        who: 'agent',
        text,
        at: Date.now(),
        failed: run.state === 'failed',
        ...(run.steps?.length ? { steps: run.steps } : {}),
        ...(run.endedAt ? { took: run.endedAt - run.startedAt } : {}),
      });
      const before = this.#turnStart.get(run.id);
      this.#turnStart.delete(run.id);
      if (before && run.state !== 'failed') {
        const { projectId, threadId } = run;
        setTimeout(() => {
          const after = this.boards[projectId];
          if (!after) return;
          const changes = diffBoards(before, after, Date.now()).map((c) => ({ id: c.taskId, what: c.what }));
          if (changes.length) this.patchLine(projectId, threadId!, run.id, { changes });
        }, SETTLE_MS);
      }
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
    this.settingsOpen = false;
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

  /** V turns between the two views of the work; from decisions it goes back to the list. */
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
