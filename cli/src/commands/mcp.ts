import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { McpServer } from "@modelcontextprotocol/server";

// Resolved at runtime from dist/commands/ — avoids widening tsc rootDir for a JSON import.
const cliVersion: string = require('../../package.json').version;
import {
  findNearestBrainfile,
  findBrainfile,
  resolveBrainfilePath,
} from '@brainfile/core';
import { findGitRoot, type McpOptions } from '../mcp/helpers';
import { assertV2Brainfile } from '../utils/v2-only';
import { registerListTasksTool } from '../mcp/tools/list_tasks_tool';
import { registerGetTaskTool } from '../mcp/tools/get_task_tool';
import { registerSearchTool } from '../mcp/tools/search_tool';
import { registerTaskAddTool } from '../mcp/tools/task_add_tool';
import { registerTaskMoveTool } from '../mcp/tools/task_move_tool';
import { registerTaskPatchTool } from '../mcp/tools/task_patch_tool';
import { registerTaskDeleteTool } from '../mcp/tools/task_delete_tool';
import { registerSubtaskTool } from '../mcp/tools/subtask_tool';
import { registerContractTool } from '../mcp/tools/contract_tool';
import { registerTaskCompleteTool } from '../mcp/tools/task_complete_tool';

/**
 * Builds the MCP server with all 10 consolidated tools registered.
 *
 * Exported so tests can serve the exact production registration over an
 * in-memory transport instead of re-listing the tools (which would drift).
 * The same factory serves both protocol eras.
 */
export function createBrainfileMcpServer(defaultFile: string): McpServer {
  const server = new McpServer({
    name: 'brainfile',
    version: cliVersion
  });

  registerListTasksTool(server, defaultFile);
  registerGetTaskTool(server, defaultFile);
  registerSearchTool(server, defaultFile);
  registerTaskAddTool(server, defaultFile);
  registerTaskMoveTool(server, defaultFile);
  registerTaskPatchTool(server, defaultFile);
  registerTaskDeleteTool(server, defaultFile);
  registerSubtaskTool(server, defaultFile);
  registerContractTool(server, defaultFile);
  registerTaskCompleteTool(server, defaultFile);

  return server;
}

export async function mcpCommand(options: McpOptions) {
  // Auto-discover brainfile if not specified
  let defaultFile = options.file;

  if (defaultFile === 'brainfile.md') {
    // Strategy 1: Check WORKSPACE_FOLDER_PATHS env var (set by Cursor)
    const workspacePaths = process.env.WORKSPACE_FOLDER_PATHS;
    if (workspacePaths) {
      const paths = workspacePaths.split(':').filter(Boolean);
      for (const wsPath of paths) {
        const found = findBrainfile(wsPath);
        if (found) {
          defaultFile = found.absolutePath;
          console.error(`[brainfile-mcp] Found in workspace: ${defaultFile}`);
          break;
        }
        const discovered = findNearestBrainfile(wsPath);
        if (discovered) {
          defaultFile = discovered.absolutePath;
          console.error(`[brainfile-mcp] Discovered in workspace: ${defaultFile}`);
          break;
        }
      }
    }

    // Strategy 2: git repo root
    if (defaultFile === 'brainfile.md') {
      const gitRoot = findGitRoot(process.cwd());
      if (gitRoot) {
        const found = findBrainfile(gitRoot);
        if (found) {
          defaultFile = found.absolutePath;
          console.error(`[brainfile-mcp] Found from git root: ${defaultFile}`);
        } else {
          const discovered = findNearestBrainfile(gitRoot);
          if (discovered) {
            defaultFile = discovered.absolutePath;
            console.error(`[brainfile-mcp] Discovered from git root: ${defaultFile}`);
          }
        }
      }
    }

    // Strategy 3: discovery from cwd
    if (defaultFile === 'brainfile.md') {
      const found = findBrainfile();
      if (found) {
        defaultFile = found.absolutePath;
        console.error(`[brainfile-mcp] Auto-discovered: ${defaultFile}`);
      } else {
        defaultFile = resolveBrainfilePath({ filePath: 'brainfile.md', startDir: process.cwd() });
        console.error(`[brainfile-mcp] No brainfile found, using: ${defaultFile}`);
      }
    }
  } else {
    // User specified a file - resolve it
    defaultFile = resolveBrainfilePath({ filePath: defaultFile, startDir: process.cwd() });
    console.error(`[brainfile-mcp] Using specified file: ${defaultFile}`);
  }

  assertV2Brainfile(defaultFile);

  // The same factory serves both protocol eras: 2026-07-28 (stateless)
  // natively, and pre-2026 clients through serveStdio's legacy shim.
  serveStdio(() => createBrainfileMcpServer(defaultFile));
}
