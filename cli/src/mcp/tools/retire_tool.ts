import type { McpServer } from "@modelcontextprotocol/server";
import * as path from 'path';
import { z } from 'zod';
import { readBoardConfig, retireDecisionFile, summarizeDecision } from '@brainfile/core';
import { ensureV2Dirs } from '../../utils/v2-detect';
import { resolveActor } from '../../utils/actor';
import { mcpError, mcpResult, requireV2, resolveBrainfile, withBoardCommit } from '../helpers';
import { retireOutputSchema } from '../schemas';

/** `retire`: mark a decision rejected or stale and move it to logs/, like `brainfile retire`. */
export function registerRetireTool(server: McpServer, defaultFile: string): void {
  server.registerTool(
    'retire',
    {
      title: 'Retire Decision',
      description: 'Mark a decision rejected (it was turned down) or stale (it no longer applies) and move it to logs/, with an optional note on why. No ledger record: a decision is not completed work. To replace a decision with a new one, use supersede.',
      inputSchema: z.object({
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        taskId: z.string().describe('The decision to retire, e.g. decision-4'),
        as: z.enum(['rejected', 'stale']).describe('Its new status'),
        note: z.string().optional().describe('Why, written on the decision\'s log'),
        agent: z.string().optional().describe('Who is retiring it (default: the detected agent, else the git user)'),
      }),
      outputSchema: retireOutputSchema,
    },
    withBoardCommit('retire', defaultFile, async ({ file, taskId, as: status, note, agent }) => {
      const filePath = file || defaultFile;
      const guard = requireV2(filePath);
      if (guard) return guard;
      const resolved = resolveBrainfile(filePath);
      const who = agent?.trim() || resolveActor(path.dirname(resolved))?.name;
      const result = retireDecisionFile(ensureV2Dirs(resolved), taskId, status, {
        types: readBoardConfig(resolved)?.config.types,
        ...(note?.trim() ? { note: note.trim() } : {}),
        ...(who ? { agent: who } : {}),
      });
      if (!result.success || !result.task || !result.filePath) return mcpError(result.error ?? `Could not retire ${taskId}`);
      const projectRoot = path.dirname(path.dirname(resolved));
      const output = {
        decision: {
          ...summarizeDecision(result.task),
          path: path.relative(projectRoot, result.filePath).split(path.sep).join('/'),
        },
      };
      return mcpResult(`Retired ${taskId} as ${status} (moved to logs/): ${result.task.title}`, output);
    }),
  );
}
