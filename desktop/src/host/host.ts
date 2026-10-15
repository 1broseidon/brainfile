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
  appendLog,
  buildBoardFromV2,
  buildDocGraph,
  completeTaskFile,
  reopenTaskFile,
  decideFile,
  decisionStatus,
  idList,
  deleteTaskFile,
  extractDescription,
  extractLog,
  findV2Task,
  getV2Dirs,
  moveTaskFileToColumn,
  patchTaskFile,
  readBoardConfig,
  readTaskFile,
  readTasksDir,
  resolveDocType,
  targetOf,
  toggleSubtasksInFile,
  writeTaskFile,
  type DocGraph,
  type Task,
  type TypesConfig,
} from '@brainfile/core';
import {
  AUTOSYNC_DELAY_MS,
  boardRemote,
  boardRemoteName,
  boardRepoKind,
  effectiveAutosync,
  fetchBeforeRead,
  flushBoardCommits,
  git,
  isTrackedBoard,
  adoptBoard,
  boardConflict,
  boardConflictError,
  locateBoard,
  mergeBoards,
  pruneLostBoardCheckouts,
  surveyBoards,
  unmergedFiles,
  relatedBoards,
  onBoardCommitted,
  pendingChanges,
  scheduleBoardCommit,
  syncBoard,
  syncMessage,
  syncStatusLabel,
} from '@brainfile/core/repo';
import { integrityView } from './integrity';
import { workColumn } from '../shared/columns';
import { applyFix, planFix as planBoardFix, undoFix as undoBoardFix, type UndoRecord } from './fix';
import type {
  BoardSnapshot,
  DecisionView,
  DependencyView,
  DispatchRecord,
  AgentId,
  LeadRecord,
  FixPlan,
  FixResult,
  HostMessage,
  HostRequest,
  IntegrityView,
  NewDecisionInput,
  NewTaskInput,
  ProjectState,
  RemovedTask,
  Result,
  SettleChoice,
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
  /** Related boards' folders, so a change over there re-reads what depends on it. */
  relatedFolders: string[];
  /** Where the board lives and whether it needs a look (spec-15), read at most every INTEGRITY_TTL_MS. */
  integrity: { at: number; view: IntegrityView; behind: number } | null;
}

const COMPLETED_LIMIT = 50;
const RELOAD_DEBOUNCE_MS = 120;
/** Commits made by the app land this soon after the last edit in a burst. */
const COMMIT_DEBOUNCE_MS = 1200;
const FULL_SYNC_INTERVAL_MS = 60_000;
/** Other boards in the repository are looked for at most this often, besides after a sync or a settle. */
const INTEGRITY_TTL_MS = 15_000;

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

/**
 * Where a board is shared, for the phone link: the URL of the remote its
 * refs go to and its name under `refs/brainfile/` there, for a tracked board
 * with a remote. Anything else is shared, if at all, as the code's origin.
 */
function sharing(folder: string): { url: string | null; ref: string | null } {
  const state = locate(folder);
  if (state.status !== 'ready' || !isTrackedBoard(state.dotDir)) return { url: null, ref: null };
  const remote = boardRemote(state.dotDir);
  if (!remote) return { url: null, ref: null };
  const url = git(['remote', 'get-url', remote], state.dotDir);
  return { url: url.ok && url.stdout ? url.stdout : null, ref: boardRemoteName(state.dotDir) };
}

// ── Reading ─────────────────────────────────────────────────────────────────

function toView(task: Task, body?: string, types?: TypesConfig, graph?: DocGraph, all?: Map<string, Task>): TaskView {
  const description = task.description ?? (body ? extractDescription(body) : undefined);
  const kind = resolveDocType(task.type, types);
  const decisions = idList(task.decisions);
  const retired = graph ? graph.decisionsOf(task.id).filter((d) => d.isDecision && d.status && d.status !== 'current' && d.status !== 'proposed') : [];
  // Where its hand-off lands, inherited up the tree (decision-16); none is the trunk.
  const target = all ? targetOf(all, task.id) : null;
  return {
    id: task.id,
    title: task.title,
    column: task.column ?? 'todo',
    position: task.position,
    type: task.type,
    role: kind.role,
    glyph: kind.glyph,
    ...(decisions.length ? { decisions } : {}),
    ...(retired.length ? { restsOnRetired: retired.map((d) => d.id) } : {}),
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
    ...(text(task.source) ? { source: text(task.source) } : {}),
    ...(leadOf(task) ? { lead: leadOf(task) } : {}),
    ...(text(task.landsOn) ? { landsOn: text(task.landsOn)!.trim() } : {}),
    ...(task.epicBranch === true ? { epicBranch: true } : {}),
    ...(target ? { target } : {}),
  };
}

