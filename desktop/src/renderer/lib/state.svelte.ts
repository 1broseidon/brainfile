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
  ColumnView,
  DispatchSettings,
  EditorInfo,
  ForgeRepo,
  GitHubAuthView,
  IssuesView,
  IssueView,
  ModelOption,
  PermissionAsk,
  Project,
  RunStep,
  SettleChoice,
} from '../../shared/api';
import { diffBoards, type FeedItem } from './feed';
import { problemBrief } from './brief';

/** How long after a turn ends its last board change is waited for: the commit, the watcher, the snapshot. */
const SETTLE_MS = 900;
import { calmOrder, decisionGroups, glance, outline, restsFolded, visibleRows, type OutlineRow } from './format';
import { intakeColumn, issueTask } from '../../shared/issues';

declare global {
  interface Window {
    brainfile: Api;
  }
}

/** Changes this window makes are not news; remember when each board was last written from here. */
const lastLocalWrite: Record<string, number> = {};
const MUTATIONS = ['addTask', 'moveTask', 'patchTask', 'toggleSubtask', 'addSubtask', 'completeTask', 'deleteTask', 'restoreTask', 'noteTask', 'settleBoards', 'fixBoard', 'undoFix'] as const;
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

export type ViewMode = 'list' | 'board' | 'decisions' | 'issues';
export type MenuKind = 'status' | 'priority' | 'assignee' | 'labels';

/** The list's group of completed work; a column's slug never has a colon. */
export const DONE_GROUP = ':done';
/** A calm group's `N more` line is a stop in the j / k walk, under this prefix and the group's key. */
export const MORE = 'more:';
export const isMore = (id: string | null | undefined): boolean => !!id?.startsWith(MORE);

/** A group of the list as it is drawn: a column's, or the completed work's. */
export interface ListGroup {
  /** The column's ID, or DONE_GROUP. */
  key: string;
  column: ColumnView | null;
  title: string;
  /** What it holds: its roots and everything under them, folded, collapsed or past the glance. */
  count: number;
  folded: boolean;
  /** The rows drawn: none when folded; in the calm list, a glance until `N more` is pressed. */
  rows: OutlineRow[];
  /** Rows waiting under `N more` (the calm list only). */
  more: number;
}

const VIEW_KEY = 'brainfile.view';
const ACTIVE_KEY = 'brainfile.active';
const LAYOUT_KEY = 'brainfile.layout';
const SEEN_KEY = 'brainfile.feedSeen';
const AGENT_KEY = 'brainfile.lastAgent';
const MODEL_KEY = 'brainfile.models';
const PREFS_KEY = 'brainfile.projectPrefs';
const MODEL_NAMES_KEY = 'brainfile.modelNames';
const EDITOR_KEY = 'brainfile.editor';
const TABS_KEY = 'brainfile.tabs';
const CALM_KEY = 'brainfile.calm';
/** The most tabs the dock keeps; the oldest go first. */
const TABS_KEPT = 12;

/** A document kept at hand in the dock: opened in the pane, or handed to an agent. */
export interface Tab {
  projectId: string;
  id: string;
}
const THREADS_KEY = 'brainfile.threads';
const THREADS_KEPT = 30;

