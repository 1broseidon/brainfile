import type { McpServer } from "@modelcontextprotocol/server";
import { z } from 'zod';
import { readTasksDir, searchTasksRanked } from '@brainfile/core';
import {
  getV2Dirs,
  findV2Task,
  extractDescription,
  extractLog,
} from '../../utils/v2-detect';
import { requireV2 } from '../helpers';

export function registerSearchTool(server: McpServer, defaultFile: string): void {
  server.registerTool(
    'search',
    {
      title: 'Search',
      description: 'Search tasks and logs by query, list recent logs, or view one task/log entry. All board documents are searchable, including epics, specs, adrs, and plans.',
      inputSchema: z.object({
              file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
              query: z.string().optional().describe('Search query (matches title, description, tags, and log text in v2)'),
              column: z.string().optional().describe('Filter by column ID or name'),
              priority: z.enum(['low', 'medium', 'high', 'critical']).optional().describe('Filter by priority'),
              assignee: z.string().optional().describe('Filter by assignee'),
              recent: z.boolean().optional().describe('List recently completed tasks (v2 only)'),
              task: z.string().optional().describe('View a specific task/log entry (v2 only)'),
            })
    },
    async ({ file, query, column, priority, assignee, recent, task }) => {
      const filePath = file || defaultFile;

      const guard = requireV2(filePath);
      if (guard) return guard;

      if (task) {
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

      const dirs = getV2Dirs(filePath);
      const matches: Array<{ id: string; title: string; column?: string; priority?: string; tags?: string[]; assignee?: string; score: number; isLog?: boolean }> = [];

      const boardMatches = searchTasksRanked(readTasksDir(dirs.boardDir), query, { column, priority, assignee });
      for (const { doc, score } of boardMatches) {
        const t = doc.task;
        matches.push({ id: t.id, title: t.title, column: t.column, priority: t.priority, tags: t.tags, assignee: t.assignee, score });
      }

      if (!column) {
        const logMatches = searchTasksRanked(readTasksDir(dirs.logsDir), query, { priority, assignee });
        for (const { doc, score } of logMatches) {
          const t = doc.task;
          matches.push({ id: t.id, title: t.title, column: 'Completed', priority: t.priority, tags: t.tags, assignee: t.assignee, score, isLog: true });
        }
      }

      matches.sort((a, b) => b.score - a.score);
      return { content: [{ type: 'text' as const, text: JSON.stringify({ results: matches, count: matches.length }, null, 2) }] };
    }
  );
}
