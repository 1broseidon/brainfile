/**
 * Task file reader/writer for per-task file architecture (v2).
 *
 * Each task is a standalone `.md` file with YAML frontmatter + markdown body:
 *
 * ```markdown
 * ---
 * id: task-1
 * title: Implement feature
 * column: todo
 * ...
 * ---
 *
 * ## Description
 * Markdown body here...
 *
 * ## Log
 * - 2025-12-17T10:00:00Z: Started work
 * ```
 *
 * @packageDocumentation
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import type { Task, TaskDocument } from './types';

/**
 * Parse YAML frontmatter and markdown body from a task file's content string.
 *
 * @param content - Raw file content (string)
 * @returns Parsed task metadata and body, or null if frontmatter is missing/invalid
 */
export function parseTaskContent(content: string): { task: Task; body: string } | null {
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

  const task = parsed as Task;

  // id and title are required
  if (!task.id || !task.title) {
    return null;
  }

  // Trim leading blank line from body if present (convention: one blank line after ---)
  const body = bodyContent.replace(/^\n/, '');

  return { task, body };
}

/**
 * Serialize task metadata and body into a markdown string with YAML frontmatter.
 *
 * @param task - Task metadata
 * @param body - Markdown body content (can be empty string)
 * @returns Serialized file content
 */
export function serializeTaskContent(task: Task, body: string = ''): string {
  const yamlContent = yaml.dump(task, {
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
 * Read and parse a single task file from disk.
 *
 * @param filePath - Absolute path to the task `.md` file
 * @returns TaskDocument with metadata, body, and filePath; or null if file is invalid
 */
export function readTaskFile(filePath: string): TaskDocument | null {
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }

  const parsed = parseTaskContent(content);
  if (!parsed) {
    return null;
  }

  return {
    task: parsed.task,
    body: parsed.body,
    filePath: path.resolve(filePath),
  };
}

/**
 * Write a task document to disk.
 *
 * @param filePath - Absolute path to write the task file
 * @param task - Task metadata (YAML frontmatter)
 * @param body - Markdown body content
 */
export function writeTaskFile(filePath: string, task: Task, body: string = ''): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  const content = serializeTaskContent(task, body);
  fs.writeFileSync(filePath, content, 'utf-8');
}

/**
 * Read all task files from a directory.
 *
 * Scans for `.md` files, parses each as a task document, and returns
 * all successfully parsed tasks. Files that fail to parse are silently skipped.
 *
 * @param dirPath - Absolute path to the tasks directory
 * @returns Array of TaskDocument objects
 */
export function readTasksDir(dirPath: string): TaskDocument[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }

  const docs: TaskDocument[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) {
      continue;
    }

    const filePath = path.join(dirPath, entry.name);
    const doc = readTaskFile(filePath);
    if (doc) {
      docs.push(doc);
    }
  }

  return docs;
}

/**
 * Get the expected filename for a task ID.
 * Convention: `{task-id}.md` (e.g., `task-42.md`)
 */
export function taskFileName(taskId: string): string {
  return `${taskId}.md`;
}
