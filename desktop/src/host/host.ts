/**
 * The board host: an Electron utility process that owns every file read,
 * write and git call, so a slow commit or a sync that waits on the network
 * never stalls the window. It speaks `HostRequest` / `HostMessage` with main.
 *
 * Writes go through the same core operations and commit path as the CLI's
 * TUI: one debounced commit per burst of edits on a tracked board, then an
 * in-process sync when the board has a remote.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  addSubtasksToFile,
  addTaskFile,
  buildBoardFromV2,
  completeTaskFile,
  deleteTaskFile,
  extractDescription,
  extractLog,
  findV2Task,
  getV2Dirs,
  moveTaskFileToColumn,
  patchTaskFile,
  readBoardConfig,
  readTasksDir,
  toggleSubtasksInFile,
  type Task,
} from '@brainfile/core';
import {
  AUTOSYNC_DELAY_MS,
  boardRemote,
  boardRepoKind,
  effectiveAutosync,
  fetchBeforeRead,
  flushBoardCommits,
  isTrackedBoard,
  locateBoard,
  onBoardCommitted,
  pendingChanges,
  scheduleBoardCommit,
  syncBoard,
  syncMessage,
  syncStatusLabel,
} from '@brainfile/core/repo';
import type {
  BoardSnapshot,
  HostMessage,
  HostRequest,
  NewTaskInput,
  ProjectState,
  RemovedTask,
  Result,
  SyncView,
  TaskDetail,
  TaskPatch,
  TaskView,
} from '../shared/api';

interface OpenBoard {
  projectId: string;
  dotDir: string;
  brainfilePath: string;
  watcher: fs.FSWatcher | null;
  reloadTimer: NodeJS.Timeout | null;
  pushTimer: NodeJS.Timeout | null;
  syncing: boolean;
  lastWarning?: string;
}

const COMPLETED_LIMIT = 50;
const RELOAD_DEBOUNCE_MS = 120;
/** Commits made by the app land this soon after the last edit in a burst. */
const COMMIT_DEBOUNCE_MS = 1200;
const FULL_SYNC_INTERVAL_MS = 60_000;

const boards = new Map<string, OpenBoard>();
const parentPort = process.parentPort;

