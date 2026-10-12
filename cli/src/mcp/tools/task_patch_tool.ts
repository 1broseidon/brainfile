import type { McpServer } from "@modelcontextprotocol/server";
import { withBoardCommit } from '../helpers';
import { z } from 'zod';
import * as path from 'path';
import {
  checkDocumentLinks,
  readBoardGraph,
  readTaskFile as coreReadTaskFile,
  patchTaskFile,
  taskFileName,
  type TaskFilePatch,
} from '@brainfile/core';
import { getV2Dirs } from '../../utils/v2-detect';
import { requireV2 } from '../helpers';
import { taskPatchOutputSchema } from '../schemas';

export function registerTaskPatchTool(server: McpServer, defaultFile: string): void {
  server.registerTool(
    'task_patch',
    {
      title: 'Patch Task',
      description: 'Update specific fields of a task. Set fields to null to remove them. parentId moves a document under its parent (a task under a plan, a spec under an epic); an off-pattern parent is a warning, refused on a strict board, and a loop is always refused. dependsOn replaces the list of tasks that come first; decisions replaces the list of decisions the work rests on.',
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
              parentId: z.string().nullable().optional().describe('Parent task ID (null to remove)'),
              dependsOn: z.array(z.string()).nullable().optional().describe('Task IDs this task depends on, replacing the list; alias:task-id names a task on a related board (null or [] to remove)'),
              decisions: z.array(z.string()).nullable().optional().describe('IDs of the decisions this work rests on, replacing the list (null or [] to remove)'),
            }),
      outputSchema: taskPatchOutputSchema
    },
    withBoardCommit('task_patch', defaultFile, async ({ file, taskId, task, title, description, priority, tags, assignee, dueDate, relatedFiles, parentId, dependsOn, decisions }) => {
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
      const results: Array<{ taskId: string; success: boolean; error?: string; warnings?: string[] }> = [];
      const linksChange = (typeof parentId === 'string' && !isNull(parentId))
        || (Array.isArray(dependsOn) && dependsOn.length > 0)
        || (Array.isArray(decisions) && decisions.length > 0);
      const board = linksChange ? readBoardGraph(filePath) : null;

      for (const id of taskIds) {
        const taskPath = path.join(dirs.boardDir, taskFileName(id));
        const doc = coreReadTaskFile(taskPath);
        if (!doc) {
          results.push({ taskId: id, success: false, error: 'Task not found' });
          continue;
        }

        const nullable = <T>(v: T | null | undefined): T | null | undefined =>
          v === undefined ? undefined : (isNull(v) ? null : (v as T));

        // Links are checked against the board (spec-12): self links and loops are
        // refused; an off-pattern link warns, and a strict board refuses it.
        let warnings: string[] = [];
        if (board) {
          const check = checkDocumentLinks(board.graph, {
            id,
            ...(typeof parentId === 'string' && !isNull(parentId) && { parentId }),
            ...(Array.isArray(dependsOn) && { dependsOn }),
            ...(Array.isArray(decisions) && { decisions }),
          }, { strict: board.config?.strict === true });
          if (check.errors.length > 0) {
            results.push({ taskId: id, success: false, error: check.errors.join('; ') });
            continue;
          }
          warnings = check.warnings;
        }

        const result = patchTaskFile(taskPath, {
          title,
          description: nullable(description),
          priority: nullable(priority) as TaskFilePatch['priority'],
          tags: nullable(tags),
          assignee: nullable(assignee),
          dueDate: nullable(dueDate),
          relatedFiles: nullable(relatedFiles),
          parentId: nullable(parentId),
          dependsOn: nullable(dependsOn),
          decisions: nullable(decisions),
        });
        if (!result.success) {
          results.push({ taskId: id, success: false, error: result.error || 'Task not found' });
          continue;
        }
        results.push({ taskId: id, success: true, ...(warnings.length > 0 && { warnings }) });
      }

      const successCount = results.filter(r => r.success).length;
      const failureCount = results.length - successCount;
      // Always the batch shape, so a single-task patch and a batch patch parse
      // identically. Only the text branches.
      const output = { success: failureCount === 0, successCount, failureCount, results };

      if (!isBatch) {
        const single = results[0];
        if (!single?.success) {
          return {
            content: [{ type: 'text' as const, text: `Error: ${single?.error || 'Task not found'}` }],
            structuredContent: output,
            isError: true,
          };
        }
        const warned = single.warnings?.length ? `\nWarning: ${single.warnings.join('\nWarning: ')}` : '';
        return {
          content: [{ type: 'text' as const, text: `Task ${taskIds[0]} updated successfully${warned}` }],
          structuredContent: output,
        };
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
        isError: failureCount > 0 && successCount === 0,
      };
    }
  ));
}
