import type { McpServer } from "@modelcontextprotocol/server";
import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { ago, whereReport } from '../../commands/where';
import { boardConflictRelation } from '../../utils/board-sync';
import { mcpError, mcpResult, resolveBrainfile } from '../helpers';
import { whereOutputSchema } from '../schemas';

/** `where`: where the board lives, how fresh it is, and any other copy of it, like `brainfile where`. Offline unless `fetch`. */
export function registerWhereTool(server: McpServer, defaultFile: string): void {
  server.registerTool(
    'where',
    {
      title: 'Where Is The Board',
      description: 'Where the board lives (path), how it is stored (plain files, a branch of this repository, or its own repository), the remote it is shared through, when it last synced and whether that worked, and how many changes wait to be sent; every other copy of the board in the repository (boards), and conflict when one disagrees with this one, in which case every write is refused until conflict.resolve is run. Read-only; offline unless fetch.',
      inputSchema: z.object({
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
        fetch: z.boolean().optional().describe('Ask the remote for its copy of the board first'),
      }),
      outputSchema: whereOutputSchema,
    },
    async ({ file, fetch }) => {
      const resolved = resolveBrainfile(file || defaultFile);
      if (!fs.existsSync(resolved)) return mcpError(`File not found: ${resolved}`);
      const report = whereReport(path.dirname(resolved), { fetch: fetch === true });
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
      return mcpResult(`${report.path}: ${stored}; ${shared}${conflict}\n\n${JSON.stringify(report, null, 2)}`, { ...report });
    },
  );
}
