import type { McpServer } from "@modelcontextprotocol/server";
import { z } from 'zod';
import type { GitHub } from '@brainfile/core/forge';
import { issuesReport, type IssuesReport } from '../../commands/issues';
import { gitHubClient } from '../../utils/github-auth';
import { mcpError, mcpErrorFrom, mcpResult, requireV2, resolveBrainfile, withBoardCommit } from '../helpers';
import { issuesOutputSchema } from '../schemas';

function summary(report: IssuesReport): string {
  const where = `${report.repo.owner}/${report.repo.name}`;
  if (report.imported.length > 0) {
    return report.imported.map((i) => (i.made ? `#${i.number} → ${i.task}` : `#${i.number} is already ${i.task}`)).join('\n');
  }
  const lines = report.issues.map((i) => `#${i.number} ${i.title}${i.task ? ` (on the board: ${i.task})` : ''}`);
  return [`${where}: ${report.issues.length}${report.truncated ? '+' : ''} open issues`, ...lines].join('\n');
}

/**
 * `issues`: the project's open GitHub issues, each marked with the task made
 * from it, and `import` to make tasks from some, like `brainfile issues`. One
 * client per server, so a repository's issues are asked for at most once a
 * minute.
 */
export function registerIssuesTool(server: McpServer, defaultFile: string, github: () => GitHub = lazyClient()): void {
  server.registerTool(
    'issues',
    {
      title: 'Issues',
      description: "The open issues of the GitHub repository the project's origin points at, pull requests left out, each with task when one on the board (open or completed) carries its URL as source. action import makes a task from each of numbers: its title, body as the description, labels as tags and its URL as source, in column (default: the first that is not done); an issue already on the board is reported with made: false, not made again. Credentials: the gh CLI's login, then GH_TOKEN or GITHUB_TOKEN, then the token brainfile auth github saved.",
      inputSchema: z.object({
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        action: z.enum(['list', 'import']).optional().describe('list (default) or import'),
        numbers: z.array(z.number().int().positive()).optional().describe('import: the issue numbers to make tasks from'),
        column: z.string().optional().describe('import: column ID or name for the new tasks'),
      }),
      outputSchema: issuesOutputSchema,
    },
    withBoardCommit('issues', defaultFile, async ({ file, action, numbers, column }) => {
      const filePath = file || defaultFile;
      const guard = requireV2(filePath);
      if (guard) return guard;
      if (action === 'import' && !numbers?.length) return mcpError('import needs numbers: the issues to make tasks from');
      try {
        const report = await issuesReport(resolveBrainfile(filePath), { import: action === 'import' ? numbers : [], column }, github());
        return mcpResult(summary(report), { ...report });
      } catch (e) {
        return mcpErrorFrom(e);
      }
    }),
  );
}

function lazyClient(): () => GitHub {
  let client: GitHub | undefined;
  return () => (client ??= gitHubClient());
}
