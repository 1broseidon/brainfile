import type { McpServer } from "@modelcontextprotocol/server";
import { z } from 'zod';
import { agentsReport, agentsText } from '../../commands/dispatch';
import { mcpErrorFrom, mcpResult } from '../helpers';
import { agentsOutputSchema } from '../schemas';

/**
 * `agents` (task-81), like `brainfile agents`: the coding agents a task can
 * be handed to, which are installed on this machine, and the models each
 * offered when last started. Read-only; no board.
 */
export function registerAgentsTool(server: McpServer): void {
  server.registerTool(
    'agents',
    {
      title: 'Coding Agents',
      description: "The coding agents a task can be handed to (dispatch's agent): the ones Brainfile knows and the person's own, whether each is installed on this machine, and the models it offered when last started (empty until then). Read-only.",
      inputSchema: z.object({}),
      outputSchema: agentsOutputSchema,
    },
    async () => {
      try {
        const report = agentsReport();
        return mcpResult(agentsText(report), { ...report });
      } catch (e) {
        return mcpErrorFrom(e);
      }
    },
  );
}
