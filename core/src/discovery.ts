/**
 * Brainfile Discovery Module
 *
 * Provides utilities for discovering brainfiles in a workspace/directory.
 * Used by CLI, VSCode extension, and other tools.
 */

import * as fs from 'fs';
import * as path from 'path';
import { BrainfileParser } from './parser';
import { getTotalTaskCount } from './query';
import type { Board } from './types';

/**
 * Patterns for finding brainfiles (in priority order)
 */
export const BRAINFILE_PATTERNS = [
  // Standard names
  'brainfile.md',
  '.brainfile.md',
  '.bb.md',

  // Suffixed variants (brainfile.private.md, brainfile.work.md, etc.)
  'brainfile.*.md',
] as const;

/**
 * Glob patterns for recursive discovery
 */
export const BRAINFILE_GLOBS = [
  // Root level
  'brainfile.md',
  '.brainfile.md',
  '.bb.md',
  'brainfile.*.md',

  // Nested (subfolders)
  '**/brainfile.md',
  '**/.brainfile.md',
  '**/.bb.md',
  '**/brainfile.*.md',
] as const;

/**
 * Directories to exclude from discovery
 */
export const EXCLUDE_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.vscode-test',
  'coverage',
  '.next',
  '.nuxt',
  'vendor',
] as const;

/**
 * Represents a discovered brainfile
 */
export interface DiscoveredFile {
  /** Absolute path to the file */
  absolutePath: string;

  /** Path relative to the workspace root */
  relativePath: string;

  /** Display name (from board title or filename) */
  name: string;

  /** Brainfile type (board, journal, etc.) */
  type: string;

  /** Whether this is a hidden file (.brainfile.md, .bb.md) */
  isHidden: boolean;

  /** Whether this file appears to be private (contains .private or in .gitignore) */
  isPrivate: boolean;

  /** Number of items (tasks for boards, entries for journals, etc.) */
  itemCount: number;

  /** File modification time */
  modifiedAt: Date;
}

/**
 * Options for discovery
 */
export interface DiscoveryOptions {
  /** Include nested directories (default: true) */
  recursive?: boolean;

  /** Include hidden files like .brainfile.md (default: true) */
  includeHidden?: boolean;

  /** Maximum directory depth for recursive search (default: 10) */
  maxDepth?: number;

  /** Custom exclude patterns */
  excludeDirs?: string[];
}

/**
 * Result of workspace discovery
 */
export interface DiscoveryResult {
  /** Root directory that was searched */
  root: string;

  /** All discovered brainfiles */
  files: DiscoveredFile[];

  /** Total item count across all files */
  totalItems: number;

  /** Discovery timestamp */
  discoveredAt: Date;
}

/**
 * Check if a filename matches brainfile patterns
 */
export function isBrainfileName(filename: string): boolean {
  const name = path.basename(filename).toLowerCase();

  // Exact matches
  if (name === 'brainfile.md' || name === '.brainfile.md' || name === '.bb.md') {
    return true;
  }

  // Suffixed pattern: brainfile.*.md
  if (name.startsWith('brainfile.') && name.endsWith('.md') && name !== 'brainfile.md') {
    return true;
  }

  return false;
}

/**
 * Check if a path should be excluded
 */
function shouldExclude(filePath: string, excludeDirs: string[]): boolean {
  const parts = filePath.split(path.sep);
  return parts.some(part => excludeDirs.includes(part));
}

/**
 * Extract suffix from brainfile name (e.g., "private" from "brainfile.private.md")
 */
export function extractBrainfileSuffix(filename: string): string | null {
  const name = path.basename(filename).toLowerCase();

  if (name.startsWith('brainfile.') && name.endsWith('.md') && name !== 'brainfile.md') {
    // Extract middle part: brainfile.SUFFIX.md
    const withoutPrefix = name.slice('brainfile.'.length);
    const suffix = withoutPrefix.slice(0, -'.md'.length);
    return suffix || null;
  }

  return null;
}

/**
 * Determine if a file is considered private
 */
