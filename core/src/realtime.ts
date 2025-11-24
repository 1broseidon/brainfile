import { createHash } from 'crypto';
import { BrainfileSerializer } from './serializer';
import { Board, Column, Task } from './types';

export interface ColumnDiff {
  columnId: string;
  before?: Column;
  after?: Column;
  fromIndex?: number;
  toIndex?: number;
  changedFields?: string[];
}

export interface TaskDiff {
  taskId: string;
  before?: Task;
  after?: Task;
  fromColumnId?: string;
  toColumnId?: string;
  fromIndex?: number;
  toIndex?: number;
  changedFields?: string[];
}

export interface BoardDiff {
  metadataChanged: boolean;
  columnsAdded: ColumnDiff[];
  columnsRemoved: ColumnDiff[];
  columnsUpdated: ColumnDiff[];
  columnsMoved: ColumnDiff[];
  tasksAdded: TaskDiff[];
  tasksRemoved: TaskDiff[];
  tasksUpdated: TaskDiff[];
  tasksMoved: TaskDiff[];
}

/**
  * Generate a stable hash for raw Brainfile content.
  * Uses SHA-256 for collision resistance and cross-process consistency.
  */
export function hashBoardContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
  * Generate a stable hash for a Board by serializing with BrainfileSerializer.
  */
export function hashBoard(board: Board): string {
  const serialized = BrainfileSerializer.serialize(board);
  return hashBoardContent(serialized);
}

/**
  * Compute a structural diff between two Board objects.
  */
export function diffBoards(previous: Board, next: Board): BoardDiff {
  const metadataChanged = !isEqual(
    {
      title: previous.title,
      protocolVersion: previous.protocolVersion,
      schema: previous.schema,
      agent: previous.agent,
      rules: previous.rules,
      statsConfig: previous.statsConfig
    },
    {
      title: next.title,
      protocolVersion: next.protocolVersion,
      schema: next.schema,
      agent: next.agent,
      rules: next.rules,
      statsConfig: next.statsConfig
    }
  );

  const columnIdToPrev = indexColumns(previous.columns);
  const columnIdToNext = indexColumns(next.columns);

  const columnsAdded: ColumnDiff[] = [];
  const columnsRemoved: ColumnDiff[] = [];
  const columnsUpdated: ColumnDiff[] = [];
  const columnsMoved: ColumnDiff[] = [];

  for (const [id, prevInfo] of columnIdToPrev.entries()) {
    if (!columnIdToNext.has(id)) {
      columnsRemoved.push({ columnId: id, before: prevInfo.column, fromIndex: prevInfo.index });
    }
  }

  for (const [id, nextInfo] of columnIdToNext.entries()) {
    const prevInfo = columnIdToPrev.get(id);
    if (!prevInfo) {
      columnsAdded.push({ columnId: id, after: nextInfo.column, toIndex: nextInfo.index });
      continue;
    }

    const changedFields = detectChangedFields(prevInfo.column, nextInfo.column, ['title', 'order']);
    if (changedFields.length > 0) {
      columnsUpdated.push({
        columnId: id,
        before: prevInfo.column,
        after: nextInfo.column,
        changedFields
      });
    }

    if (prevInfo.index !== nextInfo.index) {
      columnsMoved.push({
        columnId: id,
        before: prevInfo.column,
        after: nextInfo.column,
        fromIndex: prevInfo.index,
        toIndex: nextInfo.index
      });
    }
  }

  const tasksAdded: TaskDiff[] = [];
  const tasksRemoved: TaskDiff[] = [];
  const tasksUpdated: TaskDiff[] = [];
  const tasksMoved: TaskDiff[] = [];

  const prevTasks = indexTasks(previous.columns);
  const nextTasks = indexTasks(next.columns);

  for (const [taskId, prevInfo] of prevTasks.entries()) {
    if (!nextTasks.has(taskId)) {
      tasksRemoved.push({
        taskId,
        before: prevInfo.task,
        fromColumnId: prevInfo.columnId,
        fromIndex: prevInfo.index
      });
    }
  }

  for (const [taskId, nextInfo] of nextTasks.entries()) {
    const prevInfo = prevTasks.get(taskId);
    if (!prevInfo) {
      tasksAdded.push({
        taskId,
        after: nextInfo.task,
        toColumnId: nextInfo.columnId,
        toIndex: nextInfo.index
      });
      continue;
    }

    const moved =
      prevInfo.columnId !== nextInfo.columnId ||
      prevInfo.index !== nextInfo.index;
    if (moved) {
      tasksMoved.push({
        taskId,
        before: prevInfo.task,
        after: nextInfo.task,
        fromColumnId: prevInfo.columnId,
        toColumnId: nextInfo.columnId,
        fromIndex: prevInfo.index,
        toIndex: nextInfo.index
      });
    }

    const changedFields = detectChangedFields(prevInfo.task, nextInfo.task, [
      'title',
      'description',
      'relatedFiles',
      'assignee',
      'tags',
      'priority',
      'dueDate',
      'subtasks',
      'template'
    ]);
    if (changedFields.length > 0) {
      tasksUpdated.push({
        taskId,
        before: prevInfo.task,
        after: nextInfo.task,
        fromColumnId: prevInfo.columnId,
        toColumnId: nextInfo.columnId,
        fromIndex: prevInfo.index,
        toIndex: nextInfo.index,
        changedFields
      });
    }
  }

  return {
    metadataChanged,
    columnsAdded,
    columnsRemoved,
    columnsUpdated,
    columnsMoved,
    tasksAdded,
    tasksRemoved,
    tasksUpdated,
    tasksMoved
  };
}

function indexColumns(columns: Column[]) {
  const map = new Map<string, { column: Column; index: number }>();
  columns.forEach((col, index) => {
    map.set(col.id, { column: col, index });
  });
  return map;
}

function indexTasks(columns: Column[]) {
  const map = new Map<
    string,
    { task: Task; columnId: string; index: number }
  >();
  columns.forEach((col) => {
    col.tasks.forEach((task, index) => {
      map.set(task.id, { task, columnId: col.id, index });
    });
  });
  return map;
}

function detectChangedFields<T extends Record<string, any>>(
  before: T,
  after: T,
  fields: (keyof T)[]
): string[] {
  const changed: string[] = [];
  for (const field of fields) {
    if (!isEqual(before[field], after[field])) {
      changed.push(String(field));
    }
  }
  return changed;
}

function isEqual(a: any, b: any): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
