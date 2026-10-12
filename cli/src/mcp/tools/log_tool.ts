import type { McpServer } from "@modelcontextprotocol/server";
import { z } from 'zod';
import { readTaskLog, recentLogEntries, searchLogEntries } from '../../commands/log';
import { getV2Dirs } from '../../utils/v2-detect';
import { mcpError, mcpErrorFrom, mcpResult, requireV2 } from '../helpers';
import { logOutputSchema } from '../schemas';

/** `log`: read completed work, like the CLI's `log`. Read-only. */
export function registerLogTool(server: McpServer, defaultFile: string): void {
  server.registerTool(
    'log',
    {
      title: 'Read Logs',
      description: 'Read completed work. task: one task\'s description and log (open or completed). query: search completed tasks (title, description, log) with where each matched. Neither: the most recently completed tasks, ledger-only records included. For search across the board, its history and the project\'s docs, use search.',
      inputSchema: z.object({
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        task: z.string().optional().describe('A task ID: its description and log'),
        query: z.string().optional().describe('Search completed tasks'),
        limit: z.number().int().positive().optional().describe('Most entries for search and recent (default 20)'),
      }),
      outputSchema: logOutputSchema,
    },
    async ({ file, task, query, limit }) => {
      const filePath = file || defaultFile;
      const guard = requireV2(filePath);
      if (guard) return guard;
      if (task && query) return mcpError('give task or query, not both');
      const dirs = getV2Dirs(filePath);
      const max = limit ?? 20;
      try {
        if (task) {
          const view = readTaskLog(dirs, task);
          const head = `${view.id}: ${view.title}${view.completedAt ? ` (completed ${view.completedAt})` : ''}`;
          return mcpResult(`${head}\n\n${view.log ?? '(no log entries)'}`, { mode: 'task' as const, task: view });
        }
        if (query !== undefined) {
          if (!query.trim()) return mcpError('query is empty');
          const matches = searchLogEntries(dirs, query.trim());
          const output = { mode: 'search' as const, query: query.trim(), entries: matches.slice(0, max), count: matches.length };
          return mcpResult(JSON.stringify(output, null, 2), output);
        }
        const entries = recentLogEntries(dirs);
        const output = { mode: 'recent' as const, entries: entries.slice(0, max), count: entries.length };
        return mcpResult(JSON.stringify(output, null, 2), output);
      } catch (error) {
        return mcpErrorFrom(error);
      }
    },
  );
}
