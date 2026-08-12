import type { McpServer } from "@modelcontextprotocol/server";
import { z } from 'zod';
import * as path from 'path';
import {
  readTaskFile as coreReadTaskFile,
  patchTaskFile,
  taskFileName,
  type TaskFilePatch,
} from '@brainfile/core';
import { getV2Dirs } from '../../utils/v2-detect';
import { requireV2 } from '../helpers';

export function registerTaskPatchTool(server: McpServer, defaultFile: string): void {
  server.registerTool(
    'task_patch',
    {
      title: 'Patch Task',
      description: 'Update specific fields of a task. Set fields to null to remove them. Set parentId to a plan ID to link a task to the plan it implements.',
      inputSchema: z.object({
              file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
              taskId: z.union([z.string(), z.array(z.string())]).optional().describe('Task ID or array of task IDs to update'),
              task: z.string().optional().describe('Alias of taskId for single task update'),
              title: z.string().optional().describe('New task title'),
              description: z.string().nullable().optional().describe('New description (null to remove)'),
              priority: z.enum(['low', 'medium', 'high', 'critical']).nullable().optional().describe('New priority (null to remove)'),
              tags: z.array(z.string()).nullable().optional().describe('New tags (null to remove)'),
              assignee: z.string().nullable().optional().describe('New assignee (null to remove)'),
              dueDate: z.string().nullable().optional().describe('New due date (null to remove)'),
              relatedFiles: z.array(z.string()).nullable().optional().describe('Related file paths (null to remove)'),
              parentId: z.string().nullable().optional().describe('Parent task ID (null to remove)')
            })
    },
    async ({ file, taskId, task, title, description, priority, tags, assignee, dueDate, relatedFiles, parentId }) => {
      const filePath = file || defaultFile;
      const rawTaskIds = taskId ?? task;
      if (!rawTaskIds) {
        return { content: [{ type: 'text' as const, text: 'Error: taskId is required' }], isError: true };
      }
      const taskIds = Array.isArray(rawTaskIds) ? rawTaskIds : [rawTaskIds];
      const isBatch = taskIds.length > 1;

      const isNull = (v: unknown) => v === null || v === 'null';

      const guard = requireV2(filePath);
      if (guard) return guard;

      const dirs = getV2Dirs(filePath);
      const results: Array<{ taskId: string; success: boolean; error?: string }> = [];

      for (const id of taskIds) {
        const taskPath = path.join(dirs.boardDir, taskFileName(id));
        const doc = coreReadTaskFile(taskPath);
        if (!doc) {
          results.push({ taskId: id, success: false, error: 'Task not found' });
          continue;
        }

        const nullable = <T>(v: T | null | undefined): T | null | undefined =>
          v === undefined ? undefined : (isNull(v) ? null : (v as T));

        const result = patchTaskFile(taskPath, {
          title,
          description: nullable(description),
          priority: nullable(priority) as TaskFilePatch['priority'],
          tags: nullable(tags),
          assignee: nullable(assignee),
          dueDate: nullable(dueDate),
          relatedFiles: nullable(relatedFiles),
          parentId: nullable(parentId),
        });
        if (!result.success) {
          results.push({ taskId: id, success: false, error: result.error || 'Task not found' });
          continue;
        }
        results.push({ taskId: id, success: true });
      }

      if (!isBatch) {
        const single = results[0];
        if (!single?.success) {
          return { content: [{ type: 'text' as const, text: `Error: ${single?.error || 'Task not found'}` }], isError: true };
        }
        return { content: [{ type: 'text' as const, text: `Task ${taskIds[0]} updated successfully` }] };
      }

      const successCount = results.filter(r => r.success).length;
      const failureCount = results.length - successCount;
      const output = { success: failureCount === 0, successCount, failureCount, results };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
        isError: failureCount > 0 && successCount === 0,
      };
    }
  );
}
