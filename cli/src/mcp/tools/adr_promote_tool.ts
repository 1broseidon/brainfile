import type { McpServer } from "@modelcontextprotocol/server";
import { z } from 'zod';
import { adrPromoteCommand } from '../../commands/adr';
import { MemoryLogger } from '../../utils/logger';
import { mcpErrorFrom, mcpResult, requireV2, resolveBrainfile, withBoardCommit } from '../helpers';
import { adrPromoteOutputSchema } from '../schemas';

/**
 * `adr_promote`: accept a legacy ADR (`type: adr`, still proposed) and move
 * it to logs/, like `brainfile adr promote`. New decisions use decide.
 */
export function registerAdrPromoteTool(server: McpServer, defaultFile: string): void {
  server.registerTool(
    'adr_promote',
    {
      title: 'Promote ADR',
      description: 'Accept a legacy ADR (a document with type: adr, which counts as a proposed decision) and move it to logs/ with status promoted, where it counts as a current decision in every brief. Only for type: adr documents; record new decisions with decide.',
      inputSchema: z.object({
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        task: z.string().describe('The ADR\'s ID, e.g. adr-3'),
      }),
      outputSchema: adrPromoteOutputSchema,
    },
    withBoardCommit('adr_promote', defaultFile, async ({ file, task }) => {
      const filePath = file || defaultFile;
      const guard = requireV2(filePath);
      if (guard) return guard;
      try {
        const result = adrPromoteCommand({ file: resolveBrainfile(filePath), task }, new MemoryLogger());
        const output = { taskId: result.taskId, title: result.title, status: 'promoted' as const, completedAt: result.completedAt };
        return mcpResult(`Promoted ${result.taskId} (moved to logs/): ${result.title}`, output);
      } catch (error) {
        return mcpErrorFrom(error);
      }
    }),
  );
}
