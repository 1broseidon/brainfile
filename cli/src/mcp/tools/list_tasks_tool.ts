import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { buildBoardFromV2 } from '../../utils/v2-detect';
import { isV2 } from '../../utils/v2-detect';
import { readBoard } from '../helpers';

export function registerListTasksTool(server: McpServer, defaultFile: string): void {
  server.registerTool(
    'list_tasks',
    {
      title: 'List Tasks',
      description: 'List all tasks from the brainfile, optionally filtered by column or tag',
      inputSchema: {
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        column: z.string().optional().describe('Filter by column ID or name'),
        tag: z.string().optional().describe('Filter by tag'),
        type: z.string().optional().describe('Filter by document type (e.g., epic, adr). Only returns tasks matching this type.'),
      }
    },
    async ({ file, column, tag, type: filterType }) => {
      const filePath = file || defaultFile;

      // V2: use per-task files
      if (isV2(filePath)) {
        const board = buildBoardFromV2(filePath);
        let tasks: Array<{ id: string; title: string; column: string; priority?: string; tags?: string[]; assignee?: string }> = [];
        for (const col of board.columns) {
          if (column) {
            const matchesId = col.id === column;
            const matchesName = col.title.toLowerCase() === column.toLowerCase();
            if (!matchesId && !matchesName) continue;
          }
          for (const task of col.tasks) {
            if (tag && (!task.tags || !task.tags.includes(tag))) continue;
            if (filterType) {
              const taskType = task.type || 'task';
              if (taskType !== filterType) continue;
            }
            tasks.push({ id: task.id, title: task.title, column: col.title, priority: task.priority, tags: task.tags, assignee: task.assignee });
          }
        }
        return { content: [{ type: 'text' as const, text: JSON.stringify({ tasks, count: tasks.length }, null, 2) }] };
      }

      // V1: use board
      const result = readBoard(filePath);
      if ('error' in result) {
        return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true };
      }

      const { board } = result;
      let tasks: Array<{ id: string; title: string; column: string; priority?: string; tags?: string[]; assignee?: string }> = [];

      for (const col of board.columns) {
        if (column) {
          const matchesId = col.id === column;
          const matchesName = col.title.toLowerCase() === column.toLowerCase();
          if (!matchesId && !matchesName) continue;
        }

        for (const task of col.tasks) {
          if (tag && (!task.tags || !task.tags.includes(tag))) continue;
          if (filterType) {
            const taskType = task.type || 'task';
            if (taskType !== filterType) continue;
          }

          tasks.push({
            id: task.id,
            title: task.title,
            column: col.title,
            priority: task.priority,
            tags: task.tags,
            assignee: task.assignee
          });
        }
      }

      const output = { tasks, count: tasks.length };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }]
      };
    }
  );
}
