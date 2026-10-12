/**
 * Related boards (spec-10), resolved on disk. A board's `related:` map names
 * sister repos; `alias:task-id` points at a task on one of them. A sister is
 * found exactly as running `brainfile` in its folder would find it (plain
 * `.brainfile/`, or the worktree on the board branch), except that nothing is
 * ever checked out, fetched or written for it.
 *
 * Node only (git, fs); exported from `@brainfile/core/repo`.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseFrontmatter } from '../frontmatter';
import { readLedger } from '../ledger';
import { readTaskFile, readTasksDir } from '../taskFile';
import type { ColumnConfig, Task, TaskDocument } from '../types';
import { getLogFilePath, getTaskFilePath } from '../workspace';
import { isQualifiedRef, parseTaskRef, readRelatedConfig, type RelatedConfig } from '../related';
import { boardBranch, boardRepoKind, git, gitCommonDir, gitToplevel } from './boardRepo';
import { locateBoard } from './locate';

interface RelatedBoardBase {
  /** The short name under `related:`. */
  alias: string;
  /** The folder as written in brainfile.md. */
  path: string;
  /** The folder, resolved against this board's project root. */
  folder: string;
}

export type RelatedBoard =
  | (RelatedBoardBase & {
      status: 'found';
      dotDir: string;
      brainfilePath: string;
      boardDir: string;
      logsDir: string;
      title?: string;
      columns: ColumnConfig[];
    })
  /** The folder is not on this machine. */
  | (RelatedBoardBase & { status: 'missing' })
  /** The folder exists but has no board. `onBranch`: one is on its board branch, not checked out. */
  | (RelatedBoardBase & { status: 'no-board'; onBranch: boolean });

export type RelatedBoardStatus = RelatedBoard['status'];

/**
 * Where a reference landed:
 * - `open`: in that board's `board/`.
 * - `completed`: in that board's `logs/` (or its ledger).
 * - `not-found`: the board is there but has no such task.
 * - `missing`, `no-board`: the related folder is not on this machine, or holds no board.
 * - `unknown-alias`: `related:` has no such name.
 * - `malformed`: not a task reference.
 */
export type TaskRefState =
  | 'open'
  | 'completed'
  | 'not-found'
  | 'missing'
  | 'no-board'
  | 'unknown-alias'
  | 'malformed';

export interface ResolvedTaskRef {
  /** The reference as written. */
  ref: string;
  alias?: string;
  id: string;
  state: TaskRefState;
  /** True only when the task is completed. Anything else counts as not done. */
  done: boolean;
  /** The related board, for a qualified reference with a known alias. */
  board?: RelatedBoard;
  /** The task file, when the task was found. */
  doc?: TaskDocument;
}

export interface RelatedListing {
  board: RelatedBoard;
  /** Open tasks on that board, in column order. */
  tasks: Task[];
  /** `--related` (depends mode): referenced IDs that board does not have. */
  notFound: string[];
  /** `--related` (depends mode): which of this board's tasks depend on each listed task. */
  neededBy: Record<string, string[]>;
}

export type RelatedListMode = 'depends' | 'all';

/**
 * The folder `related:` paths are relative to: the code repository's root.
 * A board on the board branch is a linked worktree whose own toplevel is
 * `.brainfile/`, so its root is the main worktree of the repository it
 * belongs to. Otherwise it is the repository holding the board, or the
 * folder holding `.brainfile/` outside one.
 */
export function boardProjectRoot(dotDir: string): string {
  const dir = path.resolve(dotDir);
  if (boardRepoKind(dir) === 'linked') {
    const common = gitCommonDir(dir);
    if (common && path.basename(common) === '.git') return path.dirname(common);
  }
  const parent = path.dirname(dir);
  return gitToplevel(parent) ?? parent;
}

/** The `related:` map of the board at `brainfilePath`. Empty when unreadable. */
export function readRelated(brainfilePath: string): RelatedConfig {
  return readRelatedConfig(readConfig(brainfilePath));
}

function readConfig(brainfilePath: string): Record<string, unknown> | null {
  try {
    const doc = parseFrontmatter<Record<string, unknown>>(fs.readFileSync(brainfilePath, 'utf-8'));
    return doc?.data && typeof doc.data === 'object' ? doc.data : null;
  } catch {
    return null;
  }
}

function expandHome(folder: string): string {
  if (folder === '~') return os.homedir();
  if (folder.startsWith('~/')) return path.join(os.homedir(), folder.slice(2));
  return folder;
}

