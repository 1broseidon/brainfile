import * as fs from 'fs';
import { findBrainfile as findBrainfileCore } from '@brainfile/core';

/**
 * Find a brainfile by walking up from the current directory.
 * @returns Absolute path to brainfile, or null if not found
 */
export function findBrainfile(): string | null {
  const found = findBrainfileCore(process.cwd());
  return found?.absolutePath ?? null;
}

/**
 * Get the age of a file in minutes
 * @param filePath Absolute path to file
 * @returns Age in minutes, or Infinity if file doesn't exist
 */
export function getFileAgeMinutes(filePath: string): number {
  try {
    const stats = fs.statSync(filePath);
    const now = Date.now();
    const modifiedTime = stats.mtimeMs;
    const ageMs = now - modifiedTime;
    const ageMinutes = ageMs / 1000 / 60; // Convert to minutes
    // Handle edge case where mtime might be slightly in the future due to timing
    return Math.max(0, ageMinutes);
  } catch {
    return Infinity;
  }
}
