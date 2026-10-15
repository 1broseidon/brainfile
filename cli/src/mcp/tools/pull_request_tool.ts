import type { McpServer } from "@modelcontextprotocol/server";
import { z } from 'zod';
import type { GitHub } from '@brainfile/core/forge';
import { pullRequestReport, type PrDeps, type PrReport } from '../../commands/pr';
import { gitHubClient } from '../../utils/github-auth';
import { mcpErrorFrom, mcpResult, requireV2, resolveBrainfile, withBoardCommit } from '../helpers';
import { pullRequestOutputSchema } from '../schemas';

function summary(report: PrReport): string {
  const pr = report.pullRequest;
  const where = `#${pr.number} ${pr.head} → ${pr.base}`;
  if (report.action === 'opened') return `Opened pull request ${where}: ${pr.url}`;
  const settled = pr.state === 'merged' ? `${report.completed ? `; ${report.task} is done` : `; ${report.task} stays open: subtasks are left`}${report.released === false ? `. ${report.said}` : ''}` : '';
  return `${where}: ${pr.state === 'closed' ? 'closed without merging' : pr.state}${settled}: ${pr.url}`;
}

/**
 * `pull_request`: a hand-off landed by pull request (decision-16), like
 * `brainfile pr`: `open` pushes the task's branch and opens one into where it
 * lands, recorded on the task; `status` asks GitHub, and merged completes the
 * task and lets its worktree go. One client per server.
 */
export function registerPullRequestTool(server: McpServer, defaultFile: string, deps: () => PrDeps = lazyClient()): void {
  server.registerTool(
    'pull_request',
    {
      title: 'Pull request',
      description: "A task's hand-off landed by pull request instead of a merge. action open (default) pushes the task's branch dispatch/<task> to origin and opens a GitHub pull request into the branch it lands on (its landsOn, its parent's, else the trunk), titled with the task's title, and records it on the task as pullRequest; refused while the worktree has uncommitted work, the branch has nothing to land, or a runner is still at it. action status asks GitHub where it stands: merged completes the task (unless subtasks are left) and removes its worktree and local branch; closed records that it closed without merging, so the hand-off can be merged again. Only the task's branch is pushed. Credentials as brainfile issues.",
      inputSchema: z.object({
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        task: z.string().describe('The task whose hand-off it is, e.g. task-12'),
        action: z.enum(['open', 'status']).optional().describe('open (default) or status'),
      }),
      outputSchema: pullRequestOutputSchema,
    },
    withBoardCommit('pull_request', defaultFile, async ({ file, task, action }) => {
      const filePath = file || defaultFile;
      const guard = requireV2(filePath);
      if (guard) return guard;
      try {
        const report = await pullRequestReport(resolveBrainfile(filePath), task, { status: action === 'status' }, deps());
        return mcpResult(summary(report), { ...report });
      } catch (e) {
        return mcpErrorFrom(e);
      }
    }),
  );
}

function lazyClient(): () => PrDeps {
  let client: GitHub | undefined;
  return () => ({ github: (client ??= gitHubClient()) });
}
