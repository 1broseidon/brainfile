import type { McpServer } from "@modelcontextprotocol/server";
import { z } from 'zod';
import { lintBoard } from '../../commands/lint';
import { mcpErrorFrom, mcpResult, requireV2, resolveBrainfile, withBoardCommit } from '../helpers';
import { lintOutputSchema } from '../schemas';

/**
 * `lint`: check the board, and fix what the CLI can, like `brainfile lint`.
 * Issues are a result, not an error: the call succeeds with valid: false.
 */
export function registerLintTool(server: McpServer, defaultFile: string): void {
  server.registerTool(
    'lint',
    {
      title: 'Lint Board',
      description: 'Check the board: the config\'s YAML and shape, columns, types, dependsOn references to related boards, and the graph (missing or looping parents, off-pattern links, decisions: naming nothing or a non-decision). fix: true rewrites what can be fixed (quoting, a legacy rules: block). valid is false when there are errors; warnings do not count.',
      inputSchema: z.object({
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        fix: z.boolean().optional().describe('Fix what can be fixed'),
      }),
      outputSchema: lintOutputSchema,
    },
    withBoardCommit('lint', defaultFile, async ({ file, fix }) => {
      const filePath = file || defaultFile;
      const guard = requireV2(filePath);
      if (guard) return guard;
      try {
        const report = lintBoard(resolveBrainfile(filePath), { fix: fix === true });
        const output = {
          valid: report.errors.length === 0,
          issues: report.issues,
          errorCount: report.errors.length,
          warningCount: report.warnings.length,
          fixableCount: report.fixable.length,
          fixed: report.fixed,
          fixedCount: report.fixedCount,
          remaining: report.remaining,
        };
        const head = report.issues.length === 0
          ? 'No issues found'
          : `${output.errorCount} error${output.errorCount === 1 ? '' : 's'}, ${output.warningCount} warning${output.warningCount === 1 ? '' : 's'}${report.fixed ? `; fixed ${report.fixedCount}` : output.fixableCount > 0 ? `; ${output.fixableCount} fixable with fix: true` : ''}`;
        return mcpResult(`${head}\n\n${JSON.stringify(output, null, 2)}`, output);
      } catch (error) {
        return mcpErrorFrom(error);
      }
    }),
  );
}
