import type { McpServer } from "@modelcontextprotocol/server";
import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { ago, whereReport } from '../../commands/where';
import { type FixReport, fixPlanReport, runFixReport, undoFixReport } from '../../commands/fix';
import { boardConflictRelation } from '../../utils/board-sync';
import { mcpError, mcpResult, resolveBrainfile } from '../helpers';
import { whereOutputSchema } from '../schemas';

/**
 * `where`: where the board lives, how fresh it is, and any other copy of it,
 * like `brainfile where`. Offline unless `fetch`. `fix` says what is wrong
 * and what Fix would do; action fix runs it while its words are `expected`,
 * and undo puts it back, like `brainfile fix` (task-78). Not wrapped in the
 * write guard: a fix is what settles a board that writes refuse on, and it
 * makes its own commits.
 */
export function registerWhereTool(server: McpServer, defaultFile: string): void {
  server.registerTool(
    'where',
    {
      title: 'Where Is The Board',
      description: 'Where the board lives (path), how it is stored (plain files, a branch of this repository, or its own repository), the remote it is shared through, when it last synced and whether that worked, and how many changes wait to be sent; every other copy of the board in the repository (boards), and conflict when one disagrees with this one, in which case every write is refused until conflict.resolve is run. fix.problems says what is wrong, in the desktop\'s words, and fix.plan what Fix would do when nothing would be lost (null when a person must choose). action=fix runs that plan, every copy backed up first, only while its words are still expected (fix.plan.words); action=undo puts back what the last fix changed, within 20 seconds of it, whoever ran it. Without action, read-only and offline unless fetch.',
      inputSchema: z.object({
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        fetch: z.boolean().optional().describe('Ask the remote for its copy of the board first'),
        action: z.enum(['fix', 'undo']).optional().describe('fix: run fix.plan (needs expected); undo: put back the last fix, within 20 seconds of it'),
        expected: z.string().optional().describe('For action=fix: fix.plan.words as you read them; if the plan is different now, nothing runs'),
      }),
      outputSchema: whereOutputSchema,
    },
    async ({ file, fetch, action, expected }) => {
      const resolved = resolveBrainfile(file || defaultFile);
      if (!fs.existsSync(resolved)) return mcpError(`File not found: ${resolved}`);
      const dotDir = path.dirname(resolved);
      if (action === 'fix' && !expected) return mcpError('action=fix needs expected: fix.plan.words, as where without action gives them');
      // Origin's copy first, when asked for, so the plan sees it too.
      let report = whereReport(dotDir, { fetch: fetch === true });
      let fix: FixReport;
      try {
        fix = action === 'fix' ? runFixReport(dotDir, expected!) : action === 'undo' ? undoFixReport(dotDir) : fixPlanReport(dotDir);
      } catch (error) {
        return mcpError(error instanceof Error ? error.message : String(error));
      }
      // The board where the fix or the undo left it.
      if (action) report = whereReport(fix.path);
      const stored = report.storage === 'plain'
        ? 'plain files, not tracked by git'
        : report.storage === 'branch'
          ? `commits on the '${report.branch}' branch`
          : 'commits in its own repository';
      const shared = report.remote
        ? `shared through ${report.remote}${report.lastSyncSecondsAgo !== null ? `, last synced ${ago(report.lastSyncSecondsAgo)}${report.lastSyncOk === false ? ' (failed)' : ''}` : ''}, ${report.pendingChanges} change${report.pendingChanges === 1 ? '' : 's'} waiting`
        : 'not shared';
      const conflict = report.conflict
        ? `\n${report.conflict.message} ${boardConflictRelation(report.conflict)} Writes are refused until: ${report.conflict.resolve}`
        : '';
      const { problems, plan, applied, undone } = fix;
      const done = applied
        ? `${applied.message}${applied.undoUntil ? ` Undo until ${applied.undoUntil}: action=undo.` : ''}\n`
        : undone ? `${undone}\n` : '';
      const lines = problems.map((p) => `${p.short}: ${p.line}`);
      if (plan) lines.push(`Fix would: ${plan.words} (action=fix with these words as expected).`);
      else if (problems.length > 0) lines.push('No safe fix: a person decides this one.');
      const fixable = lines.map((line) => `\n${line}`).join('');
      const output = { ...report, fix: { problems, plan, ...(applied ? { applied } : {}), ...(undone ? { undone } : {}) } };
      return mcpResult(`${done}${report.path}: ${stored}; ${shared}${conflict}${fixable}\n\n${JSON.stringify(output, null, 2)}`, output);
    },
  );
}
