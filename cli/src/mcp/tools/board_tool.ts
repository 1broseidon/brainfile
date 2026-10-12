import type { McpServer } from "@modelcontextprotocol/server";
import { z } from 'zod';
import {
  readBoardConfig,
  summarizeColumns,
  updateBoardSettingsFile,
  type BoardSettingsPatch,
} from '@brainfile/core';
import { mcpError, mcpResult, requireV2, resolveBrainfile, withBoardCommit } from '../helpers';
import { boardOutputSchema } from '../schemas';

/**
 * `board`: read the board's own settings, and set its title, agent
 * instructions and related boards. Called with no changes, it only reads.
 */
export function registerBoardTool(server: McpServer, defaultFile: string): void {
  server.registerTool(
    'board',
    {
      title: 'Board Settings',
      description: 'Read the board\'s settings (title, agent instructions, related boards, columns with task counts, strict), or change them: title; instructions replaces agent.instructions, removeInstructions and addInstructions edit them line by line (exact text); addRelated adds or repoints related boards ({alias, path}: path is the repo folder relative to this project\'s root), removeRelated drops them by alias. With no changes it only reads. Columns are edited with the columns tool, types with types.',
      inputSchema: z.object({
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        title: z.string().optional().describe('New board title'),
        instructions: z.array(z.string()).optional().describe('Replace agent.instructions with these lines'),
        addInstructions: z.array(z.string()).optional().describe('Append these instruction lines (ones already there are skipped)'),
        removeInstructions: z.array(z.string()).optional().describe('Remove these instruction lines (exact text)'),
        addRelated: z.array(z.object({
          alias: z.string().describe('Short name: letters, digits, - and _'),
          path: z.string().describe('The related repo\'s folder, relative to this project\'s root, e.g. ../mobile'),
        })).optional().describe('Add or repoint related boards'),
        removeRelated: z.array(z.string()).optional().describe('Remove related boards by alias'),
      }),
      outputSchema: boardOutputSchema,
    },
    withBoardCommit('board', defaultFile, async (input) => {
      const filePath = input.file || defaultFile;
      const guard = requireV2(filePath);
      if (guard) return guard;
      const resolved = resolveBrainfile(filePath);

      const patch: BoardSettingsPatch = {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.instructions !== undefined ? { instructions: input.instructions } : {}),
        ...(input.addInstructions !== undefined ? { addInstructions: input.addInstructions } : {}),
        ...(input.removeInstructions !== undefined ? { removeInstructions: input.removeInstructions } : {}),
        ...(input.addRelated !== undefined
          ? { addRelated: Object.fromEntries(input.addRelated.map((r) => [r.alias, r.path])) }
          : {}),
        ...(input.removeRelated !== undefined ? { removeRelated: input.removeRelated } : {}),
      };
      const result = updateBoardSettingsFile(resolved, patch);
      if (!result.success || !result.settings) return mcpError(result.error ?? 'the board settings were not changed');

      const config = readBoardConfig(resolved)!.config;
      const output = {
        title: result.settings.title,
        instructions: result.settings.instructions,
        related: Object.entries(result.settings.related).map(([alias, folder]) => ({ alias, path: folder })),
        columns: summarizeColumns(resolved, config),
        strict: config.strict === true,
        changed: result.changed,
      };
      const head = result.changed.length > 0 ? `Changed ${result.changed.join(', ')}` : output.title;
      return mcpResult(`${head}\n\n${JSON.stringify(output, null, 2)}`, output);
    }),
  );
}
