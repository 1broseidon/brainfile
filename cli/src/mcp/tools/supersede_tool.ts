import type { McpServer } from "@modelcontextprotocol/server";
import * as path from 'path';
import { z } from 'zod';
import { readBoardConfig, supersedeDecisionFile } from '@brainfile/core';
import { ensureV2Dirs } from '../../utils/v2-detect';
import { detectAgent } from '../../utils/actor';
import { requireV2, resolveBrainfile, withBoardCommit } from '../helpers';
import { decideOutputSchema } from '../schemas';
import { decideInputFrom, decideToolResult, decisionInputShape } from './decide_tool';

/** `supersede`: replace one decision by hand with a new one in its family. */
export function registerSupersedeTool(server: McpServer, defaultFile: string): void {
  server.registerTool(
    'supersede',
    {
      title: 'Supersede Decision',
      description: 'Replace a decision by hand: a new decision in the same claim family (claimKey and kind default to the old one\'s) and the old one marked superseded, linked both ways and moved to logs/. Refuses a decision that is already superseded, rejected or stale.',
      inputSchema: z.object({
        taskId: z.string().describe('The decision to supersede, e.g. decision-3'),
        claimKey: z.string().optional().describe('Claim family for the new decision (default: the old one\'s)'),
        ...decisionInputShape,
      }),
      outputSchema: decideOutputSchema,
    },
    withBoardCommit('supersede', defaultFile, async (input) => {
      const filePath = input.file || defaultFile;
      const guard = requireV2(filePath);
      if (guard) return guard;
      const resolved = resolveBrainfile(filePath);
      const projectRoot = path.dirname(path.dirname(resolved));
      const agent = detectAgent()?.name;
      const result = supersedeDecisionFile(ensureV2Dirs(resolved), input.taskId, decideInputFrom(input, projectRoot), {
        types: readBoardConfig(resolved)?.config.types,
        ...(agent ? { agent } : {}),
      });
      const out = decideToolResult(result, `Superseded ${input.taskId} with`);
      return 'structuredContent' in out ? { content: out.content, structuredContent: out.structuredContent } : out;
    }),
  );
}
