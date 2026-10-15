import type { McpServer } from "@modelcontextprotocol/server";
import { withBoardCommit } from '../helpers';
import { z } from 'zod';
import { addTaskFile, checkDocumentLinks, readBoardGraph, readTasksDir, resolveDocType, sourceKey, sourcesOf } from '@brainfile/core';
import {
  ensureV2Dirs,
  composeBody,
} from '../../utils/v2-detect';
import { buildContract } from '@brainfile/core';
import { validateType } from '@brainfile/core';
import { requireV2, mcpStructuredError } from '../helpers';
import { taskAddOutputSchema } from '../schemas';

export function registerTaskAddTool(server: McpServer, defaultFile: string): void {
  server.registerTool(
    'task_add',
    {
      title: 'Add Task',
      description: 'Add a board document. Types: epic, spec, plan, task (alias issue) and decision (alias adr) are built in, plus the board\'s own. parentId must fit (epic holds spec, plan, task; spec holds plan, task; plan holds task; task holds task); an off-pattern parent is a warning, refused on a strict board. A decision has no column. decisions: lists the decisions a piece of work rests on.',
      inputSchema: z.object({
              file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
              column: z.string().optional().describe('Column ID or name to add the document to. Required for work; ignored for a decision, which has no column'),
              title: z.string().describe('Task title'),
              description: z.string().optional().describe('Task description'),
              priority: z.enum(['low', 'medium', 'high', 'critical']).optional().describe('Task priority'),
              tags: z.array(z.string()).optional().describe('Task tags'),
              assignee: z.string().optional().describe('Task assignee'),
              dueDate: z.string().optional().describe('Due date (YYYY-MM-DD)'),
              subtasks: z.array(z.string()).optional().describe('Subtask titles (IDs auto-generated)'),
              relatedFiles: z.array(z.string()).optional().describe('Related file paths'),
              type: z.string().optional().describe('Document type: epic, spec, plan, task (alias issue), decision (alias adr) or one of the board\'s types. Aliases are written canonically. Determines ID prefix. Default: task'),
              status: z.string().optional().describe('Free-form status, e.g. draft/active/superseded for plan documents'),
              // Contract creation (optional)
              with_contract: z.boolean().optional().describe('Attach a contract to the new task (default status=draft; use ready:true to make immediately dispatchable)'),
              ready: z.boolean().optional().describe('When true, contract status is set to ready instead of draft'),
              deliverables: z.array(z.string()).optional().describe('Contract deliverables: type:path:description'),
              validation_commands: z.array(z.string()).optional().describe('Contract validation commands'),
              constraints: z.array(z.string()).optional().describe('Contract constraints'),
              parentId: z.string().optional().describe('Parent ID (parentId). Must fit the type: a spec under an epic, a plan under an epic or spec, a task under any of those or a task'),
              dependsOn: z.array(z.string()).optional().describe('IDs of tasks that come first; alias:task-id for a task on a related board'),
              decisions: z.array(z.string()).optional().describe('IDs of the decisions this work rests on'),
              source: z.string().optional().describe('URL of the issue the task is made from, kept as source:; refused when a task already carries it (the issues tool imports one for you)'),
              // Aliases (some clients prefer camelCase)
              withContract: z.boolean().optional().describe('Alias of with_contract'),
              validationCommands: z.array(z.string()).optional().describe('Alias of validation_commands'),
            }),
      outputSchema: taskAddOutputSchema
    },
    withBoardCommit('task_add', defaultFile, async ({
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
      status,
      parentId,
      dependsOn,
      decisions,
      source: rawSource,
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
        const boardGraph = readBoardGraph(filePath);
        const board = boardGraph.config;
        if (!board) {
          return { content: [{ type: 'text' as const, text: `Error: Failed to parse brainfile: ${filePath}` }], isError: true };
        }
        const typePrefix = docType || 'task';
        const typeValidation = validateType(board, typePrefix);
        if (!typeValidation.valid) {
          return mcpStructuredError(
            typeValidation.error || `Invalid type: ${typePrefix}`,
            'type',
            typePrefix
          );
        }
        const isDecision = resolveDocType(typePrefix, board.types).role === 'decision';

        // A decision has no column (spec-12); work needs one.
        let targetColumn = isDecision || !column ? undefined : board.columns.find(c => c.id === column);
        if (!isDecision && column && !targetColumn) targetColumn = board.columns.find(c => c.title.toLowerCase() === column.toLowerCase());
        if (!isDecision && !targetColumn) {
          const available = board.columns.map(c => `${c.id} (${c.title})`).join(', ');
          const message = column ? `Column not found: ${column}` : 'column is required for work (only a decision has none)';
          return { content: [{ type: 'text' as const, text: `Error: ${message}. Available: ${available}` }], isError: true };
        }

        const links = checkDocumentLinks(boardGraph.graph, {
          type: typePrefix,
          ...(parentId && { parentId }),
          ...(dependsOn && dependsOn.length > 0 && { dependsOn }),
          ...(decisions && decisions.length > 0 && { decisions }),
        }, { strict: board.strict === true });
        if (links.errors.length > 0) {
          return { content: [{ type: 'text' as const, text: `Error: ${links.errors.join('\n')}` }], isError: true };
        }

        // An issue becomes one task: the board, open or completed, is asked first (decision-4).
        const source = rawSource?.trim() ? sourceKey(rawSource) : undefined;
        if (source) {
          const taken = sourcesOf([...readTasksDir(dirs.boardDir), ...readTasksDir(dirs.logsDir)])[source];
          if (taken) return { content: [{ type: 'text' as const, text: `Error: That issue is already ${taken}.` }], isError: true };
        }

        const wantsContract =
          Boolean(with_contract ?? withContract) ||
          Boolean(deliverables && deliverables.length > 0) ||
          Boolean(validation_commands && validation_commands.length > 0) ||
          Boolean(validationCommands && validationCommands.length > 0) ||
          Boolean(constraints && constraints.length > 0);

        const contract = wantsContract
          ? buildContract({
              deliverableSpecs: deliverables,
              validationCommands: validation_commands ?? validationCommands,
              constraints,
              status: contractReady ? 'ready' : 'draft',
            })
          : undefined;

        const result = addTaskFile(
          dirs.boardDir,
          {
            title,
            column: targetColumn?.id,
            ...(docType && { type: docType }),
            description,
            priority,
            tags,
            assignee,
            dueDate,
            relatedFiles,
            subtasks,
            parentId,
            dependsOn,
            decisions,
            status,
            contract,
            source,
          },
          description ? composeBody(description) : '',
          dirs.logsDir,
          { types: board.types },
        );

        if (!result.success || !result.task) {
          return { content: [{ type: 'text' as const, text: `Error: ${result.error || 'Failed to add task'}` }], isError: true };
        }

        const warnings = links.warnings.length > 0 ? `\nWarning: ${links.warnings.join('\nWarning: ')}` : '';
        return {
          content: [{ type: 'text' as const, text: `Task added successfully: ${result.task.id} - ${title}${warnings}` }],
          structuredContent: {
            id: result.task.id,
            title,
            ...(result.task.type ? { type: result.task.type } : {}),
            ...(links.warnings.length > 0 ? { warnings: links.warnings } : {}),
          },
        };
      } catch (e) {
        return { content: [{ type: 'text' as const, text: `Error: ${(e as Error).message}` }], isError: true };
      }
    }
  ));
}