export interface Thread {
  id: string;
  agentId: AgentId;
  startedAt: number;
  lines: ChatLine[];
  /** A discussion of this task before it is handed off (task-35); unset for a chat about the board. */
  taskId?: string;
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

export type Health = 'ok' | 'busy' | 'pending' | 'behind' | 'warn' | 'local';

/**
 * A fix from the health list, per project (task-34): said before it runs,
 * running, then its result with Undo for a few seconds, or what stopped it.
 */
export type FixStage =
  | { stage: 'confirm'; words: string }
  | { stage: 'running'; words: string }
  | { stage: 'done'; message: string; undo: boolean }
  | { stage: 'failed'; message: string };

/** How long a fix's result line and its Undo stay. */
const FIX_UNDO_MS = 10_000;
/** How long what stopped a fix stays said. */
const FIX_FAILED_MS = 12_000;

export function healthOf(board: BoardSnapshot | undefined): Health | null {
  if (!board) return null;
  // Where the board lives (spec-15): two boards, a stray checkout, a merge left half-done.
  if (board.integrity.short || board.sync.warning) return 'warn';
  if (board.sync.busy) return 'busy';
  if (!board.sync.remote) return 'local';
  if (board.sync.pending > 0) return 'pending';
  if (board.sync.behind > 0) return 'behind';
  return 'ok';
}

/** How long changes may wait to be sent or received before the strip says so. */
const UNSENT_GRACE_MS = 60_000;

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
  /** The calm list (design.md, Calm list): one signal a row, chosen once for the window. */
  calm = $state(localStorage.getItem(CALM_KEY) !== 'off');
  layout = $state(loadLayout());
  /** A problem worth saying, shown in the board's band until it times out. Success is silent. */
  problem = $state<string | null>(null);
  /** The project whose two boards are being made one; its snapshot is not news. */
  settling = $state<string | null>(null);
  /** Fixes from the health list in progress or just done, per project. */
  fixes = $state<Record<string, FixStage>>({});
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
  /** Per board, the thread whose reply came while the chat was closed; opening the chat there reads it. */
  unread = $state<Record<string, string>>({});
  /** The chat key's width: the square, or wider while it shows a turn at work. The dock and the popover start from it. */
  chatKeyW = $state(32);
  /** Settings take the board's place in the pane until a project is picked or Esc. */
  settingsOpen = $state(false);
  settings = $state<DispatchSettings>({ bypass: false, modes: {} });
  /** The dock's tabs, oldest first: the newest sits next to the chat key. */
  tabs = $state<Tab[]>((() => {
    try {
      return JSON.parse(localStorage.getItem(TABS_KEY) ?? '[]') as Tab[];
    } catch {
      return [];
    }
  })());
  /** The available editors; unset uses a running editor, then the first found. */
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
  /** When each board began to have changes not shared, or to be behind; a push takes seconds. */
  #unsentSince: Record<string, number> = {};
  /** A clock for "longer than a minute", ticking slowly. */
  now = $state(Date.now());

  /**
   * A board's health as the window says it: changes waiting to be sent, or
   * to be received, only count once they have waited longer than a push
   * takes, so the strip stays quiet through ordinary autosync.
   */
  quietHealth(board: BoardSnapshot | undefined): Health | null {
    const h = healthOf(board);
    if ((h === 'pending' || h === 'behind') && board) {
      const since = this.#unsentSince[board.projectId];
      if (!since || this.now - since < UNSENT_GRACE_MS) return 'ok';
    }
    return h === 'busy' ? 'ok' : h;
  }

  health = $derived.by(() => {
    const boards = Object.values(this.boards);
    const count = (h: Health) => boards.filter((b) => this.quietHealth(b) === h).length;
    return { total: boards.length, warn: count('warn'), busy: count('busy'), pending: count('pending'), behind: count('behind'), local: count('local') };
  });

  active = $derived(this.projects.find((p) => p.id === this.activeId) ?? null);
  board = $derived(this.activeId ? (this.boards[this.activeId] ?? null) : null);
  /** Issues are a view only where the origin is on a forge the window knows; elsewhere the list stands in. */
  view = $derived.by<ViewMode>(() => {
    const chosen = (this.activeId && this.views[this.activeId]) || 'list';
    return chosen === 'issues' && this.activeId && this.forges[this.activeId] === null ? 'list' : chosen;
  });

  /** Each project's forge repository (task-26): undefined until asked, null when its origin is none the window knows. */
  forges = $state<Record<string, ForgeRepo | null>>({});
  /** Each project's open issues, as last read, and whether a read is under way. */
  issues = $state<Record<string, { view: IssuesView | null; loading: boolean; error: string | null }>>({});
  /** How the window signs in to GitHub, as Settings last asked. */
  githubAuth = $state<GitHubAuthView | null>(null);
  /** Issues being made into tasks, by URL, so a second click waits for the first. */
  making = $state<Record<string, boolean>>({});

  /**
   * The list's folds, per board: column groups folded shut, parents whose
   * children are hidden, and calm groups opened past their glance. They live
   * here so j / k walk only what is drawn.
   */
  folds = $state<
    Record<string, { groups: Record<string, boolean>; parents: Record<string, boolean>; whole: Record<string, boolean> }>
  >({});

