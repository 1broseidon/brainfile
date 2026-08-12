import type { McpServer } from "@modelcontextprotocol/server";
import { z } from 'zod';
import { buildBrief, readBriefState, writeBriefState } from '@brainfile/core';
import { getV2Dirs } from '../../utils/v2-detect';
import { requireV2, resolveBrainfile } from '../helpers';
import { briefOutputSchema } from '../schemas';

/**
 * `brief` — "what changed that I should care about?" for one agent.
 *
 * The first call for an agent returns a full orientation; later calls return a
 * delta against that agent's stored checkpoint in `.brainfile/state/`. `peek`
 * reads without advancing the checkpoint, so a client can inspect pending work
 * without consuming it.
 *
 * Note that `buildBrief` itself is read-only — advancing the checkpoint is this
 * handler's decision, which is what makes `peek` a no-op on the write step.
 */
export function registerBriefTool(server: McpServer, defaultFile: string): void {
  server.registerTool(
    'brief',
    {
      title: 'Agent Brief',
      description:
        'Get a per-agent brief: what changed on the board since this agent last checked in. '
        + 'First call returns a full orientation; later calls return only what is new.',
      inputSchema: z.object({
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        agent: z.string().describe('Agent identifier (required — brief state is per-agent)'),
        peek: z.boolean().optional().describe('Read the brief without marking it as seen'),
      }),
      outputSchema: briefOutputSchema,
    },
    async ({ file, agent, peek }) => {
      const filePath = file || defaultFile;

      const guard = requireV2(filePath);
      if (guard) return guard;

      const agentName = agent?.trim();
      if (!agentName) {
        return {
          content: [{ type: 'text' as const, text: 'Error: agent is required' }],
          isError: true as const,
        };
      }

      const resolvedPath = resolveBrainfile(filePath);
      const dirs = getV2Dirs(resolvedPath);
      const isPeek = peek === true;

      const state = readBriefState(resolvedPath, agentName);
      const result = buildBrief(dirs, agentName, { lastBriefAt: state.lastBriefAt });

      if (!isPeek) {
        writeBriefState(resolvedPath, agentName, result.generatedAt);
      }

      const output = { ...result, peek: isPeek };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );
}
