import * as fs from 'fs';
import * as path from 'path';

/**
 * Find brainfile.md or .brainfile.md in the current directory
 * @returns Absolute path to brainfile, or null if not found
 */
export function findBrainfile(): string | null {
  const cwd = process.cwd();

  const possibleNames = ['brainfile.md', '.brainfile.md'];

  for (const name of possibleNames) {
    const filePath = path.join(cwd, name);
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }

  return null;
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
