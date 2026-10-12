import type { McpServer } from "@modelcontextprotocol/server";
import * as path from 'path';
import { z } from 'zod';
import { describeRelatedBoard, relatedBoards } from '@brainfile/core/repo';
import { buildBoardFromV2 } from '../../utils/v2-detect';
import { requireV2 } from '../helpers';
import { listTasksOutputSchema } from '../schemas';

export function registerListTasksTool(server: McpServer, defaultFile: string): void {
  server.registerTool(
    'list_tasks',
    {
      title: 'List Tasks',
      description: 'List all board documents (tasks, epics, specs, adrs, plans), optionally filtered by column, tag, or type. Use type:"plan" to list plan documents.',
      inputSchema: z.object({
              file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
              column: z.string().optional().describe('Filter by column ID or name'),
              tag: z.string().optional().describe('Filter by tag'),
              type: z.string().optional().describe('Filter by document type (e.g., epic, adr, plan). Only returns tasks matching this type.'),
              related: z.union([z.boolean(), z.literal('all')]).optional().describe('Also list open tasks on related boards (related: in brainfile.md): true for the ones this board\'s tasks depend on, "all" for every open task there. Reference them as alias:task-id.'),
            }),
      outputSchema: listTasksOutputSchema
    },
    async ({ file, column, tag, type: filterType, related }) => {
      const filePath = file || defaultFile;

      const guard = requireV2(filePath);
      if (guard) return guard;

      const board = buildBoardFromV2(filePath);
      const tasks: Array<{ id: string; title: string; column: string; priority?: string; tags?: string[]; assignee?: string }> = [];
      for (const col of board.columns) {
        if (column) {
          const matchesId = col.id === column;
          const matchesName = col.title.toLowerCase() === column.toLowerCase();
          if (!matchesId && !matchesName) continue;
        }
        for (const task of col.tasks) {
          if (tag && (!task.tags || !task.tags.includes(tag))) continue;
          if (filterType) {
            const taskType = task.type || 'task';
            if (taskType !== filterType) continue;
          }
          tasks.push({ id: task.id, title: task.title, column: col.id, priority: task.priority, tags: task.tags, assignee: task.assignee });
        }
      }
      const output = {
        tasks,
        count: tasks.length,
        ...(related ? { related: listRelated(filePath, related === 'all' ? 'all' : 'depends') } : {}),
      };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );
}

function listRelated(filePath: string, mode: 'depends' | 'all') {
  return relatedBoards(path.resolve(filePath)).openTasks(mode).map(({ board, tasks, notFound, neededBy }) => ({
    alias: board.alias,
    path: board.path,
    status: board.status,
    note: describeRelatedBoard(board),
    ...(board.status === 'found' && board.title ? { title: board.title } : {}),
    tasks: tasks.map((task) => ({
      ref: `${board.alias}:${task.id}`,
      id: task.id,
      title: task.title,
      column: task.column ?? 'todo',
      priority: task.priority,
      tags: task.tags,
      assignee: task.assignee,
      ...(neededBy[task.id] ? { neededBy: neededBy[task.id] } : {}),
    })),
    notFound,
    neededBy,
  }));
}