  #foldsHere() {
    if (!this.activeId) return null;
    this.folds[this.activeId] ??= { groups: {}, parents: {}, whole: {} };
    // Read back through the state proxy: the literal above is not reactive.
    return this.folds[this.activeId];
  }

  /** As the hand left it; untouched, as it rests: the calm list rests the backlog and a completion column folded. */
  folded(kind: 'groups' | 'parents', id: string): boolean {
    const set = this.activeId ? this.folds[this.activeId]?.[kind][id] : undefined;
    if (set !== undefined) return set;
    if (kind !== 'groups' || !this.calm) return false;
    const column = this.board?.columns.find((c) => c.id === id);
    return !!column && restsFolded(column);
  }

  toggleFold(kind: 'groups' | 'parents', id: string): void {
    const folded = this.folded(kind, id);
    const mine = this.#foldsHere();
    if (!mine) return;
    mine[kind][id] = !folded;
    // Folding a group puts it back to a glance for the next time it opens.
    if (kind === 'groups' && !folded) delete mine.whole[id];
  }

  /** Fold or open a group of the list; Done's fold is the window's, as before. */
  toggleGroup(key: string): void {
    if (key !== DONE_GROUP) return this.toggleFold('groups', key);
    this.showCompleted = !this.showCompleted;
    const mine = this.#foldsHere();
    if (mine && !this.showCompleted) delete mine.whole[key];
  }

  /** Show a calm group past its glance, until it is folded. */
  showWhole(key: string): void {
    const mine = this.#foldsHere();
    if (mine) mine.whole[key] = true;
  }

  /**
   * Turn the list calm or full without losing the selection: a task the calm
   * list would rest folded or keep past a glance has its group opened, whole
   * if need be, and a selected `N more`, which the full list does not have,
   * hands its place to the first row that was waiting.
   */
  setCalm(on: boolean): void {
    const stop = this.listGroups.find((g) => g.more && MORE + g.key === this.selectedTaskId);
    this.calm = on;
    localStorage.setItem(CALM_KEY, on ? 'on' : 'off');
    if (stop) {
      this.selectedTaskId = this.listGroups.find((g) => g.key === stop.key)?.rows[stop.rows.length]?.task.id ?? null;
      return;
    }
    const id = this.selectedTaskId;
    const board = this.board;
    if (!on || !id || !board || this.orderedTasks.some((t) => t.id === id)) return;
    const tree = outline(board.columns, board.tasks, board.completed);
    const holds = (rows: OutlineRow[]) => rows.some((r) => r.task.id === id);
    const key = tree.groups.find((g) => holds(g.rows))?.column.id ?? (holds(tree.done) ? DONE_GROUP : null);
    if (!key) return;
    if (key !== DONE_GROUP && this.folded('groups', key)) this.toggleFold('groups', key);
    if (!this.orderedTasks.some((t) => t.id === id)) this.showWhole(key);
  }

  /**
   * The list as it is drawn (design.md, Rows; Calm list): the outline's
   * groups with their visible rows, children under their parent whatever
   * their column, then Done. The calm list puts the groups nearest done
   * first and shows each open group at a glance. ListView draws it and
   * j / k walk it.
   */
  listGroups = $derived.by((): ListGroup[] => {
    const board = this.board;
    if (!board) return [];
    const tree = outline(board.columns, board.tasks, board.completed);
    const collapsed = (id: string) => this.folded('parents', id);
    const group = (key: string, column: ColumnView | null, all: OutlineRow[], folded: boolean): ListGroup => {
      const rows = folded ? [] : visibleRows(all, collapsed);
      const whole = !!(this.activeId && this.folds[this.activeId]?.whole[key]);
      const seen = this.calm && !whole ? glance(rows) : { shown: rows, more: 0 };
      return { key, column, title: column?.title ?? 'Done', count: all.length, folded, rows: seen.shown, more: seen.more };
    };
    const groups = (this.calm ? calmOrder(board.columns, tree.groups) : tree.groups)
      .filter((g) => g.rows.length > 0)
      .map((g) => group(g.column.id, g.column, g.rows, this.folded('groups', g.column.id)));
    if (tree.done.length) groups.push(group(DONE_GROUP, null, tree.done, !this.showCompleted));
    return groups;
  });

  /**
   * What j / k step through, in the order the view draws it: the list as it
   * stands (a calm group's `N more` is a stop of its own), the board's cards
   * column by column, or decisions by family.
   */
  orderedTasks = $derived.by((): { id: string }[] => {
    const board = this.board;
    if (!board) return [];
    if (this.view === 'issues') return [];
    if (this.view === 'decisions') return decisionGroups(board.decisions).flatMap((g) => g.decisions);
    if (this.view === 'board') return board.columns.flatMap((column) => board.tasks.filter((t) => t.column === column.id));
    return this.listGroups.flatMap((g) => [...g.rows.map((row) => row.task), ...(g.more ? [{ id: MORE + g.key }] : [])]);
  });

  #problemTimer: ReturnType<typeof setTimeout> | null = null;
  #fixTimers: Record<string, ReturnType<typeof setTimeout>> = {};
  /** The board as each chat turn found it, to say afterwards what the turn changed. */
  #turnStart = new Map<string, BoardSnapshot>();
  /** The hand-offs each chat turn made (spec-16), by the turn's run ID, said under its reply. */
  #handoffs = new Map<string, { id: string; what: string }[]>();
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
    setInterval(() => (this.now = Date.now()), 15_000);
    void this.refreshAgents();
    void api.getSettings().then((settings) => (this.settings = settings));
    this.projects = await api.listProjects();
    this.loaded = true;
    // A board can turn up while the window is away (pushed from another
    // machine, `brainfile init` in a terminal), so look again on return.
    window.addEventListener('focus', () => {
      for (const p of this.projects) if (p.state.status !== 'ready') void this.refreshProject(p.id);
      // Issues filed while the window was away; the host side keeps this to once a minute.
      if (this.activeId && this.view === 'issues') void this.loadIssues(this.activeId);
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
    if (!(projectId in this.forges)) void api.forgeRepo(projectId).then((repo) => (this.forges[projectId] = repo));
  }

  // ── Issues (task-26) ──────────────────────────────────────────────────────

  /** Read the project's open issues; `force` asks GitHub even if it was asked a moment ago. */
  async loadIssues(projectId: string, force = false): Promise<void> {
    this.issues[projectId] ??= { view: null, loading: false, error: null };
    // Read back through the state proxy: the literal above is not reactive.
    const entry = this.issues[projectId];
    if (entry.loading) return;
    entry.loading = true;
    const result = await api.listIssues(projectId, force);
    const now = this.issues[projectId];
    now.loading = false;
    if (result.ok) {
      now.view = result.value;
      now.error = null;
    } else {
      // What was read before stays on screen, under the problem.
      now.error = result.error;
    }
  }

  /** Make a task from an issue on the active board, linked back to it by `source:`. */
  async taskFromIssue(issue: IssueView): Promise<void> {
    const board = this.board;
    const column = board && intakeColumn(board.columns);
    if (!board || !this.activeId || !column || this.making[issue.url]) return;
    this.making[issue.url] = true;
    const result = await api.addTask(this.activeId, issueTask(issue, column));
    delete this.making[issue.url];
    if (!result.ok) this.notify(result.error, 'warn');
    else this.selectedTaskId = result.value.id;
  }

  async loadGitHubAuth(): Promise<void> {
    this.githubAuth = await api.githubAuth();
  }

  /** Save a token for GitHub, or forget it; the issues read before are read again with it. */
  async setGitHubToken(token: string | null): Promise<boolean> {
    const result = await api.setGitHubToken(token);
    if (!result.ok) {
      this.notify(result.error, 'warn');
      return false;
    }
    this.githubAuth = result.value;
    for (const id of Object.keys(this.issues)) this.issues[id].view = null;
    return true;
  }

  /** A fresh snapshot from the host. What changed without this window's hand goes in the feed. */
  receive(snapshot: BoardSnapshot): void {
    const unsent = snapshot.sync.pending > 0 || snapshot.sync.behind > 0;
    if (!unsent) delete this.#unsentSince[snapshot.projectId];
    else this.#unsentSince[snapshot.projectId] ??= Date.now();
    const before = this.boards[snapshot.projectId];
    this.boards[snapshot.projectId] = snapshot;
    if (!before || this.settling === snapshot.projectId || Date.now() - (lastLocalWrite[snapshot.projectId] ?? 0) < LOCAL_WINDOW_MS) return;
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
    else this.touchTab(this.activeId, taskId);
  }

  // ── A hand-off's review (spec-14) ────────────────────────────────────────

  /** The hand-off's worktree, opened in the chosen editor. */
  async openWorktree(taskId: string): Promise<void> {
    if (!this.activeId) return;
    const result = await api.openWorktree(this.activeId, taskId, this.editor ?? undefined);
    if (!result.ok) this.notify(result.error, 'warn');
  }

  /** Merge or discard: the review goes when its worktree does. True when it went. */
  async settleReview(taskId: string, how: 'merge' | 'discard'): Promise<boolean> {
    if (!this.activeId) return false;
    const result = how === 'merge' ? await api.mergeReview(this.activeId, taskId) : await api.discardReview(this.activeId, taskId);
    if (!result.ok) this.notify(result.error, 'warn');
    return result.ok;
  }

  /** Back to the agent with the person's note, in the log where the brief will carry it, on the same branch. */
  async sendBack(taskId: string, note: string, agentId: AgentId): Promise<void> {
    if (!this.activeId) return;
    const noted = await api.noteTask(this.activeId, taskId, `Sent back from review: ${note.trim()}`);
    if (!noted.ok) return this.notify(noted.error, 'warn');
    await this.dispatch(taskId, agentId);
  }

  // ── The dock's tabs ──────────────────────────────────────────────────────

  /** Keeps a document at hand: added at the newest end; a tab already there keeps its place. */
  touchTab(projectId: string, id: string): void {
    if (this.tabs.some((t) => t.projectId === projectId && t.id === id)) return;
    this.tabs = [...this.tabs, { projectId, id }].slice(-TABS_KEPT);
    this.saveTabs();
  }

  closeTab(projectId: string, id: string): void {
    this.tabs = this.tabs.filter((t) => !(t.projectId === projectId && t.id === id));
    this.saveTabs();
  }

  /** Steps to the tab before or after the one open, and opens it. */
  async cycleTab(step: number): Promise<void> {
    if (this.tabs.length === 0) return;
    const at = this.tabs.findIndex((t) => t.projectId === this.activeId && t.id === this.openTaskId);
    const next = this.tabs[(at < 0 ? (step > 0 ? 0 : this.tabs.length - 1) : at + step + this.tabs.length) % this.tabs.length];
    await this.goTo(next.projectId, next.id);
  }

  /** The live hand-off on a document of any board, if there is one. */
  runOn(projectId: string, id: string): AgentRun | undefined {
    return Object.values(this.runs).find((r) => r.kind === 'dispatch' && r.taskId === id && r.projectId === projectId && isLive(r));
  }

  private saveTabs(): void {
    localStorage.setItem(TABS_KEY, JSON.stringify(this.tabs));
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

  /** The popover opens to a blank page, unless a reply is still on its way or waiting to be read. */
  openChat(): void {
    if (this.activeId && !this.liveAsk) this.thread[this.activeId] = null;
    this.chatOpen = true;
    if (this.activeId) this.readReply(this.activeId);
  }

  /** The chat is open on this board: a reply waiting on the key is the thread it shows, and is read. */
  readReply(projectId: string, show = true): void {
    const waiting = this.unread[projectId];
    if (!waiting) return;
    if (show && !this.liveAsk) this.thread[projectId] = waiting;
    delete this.unread[projectId];
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

  /** `discussing` starts a new thread as a discussion of that task; a thread already open keeps what it is. */
  async askBoard(text: string, agentId: AgentId, discussing?: string): Promise<void> {
    const projectId = this.activeId;
    if (!projectId || !text.trim()) return;
    this.remember(agentId, projectId);
    let thread = this.currentThread;
    if (!thread) {
      thread = { id: `t-${Date.now()}`, agentId, startedAt: Date.now(), lines: [], ...(discussing ? { taskId: discussing } : {}) };
      this.threads[projectId] = [thread, ...(this.threads[projectId] ?? [])].slice(0, THREADS_KEPT);
      this.thread[projectId] = thread.id;
    }
    const earlier = thread.lines.filter((l) => !l.failed).map((l) => ({ who: l.who, text: l.text }));
    // What is open in the pane goes along, so "this" means it; a discussion is about its own task.
    const context = this.openTaskId && !thread.taskId ? [this.openTaskId] : [];
    this.addLine(projectId, thread.id, {
      key: `you-${Date.now()}`,
      who: 'you',
      text: text.trim(),
      at: Date.now(),
      ...(context.length ? { context } : {}),
    });
    const before = this.boards[projectId];
    // A hand-off the chat makes takes the model Hand to… would take for that agent here.
    const models = Object.fromEntries(
      this.agents.map((a) => [a.id, this.modelFor(a.id, projectId)] as const).filter(([, model]) => !!model)
    ) as Partial<Record<AgentId, string>>;
    const result = thread.taskId
      ? await api.discuss(projectId, agentId, text.trim(), thread.id, thread.taskId, this.modelFor(agentId, projectId), earlier)
      : await api.ask(projectId, agentId, text.trim(), thread.id, this.modelFor(agentId, projectId), earlier, context, models);
    if (result.ok && before) this.#turnStart.set(result.value.id, before);
    if (!result.ok) this.addLine(projectId, thread.id, { key: `err-${Date.now()}`, who: 'agent', text: result.error, at: Date.now(), failed: true });
  }

  private onRun(run: AgentRun): void {
    const before = this.runs[run.id];
    this.runs[run.id] = run;
    // A hand-off is kept at hand in the dock from the moment it starts.
    if (!before && run.kind === 'dispatch' && run.taskId && !this.tabs.some((t) => t.projectId === run.projectId && t.id === run.taskId)) {
      this.touchTab(run.projectId, run.taskId);
    }
    // One the chat made is said under the turn's reply, like a board change.
    if (!before && run.kind === 'dispatch' && run.taskId && run.from) {
      this.#handoffs.set(run.from, [...(this.#handoffs.get(run.from) ?? []), { id: run.taskId, what: `handed to ${run.agentId}` }]);
    }
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
      // A reply that came with the chat closed waits on the key, on its own board.
      if (run.state === 'done' && !(this.chatOpen && this.activeId === run.projectId)) this.unread[run.projectId] = run.threadId;
      const before = this.#turnStart.get(run.id);
      const handed = this.#handoffs.get(run.id) ?? [];
      this.#turnStart.delete(run.id);
      this.#handoffs.delete(run.id);
      if ((before || handed.length) && run.state !== 'failed') {
        const { projectId, threadId } = run;
        setTimeout(() => {
          const after = this.boards[projectId];
          const board = before && after ? diffBoards(before, after, Date.now()).map((c) => ({ id: c.taskId, what: c.what })) : [];
          // A task handed off says so once: its record, and what its agent has done since, are the hand-off.
          const changes = [...board.filter((c) => c.what === 'added' || !handed.some((h) => h.id === c.id)), ...handed];
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
    if (this.chatOpen) this.readReply(projectId);
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

  /** V turns between the two views of the work; from decisions or issues it goes back to the list. */
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

  /** Two boards made one, as the band offers (spec-15). The board changing is the confirmation. */
  async settleBoards(choice: SettleChoice): Promise<void> {
    const projectId = this.activeId;
    if (!projectId || this.settling) return;
    this.settling = projectId;
    try {
      const result = await api.settleBoards(projectId, choice);
      if (!result.ok) this.notify(result.error, 'warn');
      else await this.refreshProject(projectId);
    } finally {
      this.settling = null;
    }
  }

  // ── Fixing a board problem from the health list (task-34) ───────────────

  /** Sets a project's fix stage; `ms` clears it after that long. */
  private setFix(projectId: string, stage: FixStage | null, ms = 0): void {
    clearTimeout(this.#fixTimers[projectId]);
    delete this.#fixTimers[projectId];
    if (!stage) {
      delete this.fixes[projectId];
      return;
    }
    this.fixes[projectId] = stage;
    if (ms) this.#fixTimers[projectId] = setTimeout(() => this.setFix(projectId, null), ms);
  }

  /** Fix pressed: ask the host what it would do now, and say it before anything runs. */
  async proposeFix(projectId: string): Promise<void> {
    const result = await api.planFix(projectId);
    if (!result.ok) return this.setFix(projectId, { stage: 'failed', message: result.error }, FIX_FAILED_MS);
    if (!result.value) return this.setFix(projectId, { stage: 'failed', message: 'No safe fix now. Ask an agent instead.' }, FIX_FAILED_MS);
    this.setFix(projectId, { stage: 'confirm', words: result.value.words });
  }

  cancelFix(projectId: string): void {
    this.setFix(projectId, null);
  }

  /** Confirmed: the host backs up every copy, then fixes; the board republishes where it now lives. */
  async confirmFix(projectId: string): Promise<void> {
    const asked = this.fixes[projectId];
    if (asked?.stage !== 'confirm' || this.settling) return;
    this.setFix(projectId, { stage: 'running', words: 'Backing up…' });
    this.settling = projectId;
    try {
      const result = await api.fixBoard(projectId, asked.words);
      if (!result.ok) return this.setFix(projectId, { stage: 'failed', message: result.error }, FIX_FAILED_MS);
      await this.refreshProject(projectId);
      this.setFix(projectId, { stage: 'done', message: result.value.message, undo: result.value.undo }, FIX_UNDO_MS);
    } finally {
      this.settling = null;
    }
  }

  /** Puts back what the fix changed; the board it replaces is backed up first. */
  async undoFix(projectId: string): Promise<void> {
    const done = this.fixes[projectId];
    if (done?.stage !== 'done' || !done.undo || this.settling) return;
    this.setFix(projectId, { stage: 'running', words: 'Putting it back…' });
    this.settling = projectId;
    try {
      const result = await api.undoFix(projectId);
      if (!result.ok) return this.setFix(projectId, { stage: 'failed', message: result.error }, FIX_FAILED_MS);
      await this.refreshProject(projectId);
      this.setFix(projectId, { stage: 'done', message: result.value.message, undo: false }, FIX_UNDO_MS / 2);
    } finally {
      this.settling = null;
    }
  }

  /**
   * Hands a board's problem to the project's agent in its chat: what was
   * found, and to explain it and ask before changing anything. It is an
   * ordinary chat turn, so it shows in the dock's chat like any other.
   */
  async askAboutBoard(projectId: string): Promise<void> {
    const board = this.boards[projectId];
    const agent = this.agentFor(projectId);
    const project = this.projects.find((p) => p.id === projectId);
    if (!board || !agent || !project) return;
    if (projectId !== this.activeId) await this.select(projectId);
    this.chatOpen = true;
    this.readReply(projectId, false);
    // One turn at a time: a reply still on its way is shown, not talked over.
    if (this.liveAsk) return this.notify(`${this.agentName(this.liveAsk.agentId)} is still answering here.`, 'warn');
    this.thread[projectId] = null;
    await this.askBoard(problemBrief(project.name, board.integrity), agent);
  }

  /**
   * Talks a task over before it is handed off (task-35). The chat opens on the
   * task's latest discussion, kept like any chat, or starts one with the
   * agent Hand to… offers first; the agent reads the task and answers.
   */
  async discussTask(taskId: string): Promise<void> {
    const projectId = this.activeId;
    const agent = this.agentFor(projectId);
    if (!projectId) return;
    if (!agent) return this.notify('No agent is installed to talk it over with.', 'warn');
    const threads = this.threads[projectId] ?? [];
    const live = this.liveAsk;
    const liveThread = live ? threads.find((t) => t.id === live.threadId) : undefined;
    this.chatOpen = true;
    this.readReply(projectId, false);
    // One turn at a time: a reply still on its way is shown, not talked over.
    if (live && liveThread?.taskId !== taskId) return this.notify(`${this.agentName(live.agentId)} is still answering here.`, 'warn');
    const earlier = liveThread ?? threads.find((t) => t.taskId === taskId);
    if (earlier) {
      this.thread[projectId] = earlier.id;
      return;
    }
    this.thread[projectId] = null;
    await this.askBoard(`Talk ${taskId} over with me before I hand it off.`, agent, taskId);
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