/** The `lead:` an epic carries, when it is whole enough to resume from. */
function leadOf(task: Task): LeadRecord | undefined {
  const lead = (task as { lead?: unknown }).lead as Partial<LeadRecord> | undefined;
  if (!lead || typeof lead !== 'object' || typeof lead.agent !== 'string' || !lead.agent) return undefined;
  return {
    agent: lead.agent as AgentId,
    ...(typeof lead.model === 'string' && lead.model ? { model: lead.model } : {}),
    ...(typeof lead.effort === 'string' && lead.effort ? { effort: lead.effort } : {}),
    by: lead.by === 'chat' ? 'chat' : 'person',
    at: typeof lead.at === 'string' ? lead.at : '',
    until: lead.until === 'done' ? 'done' : 'review',
  };
}

/** A `source:` as compared: the same issue with or without a trailing slash is one source. */
function sourceKey(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

/** Every `source:` on the board, open and completed, to the task that carries it (task-26). */
function sourcesOf(docs: { task: Task }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { task } of docs) {
    const source = text(task.source);
    if (source) out[sourceKey(source)] ??= task.id;
  }
  return out;
}

/** Every board in the repository, and the rest of where this one lives. Cached; `fetch` asks the remote first. */
function readIntegrity(board: OpenBoard, options: { fresh?: boolean; fetch?: boolean } = {}): { view: IntegrityView; behind: number } {
  const cached = board.integrity;
  if (cached && !options.fresh && !options.fetch && Date.now() - cached.at < INTEGRITY_TTL_MS) return cached;
  try {
    const survey = surveyBoards(board.dotDir, { fetch: options.fetch });
    const unfinished = isTrackedBoard(board.dotDir) ? unmergedFiles(board.dotDir) : [];
    const view = integrityView(survey, unfinished);
    // A problem says whether Fix can settle it without losing anything (task-34).
    if (view.short) view.fix = fixPlanView(board, survey);
    board.integrity = { at: Date.now(), view, behind: survey.lineage?.behind ?? 0 };
  } catch {
    board.integrity = { at: Date.now(), view: { twoBoards: null, notes: [], short: null, line: null, fix: null, found: [] }, behind: 0 };
  }
  return board.integrity;
}

function syncView(board: OpenBoard): SyncView {
  const tracked = isTrackedBoard(board.dotDir);
  return {
    label: syncStatusLabel(board.dotDir),
    remote: tracked ? boardRemote(board.dotDir) : null,
    pending: tracked ? pendingChanges(board.dotDir) : 0,
    behind: tracked ? readIntegrity(board).behind : 0,
    busy: board.syncing,
    ...(board.lastWarning ? { warning: board.lastWarning } : {}),
  };
}

/** A frontmatter value that should be text, or nothing. */
function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

/** A decision document as the window shows it. */
function toDecision(task: Task, body: string | undefined, graph: DocGraph): DecisionView {
  return {
    id: task.id,
    title: task.title,
    claimKey: text(task.claimKey),
    kind: text(task.kind),
    status: decisionStatus(task),
    stance: text(task.stance),
    subject: text(task.subject),
    holdsWhile: text(task.holdsWhile),
    recheck: text(task.recheck),
    validUntil: text(task.validUntil),
    supersedes: idList(task.supersedes),
    supersededBy: text(task.supersededBy),
    description: task.description ?? (body ? extractDescription(body) : undefined),
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    restingOn: graph
      .restingOn(task.id)
      .filter((t) => graph.isOpenWork(t))
      .map((t) => t.id),
  };
}

