/**
 * The one contract between the window and the board host. The renderer sees
 * only these shapes; everything that touches files or git stays behind it.
 */

export type Priority = 'low' | 'medium' | 'high' | 'critical';

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

export interface TaskView {
  id: string;
  title: string;
  column: string;
  position?: number;
  type?: string;
  priority?: Priority;
  assignee?: string;
  tags?: string[];
  dueDate?: string;
  parentId?: string;
  description?: string;
  subtasks?: Subtask[];
  contractStatus?: string;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string;
}

export interface TaskDetail extends TaskView {
  /** Markdown body below the frontmatter, description section included. */
  body: string;
  /** `## Log` entries, newest last, as written. */
  log: string[];
  relatedFiles?: string[];
  blockedBy?: string[];
  dependsOn?: string[];
  /** True when the task lives in logs/ (completed). */
  archived: boolean;
}

export interface ColumnView {
  id: string;
  title: string;
  completionColumn?: boolean;
}

export type Storage = 'linked' | 'standalone' | 'plain';

export interface SyncView {
  /** `synced 12s ago`, `local only`, … null for a plain board. */
  label: string | null;
  remote: string | null;
  /** Commits not yet sent. */
  pending: number;
  busy: boolean;
  /** Plain-language result of the last sync this app ran, when it failed. */
  warning?: string;
}

export interface BoardSnapshot {
  projectId: string;
  title: string;
  columns: ColumnView[];
  tasks: TaskView[];
  /** Most recent completions from logs/, newest first. */
  completed: TaskView[];
  typeNames: string[];
  storage: Storage;
  sync: SyncView;
}

export type ProjectState =
  | { status: 'ready'; storage: Storage; dotDir: string; materialized?: boolean }
  | { status: 'no-board'; inRepo: boolean }
  | { status: 'legacy'; file: string }
  | { status: 'missing' }
  | { status: 'error'; message: string };

export interface Project {
  /** Absolute folder path; doubles as the id. */
  id: string;
  name: string;
  path: string;
  state: ProjectState;
}

export interface NewTaskInput {
  title: string;
  column: string;
  description?: string;
  priority?: Priority;
  assignee?: string;
  tags?: string[];
  type?: string;
  parentId?: string;
}

export interface TaskPatch {
  title?: string;
  description?: string | null;
  priority?: Priority | null;
  assignee?: string | null;
  tags?: string[] | null;
  dueDate?: string | null;
  parentId?: string | null;
}

export interface RemovedTask {
  taskId: string;
  filePath: string;
  content: string;
}

export type Result<T = void> = { ok: true; value: T } | { ok: false; error: string };

/** Requests the renderer can make. Each maps to one handler in the host or main. */
export interface Api {
  listProjects(): Promise<Project[]>;
  /** Opens the folder picker; resolves to the added project, or null when cancelled. */
  addProject(): Promise<Project | null>;
  removeProject(projectId: string): Promise<void>;
  revealProject(projectId: string): Promise<void>;
  /** Re-resolve a project's board (after `brainfile init`, a fetch, …). */
  refreshProject(projectId: string): Promise<Project>;
  initBoard(projectId: string): Promise<Result<Project>>;

  openBoard(projectId: string): Promise<Result<BoardSnapshot>>;
  closeBoard(projectId: string): Promise<void>;
  getTask(projectId: string, taskId: string): Promise<Result<TaskDetail>>;

  addTask(projectId: string, input: NewTaskInput): Promise<Result<TaskView>>;
  moveTask(projectId: string, taskId: string, column: string, position?: number): Promise<Result<{ completed: boolean }>>;
  patchTask(projectId: string, taskId: string, patch: TaskPatch): Promise<Result>;
  toggleSubtask(projectId: string, taskId: string, subtaskId: string): Promise<Result>;
  addSubtask(projectId: string, taskId: string, title: string): Promise<Result>;
  completeTask(projectId: string, taskId: string): Promise<Result>;
  /** Resolves to the removed file, so the window can offer Undo. */
  deleteTask(projectId: string, taskId: string): Promise<Result<RemovedTask>>;
  restoreTask(projectId: string, removed: RemovedTask): Promise<Result>;
  syncNow(projectId: string): Promise<Result<SyncView>>;

  onBoardChanged(listener: (snapshot: BoardSnapshot) => void): () => void;
  onProjectsChanged(listener: (projects: Project[]) => void): () => void;
}

/** Channel names, shared by preload and main. */
export const CHANNEL = {
  invoke: 'brainfile:invoke',
  board: 'brainfile:board',
  projects: 'brainfile:projects',
} as const;

/** Methods main forwards to the board host rather than answering itself. */
export const HOST_METHODS = [
  'openBoard',
  'closeBoard',
  'getTask',
  'addTask',
  'moveTask',
  'patchTask',
  'toggleSubtask',
  'addSubtask',
  'completeTask',
  'deleteTask',
  'restoreTask',
  'syncNow',
] as const;

export type HostMethod = (typeof HOST_METHODS)[number];

/** Messages between main and the board host (a utility process). */
export type HostRequest = { id: number; method: HostMethod | 'locate'; args: unknown[] };
export type HostMessage =
  | { kind: 'reply'; id: number; result: unknown }
  | { kind: 'board'; snapshot: BoardSnapshot };