function isPrivateFile(filename: string, relativePath: string): boolean {
  const suffix = extractBrainfileSuffix(filename);

  // Check for private suffix
  if (suffix === 'private' || suffix === 'local' || suffix === 'personal') {
    return true;
  }

  // Hidden files in hidden directories are often private
  if (relativePath.includes('/.') || relativePath.startsWith('.')) {
    return true;
  }

  return false;
}

/**
 * Parse a brainfile and extract metadata
 */
function parseFileMetadata(absolutePath: string, relativePath: string): DiscoveredFile | null {
  try {
    const content = fs.readFileSync(absolutePath, 'utf-8');
    const board = BrainfileParser.parse(content);
    const stats = fs.statSync(absolutePath);
    const filename = path.basename(absolutePath);
    const isHidden = filename.startsWith('.');

    if (board) {
      return {
        absolutePath,
        relativePath,
        name: board.title || filename.replace(/\.md$/, ''),
        type: (board as any).type || 'board',
        isHidden,
        isPrivate: isPrivateFile(filename, relativePath),
        itemCount: getTotalTaskCount(board),
        modifiedAt: stats.mtime,
      };
    }

    // File exists but failed to parse - still include it
    return {
      absolutePath,
      relativePath,
      name: filename.replace(/\.md$/, ''),
      type: 'unknown',
      isHidden,
      isPrivate: isPrivateFile(filename, relativePath),
      itemCount: 0,
      modifiedAt: stats.mtime,
    };
  } catch {
    return null;
  }
}

/**
 * Recursively find brainfiles in a directory
 */
function findBrainfilesRecursive(
  dir: string,
  rootDir: string,
  options: Required<DiscoveryOptions>,
  currentDepth: number = 0
): DiscoveredFile[] {
  const results: DiscoveredFile[] = [];

  if (currentDepth > options.maxDepth) {
    return results;
  }

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(rootDir, fullPath);

      if (entry.isDirectory()) {
        // Skip excluded directories
        if (shouldExclude(entry.name, options.excludeDirs)) {
          continue;
        }

        // Recurse into subdirectories
        if (options.recursive) {
          results.push(...findBrainfilesRecursive(
            fullPath,
            rootDir,
            options,
            currentDepth + 1
          ));
        }
      } else if (entry.isFile()) {
        // Check if this is a brainfile
        if (!isBrainfileName(entry.name)) {
          continue;
        }

        // Skip hidden files if not included
        if (entry.name.startsWith('.') && !options.includeHidden) {
          continue;
        }

        const metadata = parseFileMetadata(fullPath, relativePath);
        if (metadata) {
          results.push(metadata);
        }
      }
    }
  } catch {
    // Directory not readable, skip it
  }

  return results;
}

/**
 * Discover all brainfiles in a workspace directory
 *
 * @param rootDir - The root directory to search
 * @param options - Discovery options
 * @returns Discovery result with all found files
 *
 * @example
 * ```typescript
 * const result = discover('/path/to/project');
 * console.log(`Found ${result.files.length} brainfiles`);
 *
 * for (const file of result.files) {
 *   console.log(`${file.name}: ${file.itemCount} items`);
 * }
 * ```
 */
export function discover(
  rootDir: string,
  options: DiscoveryOptions = {}
): DiscoveryResult {
  const opts: Required<DiscoveryOptions> = {
    recursive: options.recursive ?? true,
    includeHidden: options.includeHidden ?? true,
    maxDepth: options.maxDepth ?? 10,
    excludeDirs: options.excludeDirs ?? [...EXCLUDE_DIRS],
  };

  const absoluteRoot = path.resolve(rootDir);
  const files = findBrainfilesRecursive(absoluteRoot, absoluteRoot, opts);

  // Sort by path (root files first, then alphabetically)
  files.sort((a, b) => {
    const aDepth = a.relativePath.split(path.sep).length;
    const bDepth = b.relativePath.split(path.sep).length;

    if (aDepth !== bDepth) {
      return aDepth - bDepth;
    }

    return a.relativePath.localeCompare(b.relativePath);
  });

  return {
    root: absoluteRoot,
    files,
    totalItems: files.reduce((sum, f) => sum + f.itemCount, 0),
    discoveredAt: new Date(),
  };
}

