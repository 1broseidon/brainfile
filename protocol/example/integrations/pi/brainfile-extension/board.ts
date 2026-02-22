import type { ExtensionContext } from '@mariozechner/pi-coding-agent';
import * as fs from 'fs';
import * as path from 'path';
import {
  Brainfile,
  findBrainfile,
  readTasksDir,
  readTaskFile,
  taskFileName,
  getBoardTypes,
  type Board,
  type Task,
} from '@brainfile/core';

import type { BoardContext, ColumnInfo, LocatedTask, Rt } from './types';
import { PI_EVENTS_BASENAME, DEFAULT_STALE_TIMEOUT_SECONDS } from './constants';

// ── Pure helpers (no Rt dependency) ────────────────────────────────────

export function isTaskCompletable(task: Task, board: Board): boolean {
  const taskType = task.type || 'task';
  if (taskType === 'task') return true;
  const typeConfig = getBoardTypes(board)[taskType];
  return typeConfig?.completable !== false;
}

export function normalizeColumnInput(input: string): string {
  return input.trim().toLowerCase();
}

export function extractDescription(body: string): string | undefined {
  const match = body.match(/## Description\n([\s\S]*?)(?=\n## |\n*$)/);
  return match ? match[1].trim() || undefined : undefined;
}

export function setDescriptionSection(body: string, description: string | undefined): string {
  const sectionRegex = /(^## Description\s*\n)([\s\S]*?)(?=\n## |\n*$)/m;
  const trimmedDescription = description?.trim();

  if (!trimmedDescription) {
    if (!sectionRegex.test(body)) return body.trimEnd();
    const removed = body.replace(sectionRegex, '').replace(/^\s+|\s+$/g, '').replace(/\n{3,}/g, '\n\n');
    return removed.length > 0 ? `${removed}\n` : '';
  }

  const replacement = `## Description\n${trimmedDescription}\n`;

  if (sectionRegex.test(body)) {
    const replaced = body.replace(sectionRegex, replacement).replace(/\n{3,}/g, '\n\n').trimEnd();
    return `${replaced}\n`;
  }

  const remainder = body.trim();
  if (!remainder) {
    return replacement;
  }

  return `${replacement}\n${remainder.endsWith('\n') ? remainder : `${remainder}\n`}`;
}

export function getColumns(board: Board | null): ColumnInfo[] {
  if (!board) return [];
  return board.columns.map((column) => ({
    id: column.id,
    title: column.title,
    completionColumn: Boolean((column as any).completionColumn),
  }));
}

export function resolveColumn(columnInput: string, board: Board | null): ColumnInfo | null {
  const normalized = normalizeColumnInput(columnInput);
  const columns = getColumns(board);

  const byId = columns.find((column) => column.id === columnInput);
  if (byId) return byId;

  const byTitle = columns.find((column) => normalizeColumnInput(column.title) === normalized);
  if (byTitle) return byTitle;

  return null;
}

export function columnTitleForId(columnId: string | undefined, board: Board | null): string {
  if (!columnId) return 'unknown';
  const columns = getColumns(board);
  return columns.find((column) => column.id === columnId)?.title || columnId;
}

// ── Functions that access Rt ───────────────────────────────────────────

function loadWorkspaceExtensionSettings(rt: Rt, projectRoot: string): void {
  rt.staleTimeoutSeconds = DEFAULT_STALE_TIMEOUT_SECONDS;

  const settingsPath = path.join(projectRoot, '.pi', 'settings.json');
  if (!fs.existsSync(settingsPath)) return;

  try {
    const raw = fs.readFileSync(settingsPath, 'utf-8');
    const parsed = JSON.parse(raw) as any;
    const candidate = Number(parsed?.brainfileExtension?.staleTimeoutSeconds);
    if (Number.isFinite(candidate) && candidate > 0) {
      rt.staleTimeoutSeconds = Math.max(1, Math.floor(candidate));
    }
  } catch {
    // Ignore malformed settings and continue with defaults.
  }
}

export function refreshBoardContext(rt: Rt, startDir: string): { ok: true } | { ok: false; error: string } {
  const found = findBrainfile(startDir);
  if (!found) {
    rt.boardContext = null;
    return { ok: false, error: 'No brainfile found (expected .brainfile/brainfile.md).' };
  }

  const brainfileDir = path.dirname(found.absolutePath);
  const boardDir = path.join(brainfileDir, 'board');
  const logsDir = path.join(brainfileDir, 'logs');
  const stateDir = path.join(brainfileDir, 'state');
  const eventsLogPath = path.join(stateDir, PI_EVENTS_BASENAME);

  if (path.basename(brainfileDir) !== '.brainfile' || !fs.existsSync(boardDir)) {
    rt.boardContext = null;
    return {
      ok: false,
      error: `Brainfile found at ${path.relative(startDir, found.absolutePath)}, but v2 layout (.brainfile/board/) is missing.`,
    };
  }

  rt.boardContext = {
    brainfilePath: found.absolutePath,
    brainfileDir,
    projectRoot: found.projectRoot,
    boardDir,
    logsDir,
    stateDir,
    eventsLogPath,
  };

  loadWorkspaceExtensionSettings(rt, found.projectRoot);

  return { ok: true };
}

export function ensureBoardContext(rt: Rt, ctx: ExtensionContext): { ok: true } | { ok: false } {
  if (!rt.boardContext) {
    const refreshed = refreshBoardContext(rt, ctx.cwd);
    if (!refreshed.ok) {
      ctx.ui.notify(refreshed.error, 'error');
      return { ok: false };
    }
  }
  return { ok: true };
}

export function readBoardConfig(rt: Rt): Board | null {
  if (!rt.boardContext) return null;
  try {
    const content = fs.readFileSync(rt.boardContext.brainfilePath, 'utf-8');
    const parsed = Brainfile.parseWithErrors(content);
    return parsed.board || null;
  } catch {
    return null;
  }
}

export function locateTask(rt: Rt, taskId: string, includeLogs = true): LocatedTask | null {
  if (!rt.boardContext) return null;

  const directTaskPath = path.join(rt.boardContext.boardDir, taskFileName(taskId));
  const directTaskDoc = readTaskFile(directTaskPath);
  if (directTaskDoc && directTaskDoc.task.id === taskId) {
    return {
      task: directTaskDoc.task,
      body: directTaskDoc.body,
      filePath: directTaskPath,
      isLog: false,
    };
  }

  if (includeLogs) {
    const directLogPath = path.join(rt.boardContext.logsDir, taskFileName(taskId));
    const directLogDoc = readTaskFile(directLogPath);
    if (directLogDoc && directLogDoc.task.id === taskId) {
      return {
        task: directLogDoc.task,
        body: directLogDoc.body,
        filePath: directLogPath,
        isLog: true,
      };
    }
  }

  const activeDocs = readTasksDir(rt.boardContext.boardDir);
  const activeMatch = activeDocs.find((doc) => doc.task.id === taskId);
  if (activeMatch) {
    return {
      task: activeMatch.task,
      body: activeMatch.body,
      filePath: activeMatch.filePath || path.join(rt.boardContext.boardDir, taskFileName(taskId)),
      isLog: false,
    };
  }

  if (includeLogs) {
    const logDocs = readTasksDir(rt.boardContext.logsDir);
    const logMatch = logDocs.find((doc) => doc.task.id === taskId);
    if (logMatch) {
      return {
        task: logMatch.task,
        body: logMatch.body,
        filePath: logMatch.filePath || path.join(rt.boardContext.logsDir, taskFileName(taskId)),
        isLog: true,
      };
    }
  }

  return null;
}

export function findChildTasks(rt: Rt, parentId: string, includeLogs = false): LocatedTask[] {
  if (!rt.boardContext) return [];

  const children: LocatedTask[] = [];

  for (const doc of readTasksDir(rt.boardContext.boardDir)) {
    if (doc.task.parentId !== parentId) continue;
    children.push({
      task: doc.task,
      body: doc.body,
      filePath: doc.filePath || path.join(rt.boardContext.boardDir, taskFileName(doc.task.id)),
      isLog: false,
    });
  }

  if (includeLogs) {
    for (const doc of readTasksDir(rt.boardContext.logsDir)) {
      if (doc.task.parentId !== parentId) continue;
      children.push({
        task: doc.task,
        body: doc.body,
        filePath: doc.filePath || path.join(rt.boardContext.logsDir, taskFileName(doc.task.id)),
        isLog: true,
      });
    }
  }

  children.sort((a, b) => {
    const aPos = typeof a.task.position === 'number' ? a.task.position : Number.MAX_SAFE_INTEGER;
    const bPos = typeof b.task.position === 'number' ? b.task.position : Number.MAX_SAFE_INTEGER;
    if (aPos !== bPos) return aPos - bPos;
    return a.task.id.localeCompare(b.task.id);
  });

  return children;
}

export function taskSummary(rt: Rt, located: LocatedTask, board: Board | null) {
  const description = located.task.description || extractDescription(located.body);

  return {
    id: located.task.id,
    title: located.task.title,
    type: located.task.type || 'task',
    parentId: located.task.parentId,
    column: located.isLog ? 'Completed' : columnTitleForId(located.task.column, board),
    columnId: located.task.column,
    priority: located.task.priority,
    tags: located.task.tags || [],
    assignee: located.task.assignee,
    dueDate: located.task.dueDate,
    relatedFiles: located.task.relatedFiles || [],
    subtasks: located.task.subtasks || [],
    contract: located.task.contract || null,
    createdAt: located.task.createdAt,
    updatedAt: located.task.updatedAt,
    completedAt: located.task.completedAt,
    isCompleted: located.isLog,
    filePath: rt.boardContext ? path.relative(rt.boardContext.projectRoot, located.filePath) : located.filePath,
    description,
  };
}

export function boardSummary(rt: Rt): { title: string; columns: Array<{ id: string; title: string; count: number }>; total: number } {
  const board = readBoardConfig(rt);
  const title = board?.title || 'Brainfile';
  const columns = getColumns(board);
  const docs = rt.boardContext ? readTasksDir(rt.boardContext.boardDir) : [];

  const counts = new Map<string, number>();
  for (const doc of docs) {
    const column = doc.task.column || 'unknown';
    counts.set(column, (counts.get(column) || 0) + 1);
  }

  const summaryColumns = columns.map((column) => ({
    id: column.id,
    title: column.title,
    count: counts.get(column.id) || 0,
  }));

  return {
    title,
    columns: summaryColumns,
    total: docs.length,
  };
}
