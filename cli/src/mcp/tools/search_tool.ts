import type { McpServer } from "@modelcontextprotocol/server";
import { z } from 'zod';
import { readTasksDir, resolveDocType } from '@brainfile/core';
import { searchMemory } from '@brainfile/core/memory';
import {
  getV2Dirs,
  findV2Task,
  extractDescription,
  extractLog,
} from '../../utils/v2-detect';
import { requireV2 } from '../helpers';
import { searchOutputSchema } from '../schemas';

export function registerSearchTool(server: McpServer, defaultFile: string): void {
  server.registerTool(
    'search',
    {
      title: 'Search',
      description: 'Search by query, list recent logs, or view one task/log entry. With the local index (Node 22.13+) a query searches board and logs documents, the ledger, plans/ and the project\'s own docs (README, AGENTS.md, docs/…); otherwise board and logs. Current results come first, history (completed work, superseded or rejected decisions) after, each with lane, path and line range; a doc hit\'s id is path:start-end. Filter tokens work in the query (p:high #tag @user type:spec due:week contract:ready). type filters by document type (aliases work: adr finds decisions).',
      inputSchema: z.object({
              file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
              query: z.string().optional().describe('Search query (matches title, description, tags, and log text in v2)'),
              column: z.string().optional().describe('Filter by column ID or name'),
              priority: z.enum(['low', 'medium', 'high', 'critical']).optional().describe('Filter by priority'),
              assignee: z.string().optional().describe('Filter by assignee'),
              type: z.string().optional().describe('Filter by document type (epic, spec, plan, task, decision, or the board\'s own; issue and adr are aliases)'),
              recent: z.boolean().optional().describe('List recently completed tasks (v2 only)'),
              task: z.string().optional().describe('View a specific task/log entry (v2 only)'),
              limit: z.number().int().positive().optional().describe('Most results per lane (default 20)'),
              history: z.boolean().optional().describe('Include history (completed work, superseded decisions); default true'),
            }),
      outputSchema: searchOutputSchema
    },
    async ({ file, query, column, priority, assignee, type, recent, task, limit, history }) => {
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
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      }

      if (recent) {
        const dirs = getV2Dirs(filePath);
        // A decision retired to logs/ was never completed: it is not a recent completion.
        const logDocs = readTasksDir(dirs.logsDir)
          .filter((doc) => doc.task.completedAt || resolveDocType(doc.task.type).role !== 'decision');
        logDocs.sort((a, b) => (b.task.completedAt || '').localeCompare(a.task.completedAt || ''));
        const logs = logDocs.slice(0, 20).map(doc => ({
          id: doc.task.id,
          title: doc.task.title,
          completedAt: doc.task.completedAt,
        }));
        const output = { logs, count: logs.length };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      }

      if (!query) {
        return { content: [{ type: 'text' as const, text: 'Error: query is required unless recent or task is provided' }], isError: true };
      }

      const found = searchMemory(filePath, query, {
        filters: { column, priority, assignee, type },
        ...(limit ? { limit } : {}),
      });
      const hits = history === false ? found.current : found.results;
      const matches = hits.map((hit) => ({
        id: hit.id,
        title: hit.title,
        // Older clients read column 'Completed' for a log entry.
        ...(hit.column ? { column: hit.column } : hit.source === 'logs' && hit.status === 'completed' ? { column: 'Completed' } : {}),
        ...(hit.priority ? { priority: hit.priority } : {}),
        ...(hit.tags ? { tags: hit.tags } : {}),
        ...(hit.assignee ? { assignee: hit.assignee } : {}),
        score: hit.score,
        ...(hit.isLog ? { isLog: true } : {}),
        lane: hit.lane,
        source: hit.source,
        path: hit.path,
        startLine: hit.startLine,
        endLine: hit.endLine,
        ...(hit.snippet ? { snippet: hit.snippet } : {}),
        ...(hit.type ? { type: hit.type } : {}),
        ...(hit.status ? { status: hit.status } : {}),
        ...(hit.claimKey ? { claimKey: hit.claimKey } : {}),
        ...(hit.completedAt ? { completedAt: hit.completedAt } : {}),
      }));

      const output = { results: matches, count: matches.length, mode: found.mode };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );
}
