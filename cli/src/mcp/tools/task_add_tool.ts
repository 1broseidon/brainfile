import type { McpServer } from "@modelcontextprotocol/server";
import { z } from 'zod';
import * as path from 'path';
import {
  generateNextFileTaskId,
  readTasksDir,
  writeTaskFile as coreWriteTaskFile,
  taskFileName,
} from '@brainfile/core';
import {
  ensureV2Dirs,
  composeBody,
} from '../../utils/v2-detect';
import { buildContract } from '../../utils/contractSpec';
import { validateType, readBoardConfig } from '@brainfile/core';
import { requireV2, mcpStructuredError } from '../helpers';

export function registerTaskAddTool(server: McpServer, defaultFile: string): void {
  server.registerTool(
    'task_add',
    {
      title: 'Add Task',
      description: 'Add a new task to a column in the brainfile',
      inputSchema: z.object({
              file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
              column: z.string().describe('Column ID or name to add task to'),
              title: z.string().describe('Task title'),
              description: z.string().optional().describe('Task description'),
              priority: z.enum(['low', 'medium', 'high', 'critical']).optional().describe('Task priority'),
              tags: z.array(z.string()).optional().describe('Task tags'),
              assignee: z.string().optional().describe('Task assignee'),
              dueDate: z.string().optional().describe('Due date (YYYY-MM-DD)'),
              subtasks: z.array(z.string()).optional().describe('Subtask titles (IDs auto-generated)'),
              relatedFiles: z.array(z.string()).optional().describe('Related file paths'),
              type: z.string().optional().describe('Document type (e.g., epic, adr). Determines ID prefix. Default: task'),
              // Contract creation (optional)
              with_contract: z.boolean().optional().describe('Attach a contract to the new task (default status=draft; use ready:true to make immediately dispatchable)'),
              ready: z.boolean().optional().describe('When true, contract status is set to ready instead of draft'),
              deliverables: z.array(z.string()).optional().describe('Contract deliverables: type:path:description'),
              validation_commands: z.array(z.string()).optional().describe('Contract validation commands'),
              constraints: z.array(z.string()).optional().describe('Contract constraints'),
              parentId: z.string().optional().describe('Parent task ID for first-class parent-child linking'),
              // Aliases (some clients prefer camelCase)
              withContract: z.boolean().optional().describe('Alias of with_contract'),
              validationCommands: z.array(z.string()).optional().describe('Alias of validation_commands'),
            })
    },
    async ({
      file,
      column,
      title,
      description,
      priority,
      tags,
      assignee,
      dueDate,
      subtasks,
      relatedFiles,
      type: docType,
      parentId,
      with_contract,
      ready: contractReady,
      deliverables,
      validation_commands,
      constraints,
      withContract,
      validationCommands,
    }) => {
      const filePath = file || defaultFile;

      const guard = requireV2(filePath);
      if (guard) return guard;

      try {
        const dirs = ensureV2Dirs(filePath);
        const boardFile = readBoardConfig(filePath);
        if (!boardFile) {
          return { content: [{ type: 'text' as const, text: `Error: Failed to parse brainfile: ${filePath}` }], isError: true };
        }
        const board = boardFile.config;
        const typePrefix = docType || 'task';
        const typeValidation = validateType(board, typePrefix);
        if (!typeValidation.valid) {
          return mcpStructuredError(
            typeValidation.error || `Invalid type: ${typePrefix}`,
            'type',
            typePrefix
          );
        }

        let targetColumn = board.columns.find(c => c.id === column);
        if (!targetColumn) targetColumn = board.columns.find(c => c.title.toLowerCase() === column.toLowerCase());
        if (!targetColumn) {
          const available = board.columns.map(c => `${c.id} (${c.title})`).join(', ');
          return { content: [{ type: 'text' as const, text: `Error: Column not found: ${column}. Available: ${available}` }], isError: true };
        }

        const taskId = generateNextFileTaskId(dirs.boardDir, dirs.logsDir, typePrefix);
        const existingTasks = readTasksDir(dirs.boardDir).filter(t => t.task.column === targetColumn!.id);
        const position = existingTasks.length;

        const builtSubtasks = subtasks && subtasks.length > 0
          ? subtasks.map((st: string, i: number) => ({ id: `${taskId}-${i + 1}`, title: st.trim(), completed: false }))
          : undefined;

        const task: any = {
          id: taskId,
          title,
          ...(docType && docType !== 'task' && { type: docType }),
          column: targetColumn.id,
          position,
          ...(description && { description }),
          ...(priority && { priority }),
          ...(tags && tags.length > 0 && { tags }),
          ...(assignee && { assignee }),
          ...(dueDate && { dueDate }),
          ...(relatedFiles && relatedFiles.length > 0 && { relatedFiles }),
          ...(builtSubtasks && { subtasks: builtSubtasks }),
          ...(parentId && { parentId }),
          createdAt: new Date().toISOString(),
        };

        const wantsContract =
          Boolean(with_contract ?? withContract) ||
          Boolean(deliverables && deliverables.length > 0) ||
          Boolean(validation_commands && validation_commands.length > 0) ||
          Boolean(validationCommands && validationCommands.length > 0) ||
          Boolean(constraints && constraints.length > 0);

        if (wantsContract) {
          const contract = buildContract({
            deliverableSpecs: deliverables,
            validationCommands: validation_commands ?? validationCommands,
            constraints,
            status: contractReady ? 'ready' : 'draft',
          });
          task.contract = contract;
        }

        const taskPath = path.join(dirs.boardDir, taskFileName(taskId));
        const body = description ? composeBody(description) : '';
        coreWriteTaskFile(taskPath, task, body);

        return { content: [{ type: 'text' as const, text: `Task added successfully: ${taskId} - ${title}` }] };
      } catch (e) {
        return { content: [{ type: 'text' as const, text: `Error: ${(e as Error).message}` }], isError: true };
      }
    }
  );
}
