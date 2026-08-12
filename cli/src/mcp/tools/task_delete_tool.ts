import type { McpServer } from "@modelcontextprotocol/server";
import { z } from 'zod';
import * as fs from 'fs';
import { getV2Dirs, findV2Task } from '../../utils/v2-detect';
import { requireV2 } from '../helpers';

export function registerTaskDeleteTool(server: McpServer, defaultFile: string): void {
  server.registerTool(
    'task_delete',
    {
      title: 'Delete Task',
      description: 'Permanently delete a task from the brainfile',
      inputSchema: z.object({
              file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
              task: z.string().describe('Task ID to delete')
            })
    },
    async ({ file, task }) => {
      const filePath = file || defaultFile;

      const guard = requireV2(filePath);
      if (guard) return guard;

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
  );
}