function send(message: HostMessage): void {
  parentPort.postMessage(message);
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function fail(error: unknown): Result<never> {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

// ── Locating ────────────────────────────────────────────────────────────────

function locate(folder: string): ProjectState {
  try {
    if (!fs.existsSync(folder)) return { status: 'missing' };
    const located = locateBoard(folder);
    if (located.found) {
      return { status: 'ready', storage: located.storage, dotDir: located.dotDir, materialized: located.materialized };
    }
    if (located.legacy) return { status: 'legacy', file: located.legacy };
    return { status: 'no-board', inRepo: located.inRepo };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

// ── Reading ─────────────────────────────────────────────────────────────────

function toView(task: Task, body?: string): TaskView {
  const description = task.description ?? (body ? extractDescription(body) : undefined);
  return {
    id: task.id,
    title: task.title,
    column: task.column ?? 'todo',
    position: task.position,
    type: task.type,
    priority: task.priority,
    assignee: task.assignee,
    tags: task.tags,
    dueDate: task.dueDate,
    parentId: task.parentId,
    description,
    subtasks: task.subtasks,
    contractStatus: task.contract?.status,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    completedAt: task.completedAt,
  };
}

function syncView(board: OpenBoard): SyncView {
  const tracked = isTrackedBoard(board.dotDir);
  return {
    label: syncStatusLabel(board.dotDir),
    remote: tracked ? boardRemote(board.dotDir) : null,
    pending: tracked ? pendingChanges(board.dotDir) : 0,
    busy: board.syncing,
    ...(board.lastWarning ? { warning: board.lastWarning } : {}),
  };
}

function snapshot(board: OpenBoard): BoardSnapshot {
  const built = buildBoardFromV2(board.brainfilePath);
  const config = readBoardConfig(board.brainfilePath)?.config;
  const tasks = built.columns.flatMap((column) => column.tasks.map((task) => toView({ ...task, column: column.id })));
  const { logsDir } = getV2Dirs(board.brainfilePath);
  const completed = readTasksDir(logsDir)
    .map((doc) => toView(doc.task, doc.body))
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
    .slice(0, COMPLETED_LIMIT);
  return {
    projectId: board.projectId,
    title: built.title || path.basename(path.dirname(board.dotDir)),
    columns: built.columns.map(({ id, title, completionColumn }) => ({ id, title, completionColumn })),
    tasks,
    completed,
    typeNames: Object.keys(config?.types ?? {}),
    storage: boardRepoKind(board.dotDir) ?? 'plain',
    sync: syncView(board),
  };
}

function publish(board: OpenBoard): void {
  try {
    send({ kind: 'board', snapshot: snapshot(board) });
  } catch {
    /* mid-write; the next change event republishes */
  }
}

function scheduleReload(board: OpenBoard): void {
  if (board.reloadTimer) clearTimeout(board.reloadTimer);
  board.reloadTimer = setTimeout(() => {
    board.reloadTimer = null;
    publish(board);
  }, RELOAD_DEBOUNCE_MS);
}

function watch(board: OpenBoard): fs.FSWatcher | null {
  try {
    return fs.watch(board.dotDir, { recursive: true }, (_event, file) => {
      const name = file ? file.toString() : '';
      if (name.startsWith('state') || name.startsWith('.git')) return;
      scheduleReload(board);
    });
  } catch {
    return null;
  }
}

function openBoard(projectId: string): Result<BoardSnapshot> {
  const existing = boards.get(projectId);
  if (existing) return ok(snapshot(existing));
  const state = locate(projectId);
  if (state.status !== 'ready') return fail(`No board in ${projectId}`);
  const board: OpenBoard = {
    projectId,
    dotDir: state.dotDir,
    brainfilePath: path.join(state.dotDir, 'brainfile.md'),
    watcher: null,
    reloadTimer: null,
    pushTimer: null,
    syncing: false,
  };
  board.watcher = watch(board);
  boards.set(projectId, board);
  if (effectiveAutosync(board.dotDir) === 'full') void runSync(board, () => fetchBeforeRead(board.dotDir));
  return ok(snapshot(board));
}

function closeBoard(projectId: string): void {
  const board = boards.get(projectId);
  if (!board) return;
  board.watcher?.close();
  if (board.reloadTimer) clearTimeout(board.reloadTimer);
  if (board.pushTimer) clearTimeout(board.pushTimer);
  boards.delete(projectId);
}

function getTask(projectId: string, taskId: string): Result<TaskDetail> {
  const board = requireBoard(projectId);
  const found = findV2Task(getV2Dirs(board.brainfilePath), taskId, true);
  if (!found) return fail(`Task ${taskId} not found`);
  const { task, body } = found.doc;
  const log = (extractLog(body) ?? '')
    .split('\n')
    .map((line) => line.replace(/^\s*[-*]\s+/, '').trim())
    .filter(Boolean);
  return ok({
    ...toView(task, body),
    body,
    log,
    relatedFiles: task.relatedFiles,
    blockedBy: task.blockedBy,
    dependsOn: task.dependsOn,
    archived: found.isLog,
  });
}

// ── Writing ─────────────────────────────────────────────────────────────────

function requireBoard(projectId: string): OpenBoard {
  const board = boards.get(projectId) ?? (openBoard(projectId).ok ? boards.get(projectId) : undefined);
  if (!board) throw new Error(`No board open for ${projectId}`);
  return board;
}

function taskPath(board: OpenBoard, taskId: string): string {
  const found = findV2Task(getV2Dirs(board.brainfilePath), taskId);
  if (!found) throw new Error(`Task ${taskId} not found`);
  return found.filePath;
}

/** Run a core operation, then commit and republish. */
function mutate<T>(projectId: string, message: (board: OpenBoard) => string, op: (board: OpenBoard) => T): Result<T> {
  try {
    const board = requireBoard(projectId);
    const value = op(board);
    scheduleBoardCommit(board.brainfilePath, message(board), COMMIT_DEBOUNCE_MS);
    publish(board);
    return ok(value);
  } catch (err) {
    return fail(err);
  }
}

function unwrap<R extends { success: boolean; error?: string }>(result: R): R {
  if (!result.success) throw new Error(result.error ?? 'Operation failed');
  return result;
}

function addTask(projectId: string, input: NewTaskInput): Result<TaskView> {
  let id = 'task';
  return mutate(
    projectId,
    () => `add ${id}: ${input.title}`,
    (board) => {
      const dirs = getV2Dirs(board.brainfilePath);
      const result = unwrap(addTaskFile(dirs.boardDir, { ...input }, '', dirs.logsDir));
      id = result.task!.id;
      return toView(result.task!);
    }
  );
}

function moveTask(projectId: string, taskId: string, column: string, position?: number): Result<{ completed: boolean }> {
  return mutate(
    projectId,
    () => `move ${taskId}: ${column}`,
    (board) => {
      const config = readBoardConfig(board.brainfilePath)?.config;
      if (!config) throw new Error('Could not read the board config');
      const result = unwrap(moveTaskFileToColumn(getV2Dirs(board.brainfilePath), config, taskId, column, { position }));
      return { completed: Boolean(result.autoCompleted) };
    }
  );
}

function patchTask(projectId: string, taskId: string, patch: TaskPatch): Result {
  const fields = Object.keys(patch).join(', ');
  return mutate(
    projectId,
    () => `patch ${taskId}: ${fields}`,
    (board) => {
      unwrap(patchTaskFile(taskPath(board, taskId), patch));
    }
  );
}

function toggleSubtask(projectId: string, taskId: string, subtaskId: string): Result {
  return mutate(
    projectId,
    () => `subtask toggle ${subtaskId}`,
    (board) => {
      unwrap(toggleSubtasksInFile(taskPath(board, taskId), [subtaskId]));
    }
  );
}

function addSubtask(projectId: string, taskId: string, title: string): Result {
  return mutate(
    projectId,
    () => `subtask add ${taskId}: ${title}`,
    (board) => {
      unwrap(addSubtasksToFile(taskPath(board, taskId), [title]));
    }
  );
}

function completeTask(projectId: string, taskId: string): Result {
  return mutate(
    projectId,
    () => `complete ${taskId}`,
    (board) => {
      unwrap(completeTaskFile(taskPath(board, taskId), getV2Dirs(board.brainfilePath).logsDir));
    }
  );
}

function deleteTask(projectId: string, taskId: string): Result<RemovedTask> {
  return mutate(
    projectId,
    () => `delete ${taskId}`,
    (board) => {
      const filePath = taskPath(board, taskId);
      const content = fs.readFileSync(filePath, 'utf-8');
      unwrap(deleteTaskFile(filePath));
      return { taskId, filePath, content };
    }
  );
}

/** Undo for a delete: the file goes back exactly as it was, as its own commit. */
function restoreTask(projectId: string, removed: RemovedTask): Result {
  return mutate(
    projectId,
    () => `restore ${removed.taskId}`,
    (board) => {
      const { boardDir } = getV2Dirs(board.brainfilePath);
      const target = path.resolve(removed.filePath);
      if (path.dirname(target) !== path.resolve(boardDir)) throw new Error('That file is not on this board');
      if (fs.existsSync(target)) throw new Error(`${removed.taskId} already exists`);
      fs.writeFileSync(target, removed.content, 'utf-8');
    }
  );
}

// ── Sync ────────────────────────────────────────────────────────────────────

async function runSync(board: OpenBoard, work: () => ReturnType<typeof syncBoard> | null): Promise<SyncView> {
  if (board.syncing) return syncView(board);
  board.syncing = true;
  publish(board);
  // Let the busy state reach the window before git blocks this process.
  await new Promise((resolve) => setTimeout(resolve, 0));
  try {
    const result = work();
    if (result) board.lastWarning = result.ok ? undefined : syncMessage(result).text;
  } finally {
    board.syncing = false;
  }
  publish(board);
  return syncView(board);
}

async function syncNow(projectId: string): Promise<Result<SyncView>> {
  try {
    const board = requireBoard(projectId);
    flushBoardCommits();
    return ok(await runSync(board, () => syncBoard(board.dotDir)));
  } catch (err) {
    return fail(err);
  }
}

onBoardCommitted((dotDir) => {
  const board = [...boards.values()].find((b) => b.dotDir === dotDir);
  if (!board || effectiveAutosync(dotDir) === 'off' || !boardRemote(dotDir)) return;
  if (board.pushTimer) clearTimeout(board.pushTimer);
  board.pushTimer = setTimeout(() => {
    board.pushTimer = null;
    void runSync(board, () => syncBoard(board.dotDir));
  }, AUTOSYNC_DELAY_MS);
});

setInterval(() => {
  for (const board of boards.values()) {
    if (effectiveAutosync(board.dotDir) === 'full') void runSync(board, () => fetchBeforeRead(board.dotDir));
  }
}, FULL_SYNC_INTERVAL_MS).unref();

// ── Dispatch ────────────────────────────────────────────────────────────────

const handlers: Record<HostRequest['method'], (...args: any[]) => unknown> = {
  locate,
  openBoard,
  closeBoard,
  getTask,
  addTask,
  moveTask,
  patchTask,
  toggleSubtask,
  addSubtask,
  completeTask,
  deleteTask,
  restoreTask,
  syncNow,
};

parentPort.on('message', async (event: { data: HostRequest }) => {
  const { id, method, args } = event.data;
  let result: unknown;
  try {
    result = await handlers[method](...args);
  } catch (err) {
    result = fail(err);
  }
  send({ kind: 'reply', id, result });
});

process.on('exit', flushBoardCommits);
