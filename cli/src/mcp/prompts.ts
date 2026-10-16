import type { McpServer } from "@modelcontextprotocol/server";
import { z } from 'zod';
import { discussContext, discussSession, discussWork } from '@brainfile/core/dispatch';
import { placeOf, withRunner } from '../commands/dispatch';
import { resolveBrainfile } from './helpers';

/**
 * A discussion of one task (decision-19), as `brainfile mcp`'s discuss prompt
 * and tool give it: the `<task-information>` block, with its branch,
 * worktree and the agent on it now as `<work>`, then the rules, from core.
 * The live run comes from a runner, which reads every runner's run files on
 * this machine.
 */
export async function discussText(filePath: string, taskId: string): Promise<string> {
  const place = placeOf(resolveBrainfile(filePath));
  const ctx = discussContext(place.filePath, taskId);
  const work = await withRunner('cli', (runner) => discussWork(place.projectId, taskId, runner));
  return discussSession({ ...ctx, work });
}

/**
 * The MCP prompts `brainfile mcp` serves. `discuss` (task-79): any MCP client
 * is already a chat, so talking a task over is a prompt that hands it the
 * task and the rules. The client keeps to them itself: a server cannot refuse
 * its client's own edits.
 */
export function registerPrompts(server: McpServer, defaultFile: string): void {
  server.registerPrompt(
    'discuss',
    {
      title: 'Discuss A Task',
      description: "Talk one task over: what the board says about it (stage, description, subtasks, contract, decisions, latest notes, its branch and worktree and the agent on it now) and the rules of a discussion: change only this task's description, subtasks and contract, with the person's yes; run check before recording a decision; note what was agreed; write no code.",
      argsSchema: z.object({
        taskId: z.string().describe('The task to discuss, e.g. task-12'),
      }),
    },
    async ({ taskId }) => ({
      description: `Discuss ${taskId}`,
      messages: [{ role: 'user' as const, content: { type: 'text' as const, text: await discussText(defaultFile, taskId) } }],
    }),
  );
}
