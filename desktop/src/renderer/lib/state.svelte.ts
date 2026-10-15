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
  LeadView,
  AgentServer,
  Api,
  BoardSnapshot,
  BranchesView,
  ColumnView,
  DispatchSettings,
  EditorInfo,
  ForgeRepo,
  GitHubAuthView,
  IssuesView,
  IssueView,
  LinkView,
  MergeTo,
  ModelOption,
  PairingCode,
  Result,
  PermissionAsk,
  Project,
  ReadyView,
  RunStep,
  UpdateStatus,
  SettleChoice,
} from '../../shared/api';
import { diffBoards, type FeedItem } from './feed';
import { dropSession, keepRecent, keepSession, RECENT_KEPT, type Doc, type Session } from './sessions';
import { problemBrief } from './brief';

/** How long after a turn ends its last board change is waited for: the commit, the watcher, the snapshot. */
const SETTLE_MS = 900;
import { calmOrder, decisionGroups, glance, GLANCE, outline, restsFolded, rootsHeld, visibleRows, workColumn, type OutlineRow } from './format';
import { intakeColumn, issueTask } from '../../shared/issues';
import { customId } from '../../shared/agentServers';
import { effortToSet } from '../../agents/effort';

declare global {
  interface Window {
    brainfile: Api;
  }
}

/** Changes this window makes are not news; remember when each board was last written from here. */
const lastLocalWrite: Record<string, number> = {};
const MUTATIONS = ['addTask', 'moveTask', 'patchTask', 'toggleSubtask', 'addSubtask', 'completeTask', 'deleteTask', 'restoreTask', 'reopenTask', 'noteTask', 'settleBoards', 'fixBoard', 'undoFix'] as const;
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

export type ViewMode = 'list' | 'decisions' | 'issues';
export type MenuKind = 'status' | 'priority' | 'assignee' | 'labels';

/** The list's group of completed work; a column's slug never has a colon. */
export const DONE_GROUP = ':done';
/** The list's group of hand-offs that can merge now (task-69), above every column. */
export const READY_GROUP = ':ready';
/** A calm group's `N more` line is a stop in the j / k walk, under this prefix and the group's key. */
export const MORE = 'more:';
export const isMore = (id: string | null | undefined): boolean => !!id?.startsWith(MORE);