/**
 * Find the primary brainfile in a directory
 * Returns the first match in priority order: brainfile.md > .brainfile.md > .bb.md
 *
 * @param rootDir - The directory to search
 * @returns The primary brainfile or null if none found
 */
export function findPrimaryBrainfile(rootDir: string): DiscoveredFile | null {
  const absoluteRoot = path.resolve(rootDir);

  // Check in priority order
  const priorityNames = ['brainfile.md', '.brainfile.md', '.bb.md'];

  for (const name of priorityNames) {
    const fullPath = path.join(absoluteRoot, name);

    if (fs.existsSync(fullPath)) {
      const metadata = parseFileMetadata(fullPath, name);
      if (metadata) {
        return metadata;
      }
    }
  }

  // Fall back to any brainfile.*.md
  try {
    const entries = fs.readdirSync(absoluteRoot);

    for (const entry of entries) {
      if (isBrainfileName(entry) && !priorityNames.includes(entry.toLowerCase())) {
        const fullPath = path.join(absoluteRoot, entry);
        const stats = fs.statSync(fullPath);

        if (stats.isFile()) {
          const metadata = parseFileMetadata(fullPath, entry);
          if (metadata) {
            return metadata;
          }
        }
      }
    }
  } catch {
    // Directory not readable
  }

  return null;
}

/**
 * Find the nearest brainfile by walking up the directory tree from a starting point.
 * Similar to how git finds .git by walking up from cwd.
 *
 * @param startDir - The directory to start searching from (default: process.cwd())
 * @returns The nearest brainfile or null if none found up to filesystem root
 *
 * @example
 * ```typescript
 * // From /home/user/projects/myapp/src
 * // Will find /home/user/projects/myapp/brainfile.md if it exists
 * const brainfile = findNearestBrainfile();
 * if (brainfile) {
 *   console.log(`Found: ${brainfile.absolutePath}`);
 * }
 * ```
 */
export function findNearestBrainfile(startDir?: string): DiscoveredFile | null {
  let currentDir = path.resolve(startDir || process.cwd());
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    const found = findPrimaryBrainfile(currentDir);
    if (found) {
      return found;
    }

    // Move up to parent directory
    const parentDir = path.dirname(currentDir);

    // Safety check: if we can't go up anymore, stop
    if (parentDir === currentDir) {
      break;
    }

    currentDir = parentDir;
  }

  // Check root directory as well
  const foundInRoot = findPrimaryBrainfile(root);
  if (foundInRoot) {
    return foundInRoot;
  }

  return null;
}

/**
 * Watch a directory for brainfile changes
 * Note: This is a simple implementation. VSCode/CLI may use their own watchers.
 *
 * @param rootDir - The directory to watch
 * @param callback - Called when files change
 * @returns A function to stop watching
 */
export function watchBrainfiles(
  rootDir: string,
  callback: (event: 'add' | 'change' | 'unlink', file: DiscoveredFile | string) => void
): () => void {
  const absoluteRoot = path.resolve(rootDir);
  const watchers: fs.FSWatcher[] = [];

  // Watch root directory
  try {
    const watcher = fs.watch(absoluteRoot, (eventType, filename) => {
      if (!filename || !isBrainfileName(filename)) return;

      const fullPath = path.join(absoluteRoot, filename);

      if (eventType === 'rename') {
        if (fs.existsSync(fullPath)) {
          const metadata = parseFileMetadata(fullPath, filename);
          if (metadata) {
            callback('add', metadata);
          }
        } else {
          callback('unlink', fullPath);
        }
      } else if (eventType === 'change') {
        const metadata = parseFileMetadata(fullPath, filename);
        if (metadata) {
          callback('change', metadata);
        }
      }
    });

    watchers.push(watcher);
  } catch {
    // Directory not watchable
  }

  // Return cleanup function
  return () => {
    for (const watcher of watchers) {
      watcher.close();
    }
  };
}