function snapshot(board: OpenBoard): BoardSnapshot {
  const built = buildBoardFromV2(board.brainfilePath);
  const config = readBoardConfig(board.brainfilePath)?.config;
  const types = config?.types;
  const { boardDir, logsDir } = getV2Dirs(board.brainfilePath);
  // Open documents and the archive together: decisions live in both, and
  // work can rest on a decision that has since been retired to logs/.
  const open = readTasksDir(boardDir);
  const archived = readTasksDir(logsDir);
  const graph = buildDocGraph([...open, ...archived].map((d) => d.task), { types });
  const all = new Map([...archived, ...open].map((d) => [d.task.id, d.task]));
  const isDecision = (task: Task) => resolveDocType(task.type, types).role === 'decision';
  const related = relatedBoards(board.brainfilePath);
  const sisters = related.boards();
  board.relatedFolders = sisters.map((b) => b.folder);
  // Only dependencies on related boards block here, as in the CLI.
  const blockedOn = (task: Task) =>
    (task.dependsOn ?? []).filter((ref) => ref.includes(':') && !related.lookup(ref).done);
  // A decision has no column: it is not work, and has its own view.
  const tasks = built.columns.flatMap((column) =>
    column.tasks.filter((task) => !isDecision(task)).map((task) => {
      const view = toView({ ...task, column: column.id }, undefined, types, graph, all);
      const blocked = blockedOn(task);
      return blocked.length ? { ...view, blockedOn: blocked } : view;
    })
  );
  const done = archived
    .filter((doc) => !isDecision(doc.task))
    .map((doc) => toView(doc.task, doc.body, types, undefined, all))
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
  // The latest completions, and everything completed under a document that
  // is shown, however old: a child stays under its open parent until the
  // parent is done, then goes with it into Done (task-20).
  const doneUnder = new Map<string, TaskView[]>();
  for (const t of done) {
    if (!t.parentId) continue;
    const list = doneUnder.get(t.parentId);
    if (list) list.push(t);
    else doneUnder.set(t.parentId, [t]);
  }
  const shown = new Set<string>();
  const bring = (id: string): void => {
    for (const child of doneUnder.get(id) ?? []) {
      if (shown.has(child.id)) continue;
      shown.add(child.id);
      bring(child.id);
    }
  };
  for (const t of tasks) bring(t.id);
  for (const t of done.slice(0, COMPLETED_LIMIT)) {
    shown.add(t.id);
    bring(t.id);
  }
  const completed = done.filter((t) => shown.has(t.id));
  return {
    projectId: board.projectId,
    title: built.title || path.basename(path.dirname(board.dotDir)),
    columns: built.columns.map(({ id, title, completionColumn }) => ({ id, title, completionColumn })),
    tasks,
    completed,
    typeNames: Object.keys(config?.types ?? {}),
    decisions: [...open, ...archived]
      .filter((doc) => isDecision(doc.task))
      .map((doc) => toDecision(doc.task, doc.body, graph))
      .sort((a, b) => (b.updatedAt ?? b.createdAt ?? '').localeCompare(a.updatedAt ?? a.createdAt ?? '')),
    storage: boardRepoKind(board.dotDir) ?? 'plain',
    related: sisters.map((b) => ({ alias: b.alias, folder: b.folder, status: b.status })),
    sync: syncView(board),
    integrity: readIntegrity(board).view,
    sources: sourcesOf([...open, ...archived]),
  };
}

function publish(board: OpenBoard): void {
  try {
    send({ kind: 'board', snapshot: snapshot(board) });
  } catch {
    /* mid-write; the next change event republishes */
  }
}

function scheduleReload(board: OpenBoard, cascade = true): void {
  // A sister board changed: boards that depend on it read their blockers again.
  if (cascade) {
    for (const other of boards.values()) {
      if (other !== board && other.relatedFolders.some((f) => path.resolve(f) === path.resolve(board.projectId))) scheduleReload(other, false);
    }
  }
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
  // A checkout of the board branch whose folder is gone only gets in the way.
  pruneLostBoardCheckouts(state.dotDir);
  const board: OpenBoard = {
    projectId,
    dotDir: state.dotDir,
    brainfilePath: path.join(state.dotDir, 'brainfile.md'),
    watcher: null,
    reloadTimer: null,
    pushTimer: null,
    syncing: false,
    relatedFolders: [],
    integrity: null,
  };
  board.watcher = watch(board);
  boards.set(projectId, board);
  if (effectiveAutosync(board.dotDir) === 'full') void runSync(board, () => fetchBeforeRead(board.dotDir));
  // Once per open, a plain folder board asks the remote for its copy: a board
  // there that this folder does not know about is a second board
  // (runprism.ai's case). A tracked board's sync keeps that copy fresh.
  if (!isTrackedBoard(board.dotDir)) setTimeout(() => {
    if (boards.get(projectId) !== board || board.syncing) return;
    readIntegrity(board, { fetch: true });
    publish(board);
  }, 0);
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
  const types = readBoardConfig(board.brainfilePath)?.config?.types;
  const docs = [...readTasksDir(getV2Dirs(board.brainfilePath).boardDir), ...readTasksDir(getV2Dirs(board.brainfilePath).logsDir)].map((d) => d.task);
  const graph = buildDocGraph(docs, { types });
  // An open document wins over a completed one of the same ID.
  const view = toView(task, body, types, graph, new Map([...docs].reverse().map((d) => [d.id, d])));
  return ok({
    ...view,
    ...(view.role === 'decision' ? { decision: toDecision(task, body, graph) } : {}),
    body,
    log,
    relatedFiles: task.relatedFiles,
    dependencies: dependencies(board, task.dependsOn ?? []),
    blockedBy: task.blockedBy,
    dependsOn: task.dependsOn,
    archived: found.isLog,
  });
}

