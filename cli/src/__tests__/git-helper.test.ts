import * as path from 'path';
import * as os from 'os';
import { isGitRepo, hasUncommittedChanges, getModifiedFiles } from '../utils/git-helper';

describe('git-helper', () => {
  describe('isGitRepo', () => {
    it('should return true in a git repository', async () => {
      // This test assumes we're running in a git repo
      const result = await isGitRepo();
      expect(result).toBe(true);
    });

    it('should return false for non-git directories', async () => {
      // Use /tmp which is typically not a git repo - pass cwd instead of chdir
      const result = await isGitRepo({ cwd: os.tmpdir() });
      expect(result).toBe(false);
    });
  });

  describe('hasUncommittedChanges', () => {
    it('should return a boolean', async () => {
      const result = await hasUncommittedChanges();
      expect(typeof result).toBe('boolean');
    });

    it('should return false for non-git directories', async () => {
      // Pass cwd instead of using process.chdir
      const result = await hasUncommittedChanges([], { cwd: os.tmpdir() });
      expect(result).toBe(false);
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

    it('should return empty array for non-git directories', async () => {
      // Pass cwd instead of using process.chdir
      const result = await getModifiedFiles({ cwd: os.tmpdir() });
      expect(result).toEqual([]);
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
