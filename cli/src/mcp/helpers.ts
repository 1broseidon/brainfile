import * as fs from 'fs';
import * as path from 'path';
import { isV2 } from '@brainfile/core';
import { V1_UNSUPPORTED_MESSAGE } from '../utils/v2-only';

export interface McpOptions {
  file: string;
}

export interface TypeEntry {
  idPrefix: string;
  completable?: boolean;
  schema?: string;
}

export type TypesConfig = Record<string, TypeEntry>;

export function sanitizeTypesConfig(raw: unknown): TypesConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }

  const out: TypesConfig = {};
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      continue;
    }

    const entry = value as Record<string, unknown>;
    const idPrefix = typeof entry.idPrefix === 'string' && entry.idPrefix.trim()
      ? entry.idPrefix.trim()
      : name;

    const normalized: TypeEntry = { idPrefix };
    if (typeof entry.completable === 'boolean') normalized.completable = entry.completable;
    if (typeof entry.schema === 'string' && entry.schema.trim()) normalized.schema = entry.schema.trim();

    out[name] = normalized;
  }

  return out;
}

export function isTaskCompletable(taskType: string | undefined, rawTypes: unknown): boolean {
  const resolvedType = taskType || 'task';
  if (resolvedType === 'task') {
    return true;
  }

  const types = sanitizeTypesConfig(rawTypes);
  const typeConfig = types[resolvedType];
  return typeConfig?.completable !== false;
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
