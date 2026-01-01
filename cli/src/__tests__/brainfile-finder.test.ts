import { findBrainfile, getFileAgeMinutes } from '../utils/brainfile-finder';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('brainfile-finder', () => {
  let tempDir: string;

  beforeEach(() => {
    // Create a temporary directory for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-test-'));
    process.chdir(tempDir);
  });

  afterEach(() => {
    // Clean up temporary directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('findBrainfile', () => {
    it('should find .brainfile/brainfile.md in current directory', () => {
      fs.mkdirSync(path.join(tempDir, '.brainfile'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, '.brainfile', 'brainfile.md'), 'test content');

      const result = findBrainfile();

      expect(result).not.toBeNull();
      expect(result).toBe(path.join(tempDir, '.brainfile', 'brainfile.md'));
    });

    it('should find brainfile.md in current directory when .brainfile/brainfile.md is missing', () => {
      fs.writeFileSync(path.join(tempDir, 'brainfile.md'), 'test content');

      const result = findBrainfile();

      expect(result).not.toBeNull();
      expect(result).toBe(path.join(tempDir, 'brainfile.md'));
    });

    it('should find .brainfile.md in current directory when other options are missing', () => {
      fs.writeFileSync(path.join(tempDir, '.brainfile.md'), 'test content');

      const result = findBrainfile();

      expect(result).not.toBeNull();
      expect(result).toBe(path.join(tempDir, '.brainfile.md'));
    });

    it('should prefer .brainfile/brainfile.md over brainfile.md', () => {
      fs.mkdirSync(path.join(tempDir, '.brainfile'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, '.brainfile', 'brainfile.md'), 'test content 1');
      fs.writeFileSync(path.join(tempDir, 'brainfile.md'), 'test content 2');

      const result = findBrainfile();

      expect(result).not.toBeNull();
      expect(result).toBe(path.join(tempDir, '.brainfile', 'brainfile.md'));
    });

    it('should return null when no brainfile exists', () => {
      const result = findBrainfile();

      expect(result).toBeNull();
    });
  });

  describe('getFileAgeMinutes', () => {
    it('should return age in minutes for existing file', () => {
      const filePath = path.join(tempDir, 'test.txt');
      fs.writeFileSync(filePath, 'test content');

      const ageMinutes = getFileAgeMinutes(filePath);

      expect(ageMinutes).toBeGreaterThanOrEqual(0);
      expect(ageMinutes).toBeLessThan(1); // Should be less than 1 minute old
    });

    it('should return Infinity for non-existent file', () => {
      const filePath = path.join(tempDir, 'nonexistent.txt');

      const ageMinutes = getFileAgeMinutes(filePath);

      expect(ageMinutes).toBe(Infinity);
    });

    it('should calculate age correctly for older file', () => {
      const filePath = path.join(tempDir, 'old.txt');
      fs.writeFileSync(filePath, 'test content');

      // Modify the file's mtime to be 10 minutes ago
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      fs.utimesSync(filePath, tenMinutesAgo, tenMinutesAgo);

      const ageMinutes = getFileAgeMinutes(filePath);

      expect(ageMinutes).toBeGreaterThanOrEqual(9.5); // Allow some tolerance
      expect(ageMinutes).toBeLessThanOrEqual(10.5);
    });

    it('should handle recently modified file', () => {
      const filePath = path.join(tempDir, 'recent.txt');
      fs.writeFileSync(filePath, 'test content');

      // File was just created, should be ~0 minutes old
      const ageMinutes = getFileAgeMinutes(filePath);

      expect(ageMinutes).toBeGreaterThanOrEqual(0);
      expect(ageMinutes).toBeLessThan(0.1);
    });
  });
});
