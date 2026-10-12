import type { McpServer } from "@modelcontextprotocol/server";
import { z } from 'zod';
import { checkClaimKeyPrefix, checkDecision, checkExitCode } from '@brainfile/core/memory';
import { requireV2, resolveBrainfile } from '../helpers';
import { checkOutputSchema } from '../schemas';

/**
 * `check`: is a decision still safe to act on? Read-only.
 */
export function registerCheckTool(server: McpServer, defaultFile: string): void {
  server.registerTool(
    'check',
    {
      title: 'Check Decision',
      description: 'Before acting, check whether a decision on the board speaks to it and still holds. Give an action in words, naming the subject right after the verb so a contradiction of the decision\'s stance is caught ("use axios for retries", "drop axios"), a decision ID, a claimKey, or a claimKeyPrefix (every family under it; the verdict is the worst). Verdicts: use (follow the current decision, which is returned), review (ask first: two current decisions, a broken predicate such as validUntil passed or a source file changed or a package version moved, or an action that contradicts the decision\'s stance on its subject), use_replacement (the action matched a superseded decision; use the current one), no_decision (nothing speaks to it). exitCode mirrors the CLI: 0 use/no_decision, 2 review, 3 use_replacement.',
      inputSchema: z.object({
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        query: z.string().optional().describe('The action in words, or a decision ID'),
        claimKey: z.string().optional().describe('Check one claim family exactly'),
        claimKeyPrefix: z.string().optional().describe('Check every claim family under a prefix (not with claimKey)'),
      }),
      outputSchema: checkOutputSchema,
    },
    async ({ file, query, claimKey, claimKeyPrefix }) => {
      const filePath = file || defaultFile;
      const guard = requireV2(filePath);
      if (guard) return guard;
      const q = query?.trim() ?? '';
      const key = claimKey?.trim() ?? '';
      const prefix = claimKeyPrefix?.trim() ?? '';
      if (key && prefix) {
        return { content: [{ type: 'text' as const, text: 'Error: choose claimKey or claimKeyPrefix, not both' }], isError: true as const };
      }
      if (!q && !key && !prefix) {
        return { content: [{ type: 'text' as const, text: 'Error: give a query (an action or a decision ID), claimKey or claimKeyPrefix' }], isError: true as const };
      }
      const resolved = resolveBrainfile(filePath);
      if (prefix) {
        const result = checkClaimKeyPrefix(resolved, prefix, q ? { query: q } : {});
        const output = { ...result, exitCode: checkExitCode(result.verdict) };
        return {
          content: [{ type: 'text' as const, text: `${output.verdict} (${output.familyCount} families under ${output.claimKeyPrefix})\n\n${JSON.stringify(output, null, 2)}` }],
          structuredContent: output,
        };
      }
      const { matchedBy, result } = checkDecision(resolved, { ...(q ? { query: q } : {}), ...(key ? { claimKey: key } : {}) });
      const output = { ...result, matchedBy, exitCode: checkExitCode(result.verdict) };
      const head = `${output.verdict}: ${output.recommendation} (${output.reason})${output.current ? ` · current ${output.current.id}: ${output.current.title}` : ''}`;
      return {
        content: [{ type: 'text' as const, text: `${head}\n\n${JSON.stringify(output, null, 2)}` }],
        structuredContent: output,
      };
    },
  );
}