/** Find the related board `alias` at `folder`. Never checks anything out. */
export function locateRelatedBoard(alias: string, configured: string, projectRoot: string): RelatedBoard {
  const folder = path.resolve(projectRoot, expandHome(configured));
  const base = { alias, path: configured, folder };

  let isDir = false;
  try {
    isDir = fs.statSync(folder).isDirectory();
  } catch {
    /* not on this machine */
  }
  if (!isDir) return { ...base, status: 'missing' };

  const located = locateBoard(folder, { materialize: false });
  if (!located.found) {
    const onBranch =
      located.inRepo && git(['rev-parse', '--verify', '--quiet', `refs/heads/${boardBranch(folder)}`], folder).ok;
    return { ...base, status: 'no-board', onBranch };
  }

  const config = readConfig(located.brainfilePath);
  const columns = Array.isArray(config?.columns)
    ? (config!.columns as ColumnConfig[]).filter((c) => c && typeof c.id === 'string')
    : [];
  return {
    ...base,
    status: 'found',
    dotDir: located.dotDir,
    brainfilePath: located.brainfilePath,
    boardDir: path.join(located.dotDir, 'board'),
    logsDir: path.join(located.dotDir, 'logs'),
    title: typeof config?.title === 'string' ? config.title : undefined,
    columns,
  };
}

/** Look a task up on a board: open in `board/`, completed in `logs/` or the ledger. */
function lookupOnBoard(boardDir: string, logsDir: string, id: string): Pick<ResolvedTaskRef, 'state' | 'doc'> {
  const open = readTaskFile(getTaskFilePath(boardDir, id));
  if (open && open.task.id === id) return { state: 'open', doc: open };
  const done = readTaskFile(getLogFilePath(logsDir, id));
  if (done && done.task.id === id) return { state: 'completed', doc: done };

  const openScan = readTasksDir(boardDir).find((d) => d.task.id === id);
  if (openScan) return { state: 'open', doc: openScan };
  const doneScan = readTasksDir(logsDir).find((d) => d.task.id === id);
  if (doneScan) return { state: 'completed', doc: doneScan };

  if (fs.existsSync(path.join(logsDir, 'ledger.jsonl')) && readLedger(logsDir).some((r) => r.id === id)) {
    return { state: 'completed' };
  }
  return { state: 'not-found' };
}

function dependsOnOf(task: Pick<Task, 'dependsOn'>): string[] {
  if (!Array.isArray(task.dependsOn)) return [];
  const refs = task.dependsOn
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter(Boolean);
  return [...new Set(refs)];
}

/**
 * Related boards as seen from one board. Sister lookups are memoised for the
 * life of the object, so one command resolves each sister once.
 */
export class RelatedBoards {
  readonly brainfilePath: string;
  readonly dotDir: string;
  readonly related: RelatedConfig;
  private root: string | null = null;
  private readonly cache = new Map<string, RelatedBoard>();

  constructor(brainfilePath: string) {
    this.brainfilePath = path.resolve(brainfilePath);
    this.dotDir = path.dirname(this.brainfilePath);
    this.related = readRelated(this.brainfilePath);
  }

  /** The folder `related:` paths are relative to. */
  get projectRoot(): string {
    if (this.root === null) this.root = boardProjectRoot(this.dotDir);
    return this.root;
  }

  get aliases(): string[] {
    return Object.keys(this.related);
  }

  /** The related board named `alias`, or null when `related:` does not name it. */
  board(alias: string): RelatedBoard | null {
    if (!Object.prototype.hasOwnProperty.call(this.related, alias)) return null;
    let hit = this.cache.get(alias);
    if (!hit) {
      hit = locateRelatedBoard(alias, this.related[alias], this.projectRoot);
      this.cache.set(alias, hit);
    }
    return hit;
  }

  /** Every related board, in the order `related:` lists them. */
  boards(): RelatedBoard[] {
    return this.aliases.map((alias) => this.board(alias)!);
  }

  /** Resolve `alias:id` on its board, or a plain `id` on this one. */
  lookup(ref: string): ResolvedTaskRef {
    const parsed = parseTaskRef(ref);
    if (!parsed) {
      const at = ref.indexOf(':');
      return { ref, alias: ref.slice(0, at) || undefined, id: ref.slice(at + 1), state: 'malformed', done: false };
    }
    if (!parsed.alias) {
      const hit = lookupOnBoard(path.join(this.dotDir, 'board'), path.join(this.dotDir, 'logs'), parsed.id);
      return { ref, id: parsed.id, ...hit, done: hit.state === 'completed' };
    }
    const board = this.board(parsed.alias);
    const base = { ref, alias: parsed.alias, id: parsed.id };
    if (!board) return { ...base, state: 'unknown-alias', done: false };
    if (board.status !== 'found') return { ...base, board, state: board.status, done: false };
    const hit = lookupOnBoard(board.boardDir, board.logsDir, parsed.id);
    return { ...base, board, ...hit, done: hit.state === 'completed' };
  }

