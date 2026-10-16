import type { McpServer } from "@modelcontextprotocol/server";
import { z } from 'zod';
import { mcpErrorFrom, mcpResult, requireV2 } from '../helpers';
import { discussText } from '../prompts';
import { discussOutputSchema } from '../schemas';

/**
 * `discuss` (task-79): the discuss prompt's text as a tool, for a client that
 * does not support prompts. Read-only; the rules it returns are the client's
 * to keep.
 */
export function registerDiscussTool(server: McpServer, defaultFile: string): void {
  server.registerTool(
    'discuss',
    {
      title: 'Discuss A Task',
      description: "Start talking a task over with the person, like the discuss prompt: returns what the board says about it (stage, description, subtasks, contract, decisions, latest notes, its branch and worktree and the agent on it now) and the rules to keep while you discuss it: change only this task's description, subtasks and contract, and only with the person's yes; run check before recording a decision; note what was agreed; write no code and hand nothing off. Read-only.",
      inputSchema: z.object({
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        taskId: z.string().describe('The task to discuss, e.g. task-12'),
      }),
      outputSchema: discussOutputSchema,
    },
    async ({ file, taskId }) => {
      const filePath = file || defaultFile;
      const guard = requireV2(filePath);
      if (guard) return guard;
      try {
        const text = await discussText(filePath, taskId);
        return mcpResult(text, { task: taskId, text });
      } catch (e) {
        return mcpErrorFrom(e);
      }
    },
  );
}