/** Each dependency resolved, here or on a related board, for the task pane. */
function dependencies(board: OpenBoard, refs: string[]): DependencyView[] {
  if (refs.length === 0) return [];
  const related = relatedBoards(board.brainfilePath);
  const dirs = getV2Dirs(board.brainfilePath);
  return refs.map((ref) => {
    if (!ref.includes(':')) {
      const local = findV2Task(dirs, ref, true);
      return { ref, state: local ? (local.isLog ? 'completed' : 'open') : 'not-found', done: !!local?.isLog, title: local?.doc.task.title };
    }
    const r = related.lookup(ref);
    return { ref, state: r.state, done: r.done, title: r.doc?.task.title, folder: r.board?.folder };
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

/**
 * Run a core operation, then commit and republish. Refused while another
 * board in the repository disagrees with this one (spec-15).
 */
function mutate<T>(projectId: string, message: (board: OpenBoard) => string, op: (board: OpenBoard) => T): Result<T> {
  try {
    const board = requireBoard(projectId);
    const conflict = boardConflict(board.dotDir);
    if (conflict) throw new Error(boardConflictError(conflict));
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
      const types = readBoardConfig(board.brainfilePath)?.config?.types;
      const { source: rawSource, ...rest } = input;
      const source = rawSource?.trim() ? sourceKey(rawSource) : undefined;
      // An issue becomes one task: a second click, or another window, finds the first.
      if (source) {
        const taken = sourcesOf([...readTasksDir(dirs.boardDir), ...readTasksDir(dirs.logsDir)])[source];
        if (taken) throw new Error(`That issue is already ${taken}.`);
      }
      const result = unwrap(addTaskFile(dirs.boardDir, { ...rest, ...(source ? { fields: { source } } : {}) }, '', dirs.logsDir, { types }));
      id = result.task!.id;
      return toView(result.task!, undefined, types);
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
      const types = readBoardConfig(board.brainfilePath)?.config?.types;
      unwrap(completeTaskFile(taskPath(board, taskId), getV2Dirs(board.brainfilePath).logsDir, { types }));
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

/** A completed task back from logs/ to `column`: open again, out of the ledger, its log saying so. */
function reopenTask(projectId: string, taskId: string, column: string): Result {
  return mutate(
    projectId,
    () => `reopen ${taskId}`,
    (board) => {
      const config = readBoardConfig(board.brainfilePath)?.config;
      if (!config) throw new Error('Could not read the board');
      unwrap(reopenTaskFile(getV2Dirs(board.brainfilePath), config, taskId, column));
    }
  );
}

/**
 * After a merge (decision-12): the task is done, unless subtasks are left;
 * then it goes back to where unfinished work goes, its log saying how many.
 * A parent with open children refuses to complete, and says so.
 */
function settleLanded(projectId: string, taskId: string): Result<{ completed: boolean; left: number }> {
  return mutate(
    projectId,
    () => `land ${taskId}`,
    (board) => {
      const file = taskPath(board, taskId);
      const doc = readTaskFile(file);
      // Its worker completed it before it landed: nothing is left to settle.
      if (!doc && findV2Task(getV2Dirs(board.brainfilePath), taskId, true)?.isLog) return { completed: true, left: 0 };
      if (!doc) throw new Error(`Could not read ${taskId}`);
      const config = readBoardConfig(board.brainfilePath)?.config;
      const subtasks = doc.task.subtasks ?? [];
      const left = subtasks.filter((s) => !s.completed).length;
      if (left > 0) {
        const work = workColumn(config?.columns ?? []);
        if (work && work.id !== doc.task.column) {
          unwrap(moveTaskFileToColumn(getV2Dirs(board.brainfilePath), config!, taskId, work.id, { skipAutoComplete: true }));
        }
        unwrap(appendLog(file, `Merged; ${left} of ${subtasks.length} subtasks left, so it stays open`));
        return { completed: false, left };
      }
      unwrap(completeTaskFile(file, getV2Dirs(board.brainfilePath).logsDir, { types: config?.types }));
      return { completed: true, left: 0 };
    }
  );
}

/** An epic's lead, on the epic (decision-15); null takes it off. */
function recordLead(projectId: string, epicId: string, record: LeadRecord | null): Result {
  return mutate(
    projectId,
    () => (record ? `lead ${epicId}: ${record.agent} (until ${record.until})` : `lead ${epicId}: ended`),
    (board) => {
      const file = taskPath(board, epicId);
      const doc = readTaskFile(file);
      if (!doc) throw new Error(`Could not read ${epicId}`);
      const { lead: _old, ...rest } = doc.task as Task & { lead?: unknown };
      const next = record ? { ...rest, lead: { ...record } } : rest;
      writeTaskFile(file, { ...next, updatedAt: new Date().toISOString() } as Task, doc.body);
    }
  );
}

function noteTask(projectId: string, taskId: string, text: string): Result {
  return mutate(
    projectId,
    () => `note ${taskId}`,
    (board) => {
      unwrap(appendLog(taskPath(board, taskId), text.replace(/\s+/g, ' ').trim()));
    }
  );
}

/**
 * A decision, as `brainfile decide` records it (spec-11): through core, so
 * the claim key's current decision is superseded (status, links both ways,
 * moved to logs/), and the same words again are a duplicate that writes
 * nothing. The title is the decision; the description, when there is one,
 * is its why.
 */
function decide(projectId: string, input: NewDecisionInput): Result<DecisionView> {
  let id = 'decision';
  return mutate(
    projectId,
    () => `decide ${id}: ${input.title}`,
    (board) => {
      const dirs = getV2Dirs(board.brainfilePath);
      const types = readBoardConfig(board.brainfilePath)?.config?.types;
      const title = input.title.trim();
      const claimKey = input.claimKey?.trim();
      const result = decideFile(dirs, { title, text: input.description?.trim() || title, ...(claimKey ? { claimKey } : {}) }, { types });
      if (!result.success || !result.decision || !result.filePath) throw new Error(result.error ?? 'The decision was not written');
      id = result.decision.id;
      const doc = readTaskFile(result.filePath);
      const graph = buildDocGraph([...readTasksDir(dirs.boardDir), ...readTasksDir(dirs.logsDir)].map((d) => d.task), { types });
      return toDecision(doc?.task ?? result.decision, doc?.body, graph);
    }
  );
}

/**
 * A hand-off the chat asked for (spec-16): the agent becomes the assignee, as
 * Hand to… makes it, and `dispatch:` says who asked, with what and when. Core
 * keeps the key as it keeps any it does not know; it commits like any change.
 */
function recordDispatch(projectId: string, taskId: string, record: DispatchRecord): Result {
  return mutate(
    projectId,
    () => `dispatch ${taskId}: ${record.agent} (asked by ${record.by})`,
    (board) => {
      const file = taskPath(board, taskId);
      const doc = readTaskFile(file);
      if (!doc) throw new Error(`Could not read ${taskId}`);
      const dispatch: DispatchRecord = {
        agent: record.agent,
        ...(record.model ? { model: record.model } : {}),
        ...(record.effort ? { effort: record.effort } : {}),
        by: record.by,
        at: record.at,
      };
      writeTaskFile(file, { ...doc.task, assignee: record.agent, dispatch, updatedAt: new Date().toISOString() }, doc.body);
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
  readIntegrity(board, { fresh: true });
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

// ── Two boards (spec-15) ────────────────────────────────────────────────────

/**
 * Make two boards one, as the band's line offers: take the other board, merge
 * them, or keep this one. Core backs up whatever is replaced first; the board
 * is then reopened where it now lives.
 */
function settleBoards(projectId: string, choice: SettleChoice): Result<{ message: string }> {
  try {
    const board = requireBoard(projectId);
    flushBoardCommits();
    const conflict = surveyBoards(board.dotDir).conflict;
    if (!conflict) return ok({ message: 'Already one board.' });
    let message: string;
    if (choice === 'merge') {
      const merged = mergeBoards(board.dotDir, conflict.other.ref);
      const renumbered = merged.renumbered.map((r) => `${r.from} → ${r.to}`).join(', ');
      message = merged.adopted === 'other'
        ? `Took ${conflict.other.label}: it already had everything.`
        : merged.adopted === 'this'
          ? 'Kept this board: it already had everything.'
          : `Merged ${conflict.other.label} in${renumbered ? ` (renumbered ${renumbered})` : ''}.`;
    } else {
      adoptBoard(board.dotDir, choice === 'theirs' ? conflict.other.ref : conflict.current.ref);
      message = choice === 'theirs' ? `Took ${conflict.other.label}.` : 'Kept this board.';
    }
    closeBoard(projectId);
    const reopened = openBoard(projectId);
    if (reopened.ok) send({ kind: 'board', snapshot: reopened.value });
    return ok({ message: `${message} The board it replaced is in brainfile backups.` });
  } catch (err) {
    return fail(err);
  }
}

// ── Fix from the health list (task-34) ──────────────────────────────────────

/** How long after a fix Undo can still put it back; the window offers it for ten seconds. */
const UNDO_MS = 20_000;
const undos = new Map<string, { record: UndoRecord; at: number }>();

/** The plan as the window sees it, or null when there is no fix that loses nothing. Never throws. */
function fixPlanView(board: OpenBoard, survey?: Parameters<typeof planBoardFix>[2]): FixPlan | null {
  try {
    const plan = planBoardFix(board.dotDir, board.projectId, survey);
    return plan ? { kind: plan.kind, words: plan.words } : null;
  } catch {
    return null;
  }
}

/** The board after a fix or its undo lives somewhere else: open it again there and publish. */
function reopen(projectId: string): void {
  closeBoard(projectId);
  const reopened = openBoard(projectId);
  if (reopened.ok) send({ kind: 'board', snapshot: reopened.value });
}

function planFix(projectId: string): Result<FixPlan | null> {
  try {
    return ok(fixPlanView(requireBoard(projectId)));
  } catch (err) {
    return fail(err);
  }
}

/**
 * Back up every copy of the board, then settle its problem with core's own
 * steps; nothing runs if a backup fails, or if the plan is no longer the one
 * the person confirmed.
 */
function fixBoard(projectId: string, expected?: string): Result<FixResult> {
  try {
    const board = requireBoard(projectId);
    flushBoardCommits();
    undos.delete(projectId);
    const applied = applyFix(board.dotDir, { expected, project: projectId });
    if (applied.undo) undos.set(projectId, { record: applied.undo, at: Date.now() });
    reopen(projectId);
    return ok({ message: applied.message, undo: !!applied.undo });
  } catch (err) {
    // Whatever happened, the window should see the board as it is now.
    if (boards.has(projectId)) reopen(projectId);
    return fail(err);
  }
}

function undoFix(projectId: string): Result<{ message: string }> {
  const kept = undos.get(projectId);
  undos.delete(projectId);
  if (!kept || Date.now() - kept.at > UNDO_MS) return fail('Too late to undo here; brainfile backups has every copy.');
  try {
    flushBoardCommits();
    const message = undoBoardFix(kept.record);
    reopen(projectId);
    return ok({ message });
  } catch (err) {
    if (boards.has(projectId)) reopen(projectId);
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

/** How often what is waiting to be sent is counted again. */
const RECOUNT_MS = 10_000;
/** The count each board was last published with. */
const lastPending = new Map<string, number>();

// An agent's or the CLI's commit is pushed by its own `brainfile sync --push`,
// which moves refs in the repository's git directory, outside the folder the
// watcher sees; so what is waiting is counted again on a timer, and a board
// whose count moved is published.
setInterval(() => {
  for (const board of boards.values()) {
    if (board.syncing || !isTrackedBoard(board.dotDir)) continue;
    const pending = pendingChanges(board.dotDir);
    if (lastPending.has(board.projectId) && lastPending.get(board.projectId) === pending) continue;
    lastPending.set(board.projectId, pending);
    publish(board);
  }
}, RECOUNT_MS).unref();

// ── Dispatch ────────────────────────────────────────────────────────────────

const handlers: Record<HostRequest['method'], (...args: any[]) => unknown> = {
  locate,
  sharing,
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
  reopenTask,
  noteTask,
  decide,
  recordDispatch,
  recordLead,
  settleLanded,
  syncNow,
  settleBoards,
  planFix,
  fixBoard,
  undoFix,
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
