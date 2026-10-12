import type { McpServer } from "@modelcontextprotocol/server";
import { z } from 'zod';
import { readBriefState, writeBriefState } from '@brainfile/core';
import { composeBrief } from '@brainfile/core/memory';
import { getV2Dirs } from '../../utils/v2-detect';
import { requireV2, resolveBrainfile } from '../helpers';
import { briefOutputSchema } from '../schemas';
import { syncBoard } from '../../utils/board-sync';
import * as path from 'path';

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
        'Get a per-agent brief. text is a budgeted block (maxChars, default 1600) for a session start: '
        + 'heads up (work resting on a superseded decision, decisions whose predicates broke), current decisions, '
        + 'your tasks (or the work in flight), what changed since this agent last checked in, and the docs that bear on them. '
        + 'sections holds the same lanes as data; lanes holds the checkpoint view (first call: full orientation; later: only what is new).',
      inputSchema: z.object({
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        agent: z.string().describe('Agent identifier (required — brief state is per-agent)'),
        peek: z.boolean().optional().describe('Read the brief without marking it as seen'),
        offline: z.boolean().optional().describe('Skip syncing a shared board before the brief'),
        maxChars: z.number().int().min(0).optional().describe('Character budget for text (default 1600; 0 for no limit)'),
      }),
      outputSchema: briefOutputSchema,
    },
    async ({ file, agent, peek, offline, maxChars }) => {
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
      if (!offline) syncBoard(path.dirname(resolvedPath));

      const dirs = getV2Dirs(resolvedPath);
      const isPeek = peek === true;

      const state = readBriefState(resolvedPath, agentName);
      const result = composeBrief(dirs, agentName, {
        lastBriefAt: state.lastBriefAt,
        ...(maxChars !== undefined ? { maxChars } : {}),
      });

      if (!isPeek) {
        writeBriefState(resolvedPath, agentName, result.generatedAt);
      }

      const { docsMode: _docsMode, ...rest } = result;
      const output = { ...rest, peek: isPeek };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );
}
