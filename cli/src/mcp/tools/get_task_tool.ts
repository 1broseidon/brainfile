import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { findTaskById } from '@brainfile/core';
import { isV2, getV2Dirs, findV2Task, extractDescription } from '../../utils/v2-detect';
import { readBoard } from '../helpers';

export function registerGetTaskTool(server: McpServer, defaultFile: string): void {
  server.registerTool(
    'get_task',
    {
      title: 'Get Task',
      description: 'Get detailed information about a specific task by ID',
      inputSchema: {
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        task: z.string().describe('Task ID to retrieve')
      }
    },
    async ({ file, task }) => {
      const filePath = file || defaultFile;

      // V2: use per-task files
      if (isV2(filePath)) {
        const dirs = getV2Dirs(filePath);
        const found = findV2Task(dirs, task, true);
        if (!found) {
          return { content: [{ type: 'text' as const, text: `Error: Task not found: ${task}` }], isError: true };
        }
        const { doc, isLog } = found;
        const description = extractDescription(doc.body);
        const output = {
          ...doc.task,
          ...(description && !doc.task.description && { description }),
          column: isLog ? 'Completed' : (doc.task.column || 'unknown'),
          ...(isLog && { archived: true }),
        };
        return { content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }] };
      }

      // V1: use board
      const result = readBoard(filePath);
      if ('error' in result) {
        return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true };
      }

      const { board } = result;
      const taskInfo = findTaskById(board, task);

      if (!taskInfo) {
        return { content: [{ type: 'text' as const, text: `Error: Task not found: ${task}` }], isError: true };
      }

      const output = {
        ...taskInfo.task,
        column: taskInfo.column.title,
        columnId: taskInfo.column.id
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }]
      };
    }
  );
}
