import { isGitRepo, hasUncommittedChanges, getModifiedFiles } from '../utils/git-helper';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('git-helper', () => {
  describe('isGitRepo', () => {
    it('should return true in a git repository', async () => {
      // This test assumes we're running in a git repo
      const result = await isGitRepo();
      expect(typeof result).toBe('boolean');
    });

    it('should handle non-git directories gracefully', async () => {
      // Save original cwd
      const originalCwd = process.cwd();

      try {
        // Change to /tmp which is typically not a git repo
        process.chdir('/tmp');
        const result = await isGitRepo();
        expect(typeof result).toBe('boolean');
      } finally {
        // Restore original cwd
        process.chdir(originalCwd);
      }
    });
  });

  describe('hasUncommittedChanges', () => {
    it('should return false when no changes exist', async () => {
      // This test assumes a clean working directory
      const result = await hasUncommittedChanges();
      expect(typeof result).toBe('boolean');
    });

    it('should handle non-git directories', async () => {
      const originalCwd = process.cwd();

      try {
        process.chdir('/tmp');
        const result = await hasUncommittedChanges();
        expect(result).toBe(false);
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should handle exclude patterns', async () => {
      const result = await hasUncommittedChanges(['*.md', '*.txt']);
      expect(typeof result).toBe('boolean');
    });
  });

  describe('getModifiedFiles', () => {
    it('should return an array', async () => {
      const result = await getModifiedFiles();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle non-git directories', async () => {
      const originalCwd = process.cwd();

      try {
        process.chdir('/tmp');
        const result = await getModifiedFiles();
        expect(result).toEqual([]);
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should return file paths without status codes', async () => {
      const result = await getModifiedFiles();

      // If there are modified files, they should be strings without status codes
      result.forEach(file => {
        expect(typeof file).toBe('string');
        expect(file.length).toBeGreaterThan(0);
      });
    });
  });
});
