/**
 * One search (spec-11): the local index when this Node has `node:sqlite`,
 * today's scan over board/ and logs/ when it does not. Both answer in the
 * same shape: current results first, history (completed work, superseded,
 * rejected and stale decisions) in its own lane, every hit with its path and
 * line range, board documents with their ID.
 *
 * @packageDocumentation
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Task, TaskDocument } from '../types/base';
import { readBoardConfig } from '../boardFile';
import { readTasksDir } from '../taskFile';
import { getV2Dirs } from '../workspace';
import { resolveDocType } from '../docTypes';
import { decisionStatus } from '../docGraph';
import { isHistoricalStatus } from '../decisions';
import { searchTasksRanked, type SearchFilters } from '../search';
import { MemoryIndex, type IndexSearchOptions, type IndexSource, type MemoryHit, type MemoryLane, type RefreshStats } from './memoryIndex';

export interface MemorySearchOptions extends Omit<IndexSearchOptions, 'role' | 'ignoreWords'> {
  /** Leave the index alone and scan (also `BRAINFILE_INDEX=off`). */
  scan?: boolean;
  /** Refresh the index before searching (default true). */
  refresh?: boolean;
}

export interface MemorySearchResult {
  /** `index` when the local index answered, `scan` for the fallback. */
  mode: 'index' | 'scan';
  query: string;
  current: MemoryHit[];
  history: MemoryHit[];
  /** Current then history. */
  results: MemoryHit[];
  count: number;
  /** The refresh before an index search. */
  refresh?: RefreshStats;
}

function lineCount(filePath: string | undefined): number {
  if (!filePath) return 1;
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    return Math.max(1, lines[lines.length - 1] === '' ? lines.length - 1 : lines.length);
  } catch {
    return 1;
  }
}

/** A board document as a hit (the scan's answer, and what the index would say about it). */
export function hitFromDocument(
  doc: TaskDocument,
  source: 'board' | 'logs',
  score: number,
  projectRoot: string,
  types?: Parameters<typeof resolveDocType>[1],
): MemoryHit {
  const task: Task & Record<string, unknown> = doc.task as Task & Record<string, unknown>;
  const resolved = resolveDocType(task.type, types);
  const isDecision = resolved.role === 'decision';
  const status = isDecision ? decisionStatus(task) : source === 'logs' || task.completedAt ? 'completed' : 'open';
  const lane: MemoryLane = isDecision
    ? (isHistoricalStatus(status as ReturnType<typeof decisionStatus>) ? 'history' : 'current')
    : status === 'completed' ? 'history' : 'current';
  const rel = doc.filePath ? path.relative(projectRoot, doc.filePath).split(path.sep).join('/') : `${source}/${doc.task.id}.md`;
  const claimKey = typeof task.claimKey === 'string' && task.claimKey.trim() ? task.claimKey.trim().toLowerCase() : undefined;
  return {
    id: task.id,
    title: task.title,
    source,
    lane,
    path: rel,
    startLine: 1,
    endLine: lineCount(doc.filePath),
    score,
    ...(resolved.name !== 'task' ? { type: resolved.name } : {}),
    role: resolved.role,
    status,
    ...(!isDecision && source === 'board' && task.column ? { column: task.column } : {}),
    ...(typeof task.completedAt === 'string' ? { completedAt: task.completedAt } : {}),
    ...(claimKey ? { claimKey } : {}),
    ...(task.priority ? { priority: task.priority } : {}),
    ...(Array.isArray(task.tags) && task.tags.length ? { tags: task.tags } : {}),
    ...(typeof task.assignee === 'string' && task.assignee ? { assignee: task.assignee } : {}),
    isLog: source === 'logs',
  };
}

/**
 * The scan: today's ranked substring search over board/ and logs/ (logs
 * skipped under a column filter), split into lanes. What every caller gets
 * where `node:sqlite` is missing, and for filter-only queries.
 */
export function scanSearch(brainfilePath: string, query: string, options: MemorySearchOptions = {}): MemorySearchResult {
  const dirs = getV2Dirs(brainfilePath);
  const projectRoot = path.dirname(dirs.dotDir);
  const types = readBoardConfig(dirs.brainfilePath)?.config.types;
  const limit = options.limit && options.limit > 0 ? options.limit : 20;
  const filters: SearchFilters = options.filters ?? {};
  const wants = (source: IndexSource) => !options.sources || options.sources.includes(source);

  const hits: MemoryHit[] = [];
  if (wants('board')) {
    for (const { doc, score } of searchTasksRanked(readTasksDir(dirs.boardDir), query, filters)) {
      hits.push(hitFromDocument(doc, 'board', score, projectRoot, types));
    }
  }
  if (wants('logs') && !filters.column) {
    const { column: _column, ...rest } = filters;
    for (const { doc, score } of searchTasksRanked(readTasksDir(dirs.logsDir), query, rest)) {
      hits.push(hitFromDocument(doc, 'logs', score, projectRoot, types));
    }
  }
  const sorted = hits.map((hit, order) => ({ hit, order }))
    .sort((a, b) => b.hit.score - a.hit.score || a.order - b.order)
    .map(({ hit }) => hit);
  const current = sorted.filter((h) => h.lane === 'current').slice(0, limit);
  const history = sorted.filter((h) => h.lane === 'history').slice(0, limit);
  const results = [...current, ...history];
  return { mode: 'scan', query, current, history, results, count: results.length };
}

/**
 * Search a board and its project. The local index when it can be opened
 * (refreshed first), else the scan. A query with no words to search on
 * (`p:high`) always scans.
 */
export function searchMemory(brainfilePath: string, query: string, options: MemorySearchOptions = {}): MemorySearchResult {
  if (!options.scan) {
    const index = MemoryIndex.open(brainfilePath);
    if (index) {
      try {
        const refresh = options.refresh === false ? undefined : index.refresh();
        const found = index.search(query, options);
        if (found) {
          const results = [...found.current, ...found.history];
          return {
            mode: 'index',
            query,
            current: found.current,
            history: found.history,
            results,
            count: results.length,
            ...(refresh ? { refresh } : {}),
          };
        }
      } catch {
        // The index is a convenience: any trouble with it means the scan.
      } finally {
        index.close();
      }
    }
  }
  return scanSearch(brainfilePath, query, options);
}
