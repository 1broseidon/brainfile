import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as fs from 'fs';
import { findTaskById, deleteTask } from '@brainfile/core';
import { isV2, getV2Dirs, findV2Task } from '../../utils/v2-detect';
import { readBoard, writeBoard } from '../helpers';

export function registerTaskDeleteTool(server: McpServer, defaultFile: string): void {
  server.registerTool(
    'task_delete',
    {
      title: 'Delete Task',
      description: 'Permanently delete a task from the brainfile',
      inputSchema: {
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        task: z.string().describe('Task ID to delete')
      }
    },
    async ({ file, task }) => {
      const filePath = file || defaultFile;

      // V2: delete task file
      if (isV2(filePath)) {
        const dirs = getV2Dirs(filePath);
        const found = findV2Task(dirs, task, true);
        if (!found) {
          return { content: [{ type: 'text' as const, text: `Error: Task not found: ${task}` }], isError: true };
        }

        try {
          fs.unlinkSync(found.filePath);
          return { content: [{ type: 'text' as const, text: `Task ${task} deleted successfully` }] };
        } catch (e) {
          return { content: [{ type: 'text' as const, text: `Error: ${(e as Error).message}` }], isError: true };
        }
      }

      // V1: use board
      const result = readBoard(filePath);

      if ('error' in result) {
        return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true };
      }

      let { board } = result;

      const taskInfo = findTaskById(board, task);
      if (!taskInfo) {
        return { content: [{ type: 'text' as const, text: `Error: Task not found: ${task}` }], isError: true };
      }

      const deleteResult = deleteTask(board, taskInfo.column.id, task);

      if (!deleteResult.success) {
        return { content: [{ type: 'text' as const, text: `Error: ${deleteResult.error}` }], isError: true };
      }

      writeBoard(filePath, deleteResult.board!);

      return {
        content: [{ type: 'text' as const, text: `Task ${task} deleted successfully` }]
      };
    }
  );
}
