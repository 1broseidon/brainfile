/**
 * Window state. Boards arrive as snapshots from the host and are replaced
 * whole; the window never edits a snapshot except to show a move before the
 * host confirms it.
 */
import type { Api, BoardSnapshot, Project, TaskView } from '../../shared/api';
import { diffBoards, type FeedItem } from './feed';

declare global {
  interface Window {
    brainfile: Api;
  }
}

/** Changes this window makes are not news; remember when each board was last written from here. */
const lastLocalWrite: Record<string, number> = {};
const MUTATIONS = ['addTask', 'moveTask', 'patchTask', 'toggleSubtask', 'addSubtask', 'completeTask', 'deleteTask'] as const;
const LOCAL_WINDOW_MS = 4000;

export const api: Api = new Proxy(window.brainfile, {
  get(target, key: string) {
    const value = target[key as keyof Api];
    if (typeof value === 'function' && (MUTATIONS as readonly string[]).includes(key)) {
      return (projectId: string, ...rest: unknown[]) => {
        lastLocalWrite[projectId] = Date.now();
        return (value as (...args: unknown[]) => unknown)(projectId, ...rest);
      };
    }
    return value;
  },
});

export type ViewMode = 'list' | 'board';
export type MenuKind = 'status' | 'priority' | 'assignee' | 'labels';

const VIEW_KEY = 'brainfile.view';
const ACTIVE_KEY = 'brainfile.active';
const LAYOUT_KEY = 'brainfile.layout';
const SEEN_KEY = 'brainfile.feedSeen';
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
  menu = $state<{ kind: MenuKind; taskId: string; x: number; y: number } | null>(null);
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

  /** Tasks in the order the list shows them: by column, then position. */
  orderedTasks = $derived.by(() => {
    const board = this.board;
    if (!board) return [] as TaskView[];
    return board.columns.flatMap((column) => board.tasks.filter((t) => t.column === column.id));
  });

  #problemTimer: ReturnType<typeof setTimeout> | null = null;

  async init(): Promise<void> {
    api.onProjectsChanged((projects) => {
      this.projects = projects;
    });
    api.onBoardChanged((snapshot) => this.receive(snapshot));
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

  saveLayout(): void {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(this.layout));
  }

  toggleRail(): void {
    this.layout.railOpen = !this.layout.railOpen;
    this.saveLayout();
  }
}

export const app = new AppState();
