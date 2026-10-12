import type { McpServer } from "@modelcontextprotocol/server";
import * as path from 'path';
import { z } from 'zod';
import { isQualifiedRef } from '@brainfile/core';
import { relatedBoards } from '@brainfile/core/repo';
import { getV2Dirs, findV2Task, extractDescription } from '../../utils/v2-detect';
import { resolveRelatedTask } from '../../utils/related';
import { requireV2 } from '../helpers';
import { getTaskOutputSchema } from '../schemas';

export function registerGetTaskTool(server: McpServer, defaultFile: string): void {
  server.registerTool(
    'get_task',
    {
      title: 'Get Task',
      description: 'Get detailed information about a specific task by ID. A task on a related board (related: in brainfile.md) is alias:task-id; it is read-only from here.',
      inputSchema: z.object({
              file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
              task: z.string().describe('Task ID to retrieve, or alias:task-id for a task on a related board')
            }),
      outputSchema: getTaskOutputSchema
    },
    async ({ file, task }) => {
      const filePath = file || defaultFile;

      const guard = requireV2(filePath);
      if (guard) return guard;

      let boardFile = path.resolve(filePath);
      let taskId = task;
      let alias: string | undefined;
      if (isQualifiedRef(task)) {
        const target = resolveRelatedTask(boardFile, task);
        if (!target.ok) {
          const details = target.details ? `\n${target.details}` : '';
          return { content: [{ type: 'text' as const, text: `Error: ${target.message}${details}` }], isError: true };
        }
        boardFile = target.board.brainfilePath;
        taskId = target.id;
        alias = target.board.alias;
      }

      const dirs = getV2Dirs(boardFile);
      const found = findV2Task(dirs, taskId, true);
      if (!found) {
        return { content: [{ type: 'text' as const, text: `Error: Task not found: ${task}` }], isError: true };
      }
      const { doc, isLog } = found;
      const description = extractDescription(doc.body);
      const hasDeps = Array.isArray(doc.task.dependsOn) && doc.task.dependsOn.length > 0;
      const rel = hasDeps ? relatedBoards(boardFile) : null;
      const output = {
        ...doc.task,
        ...(description && !doc.task.description && { description }),
        column: isLog ? 'Completed' : (doc.task.column || 'unknown'),
        ...(isLog && { archived: true }),
        ...(alias && { board: alias, ref: `${alias}:${doc.task.id}` }),
        ...(rel && {
          dependencies: rel.dependencies(doc.task).map((d) => ({ ref: d.ref, state: d.state, done: d.done })),
          blocked: !isLog && rel.blockers(doc.task).length > 0,
        }),
      };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );
}
