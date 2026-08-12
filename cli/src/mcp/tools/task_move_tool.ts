import type { McpServer } from "@modelcontextprotocol/server";
import { z } from 'zod';
import { findTask, moveTaskFileToColumn } from '@brainfile/core';
import {
  getV2Dirs,
} from '../../utils/v2-detect';
import { validateColumn, readBoardConfig, type ColumnConfig } from '@brainfile/core';
import { mcpCheckIncompleteSubtasks } from '../../utils/errorHandler';
import {
  requireV2,
  mcpStructuredError,
} from '../helpers';
import { taskMoveOutputSchema } from '../schemas';

export function registerTaskMoveTool(server: McpServer, defaultFile: string): void {
  server.registerTool(
    'task_move',
    {
      title: 'Move Task',
      description: 'Move a task to a different column',
      inputSchema: z.object({
              file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
              taskId: z.union([z.string(), z.array(z.string())]).optional().describe('Task ID or array of task IDs to move'),
              task: z.string().optional().describe('Alias of taskId for single task move'),
              column: z.string().describe('Target column ID or name')
            }),
      outputSchema: taskMoveOutputSchema
    },
    async ({ file, taskId, task, column }) => {
      const filePath = file || defaultFile;
      const rawTaskIds = taskId ?? task;
      if (!rawTaskIds) {
        return { content: [{ type: 'text' as const, text: 'Error: taskId is required' }], isError: true };
      }
      const taskIds = Array.isArray(rawTaskIds) ? rawTaskIds : [rawTaskIds];
      const isBatch = taskIds.length > 1;

      const guard = requireV2(filePath);
      if (guard) return guard;

      const dirs = getV2Dirs(filePath);
      const boardFile = readBoardConfig(filePath);
      if (!boardFile) {
        return { content: [{ type: 'text' as const, text: `Error: Failed to parse brainfile: ${filePath}` }], isError: true };
      }
      const board = boardFile.config;
      let targetColumn = board.columns.find(c => c.id === column);
      if (!targetColumn) targetColumn = board.columns.find(c => c.title.toLowerCase() === column.toLowerCase());
      const targetColumnId = targetColumn?.id || column;
      const columnValidation = validateColumn(board, targetColumnId);
      if (!columnValidation.valid) {
        return mcpStructuredError(
          columnValidation.error || `Invalid column: ${targetColumnId}`,
          'column',
          targetColumnId
        );
      }
      const resolvedTargetColumn: ColumnConfig = targetColumn || { id: column, title: column };
      const results: Array<{ taskId: string; success: boolean; message?: string; warning?: string; error?: string }> = [];

      for (const id of taskIds) {
        const before = findTask(dirs.boardDir, id);
        const sourceColumn = before?.task.column || '';

        const result = moveTaskFileToColumn(dirs, board, id, column);
        if (!result.success || !result.task) {
          results.push({ taskId: id, success: false, error: result.error || `Failed to move task: ${id}` });
          continue;
        }

        const warning = mcpCheckIncompleteSubtasks(result.task, resolvedTargetColumn);
        let message = `Task ${id} moved from "${sourceColumn}" to "${resolvedTargetColumn.title}"`;
        if (result.autoCompleted) {
          message += '\nTask auto-completed and moved to logs/.';
        }
        results.push({ taskId: id, success: true, message, warning: warning?.warning });
      }

      const successCount = results.filter(r => r.success).length;
      const failureCount = results.length - successCount;
      // The structured payload is always the batch shape, so agents parse one
      // shape whether they moved one task or ten. Only the text branches.
      const output = { success: failureCount === 0, successCount, failureCount, results };

      if (!isBatch) {
        const single = results[0];
        if (!single?.success) {
          return {
            content: [{ type: 'text' as const, text: `Error: ${single?.error || 'Move failed'}` }],
            structuredContent: output,
            isError: true,
          };
        }
        let text = single.message || `Task ${taskIds[0]} moved`;
        if (single.warning) text += `\n\n${single.warning}`;
        return { content: [{ type: 'text' as const, text }], structuredContent: output };
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
        isError: failureCount > 0 && successCount === 0,
      };
    }
  );
}
