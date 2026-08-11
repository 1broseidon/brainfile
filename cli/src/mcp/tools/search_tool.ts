import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { readTasksDir, type TaskDocument } from '@brainfile/core';
import {
  isV2,
  getV2Dirs,
  findV2Task,
  extractDescription,
  extractLog,
} from '../../utils/v2-detect';
import { readBoard } from '../helpers';

export function registerSearchTool(server: McpServer, defaultFile: string): void {
  server.registerTool(
    'search',
    {
      title: 'Search',
      description: 'Search tasks and logs by query, list recent logs, or view one task/log entry',
      inputSchema: {
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        query: z.string().optional().describe('Search query (matches title, description, tags, and log text in v2)'),
        column: z.string().optional().describe('Filter by column ID or name'),
        priority: z.enum(['low', 'medium', 'high', 'critical']).optional().describe('Filter by priority'),
        assignee: z.string().optional().describe('Filter by assignee'),
        recent: z.boolean().optional().describe('List recently completed tasks (v2 only)'),
        task: z.string().optional().describe('View a specific task/log entry (v2 only)'),
      }
    },
    async ({ file, query, column, priority, assignee, recent, task }) => {
      const filePath = file || defaultFile;

      if (task) {
        if (!isV2(filePath)) {
          return { content: [{ type: 'text' as const, text: 'Error: task lookup in search requires v2 per-task file architecture.' }], isError: true };
        }
        const dirs = getV2Dirs(filePath);
        const found = findV2Task(dirs, task, true);
        if (!found) {
          return { content: [{ type: 'text' as const, text: `Error: Task not found: ${task}` }], isError: true };
        }
        const output = {
          id: found.doc.task.id,
          title: found.doc.task.title,
          completedAt: found.doc.task.completedAt,
          isLog: found.isLog,
          description: extractDescription(found.doc.body),
          log: extractLog(found.doc.body),
        };
        return { content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }] };
      }

      if (recent) {
        if (!isV2(filePath)) {
          return { content: [{ type: 'text' as const, text: 'Error: recent log listing requires v2 per-task file architecture.' }], isError: true };
        }
        const dirs = getV2Dirs(filePath);
        const logDocs = readTasksDir(dirs.logsDir);
        logDocs.sort((a, b) => (b.task.completedAt || '').localeCompare(a.task.completedAt || ''));
        const logs = logDocs.slice(0, 20).map(doc => ({
          id: doc.task.id,
          title: doc.task.title,
          completedAt: doc.task.completedAt,
        }));
        return { content: [{ type: 'text' as const, text: JSON.stringify({ logs, count: logs.length }, null, 2) }] };
      }

      if (!query) {
        return { content: [{ type: 'text' as const, text: 'Error: query is required unless recent or task is provided' }], isError: true };
      }

      const queryLower = query.toLowerCase();

      // V2: search per-task files
      if (isV2(filePath)) {
        const dirs = getV2Dirs(filePath);
        const matches: Array<{ id: string; title: string; column?: string; priority?: string; tags?: string[]; assignee?: string; score: number; isLog?: boolean }> = [];

        const scoreDoc = (doc: TaskDocument, includeLogText: boolean): number => {
          const t = doc.task;
          let score = 0;
          if (t.title.toLowerCase().includes(queryLower)) {
            score += 10;
            if (t.title.toLowerCase().startsWith(queryLower)) score += 5;
          }
          if (t.description?.toLowerCase().includes(queryLower)) score += 5;
          if (extractDescription(doc.body)?.toLowerCase().includes(queryLower)) score += 5;
          if (t.tags?.some(tag => tag.toLowerCase().includes(queryLower))) score += 3;
          if (includeLogText && extractLog(doc.body)?.toLowerCase().includes(queryLower)) score += 2;
          if (t.id.toLowerCase() === queryLower) score += 20;
          return score;
        };

        const taskDocs = readTasksDir(dirs.boardDir);
        for (const doc of taskDocs) {
          const t = doc.task;
          if (column && t.column !== column) continue;
          if (priority && t.priority !== priority) continue;
          if (assignee && t.assignee !== assignee) continue;

          const score = scoreDoc(doc, false);
          if (score > 0) {
            matches.push({ id: t.id, title: t.title, column: t.column, priority: t.priority, tags: t.tags, assignee: t.assignee, score });
          }
        }

        if (!column) {
          const logDocs = readTasksDir(dirs.logsDir);
          for (const doc of logDocs) {
            const t = doc.task;
            if (priority && t.priority !== priority) continue;
            if (assignee && t.assignee !== assignee) continue;

            const score = scoreDoc(doc, true);
            if (score > 0) {
              matches.push({ id: t.id, title: t.title, column: 'Completed', priority: t.priority, tags: t.tags, assignee: t.assignee, score, isLog: true });
            }
          }
        }

        matches.sort((a, b) => b.score - a.score);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ results: matches, count: matches.length }, null, 2) }] };
      }

      // V1: use board
      const result = readBoard(filePath);
      if ('error' in result) {
        return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true };
      }

      const { board } = result;
      const matches: Array<{ id: string; title: string; column: string; priority?: string; tags?: string[]; assignee?: string; score: number }> = [];

      for (const col of board.columns) {
        if (column) {
          const matchesId = col.id === column;
          const matchesName = col.title.toLowerCase() === column.toLowerCase();
          if (!matchesId && !matchesName) continue;
        }

        for (const t of col.tasks) {
          if (priority && t.priority !== priority) continue;
          if (assignee && t.assignee !== assignee) continue;

          let score = 0;
          if (t.title.toLowerCase().includes(queryLower)) {
            score += 10;
            if (t.title.toLowerCase().startsWith(queryLower)) score += 5;
          }
          if (t.description?.toLowerCase().includes(queryLower)) score += 5;
          if (t.tags?.some(tag => tag.toLowerCase().includes(queryLower))) score += 3;
          if (t.id.toLowerCase() === queryLower) score += 20;

          if (score > 0) {
            matches.push({ id: t.id, title: t.title, column: col.title, priority: t.priority, tags: t.tags, assignee: t.assignee, score });
          }
        }
      }

      matches.sort((a, b) => b.score - a.score);
      return { content: [{ type: 'text' as const, text: JSON.stringify({ results: matches, count: matches.length }, null, 2) }] };
    }
  );
}
