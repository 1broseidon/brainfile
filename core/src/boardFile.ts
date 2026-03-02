/**
 * Board config file reader/writer.
 *
 * Provides parse, serialize, read, and write operations for the board
 * configuration file (`.brainfile/brainfile.md`), matching the pattern
 * established by `taskFile.ts` for per-task files.
 *
 * The board config file uses YAML frontmatter + markdown body:
 *
 * ```markdown
 * ---
 * title: My Board
 * columns:
 *   - id: todo
 *     title: To Do
 *   - id: done
 *     title: Done
 * agent:
 *   instructions:
 *     - Always write tests
 *   identity: You are a senior engineer
 * ---
 *
 * ## Notes
 * Project-level notes here.
 * ```
 *
 * @packageDocumentation
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import type { BoardConfig } from './types';

/**
 * Parse YAML frontmatter and markdown body from a board config file's content string.
 *
 * @param content - Raw file content (string)
 * @returns Parsed board config and body, or null if frontmatter is missing/invalid
 */
export function parseBoardConfig(content: string): { config: BoardConfig; body: string } | null {
  const lines = content.split('\n');

  // Must start with frontmatter delimiter
  if (!lines[0] || lines[0].trim() !== '---') {
    return null;
  }

  // Find closing delimiter
  let endIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    return null;
  }

  const yamlContent = lines.slice(1, endIndex).join('\n');
  const bodyContent = lines.slice(endIndex + 1).join('\n');

  let parsed: unknown;
  try {
    parsed = yaml.load(yamlContent);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  const config = parsed as BoardConfig;

  // Trim leading blank line from body if present (convention: one blank line after ---)
  const body = bodyContent.replace(/^\n/, '');

  return { config, body };
}

/**
 * Serialize board config and body into a markdown string with YAML frontmatter.
 *
 * @param config - Board configuration (YAML frontmatter)
 * @param body - Markdown body content (can be empty string)
 * @returns Serialized file content
 */
export function serializeBoardConfig(config: BoardConfig, body: string = ''): string {
  const yamlContent = yaml.dump(config, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
    quotingType: '"',
    forceQuotes: false,
  });

  const parts = ['---\n', yamlContent, '---\n'];

  if (body.length > 0) {
    // Ensure a blank line between frontmatter and body
    parts.push('\n');
    parts.push(body);
    // Ensure trailing newline
    if (!body.endsWith('\n')) {
      parts.push('\n');
    }
  }

  return parts.join('');
}

/**
 * Read and parse a board config file from disk.
 *
 * @param filePath - Absolute path to the board config `.md` file
 * @returns Parsed config, body, and filePath; or null if file is invalid
 */
export function readBoardConfig(filePath: string): { config: BoardConfig; body: string; filePath: string } | null {
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }

  const parsed = parseBoardConfig(content);
  if (!parsed) {
    return null;
  }

  return {
    config: parsed.config,
    body: parsed.body,
    filePath: path.resolve(filePath),
  };
}

/**
 * Write a board config to disk.
 *
 * @param filePath - Absolute path to write the board config file
 * @param config - Board configuration (YAML frontmatter)
 * @param body - Markdown body content
 */
export function writeBoardConfig(filePath: string, config: BoardConfig, body: string = ''): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  const content = serializeBoardConfig(config, body);
  fs.writeFileSync(filePath, content, 'utf-8');
}
