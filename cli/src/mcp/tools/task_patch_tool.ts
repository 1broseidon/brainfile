import type { McpServer } from "@modelcontextprotocol/server";
import { z } from 'zod';
import * as path from 'path';
import {
  patchTask,
  patchTasks,
  readTaskFile as coreReadTaskFile,
  writeTaskFile as coreWriteTaskFile,
  taskFileName,
  type TaskPatch,
} from '@brainfile/core';
import { isV2, getV2Dirs } from '../../utils/v2-detect';
import { readBoard, writeBoard } from '../helpers';

export function registerTaskPatchTool(server: McpServer, defaultFile: string): void {
  server.registerTool(
    'task_patch',
    {
      title: 'Patch Task',
      description: 'Update specific fields of a task. Set fields to null to remove them.',
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

      // V2: update task file directly
      if (isV2(filePath)) {
        const dirs = getV2Dirs(filePath);
        const results: Array<{ taskId: string; success: boolean; error?: string }> = [];

        for (const id of taskIds) {
          const taskPath = path.join(dirs.boardDir, taskFileName(id));
          const doc = coreReadTaskFile(taskPath);
          if (!doc) {
            results.push({ taskId: id, success: false, error: 'Task not found' });
            continue;
          }

          const t = doc.task;
          if (title !== undefined) t.title = title;
          if (description !== undefined) { if (isNull(description)) delete t.description; else t.description = description as string; }
          if (priority !== undefined) { if (isNull(priority)) delete t.priority; else t.priority = priority as any; }
          if (tags !== undefined) { if (isNull(tags)) delete t.tags; else t.tags = tags as string[]; }
          if (assignee !== undefined) { if (isNull(assignee)) delete t.assignee; else t.assignee = assignee as string; }
          if (dueDate !== undefined) { if (isNull(dueDate)) delete t.dueDate; else t.dueDate = dueDate as string; }
          if (relatedFiles !== undefined) { if (isNull(relatedFiles)) delete t.relatedFiles; else t.relatedFiles = relatedFiles as string[]; }
          if (parentId !== undefined) { if (isNull(parentId)) delete t.parentId; else t.parentId = parentId as string; }
          t.updatedAt = new Date().toISOString();
          coreWriteTaskFile(taskPath, t, doc.body);
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

      // V1: use board
      const result = readBoard(filePath);
      if ('error' in result) {
        return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true };
      }

      let { board } = result;

      const patch: TaskPatch = {};
      if (title !== undefined) patch.title = title;
      if (description !== undefined) patch.description = isNull(description) ? undefined : description;
      if (priority !== undefined) patch.priority = isNull(priority) ? undefined : priority;
      if (tags !== undefined) patch.tags = isNull(tags) ? undefined : tags;
      if (assignee !== undefined) patch.assignee = isNull(assignee) ? undefined : assignee;
      if (dueDate !== undefined) patch.dueDate = isNull(dueDate) ? undefined : dueDate;
      if (relatedFiles !== undefined) patch.relatedFiles = isNull(relatedFiles) ? undefined : relatedFiles;

      if (!isBatch) {
        const id = taskIds[0];
        const patchResult = patchTask(board, id, patch);
        if (!patchResult.success) {
          return { content: [{ type: 'text' as const, text: `Error: ${patchResult.error}` }], isError: true };
        }
        writeBoard(filePath, patchResult.board!);
        return { content: [{ type: 'text' as const, text: `Task ${id} updated successfully` }] };
      }

      const bulkResult = patchTasks(board, taskIds, patch);
      if (bulkResult.board) {
        writeBoard(filePath, bulkResult.board);
      }
      const output = {
        success: bulkResult.success,
        successCount: bulkResult.successCount,
        failureCount: bulkResult.failureCount,
        results: bulkResult.results,
      };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
        isError: !bulkResult.success,
      };
    }
  );
}