  /** Every `dependsOn` entry of `task`, resolved. */
  dependencies(task: Pick<Task, 'dependsOn'>): ResolvedTaskRef[] {
    return dependsOnOf(task).map((ref) => this.lookup(ref));
  }

  /**
   * The cross-repo dependencies of `task` that are not completed. A task with
   * any is blocked: its contract cannot be picked up. A missing folder counts
   * as not done. References to this board are not considered here.
   */
  blockers(task: Pick<Task, 'dependsOn'>): ResolvedTaskRef[] {
    return dependsOnOf(task)
      .filter(isQualifiedRef)
      .map((ref) => this.lookup(ref))
      .filter((r) => !r.done);
  }

  /**
   * Open tasks on related boards. `depends`: only the ones this board's open
   * tasks depend on, and only boards they reference. `all`: every open task on
   * every related board.
   */
  openTasks(mode: RelatedListMode = 'depends'): RelatedListing[] {
    if (mode === 'all') {
      return this.boards().map((board) => ({
        board,
        tasks: board.status === 'found' ? orderTasks(readTasksDir(board.boardDir).map((d) => d.task), board.columns) : [],
        notFound: [],
        neededBy: {},
      }));
    }

    const wanted = new Map<string, Map<string, string[]>>();
    for (const doc of readTasksDir(path.join(this.dotDir, 'board'))) {
      for (const entry of dependsOnOf(doc.task)) {
        const ref = parseTaskRef(entry);
        if (!ref?.alias || !Object.prototype.hasOwnProperty.call(this.related, ref.alias)) continue;
        const ids = wanted.get(ref.alias) ?? new Map<string, string[]>();
        ids.set(ref.id, [...(ids.get(ref.id) ?? []), doc.task.id]);
        wanted.set(ref.alias, ids);
      }
    }

    const listings: RelatedListing[] = [];
    for (const alias of this.aliases) {
      const ids = wanted.get(alias);
      if (!ids) continue;
      const board = this.board(alias)!;
      const listing: RelatedListing = { board, tasks: [], notFound: [], neededBy: {} };
      if (board.status === 'found') {
        const open: Task[] = [];
        for (const [id, dependents] of ids) {
          const hit = lookupOnBoard(board.boardDir, board.logsDir, id);
          if (hit.state === 'open' && hit.doc) {
            open.push(hit.doc.task);
            listing.neededBy[id] = dependents.sort();
          } else if (hit.state === 'not-found') {
            listing.notFound.push(id);
          }
        }
        listing.tasks = orderTasks(open, board.columns);
      } else {
        for (const [id, dependents] of ids) listing.neededBy[id] = dependents.sort();
      }
      listings.push(listing);
    }
    return listings;
  }
}

/** Column order from the board config, then position, then ID. */
function orderTasks(tasks: Task[], columns: ColumnConfig[]): Task[] {
  const rank = new Map(columns.map((c, i) => [c.id, i]));
  const colRank = (t: Task) => rank.get(t.column ?? 'todo') ?? columns.length;
  return [...tasks].sort((a, b) =>
    colRank(a) - colRank(b)
    || (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER)
    || a.id.localeCompare(b.id));
}

/** Related boards seen from the board at `brainfilePath`. */
export function relatedBoards(brainfilePath: string): RelatedBoards {
  return new RelatedBoards(brainfilePath);
}

/** One line on where a related board stands, for people. */
export function describeRelatedBoard(board: RelatedBoard): string {
  switch (board.status) {
    case 'found':
      return `${board.alias} (${board.path})`;
    case 'missing':
      return `${board.alias} (${board.path}) is not on this machine`;
    case 'no-board':
      return board.onBranch
        ? `${board.alias} (${board.path}) has its board on a branch that is not checked out; run brainfile there once`
        : `${board.alias} (${board.path}) has no board`;
  }
}

/** One word or phrase for a reference's state, for people. */
export function describeTaskRefState(ref: ResolvedTaskRef): string {
  switch (ref.state) {
    case 'open': {
      const column = ref.doc?.task.column;
      return column ? `open (${column})` : 'open';
    }
    case 'completed':
      return 'completed';
    case 'not-found':
      return ref.alias ? `not on ${ref.alias}` : 'not on this board';
    case 'missing':
      return `${ref.alias} is not on this machine`;
    case 'no-board':
      return `${ref.alias} has no board`;
    case 'unknown-alias':
      return `no related board named ${ref.alias}`;
    case 'malformed':
      return 'not a task reference';
  }
}
