import type { McpServer } from "@modelcontextprotocol/server";
import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { ago, whereReport } from '../../commands/where';
import { mcpError, mcpResult, resolveBrainfile } from '../helpers';
import { whereOutputSchema } from '../schemas';

/** `where`: where the board lives and how fresh it is, like `brainfile where`. Never touches the network. */
export function registerWhereTool(server: McpServer, defaultFile: string): void {
  server.registerTool(
    'where',
    {
      title: 'Where Is The Board',
      description: 'Where the board lives (path), how it is stored (plain files, a branch of this repository, or its own repository), the remote it is shared through, when it last synced and whether that worked, and how many changes wait to be sent. Read-only and offline.',
      inputSchema: z.object({
        file: z.string().optional().describe('Path to brainfile.md (default: brainfile.md)'),
      }),
      outputSchema: whereOutputSchema,
    },
    async ({ file }) => {
      const resolved = resolveBrainfile(file || defaultFile);
      if (!fs.existsSync(resolved)) return mcpError(`File not found: ${resolved}`);
      const report = whereReport(path.dirname(resolved));
      const stored = report.storage === 'plain'
        ? 'plain files, not tracked by git'
        : report.storage === 'branch'
          ? `commits on the '${report.branch}' branch`
          : 'commits in its own repository';
      const shared = report.remote
        ? `shared through ${report.remote}${report.lastSyncSecondsAgo !== null ? `, last synced ${ago(report.lastSyncSecondsAgo)}${report.lastSyncOk === false ? ' (failed)' : ''}` : ''}, ${report.pendingChanges} change${report.pendingChanges === 1 ? '' : 's'} waiting`
        : 'not shared';
      return mcpResult(`${report.path}: ${stored}; ${shared}\n\n${JSON.stringify(report, null, 2)}`, { ...report });
    },
  );
}