/** A group of the list as it is drawn: a column's, or the completed work's. */
export interface ListGroup {
  /** The column's ID, DONE_GROUP or READY_GROUP. */
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
/** Effort last chosen for each agent and model, so a model keeps its level. */
const EFFORT_KEY = 'brainfile.efforts';
const EDITOR_KEY = 'brainfile.editor';
/** Before sessions (decision-8) the dock kept documents: they become the palette's recent ones. */
const TABS_KEY = 'brainfile.tabs';
const SESSIONS_KEY = 'brainfile.sessions';
const RECENT_KEY = 'brainfile.recent';
const CALM_KEY = 'brainfile.calm';
const THREADS_KEY = 'brainfile.threads';
const THREADS_KEPT = 30;
/** The thread the chat last showed, per board. */
const THREAD_KEY = 'brainfile.thread';

export interface Thread {
  id: string;
  agentId: AgentId;
  startedAt: number;
  lines: ChatLine[];
  /** A discussion of this task, at any stage of its life (task-35); unset for a chat about the board. */
  taskId?: string;
}

function loadList<T>(key: string): T[] | null {
  try {
    const kept = JSON.parse(localStorage.getItem(key) ?? 'null');
    return Array.isArray(kept) ? (kept as T[]) : null;
  } catch {
    return null;
  }
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
/** The chat pane (decision-8): at the window's right edge, beside the task pane. */
export const CHAT_PANE = { min: 340, max: 600, initial: 400 };

type Layout = { rail: number; railOpen: boolean; pane: number; chat: number };

function loadLayout(): Layout {
  const initial: Layout = { rail: RAIL.initial, railOpen: true, pane: TASK_PANE.initial, chat: CHAT_PANE.initial };
  try {
    const kept = { ...initial, ...JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? '{}') };
    // The popover's size, from before the chat was a pane, is not a pane's width.
    if (typeof kept.chat !== 'number') kept.chat = CHAT_PANE.initial;
    return kept;
  } catch {
    return initial;
  }
}

const VIEW_MODES = new Set<ViewMode>(['list', 'decisions', 'issues']);

function isViewMode(value: unknown): value is ViewMode {
  return typeof value === 'string' && VIEW_MODES.has(value as ViewMode);
}

/** Saved views per project. A stored `'board'` (the removed kanban) is left out, so the list stands in. */
function loadViews(): Record<string, ViewMode> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(VIEW_KEY) ?? '{}');
    if (!raw || typeof raw !== 'object') return {};
    const views: Record<string, ViewMode> = {};
    let dropped = false;
    for (const [id, mode] of Object.entries(raw)) {
      if (isViewMode(mode)) views[id] = mode;
      else dropped = true;
    }
    if (dropped) localStorage.setItem(VIEW_KEY, JSON.stringify(views));
    return views;
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
  /** The app's updates (task-71): null until main has said. */
  update = $state<UpdateStatus | null>(null);
  /** Each board's hand-offs that can merge now, or would conflict, with no agent still at them (task-69). */
  mergeable = $state<Record<string, ReadyView[]>>({});
  /** Each board's branches a hand-off could land on (decision-16), asked when a picker opens. */
  branches = $state<Record<string, BranchesView>>({});
  /** Epics' leads (decision-15), by `projectId\nepicId`: every one since the app opened. */
  leads = $state<Record<string, LeadView>>({});
  asks = $state<PermissionAsk[]>([]);
  /** Chat threads per board, newest first, kept on this machine. */
  threads = $state<Record<string, Thread[]>>(load(THREADS_KEY, {}));
  /** The thread the chat shows, per board, kept while it is hidden and across a restart; null is a new chat. */
  thread = $state<Record<string, string | null>>(load(THREAD_KEY, {}));
  /** What you were typing, per board and thread, kept while the chat is hidden. */
  drafts = $state<Record<string, string>>({});
  chatOpen = $state(false);
  /** Per board, the thread whose reply came while the chat was closed; opening the chat there reads it. */
  unread = $state<Record<string, string>>({});
  /** Settings take the board's place in the pane until a project is picked or Esc. */
  settingsOpen = $state(false);
  settings = $state<DispatchSettings>({ bypass: false, modes: {}, agentServers: {} });
  /** The dock's sessions on every board, oldest first: the newest sits next to the chat key. */
  sessions = $state<Session[]>(loadList<Session>(SESSIONS_KEY) ?? []);
  /** Documents opened in the pane on any board, newest first, for the palette. */
  recent = $state<Doc[]>(loadList<Doc>(RECENT_KEY) ?? []);
  /** The available editors; unset uses a running editor, then the first found. */
  editors = $state<EditorInfo[]>([]);
  editor = $state<string | null>(localStorage.getItem(EDITOR_KEY));
  /** Each agent's permission modes, as it reports them; null when it has none. */
  modes = $state<Partial<Record<AgentId, AgentModes | null>>>({});
  models = $state<Partial<Record<AgentId, ModelOption[]>>>({});
  /** The model last chosen for each agent anywhere: what a project with no choice of its own starts from. */
  modelChoice = $state<Partial<Record<AgentId, string>>>(load(MODEL_KEY, {}));
  /** Effort last chosen for each agent and model. Medium fills in where nothing is stored and the model offers it. */
  effortChoice = $state<Partial<Record<AgentId, Record<string, string>>>>(load(EFFORT_KEY, {}));
  /** Each agent's model names as it last reported them, so a choice reads well before the list is asked for again. */
  modelNames = $state<Partial<Record<AgentId, Record<string, string>>>>(load(MODEL_NAMES_KEY, {}));
  /** Per project, the agent last used there and the model and effort last chosen for each agent (null model: the agent's default). */
  prefs = $state<
    Record<string, { agent?: AgentId; models?: Partial<Record<AgentId, string | null>>; efforts?: Partial<Record<AgentId, Record<string, string>>> }>
  >(load(PREFS_KEY, {}));

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

  /** The effort stored for this agent and model: the project's own, else the last chosen anywhere. */
  rememberedEffort(agentId: AgentId, model: string, projectId: string | null = this.activeId): string | undefined {
    return (projectId ? this.prefs[projectId]?.efforts?.[agentId]?.[model] : undefined) ?? this.effortChoice[agentId]?.[model];
  }

  /**
   * The effort a turn should ask for. A remembered level wins when the model
   * still offers it; otherwise medium, when the model offers that. Undefined
   * when no model is chosen, or the model offers no effort.
   */
  effortFor(agentId: AgentId, projectId: string | null = this.activeId): string | undefined {
    const model = this.modelFor(agentId, projectId);
    if (!model) return undefined;
    const levels = this.models[agentId]?.find((item) => item.value === model)?.efforts;
    const remembered = this.rememberedEffort(agentId, model, projectId);
    if (levels) return effortToSet(levels, remembered);
    return remembered;
  }

  /** A model and its effort, as the picker and Hand to… read them. */
  modelNote(agentId: AgentId, projectId: string | null = this.activeId): string {
    const model = this.modelFor(agentId, projectId);
    if (!model) return '';
    const name = this.modelLabel(agentId, model);
    const effort = this.effortLabel(agentId, projectId);
    return effort ? `${name} · ${effort}` : name;
  }

  /** An effort as people read it: the name the agent gives it, or its value before the list is asked for again. */
  effortLabel(agentId: AgentId, projectId: string | null = this.activeId): string {
    const model = this.modelFor(agentId, projectId);
    const effort = this.effortFor(agentId, projectId);
    if (!model || !effort) return '';
    return this.models[agentId]?.find((item) => item.value === model)?.efforts?.find((level) => level.value === effort)?.name ?? effort;
  }

  /** The model and effort a run started on, as its line reads them (`Opus · High`); empty for the agent's default (task-54). */
  runNote(run: AgentRun): string {
    if (!run.model) return '';
    const name = this.modelLabel(run.agentId, run.model);
    const levels = this.models[run.agentId]?.find((item) => item.value === run.model)?.efforts;
    const level = run.effort ? (levels?.find((item) => item.value === run.effort)?.name ?? run.effort) : '';
    return level ? `${name} · ${level}` : name;
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
  /** The phone link (task-40): the switch and the linked phones, as main last said. */
  link = $state<LinkView | null>(null);
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
   * first and shows each open group at a glance. A task an agent is
   * working stays in that list, with its family. ListView draws it and
   * j / k walk it.
   */
  listGroups = $derived.by((): ListGroup[] => {
    const board = this.board;
    if (!board) return [];
    // What can merge now leaves its column for the group above them all; one that would conflict stays.
    const merging = new Set((this.activeId ? (this.mergeable[this.activeId] ?? []) : []).filter((r) => !r.conflicts).map((r) => r.taskId));
    const ready: OutlineRow[] = [
      ...board.tasks.filter((t) => merging.has(t.id)).map((task) => ({ task, done: false, depth: 0, children: 0 })),
      ...board.completed.filter((t) => merging.has(t.id)).map((task) => ({ task, done: true, depth: 0, children: 0 })),
    ];
    const tree = outline(
      board.columns,
      board.tasks.filter((t) => !merging.has(t.id)),
      board.completed.filter((t) => !merging.has(t.id))
    );
    const collapsed = (id: string) => this.folded('parents', id);
    // Starting, working, or waiting: the same live dispatch the row names.
    const working = new Set<string>();
    if (this.calm && this.activeId) {
      for (const run of Object.values(this.runs)) {
        if (run.kind === 'dispatch' && run.taskId && run.projectId === this.activeId && isLive(run)) working.add(run.taskId);
      }
    }
    const group = (key: string, column: ColumnView | null, all: OutlineRow[], folded: boolean): ListGroup => {
      const rows = folded ? [] : visibleRows(all, collapsed);
      const whole = !!(this.activeId && this.folds[this.activeId]?.whole[key]);
      const keep = working.size ? rootsHeld(all, working) : undefined;
      const seen = this.calm && !whole ? glance(rows, GLANCE, keep) : { shown: rows, more: 0 };
      return { key, column, title: column?.title ?? 'Done', count: all.length, folded, rows: seen.shown, more: seen.more };
    };
    const groups = (this.calm ? calmOrder(board.columns, tree.groups) : tree.groups)
      .filter((g) => g.rows.length > 0)
      .map((g) => group(g.column.id, g.column, g.rows, this.folded('groups', g.column.id)));
    if (ready.length) {
      // Every one shows: it is the person's queue, not a glance.
      const folded = this.folded('groups', READY_GROUP);
      groups.unshift({ key: READY_GROUP, column: null, title: 'Ready to merge', count: ready.length, folded, rows: folded ? [] : ready, more: 0 });
    }
    if (tree.done.length) groups.push(group(DONE_GROUP, null, tree.done, !this.showCompleted));
    return groups;
  });

  /**
   * What j / k step through, in the order the view draws it: the list as it
   * stands (a calm group's `N more` is a stop of its own), or decisions by family.
   */
  orderedTasks = $derived.by((): { id: string }[] => {
    const board = this.board;
    if (!board) return [];
    if (this.view === 'issues') return [];
    if (this.view === 'decisions') return decisionGroups(board.decisions).flatMap((g) => g.decisions);
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
    // A phone's merge or discard: the board may not change (a discard never does), so Ready to merge is asked again here.
    api.onReadyChanged((projectId) => this.refreshReady(projectId, true));
    api.onLinkChanged((view) => (this.link = view));
    api.onUpdate((status) => (this.update = status));
    void api.updateStatus().then((status) => (this.update = status));
    api.onAgentEvent((event) => {
      if (event.kind === 'run') this.onRun(event.run);
      else if (event.kind === 'lead') this.onLead(event.lead);
      else if (event.kind === 'permission') this.asks = [...this.asks, event.ask];
      else this.asks = this.asks.filter((a) => a.id !== event.id);
    });
    void api.leads().then((leads) => {
      for (const lead of leads) this.leads[`${lead.projectId}\n${lead.epicId}`] = lead;
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
      this.refreshReady(projectId, true);
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

  // ── Phone link (task-40) ────────────────────────────────────────────────

  async loadLink(): Promise<void> {
    this.link = await api.linkState();
  }

  async setLink(on: boolean): Promise<void> {
    this.link = await api.setLink(on);
  }

  /** A fresh pairing code; it turns the link on and retires the last one. */
  linkCode(): Promise<Result<PairingCode>> {
    return api.linkCode();
  }

  async forgetPhone(key: string): Promise<void> {
    this.link = await api.forgetPhone(key);
  }

  /** A fresh snapshot from the host. What changed without this window's hand goes in the feed. */
  receive(snapshot: BoardSnapshot): void {
    const unsent = snapshot.sync.pending > 0 || snapshot.sync.behind > 0;
    if (!unsent) delete this.#unsentSince[snapshot.projectId];
    else this.#unsentSince[snapshot.projectId] ??= Date.now();
    const before = this.boards[snapshot.projectId];
    this.boards[snapshot.projectId] = snapshot;
    this.refreshReady(snapshot.projectId);
    if (!before || this.settling === snapshot.projectId || Date.now() - (lastLocalWrite[snapshot.projectId] ?? 0) < LOCAL_WINDOW_MS) return;
    const items = diffBoards(before, snapshot, Date.now());
    if (items.length) this.feed = [...items.reverse(), ...this.feed].slice(0, FEED_LIMIT);
  }

  // ── Agents ──────────────────────────────────────────────────────────────

  #readyTimers: Record<string, ReturnType<typeof setTimeout>> = {};

  /** Asks again which hand-offs can merge: a beat after the last change, so a burst of board writes asks once. */
  refreshReady(projectId: string, now = false): void {
    clearTimeout(this.#readyTimers[projectId]);
    const ask = async () => {
      const result = await api.readyToMerge(projectId);
      if (result.ok) this.mergeable[projectId] = result.value;
    };
    if (now) void ask();
    else this.#readyTimers[projectId] = setTimeout(() => void ask(), 400);
  }

  /**
   * What waits on the person across every board (task-69): hand-offs that
   * can merge, and ones that would conflict, in the rail's order. The feed
   * pins them above its changes; they go when they merge, not when seen.
   */
  waiting = $derived.by(() =>
    this.projects.flatMap((project) => {
      const board = this.boards[project.id];
      if (!board) return [];
      return (this.mergeable[project.id] ?? []).flatMap((ready) => {
        const task = board.tasks.find((t) => t.id === ready.taskId) ?? board.completed.find((t) => t.id === ready.taskId);
        return task ? [{ projectId: project.id, title: task.title, ready }] : [];
      });
    })
  );
  /** How many can merge now: the number the feed's key says, in the accent. */
  readyCount = $derived(this.waiting.filter((w) => !w.ready.conflicts).length);

  /** The hand-off on a task of the board in front that can merge, or would conflict. */
  readyFor(taskId: string): ReadyView | undefined {
    return this.activeId ? this.mergeable[this.activeId]?.find((r) => r.taskId === taskId) : undefined;
  }

  private onLead(lead: LeadView): void {
    const key = `${lead.projectId}\n${lead.epicId}`;
    const before = this.leads[key];
    this.leads[key] = lead;
    if (before?.state !== lead.state && (lead.state === 'done' || (lead.state === 'paused' && /failed/.test(lead.note ?? '')))) {
      // An epic with a branch of its own is not done yet: it waits in Ready to merge (decision-16).
      const done = /Ready to merge/.test(lead.note ?? '') ? lead.note! : `${lead.epicId} is done: its lead handed off the last of it`;
      this.notify(lead.state === 'done' ? done : `${lead.epicId}'s lead paused: ${lead.note}`, lead.state === 'done' ? 'ok' : 'warn');
      if (lead.state === 'done') this.refreshReady(lead.projectId, true);
    }
  }

  /** The lead of an epic on the board in front, while it runs or after it ended this session. */
  leadFor(epicId: string, projectId = this.activeId): LeadView | undefined {
    return projectId ? this.leads[`${projectId}\n${epicId}`] : undefined;
  }

  /** The lead's turn at work on an epic, if any. */
  leadRunFor(epicId: string): AgentRun | undefined {
    return Object.values(this.runs).find((r) => r.kind === 'lead' && r.taskId === epicId && r.projectId === this.activeId && isLive(r));
  }

  async pauseLead(epicId: string): Promise<void> {
    if (!this.activeId) return;
    const result = await api.pauseLead(this.activeId, epicId);
    if (!result.ok) this.notify(result.error, 'warn');
  }

  /** Resumes a paused lead, or one left on the epic by a restart. */
  async resumeLead(epicId: string): Promise<void> {
    if (!this.activeId) return;
    const result = await api.resumeLead(this.activeId, epicId);
    if (!result.ok) this.notify(result.error, 'warn');
    else this.keepSession({ projectId: this.activeId, kind: 'handoff', id: epicId });
  }

  async stopLead(epicId: string): Promise<void> {
    if (!this.activeId) return;
    const result = await api.stopLead(this.activeId, epicId);
    if (!result.ok) this.notify(result.error, 'warn');
  }

  /** The live dispatch on a task of the board in front, if any. */
  runFor(taskId: string): AgentRun | undefined {
    return Object.values(this.runs).find((r) => r.kind === 'dispatch' && r.taskId === taskId && r.projectId === this.activeId && isLive(r));
  }

  /** Which agents are on this Mac: asked at start, and again whenever a picker opens, so one installed since shows up. */
  async refreshAgents(): Promise<void> {
    const listed: unknown = await api.listAgents();
    // An agents process that stopped mid-request answers with a failure, not a list; the last list stands.
    if (Array.isArray(listed)) this.agents = listed as AgentInfo[];
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
    // A hand-off uses this agent's settings without changing the chat's choice.
    await this.patch(taskId, { assignee: agentId });
    const result = await api.dispatch(this.activeId, taskId, agentId, this.modelFor(agentId), this.effortFor(agentId));
    if (!result.ok) this.notify(result.error, 'warn');
    else this.keepSession({ projectId: this.activeId, kind: 'handoff', id: taskId });
  }

  /** The branches a hand-off could land on, asked again each time a picker opens; the last answer stands meanwhile. */
  async refreshBranches(projectId = this.activeId): Promise<void> {
    if (!projectId) return;
    const result = await api.branches(projectId);
    if (result.ok) this.branches[projectId] = result.value;
  }

  /**
   * Where a task's hand-off lands, chosen in Hand to… (decision-16): written
   * to the task as `landsOn`, so it outlives the run. `null` is the trunk;
   * what the task would inherit anyway is written as nothing.
   */
  async setLandsOn(taskId: string, branch: string | null): Promise<void> {
    const task = this.board?.tasks.find((t) => t.id === taskId);
    if (!task) return;
    const parent = task.parentId ? this.board?.tasks.find((t) => t.id === task.parentId) ?? this.board?.completed.find((t) => t.id === task.parentId) : undefined;
    // What it would land on without its own: its parent's own branch, else the parent's target, else the trunk.
    const inherited = !parent ? null : parent.epicBranch ? `dispatch/${parent.id}` : (parent.target?.branch ?? null);
    // The trunk under a parent that lands elsewhere is written by name, so it must be known first.
    if (branch === null && inherited !== null && !this.branches[this.activeId ?? '']) await this.refreshBranches();
    const trunk = this.branches[this.activeId ?? '']?.trunk ?? null;
    if (branch === null && inherited !== null && !trunk) return this.notify('The trunk is not known yet: try again in a moment', 'warn');
    const own = branch === inherited || (branch === null && inherited === null) ? null : (branch ?? trunk);
    if ((task.landsOn ?? null) === own) return;
    await this.patch(taskId, { landsOn: own });
  }

  // ── A hand-off's review (spec-14) ────────────────────────────────────────

  /** The hand-off's worktree, opened in the chosen editor. */
  async openWorktree(taskId: string): Promise<void> {
    if (!this.activeId) return;
    const result = await api.openWorktree(this.activeId, taskId, this.editor ?? undefined);
    if (!result.ok) this.notify(result.error, 'warn');
  }

  /** Merge or discard: the review goes when its worktree does, and a merged task is done. True when it went. */
  /** `to`: where an epic's own branch goes (decision-16); left out, its target. */
  async settleReview(taskId: string, how: 'merge' | 'discard', projectId = this.activeId, to?: MergeTo): Promise<boolean> {
    if (!projectId) return false;
    const result = how === 'merge' ? await api.mergeReview(projectId, taskId, to) : await api.discardReview(projectId, taskId);
    if (!result.ok) {
      // A check that failed says its first line here; the whole of it goes in the task's log, where a send-back carries it to the agent.
      const [first, ...rest] = result.error.split('\n');
      // Sent back to its agent (task-63) is news, not a problem.
      this.notify(first, /sent back to /.test(first) ? 'ok' : 'warn');
      // A log entry is one line: the output's lines run on, marked, and its end is kept.
      const said = rest.map((l) => l.trim()).filter(Boolean).join(' ⏎ ').slice(-800);
      if (said) await api.noteTask(projectId, taskId, `Checks failed before merge: ${first.replace(/^Nothing was merged: /, '')} ${said}`);
    }
    // Merging is the person's yes: the agents process completes the task, unless subtasks are left or it is a
    // parent with open children; then it stays open, and says so.
    if (result.ok && how === 'merge' && /stays open|as a branch/.test(result.value.message)) this.notify(result.value.message, 'ok');
    this.refreshReady(projectId, true);
    return result.ok;
  }

  /** Back to the agent with the person's note, in the log where the brief will carry it, on the same branch. */
  async sendBack(taskId: string, note: string, agentId: AgentId): Promise<void> {
    if (!this.activeId) return;
    const noted = await api.noteTask(this.activeId, taskId, `Sent back from review: ${note.trim()}`);
    if (!noted.ok) return this.notify(noted.error, 'warn');
    await this.dispatch(taskId, agentId);
  }

  // ── The dock's sessions (decision-8) ─────────────────────────────────────

  /** Keeps a session at hand: added at the newest end; one already there keeps its place. */
  keepSession(session: Session): void {
    const next = keepSession(this.sessions, session);
    if (next === this.sessions) return;
    this.sessions = next;
    this.saveSessions();
  }

  /** × on a tab: the session leaves the dock; a thread stays in the chat's history. */
  closeSession(session: Session): void {
    this.sessions = dropSession(this.sessions, session);
    this.saveSessions();
  }

  /** The board in front's sessions, oldest first. */
  boardSessions = $derived(this.sessions.filter((s) => s.projectId === this.activeId));

  /** The session in front: the thread the chat shows, or a hand-off whose task is open. */
  isCurrent(session: Session): boolean {
    if (session.projectId !== this.activeId) return false;
    if (session.kind === 'chat') return this.chatOpen && this.thread[session.projectId] === session.id;
    return this.openTaskId === session.id && !(this.chatOpen && this.currentThread?.taskId === session.id);
  }

  /**
   * Opens a session where it was left: a thread in the chat (a discussion
   * with its task beside it), a hand-off as its task in the pane.
   */
  openSession(session: Session): void {
    if (session.projectId !== this.activeId) return;
    if (session.kind === 'handoff') {
      this.selectedTaskId = session.id;
      this.openTaskId = session.id;
      return;
    }
    this.chatOpen = true;
    this.showThread(session.projectId, session.id);
    if (this.unread[session.projectId] === session.id) delete this.unread[session.projectId];
    const taskId = this.threads[session.projectId]?.find((t) => t.id === session.id)?.taskId;
    if (taskId) {
      this.selectedTaskId = taskId;
      this.openTaskId = taskId;
    }
  }

  /** Steps to the session before or after the one in front, on the board in front, and opens it. */
  cycleSession(step: number): void {
    const list = this.boardSessions;
    if (list.length === 0) return;
    const at = list.findIndex((s) => this.isCurrent(s));
    this.openSession(list[(at < 0 ? (step > 0 ? 0 : list.length - 1) : at + step + list.length) % list.length]);
  }

  /** A document opened in the pane is remembered for the palette. */
  keepRecent(projectId: string, id: string): void {
    if (this.recent[0]?.projectId === projectId && this.recent[0]?.id === id) return;
    this.recent = keepRecent(this.recent, { projectId, id });
    localStorage.setItem(RECENT_KEY, JSON.stringify(this.recent));
  }

  private saveSessions(): void {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(this.sessions));
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

  /**
   * The person's own agents (task-47), saved whole. One that changed or went
   * is asked again for its models and modes; the picker learns at once.
   */
  async saveAgentServers(servers: Record<string, AgentServer>): Promise<void> {
    const before = this.settings.agentServers;
    await this.setSettings({ agentServers: servers });
    for (const name of new Set([...Object.keys(before), ...Object.keys(servers)])) {
      if (JSON.stringify(before[name]) === JSON.stringify(servers[name])) continue;
      delete this.modes[customId(name)];
      delete this.models[customId(name)];
    }
    await this.refreshAgents();
  }

  /** Removed at once, with an Undo that puts it back as it was. */
  async removeAgentServer(name: string): Promise<void> {
    const gone = this.settings.agentServers[name];
    if (!gone) return;
    const rest = { ...this.settings.agentServers };
    delete rest[name];
    await this.saveAgentServers(rest);
    this.offerUndo(`Removed ${name}`, () => this.saveAgentServers({ ...this.settings.agentServers, [name]: gone }));
  }

  /** null is the agent's own default. */
  chooseMode(agentId: AgentId, mode: string | null): void {
    const modes = { ...this.settings.modes };
    if (mode) modes[agentId] = mode;
    else delete modes[agentId];
    void this.setSettings({ modes });
  }

  /** Remembers the model for this project's agent, and as the last chosen anywhere. null is the agent's default. `effort` is the level for that model; null clears it. */
  chooseModel(agentId: AgentId, model: string | null, effort?: string | null): void {
    if (model) this.modelChoice[agentId] = model;
    else delete this.modelChoice[agentId];
    localStorage.setItem(MODEL_KEY, JSON.stringify(this.modelChoice));
    if (model) this.rememberEffort(agentId, model, effort);
    const projectId = this.activeId;
    if (!projectId) return;
    const prefs = this.prefs[projectId] ?? {};
    const efforts = model ? this.writeEffort(prefs.efforts?.[agentId], model, effort) : prefs.efforts?.[agentId];
    this.prefs[projectId] = {
      ...prefs,
      models: { ...prefs.models, [agentId]: model },
      efforts: { ...prefs.efforts, [agentId]: efforts ?? {} },
    };
    this.savePrefs();
  }

  /** Keeps or clears one model's effort, on this project and as the last chosen anywhere. */
  private rememberEffort(agentId: AgentId, model: string, effort?: string | null): void {
    this.effortChoice[agentId] = this.writeEffort(this.effortChoice[agentId], model, effort) ?? {};
    if (!Object.keys(this.effortChoice[agentId] ?? {}).length) delete this.effortChoice[agentId];
    localStorage.setItem(EFFORT_KEY, JSON.stringify(this.effortChoice));
  }

  private writeEffort(current: Record<string, string> | undefined, model: string, effort?: string | null): Record<string, string> | undefined {
    const next = { ...current };
    if (effort) next[model] = effort;
    else delete next[model];
    return Object.keys(next).length ? next : undefined;
  }

  /** The chat comes back as it was left: the thread last shown, or a reply waiting to be read. Only a new chat is blank. */
  openChat(): void {
    this.chatOpen = true;
    if (this.activeId) this.readReply(this.activeId);
  }

  /** Shows a thread in the chat, or a new chat for null, and remembers it for when the chat comes back. */
  showThread(projectId: string, id: string | null): void {
    this.thread[projectId] = id;
    localStorage.setItem(THREAD_KEY, JSON.stringify(this.thread));
    // Every thread shown is a session in the dock until its × closes it.
    if (id) this.keepSession({ projectId, kind: 'chat', id });
  }

  /** The chat is open on this board: a reply waiting on the key is the thread it shows, and is read. */
  readReply(projectId: string, show = true): void {
    const waiting = this.unread[projectId];
    if (!waiting) return;
    if (show && !this.liveAsk) this.showThread(projectId, waiting);
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
      this.showThread(projectId, thread.id);
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
    // A hand-off the chat makes takes the model and effort Hand to… would take for that agent here.
    const models = Object.fromEntries(
      this.agents.map((a) => [a.id, this.modelFor(a.id, projectId)] as const).filter(([, model]) => !!model)
    ) as Partial<Record<AgentId, string>>;
    const efforts = Object.fromEntries(
      this.agents.map((a) => [a.id, this.effortFor(a.id, projectId)] as const).filter(([, effort]) => !!effort)
    ) as Partial<Record<AgentId, string>>;
    const result = thread.taskId
      ? await api.discuss(projectId, agentId, text.trim(), thread.id, thread.taskId, this.modelFor(agentId, projectId), earlier, this.effortFor(agentId, projectId))
      : await api.ask(
          projectId,
          agentId,
          text.trim(),
          thread.id,
          this.modelFor(agentId, projectId),
          earlier,
          context,
          models,
          this.effortFor(agentId, projectId),
          efforts
        );
    if (result.ok && before) this.#turnStart.set(result.value.id, before);
    if (!result.ok) this.addLine(projectId, thread.id, { key: `err-${Date.now()}`, who: 'agent', text: result.error, at: Date.now(), failed: true });
  }

  private onRun(run: AgentRun): void {
    const before = this.runs[run.id];
    this.runs[run.id] = run;
    // A hand-off, or an epic's lead, is a session in its board's dock from the moment it starts.
    if (!before && (run.kind === 'dispatch' || run.kind === 'lead') && run.taskId) this.keepSession({ projectId: run.projectId, kind: 'handoff', id: run.taskId });
    // One the chat made is said under the turn's reply, like a board change; a lead's are said by its tab.
    if (!before && run.kind === 'dispatch' && run.taskId && run.from && this.runs[run.from]?.kind === 'ask') {
      this.#handoffs.set(run.from, [...(this.#handoffs.get(run.from) ?? []), { id: run.taskId, what: `handed to ${run.agentId}` }]);
    }
    const ended = !isLive(run) && (!before || isLive(before));
    if (!ended) return;
    // A hand-off that ends may have left a branch to merge.
    if (run.kind === 'dispatch') this.refreshReady(run.projectId, true);
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

  /** Show a move at once; the host's snapshot replaces it moments later. */
  /** A done task back on the board, open again: in `column`, else where unfinished work goes. */
  async reopenTask(taskId: string, column?: string): Promise<void> {
    const board = this.board;
    if (!board || !this.activeId) return;
    const into = column ? board.columns.find((c) => c.id === column) : workColumn(board.columns);
    if (!into) return;
    const result = await api.reopenTask(this.activeId, taskId, into.id);
    if (result.ok) this.notify(`${taskId} is open again, in ${into.title}`, 'ok');
    else this.notify(result.error, 'warn');
  }

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
    this.showThread(projectId, null);
    await this.askBoard(problemBrief(project.name, board.integrity), agent);
  }

  /**
   * Talks a task over, wherever it is in its life (task-35). The chat opens on
   * the task's latest discussion, kept like any chat, or starts one with the
   * agent Hand to… offers first. What shows is only "Let's discuss task-43.":
   * the task itself goes to the agent unseen, ahead of it (discuss.ts).
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
      this.showThread(projectId, earlier.id);
      return;
    }
    this.showThread(projectId, null);
    await this.askBoard(`Let's discuss ${taskId}.`, agent, taskId);
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

/**
 * The dock before sessions kept documents (decision-8): they become the
 * palette's recent ones, newest first, and each board's thread last shown is
 * its first session.
 */
function migrateDock(): void {
  if (localStorage.getItem(SESSIONS_KEY) !== null) return;
  const tabs = loadList<Doc>(TABS_KEY) ?? [];
  if (localStorage.getItem(RECENT_KEY) === null) localStorage.setItem(RECENT_KEY, JSON.stringify([...tabs].reverse().slice(0, RECENT_KEPT)));
  const shown = load<Record<string, string | null>>(THREAD_KEY, {});
  const sessions: Session[] = Object.entries(shown).flatMap(([projectId, id]) => (id ? [{ projectId, kind: 'chat' as const, id }] : []));
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  localStorage.removeItem(TABS_KEY);
}

migrateDock();
export const app = new AppState();
