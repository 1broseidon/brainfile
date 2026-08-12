import type { McpServer } from "@modelcontextprotocol/server";
import { z } from 'zod';
import { getV2Dirs, findV2Task, extractDescription } from '../../utils/v2-detect';
import { requireV2 } from '../helpers';

export function registerGetTaskTool(server: McpServer, defaultFile: string): void {
  server.registerTool(
    'get_task',
    {
      title: 'Get Task',
      description: 'Get detailed information about a specific task by ID',
      inputSchema: z.object({
              file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
              task: z.string().describe('Task ID to retrieve')
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
  );
}
