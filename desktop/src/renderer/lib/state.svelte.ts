/**
 * Window state. Boards arrive as snapshots from the host and are replaced
 * whole; the window never edits a snapshot except to show a move before the
 * host confirms it.
 */
import type { Api, BoardSnapshot, Project, TaskView } from '../../shared/api';

declare global {
  interface Window {
    brainfile: Api;
  }
}

export const api = window.brainfile;

export type ViewMode = 'list' | 'board';
export type MenuKind = 'status' | 'priority' | 'assignee' | 'labels';

const VIEW_KEY = 'brainfile.view';
const ACTIVE_KEY = 'brainfile.active';

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
  toast = $state<{ text: string; tone: 'ok' | 'warn' } | null>(null);
  showCompleted = $state(false);
  menu = $state<{ kind: MenuKind; taskId: string; x: number; y: number } | null>(null);

  active = $derived(this.projects.find((p) => p.id === this.activeId) ?? null);
  board = $derived(this.activeId ? (this.boards[this.activeId] ?? null) : null);
  view = $derived<ViewMode>((this.activeId && this.views[this.activeId]) || 'list');

  /** Tasks in the order the list shows them: by column, then position. */
  orderedTasks = $derived.by(() => {
    const board = this.board;
    if (!board) return [] as TaskView[];
    return board.columns.flatMap((column) => board.tasks.filter((t) => t.column === column.id));
  });

  #toastTimer: ReturnType<typeof setTimeout> | null = null;

  async init(): Promise<void> {
    api.onProjectsChanged((projects) => {
      this.projects = projects;
    });
    api.onBoardChanged((snapshot) => {
      this.boards[snapshot.projectId] = snapshot;
    });
    this.projects = await api.listProjects();
    this.loaded = true;
    const first = this.projects.find((p) => p.id === this.activeId) ?? this.projects[0];
    if (first) await this.select(first.id);
  }

  async select(projectId: string): Promise<void> {
    this.activeId = projectId;
    this.selectedTaskId = null;
    this.openTaskId = null;
    localStorage.setItem(ACTIVE_KEY, projectId);
    const project = this.projects.find((p) => p.id === projectId);
    if (project?.state.status !== 'ready') return;
    const result = await api.openBoard(projectId);
    if (result.ok) {
      this.boards[projectId] = result.value;
      delete this.boardErrors[projectId];
    } else {
      this.boardErrors[projectId] = result.error;
    }
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
    this.projects = this.projects.map((p) => (p.id === projectId ? project : p));
    if (projectId === this.activeId) await this.select(projectId);
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

  notify(text: string, tone: 'ok' | 'warn' = 'ok'): void {
    this.toast = { text, tone };
    if (this.#toastTimer) clearTimeout(this.#toastTimer);
    this.#toastTimer = setTimeout(() => (this.toast = null), tone === 'warn' ? 6000 : 3200);
  }
}

export const app = new AppState();
