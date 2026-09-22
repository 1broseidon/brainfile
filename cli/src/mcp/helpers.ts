import * as fs from 'fs';
import * as path from 'path';
import { isV2 } from '@brainfile/core';
import { V1_UNSUPPORTED_MESSAGE } from '../utils/v2-only';
import { fetchBeforeRead, installAutosync } from '../utils/board-autosync';

export interface McpOptions {
  file: string;
}

export function resolveBrainfile(filePath: string): string {
  return path.resolve(filePath);
}

/**
 * Guard for MCP tool handlers: returns an MCP error result when the target
 * brainfile is missing or not in v2 per-task file layout, null otherwise.
 */
export function requireV2(filePath: string): { content: Array<{ type: 'text'; text: string }>; isError: true } | null {
  const resolvedPath = resolveBrainfile(filePath);

  if (!fs.existsSync(resolvedPath)) {
    return { content: [{ type: 'text' as const, text: `Error: File not found: ${resolvedPath}` }], isError: true };
  }

  if (!isV2(resolvedPath)) {
    return { content: [{ type: 'text' as const, text: `Error: ${V1_UNSUPPORTED_MESSAGE}` }], isError: true };
  }

  // A shared board in autosync=full mode fetches before stale reads.
  installAutosync();
  fetchBeforeRead(path.dirname(resolvedPath));

  return null;
}

export function mcpStructuredError(message: string, field: string, value: string) {
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify(
        { error: { code: 'VALIDATION_ERROR', message, field, value } },
        null,
        2
      )
    }],
    isError: true
  };
}

/**
 * Find git repository root by walking up directory tree
 */
export function findGitRoot(startDir: string): string | null {
  let currentDir = path.resolve(startDir);
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    const gitPath = path.join(currentDir, '.git');
    if (fs.existsSync(gitPath)) {
      return currentDir;
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  return null;
}

// ── Board-on-a-branch (spec-9): one commit per mutating tool call ─────────

import { commitBoard, isTrackedBoard } from '../utils/board-repo';

type ToolInput = Record<string, unknown>;

function isErrorResult(result: unknown): boolean {
  return typeof result === 'object' && result !== null && (result as { isError?: unknown }).isError === true;
}

function describeToolCall(toolName: string, input: ToolInput): string {
  const action = typeof input.action === 'string' ? ` ${input.action}` : '';
  const rawId = input.taskId ?? input.task;
  const id = Array.isArray(rawId) ? ` ${rawId.join(',')}` : typeof rawId === 'string' ? ` ${rawId}` : '';
  const detail = [input.title, input.column]
    .find((v): v is string => typeof v === 'string' && v.length > 0);
  return `${toolName}${action}${id}${detail ? `: ${detail}` : ''}`;
}

/**
 * Wrap a mutating tool handler so a successful call commits the board when it
 * is tracked. A failed commit never fails the tool. The acting agent comes
 * from `BRAINFILE_AGENT`, which the MCP host sets per agent.
 */
export function withBoardCommit<I extends ToolInput, R, E>(
  toolName: string,
  defaultFile: string,
  handler: (input: I, extra: E) => Promise<R>
): (input: I, extra: E) => Promise<R> {
  return async (input, extra) => {
    const result = await handler(input, extra);
    try {
      if (!isErrorResult(result)) {
        const filePath = typeof input.file === 'string' && input.file ? input.file : defaultFile;
        const dotDir = path.dirname(resolveBrainfile(filePath));
        if (isTrackedBoard(dotDir)) {
          commitBoard(dotDir, {
            message: describeToolCall(toolName, input),
            agent: process.env.BRAINFILE_AGENT ?? null,
          });
        }
      }
    } catch {
      /* recording is best-effort */
    }
    return result;
  };
}
