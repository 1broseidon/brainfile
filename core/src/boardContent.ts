/**
 * Browser-safe board config content parser/serializer.
 *
 * These helpers operate on raw strings only. Disk-backed helpers live in
 * `boardFile.ts`.
 *
 * @packageDocumentation
 */

import type { BoardConfig } from './types';
import { parseFrontmatter, serializeFrontmatter } from './frontmatter';

/**
 * Parse YAML frontmatter and markdown body from a board config file's content string.
 *
 * @param content - Raw file content (string)
 * @returns Parsed board config and body, or null if frontmatter is missing/invalid
 */
export function parseBoardConfig(content: string): { config: BoardConfig; body: string } | null {
  const parsed = parseFrontmatter<BoardConfig>(content);
  if (!parsed) {
    return null;
  }

  return {
    config: parsed.data,
    body: parsed.body,
  };
}

/**
 * Serialize board config and body into a markdown string with YAML frontmatter.
 *
 * @param config - Board configuration (YAML frontmatter)
 * @param body - Markdown body content (can be empty string)
 * @returns Serialized file content
 */
export function serializeBoardConfig(config: BoardConfig, body: string = ''): string {
  return serializeFrontmatter(config, body);
}
