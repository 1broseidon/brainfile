import type { McpServer } from "@modelcontextprotocol/server";
import { z } from 'zod';
import { reopenTask } from '../../commands/restore';
import { mcpErrorFrom, mcpResult, requireV2, resolveBrainfile, withBoardCommit } from '../helpers';
import { taskRestoreOutputSchema } from '../schemas';

/**
 * `task_restore`: a completed task back on the board, as the CLI's
 * `restore` does on a v2 board: from logs/ to a column, out of the ledger,
 * with a note in its log saying so.
 */
export function registerTaskRestoreTool(server: McpServer, defaultFile: string): void {
  server.registerTool(
    'task_restore',
    {
      title: 'Restore Task',
      description: 'Reopen a completed task: it moves from logs/ back to a column, open again, and leaves the ledger; its log says it was reopened, and why. For work completed too soon. A decision is not reopened (supersede or decide instead).',
      inputSchema: z.object({
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        task: z.string().describe('ID of the completed task'),
        column: z.string().describe('Column ID or title to put it in'),
        reason: z.string().optional().describe('Why it is open again, for its log'),
        agent: z.string().optional().describe('Who reopened it (default: the detected agent, else the git user)'),
      }),
      outputSchema: taskRestoreOutputSchema,
    },
    withBoardCommit('task_restore', defaultFile, async ({ file, task, column, reason, agent }) => {
      const filePath = file || defaultFile;
      const guard = requireV2(filePath);
      if (guard) return guard;
      try {
        const reopened = reopenTask(resolveBrainfile(filePath), task, column, { agent, reason });
        return mcpResult(`Task ${task} reopened into ${reopened.column}`, { id: task, column: reopened.task.column ?? column });
      } catch (error) {
        return mcpErrorFrom(error);
      }
    }),
  );
}
