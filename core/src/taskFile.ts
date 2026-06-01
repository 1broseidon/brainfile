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
import type { Task, TaskDocument } from './types';
import { parseTaskContent, serializeTaskContent } from './taskContent';

export { parseTaskContent, serializeTaskContent } from './taskContent';

/**
 * Validate task IDs before using them as path components.
 * Rejects path traversal and path separator characters.
 */
function isUnsafeTaskId(taskId: string): boolean {
  if (!taskId || taskId.trim() === '') {
    return true;
  }

  const trimmed = taskId.trim();
  if (trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('..')) {
    return true;
  }

  if (path.isAbsolute(trimmed)) {
    return true;
  }

  return path.basename(trimmed) !== trimmed;
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
  if (isUnsafeTaskId(taskId)) {
    throw new Error(`Invalid task ID: ${taskId}`);
  }

  return `${taskId.trim()}.md`;
}
