import type { McpServer } from "@modelcontextprotocol/server";
import * as path from 'path';
import { z } from 'zod';
import {
  decisionStatus,
  flattenDocTree,
  resolveDocType,
  typesMatch,
  type Task,
  type TypesConfig,
} from '@brainfile/core';
import { describeRelatedBoard, relatedBoards } from '@brainfile/core/repo';
import { buildBoardFromV2 } from '../../utils/v2-detect';
import { readOrderedGraph } from '../../utils/graph';
import { requireV2 } from '../helpers';
import { listTasksOutputSchema } from '../schemas';

type TaskSummary = {
  id: string;
  title: string;
  column: string;
  type?: string;
  parentId?: string;
  status?: string;
  priority?: string;
  tags?: string[];
  assignee?: string;
};

export function registerListTasksTool(server: McpServer, defaultFile: string): void {
  server.registerTool(
    'list_tasks',
    {
      title: 'List Tasks',
      description: 'List board documents (epics, specs, plans, tasks and the board\'s own types), optionally filtered by column, tag or type; aliases work (issue is task, adr is decision). Decisions have no column and are left out unless type names them (type:"decision"). tree:true also returns the outline: open work nested by parentId, in reading order with depth.',
      inputSchema: z.object({
              file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
              column: z.string().optional().describe('Filter by column ID or name'),
              tag: z.string().optional().describe('Filter by tag'),
              type: z.string().optional().describe('Filter by document type (e.g. epic, spec, plan, task, decision; aliases issue and adr work). type:"decision" lists decisions, which are otherwise left out.'),
              tree: z.boolean().optional().describe('Also return tree: the containment outline of open work (epic ▸ spec · plan · task), each entry with depth, parentId and children IDs, in reading order.'),
              related: z.union([z.boolean(), z.literal('all')]).optional().describe('Also list open tasks on related boards (related: in brainfile.md): true for the ones this board\'s tasks depend on, "all" for every open task there. Reference them as alias:task-id.'),
            }),
      outputSchema: listTasksOutputSchema
    },
    async ({ file, column, tag, type: filterType, tree, related }) => {
      const filePath = file || defaultFile;

      const guard = requireV2(filePath);
      if (guard) return guard;

      const board = buildBoardFromV2(filePath);
      const types = (board as { types?: TypesConfig }).types;
      const isDecision = (task: Task) => resolveDocType(task.type, types).role === 'decision';
      const summarize = (task: Task, columnId: string): TaskSummary => ({
        id: task.id,
        title: task.title,
        column: columnId,
        ...(task.type ? { type: task.type } : {}),
        ...(typeof task.parentId === 'string' && task.parentId ? { parentId: task.parentId } : {}),
        priority: task.priority,
        tags: task.tags,
        assignee: task.assignee,
      });

      const graph = (tree || (filterType && resolveDocType(filterType, types).role === 'decision'))
        ? readOrderedGraph(filePath, board.columns.map((col) => col.id), types)
        : null;

      const tasks: TaskSummary[] = [];
      if (filterType && resolveDocType(filterType, types).role === 'decision') {
        // Decisions have no column: list them on their own, with where they stand.
        for (const task of graph!.tasks) {
          if (!isDecision(task) || !typesMatch(task.type, filterType)) continue;
          if (tag && (!task.tags || !task.tags.includes(tag))) continue;
          tasks.push({
            // A decision has no column; a legacy ADR may still carry one.
            ...summarize(task, task.column ?? (task.completedAt ? 'completed' : 'none')),
            status: decisionStatus(task as Task & { status?: unknown }),
          });
        }
      } else {
        for (const col of board.columns) {
          if (column) {
            const matchesId = col.id === column;
            const matchesName = col.title.toLowerCase() === column.toLowerCase();
            if (!matchesId && !matchesName) continue;
          }
          for (const task of col.tasks) {
            if (isDecision(task)) continue;
            if (tag && (!task.tags || !task.tags.includes(tag))) continue;
            if (filterType && !typesMatch(task.type, filterType)) continue;
            tasks.push(summarize(task, col.id));
          }
        }
      }

      const outline = tree && graph
        ? flattenDocTree(graph.tree()).map((node) => ({
            id: node.task.id,
            title: node.task.title,
            type: node.type.name,
            column: node.task.column ?? 'todo',
            depth: node.depth,
            ...(typeof node.task.parentId === 'string' && node.task.parentId ? { parentId: node.task.parentId } : {}),
            children: node.children.map((child) => child.task.id),
            ...(node.offPattern ? { offPattern: true } : {}),
            ...(node.detachedFrom ? { detachedFrom: node.detachedFrom.id } : {}),
          }))
        : undefined;

      const output = {
        tasks,
        count: tasks.length,
        ...(outline ? { tree: outline } : {}),
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
