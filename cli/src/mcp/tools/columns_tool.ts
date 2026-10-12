import type { McpServer } from "@modelcontextprotocol/server";
import { z } from 'zod';
import {
  addColumnFile,
  listColumnsFile,
  removeColumnFile,
  renameColumnFile,
  reorderColumnsFile,
  type ColumnsFileResult,
} from '@brainfile/core';
import { mcpError, mcpResult, requireV2, resolveBrainfile, withBoardCommit } from '../helpers';
import { columnsOutputSchema } from '../schemas';

type ColumnsAction = 'list' | 'add' | 'rename' | 'reorder' | 'remove';

function headline(action: ColumnsAction, result: ColumnsFileResult): string {
  const column = result.column;
  switch (action) {
    case 'add': return `Added column ${column!.id} (${column!.title})`;
    case 'rename': return `Renamed column ${column!.id} to ${column!.title}`;
    case 'reorder': return 'Columns reordered';
    case 'remove': {
      const moved = result.moved && result.moved.length > 0 && result.movedTo
        ? `; moved ${result.moved.join(', ')} to ${result.movedTo.id}`
        : '';
      return `Removed column ${column!.id}${moved}`;
    }
    default: return 'Columns';
  }
}

/**
 * `columns`: the board's columns, like `brainfile columns`. The same core
 * operations write the config; one board commit per change.
 */
export function registerColumnsTool(server: McpServer, defaultFile: string): void {
  server.registerTool(
    'columns',
    {
      title: 'Columns',
      description: 'The board\'s columns. action=list (in order, with task counts), add (title; id defaults from the title; after or before another column; completion for a column whose tasks are done), rename (column, title: the ID stays, so its tasks stay), reorder (order: the columns named come first, the rest after), remove (column; one that holds tasks is refused unless moveTo names the column they go to, where they land uncompleted; the last column is never removed). Columns are named by ID or title.',
      inputSchema: z.object({
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        action: z.enum(['list', 'add', 'rename', 'reorder', 'remove']).optional().describe('Default list'),
        column: z.string().optional().describe('rename, remove: the column (ID or title)'),
        title: z.string().optional().describe('add, rename: the title'),
        id: z.string().optional().describe('add: the column ID (default: from the title, "In Review" → in-review)'),
        after: z.string().optional().describe('add: place it after this column'),
        before: z.string().optional().describe('add: place it before this column'),
        completion: z.boolean().optional().describe('add: tasks moved into it are completed (completionColumn)'),
        order: z.array(z.string()).optional().describe('reorder: columns in their new order (the rest follow)'),
        moveTo: z.string().optional().describe('remove: move the column\'s tasks here first'),
      }),
      outputSchema: columnsOutputSchema,
    },
    withBoardCommit('columns', defaultFile, async (input) => {
      const filePath = input.file || defaultFile;
      const guard = requireV2(filePath);
      if (guard) return guard;
      const resolved = resolveBrainfile(filePath);
      const action: ColumnsAction = input.action ?? 'list';

      let result: ColumnsFileResult;
      switch (action) {
        case 'add':
          if (!input.title?.trim()) return mcpError('add needs a title');
          result = addColumnFile(resolved, {
            title: input.title,
            ...(input.id ? { id: input.id } : {}),
            ...(input.after ? { after: input.after } : {}),
            ...(input.before ? { before: input.before } : {}),
            ...(input.completion ? { completionColumn: true } : {}),
          });
          break;
        case 'rename':
          if (!input.column?.trim() || !input.title?.trim()) return mcpError('rename needs a column and a title');
          result = renameColumnFile(resolved, input.column, input.title);
          break;
        case 'reorder':
          if (!input.order || input.order.length === 0) return mcpError('reorder needs order: the columns in their new order');
          result = reorderColumnsFile(resolved, input.order);
          break;
        case 'remove':
          if (!input.column?.trim()) return mcpError('remove needs a column');
          result = removeColumnFile(resolved, input.column, input.moveTo ? { moveTo: input.moveTo } : {});
          break;
        default:
          result = listColumnsFile(resolved);
      }

      if (!result.success || !result.columns) return mcpError(result.error ?? 'the columns were not changed');
      const output = {
        action,
        columns: result.columns,
        ...(result.column ? { column: result.column } : {}),
        ...(result.moved ? { moved: result.moved } : {}),
        ...(result.movedTo ? { movedTo: result.movedTo } : {}),
      };
      return mcpResult(`${headline(action, result)}\n\n${JSON.stringify(output, null, 2)}`, output);
    }),
  );
}
