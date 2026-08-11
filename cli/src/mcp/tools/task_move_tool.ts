import type { McpServer } from "@modelcontextprotocol/server";
import { z } from 'zod';
import * as path from 'path';
import {
  findColumnById,
  findColumnByName,
  findTaskById,
  moveTask,
  moveTasks,
  readTasksDir,
  readTaskFile as coreReadTaskFile,
  writeTaskFile as coreWriteTaskFile,
  completeTaskFile as coreCompleteTaskFile,
  taskFileName,
} from '@brainfile/core';
import {
  isV2,
  getV2Dirs,
  readV2BoardConfig,
} from '../../utils/v2-detect';
import { validateColumn } from '../../utils/strict-validation';
import { mcpCheckIncompleteSubtasks } from '../../utils/errorHandler';
import {
  readBoard,
  writeBoard,
  mcpStructuredError,
  isTaskCompletable,
} from '../helpers';

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
            })
    },
    async ({ file, taskId, task, column }) => {
      const filePath = file || defaultFile;
      const rawTaskIds = taskId ?? task;
      if (!rawTaskIds) {
        return { content: [{ type: 'text' as const, text: 'Error: taskId is required' }], isError: true };
      }
      const taskIds = Array.isArray(rawTaskIds) ? rawTaskIds : [rawTaskIds];
      const isBatch = taskIds.length > 1;

      // V2: update task file
      if (isV2(filePath)) {
        const dirs = getV2Dirs(filePath);
        const board = readV2BoardConfig(filePath);
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
        const resolvedTargetColumn = targetColumn || { id: column, title: column, tasks: [] };
        let nextPosition = readTasksDir(dirs.boardDir).filter(t => t.task.column === resolvedTargetColumn.id).length;
        const results: Array<{ taskId: string; success: boolean; message?: string; warning?: string; error?: string }> = [];

        for (const id of taskIds) {
          const taskPath = path.join(dirs.boardDir, taskFileName(id));
          const doc = coreReadTaskFile(taskPath);
          if (!doc) {
            results.push({ taskId: id, success: false, error: `Task not found: ${id}` });
            continue;
          }

          const sourceColumn = doc.task.column || '';
          doc.task.column = resolvedTargetColumn.id;
          doc.task.position = nextPosition++;
          doc.task.updatedAt = new Date().toISOString();
          coreWriteTaskFile(taskPath, doc.task, doc.body);

          const shouldAutoComplete =
            resolvedTargetColumn.completionColumn === true &&
            isTaskCompletable(doc.task.type, (board as unknown as Record<string, unknown>).types);
          if (shouldAutoComplete) {
            const completeResult = coreCompleteTaskFile(taskPath, dirs.logsDir);
            if (!completeResult.success) {
              results.push({ taskId: id, success: false, error: completeResult.error || `Failed to complete task: ${id}` });
              continue;
            }
          }

          const warning = mcpCheckIncompleteSubtasks(doc.task, resolvedTargetColumn);
          let message = `Task ${id} moved from "${sourceColumn}" to "${resolvedTargetColumn.title}"`;
          if (shouldAutoComplete) {
            message += '\nTask auto-completed and moved to logs/.';
          }
          results.push({ taskId: id, success: true, message, warning: warning?.warning });
        }

        if (!isBatch) {
          const single = results[0];
          if (!single?.success) {
            return { content: [{ type: 'text' as const, text: `Error: ${single?.error || 'Move failed'}` }], isError: true };
          }
          let text = single.message || `Task ${taskIds[0]} moved`;
          if (single.warning) text += `\n\n${single.warning}`;
          return { content: [{ type: 'text' as const, text }] };
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

      const { board } = result;

      let targetColumn = findColumnById(board, column);
      if (!targetColumn) {
        targetColumn = findColumnByName(board, column);
      }

      if (!targetColumn) {
        return { content: [{ type: 'text' as const, text: `Error: Column not found: ${column}` }], isError: true };
      }

      if (!isBatch) {
        const id = taskIds[0];
        const taskInfo = findTaskById(board, id);
        if (!taskInfo) {
          return { content: [{ type: 'text' as const, text: `Error: Task not found: ${id}` }], isError: true };
        }

        const moveResult = moveTask(board, id, taskInfo.column.id, targetColumn.id, targetColumn.tasks.length);
        if (!moveResult.success) {
          return { content: [{ type: 'text' as const, text: `Error: ${moveResult.error}` }], isError: true };
        }
        writeBoard(filePath, moveResult.board!);

        const warning = mcpCheckIncompleteSubtasks(taskInfo.task, targetColumn);
        let message = `Task ${id} moved from "${taskInfo.column.title}" to "${targetColumn.title}"`;
        if (warning) message += `\n\n${warning.warning}`;
        return { content: [{ type: 'text' as const, text: message }] };
      }

      const tasksWithIncomplete: Array<{ id: string; incomplete: number; total: number }> = [];
      for (const id of taskIds) {
        const taskInfo = findTaskById(board, id);
        if (taskInfo) {
          const warning = mcpCheckIncompleteSubtasks(taskInfo.task, targetColumn);
          if (warning?.incompleteSubtasks) {
            tasksWithIncomplete.push({
              id,
              incomplete: warning.incompleteSubtasks.incomplete.length,
              total: warning.incompleteSubtasks.total,
            });
          }
        }
      }

      const bulkResult = moveTasks(board, taskIds, targetColumn.id);
      if (bulkResult.board) {
        writeBoard(filePath, bulkResult.board);
      }

      const output: Record<string, unknown> = {
        success: bulkResult.success,
        successCount: bulkResult.successCount,
        failureCount: bulkResult.failureCount,
        results: bulkResult.results,
      };
      if (tasksWithIncomplete.length > 0) {
        output.warning = `${tasksWithIncomplete.length} task(s) moved to "${targetColumn.title}" have incomplete subtasks`;
        output.tasksWithIncompleteSubtasks = tasksWithIncomplete;
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
        isError: !bulkResult.success,
      };
    }
  );
}
