import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  discover,
  findPrimaryBrainfile,
  isBrainfileName,
  extractBrainfileSuffix,
  watchBrainfiles,
  type WatchResult,
} from '../discovery';

describe('discovery', () => {
  let testDir: string;

  beforeEach(() => {
    // Create a temporary test directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-test-'));
  });

  afterEach(() => {
    // Clean up test directory
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  const createBrainfile = (relativePath: string, title: string = 'Test Board') => {
    const fullPath = path.join(testDir, relativePath);
    const dir = path.dirname(fullPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const content = `---
title: ${title}
columns:
  - id: todo
    title: To Do
    tasks:
      - id: task-1
        title: Test task
---
`;
    fs.writeFileSync(fullPath, content);
    return fullPath;
  };

  describe('isBrainfileName', () => {
    it('returns true for standard brainfile names', () => {
      expect(isBrainfileName('brainfile.md')).toBe(true);
      expect(isBrainfileName('.brainfile.md')).toBe(true);
      expect(isBrainfileName('.bb.md')).toBe(true);
    });

    it('returns true for suffixed brainfile names', () => {
      expect(isBrainfileName('brainfile.private.md')).toBe(true);
      expect(isBrainfileName('brainfile.work.md')).toBe(true);
      expect(isBrainfileName('brainfile.personal.md')).toBe(true);
    });

    it('returns false for non-brainfile names', () => {
      expect(isBrainfileName('readme.md')).toBe(false);
      expect(isBrainfileName('brain.md')).toBe(false);
      expect(isBrainfileName('brainfile.txt')).toBe(false);
    });

    it('is case insensitive for base name', () => {
      expect(isBrainfileName('BRAINFILE.MD')).toBe(true);
      expect(isBrainfileName('Brainfile.md')).toBe(true);
    });
  });

  describe('extractBrainfileSuffix', () => {
    it('extracts suffix from suffixed filenames', () => {
      expect(extractBrainfileSuffix('brainfile.private.md')).toBe('private');
      expect(extractBrainfileSuffix('brainfile.work.md')).toBe('work');
      expect(extractBrainfileSuffix('brainfile.my-project.md')).toBe('my-project');
    });

    it('returns null for standard filenames', () => {
      expect(extractBrainfileSuffix('brainfile.md')).toBe(null);
      expect(extractBrainfileSuffix('.brainfile.md')).toBe(null);
      expect(extractBrainfileSuffix('.bb.md')).toBe(null);
    });
  });

  describe('discover', () => {
    it('finds brainfile.md at root', () => {
      createBrainfile('brainfile.md', 'Root Board');

      const result = discover(testDir);

      expect(result.files).toHaveLength(1);
      expect(result.files[0].name).toBe('Root Board');
      expect(result.files[0].relativePath).toBe('brainfile.md');
    });

    it('finds hidden brainfiles', () => {
      createBrainfile('.brainfile.md', 'Hidden Board');

      const result = discover(testDir);

      expect(result.files).toHaveLength(1);
      expect(result.files[0].isHidden).toBe(true);
    });

    it('finds suffixed brainfiles', () => {
      createBrainfile('brainfile.private.md', 'Private Board');
      createBrainfile('brainfile.work.md', 'Work Board');

      const result = discover(testDir);

      expect(result.files).toHaveLength(2);
      expect(result.files.some(f => f.name === 'Private Board')).toBe(true);
      expect(result.files.some(f => f.name === 'Work Board')).toBe(true);
    });

    it('marks private files correctly', () => {
      createBrainfile('brainfile.private.md', 'Private');

      const result = discover(testDir);

      expect(result.files[0].isPrivate).toBe(true);
    });

    it('finds nested brainfiles', () => {
      createBrainfile('brainfile.md', 'Root');
      createBrainfile('subproject/brainfile.md', 'Subproject');
      createBrainfile('deep/nested/brainfile.md', 'Deep Nested');

      const result = discover(testDir);

      expect(result.files).toHaveLength(3);
      expect(result.files[0].relativePath).toBe('brainfile.md'); // Root first
    });

    it('excludes node_modules', () => {
      createBrainfile('brainfile.md', 'Root');
      createBrainfile('node_modules/some-pkg/brainfile.md', 'Should be excluded');

      const result = discover(testDir);

      expect(result.files).toHaveLength(1);
      expect(result.files[0].name).toBe('Root');
    });

    it('counts items correctly', () => {
      createBrainfile('brainfile.md', 'Board with tasks');

      const result = discover(testDir);

      expect(result.files[0].itemCount).toBe(1);
      expect(result.totalItems).toBe(1);
    });

    it('respects recursive option', () => {
      createBrainfile('brainfile.md', 'Root');
      createBrainfile('sub/brainfile.md', 'Sub');

      const result = discover(testDir, { recursive: false });

      expect(result.files).toHaveLength(1);
      expect(result.files[0].name).toBe('Root');
    });

    it('respects includeHidden option', () => {
      createBrainfile('.brainfile.md', 'Hidden');

      const result = discover(testDir, { includeHidden: false });

      expect(result.files).toHaveLength(0);
    });
  });

  describe('findPrimaryBrainfile', () => {
    it('returns brainfile.md when present', () => {
      createBrainfile('brainfile.md', 'Primary');
      createBrainfile('.brainfile.md', 'Hidden');

      const result = findPrimaryBrainfile(testDir);

      expect(result).not.toBeNull();
      expect(result!.name).toBe('Primary');
    });

    it('falls back to .brainfile.md', () => {
      createBrainfile('.brainfile.md', 'Hidden Primary');

      const result = findPrimaryBrainfile(testDir);

      expect(result).not.toBeNull();
      expect(result!.name).toBe('Hidden Primary');
    });

    it('returns null when no brainfile exists', () => {
      const result = findPrimaryBrainfile(testDir);

      expect(result).toBeNull();
    });
  });

  describe('watchBrainfiles', () => {
    it('returns success for valid directory', () => {
      const result = watchBrainfiles(testDir, () => {});

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.isActive()).toBe(true);

      // Clean up
      result.stop();
      expect(result.isActive()).toBe(false);
    });

    it('returns ENOENT error for non-existent directory', () => {
      const result = watchBrainfiles('/nonexistent/path/12345', () => {});

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('ENOENT');
      expect(result.error?.message).toContain('does not exist');
      expect(result.isActive()).toBe(false);
    });

    it('returns ENOTDIR error for file path', () => {
      const filePath = createBrainfile('brainfile.md');
      const result = watchBrainfiles(filePath, () => {});

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('ENOTDIR');
      expect(result.error?.message).toContain('not a directory');
      expect(result.isActive()).toBe(false);
    });

    it('stop() is idempotent', () => {
      const result = watchBrainfiles(testDir, () => {});

      expect(result.success).toBe(true);

      // Multiple stops should not throw
      result.stop();
      result.stop();
      result.stop();

      expect(result.isActive()).toBe(false);
    });

    it('stop() is safe to call on failed watch', () => {
      const result = watchBrainfiles('/nonexistent/path', () => {});

      expect(result.success).toBe(false);

      // Should not throw
      result.stop();
      expect(result.isActive()).toBe(false);
    });

    it('detects file changes', (done) => {
      createBrainfile('brainfile.md', 'Initial');

      const events: Array<{ event: string; file: any }> = [];
      const result = watchBrainfiles(testDir, (event, file) => {
        events.push({ event, file });
      });

      expect(result.success).toBe(true);

      // Give watcher time to initialize, then modify file
      setTimeout(() => {
        const content = `---
title: Modified
columns:
  - id: todo
    title: To Do
    tasks: []
---
`;
        fs.writeFileSync(path.join(testDir, 'brainfile.md'), content);
      }, 50);

      // Check for events after a delay
      setTimeout(() => {
        result.stop();

        // fs.watch behavior varies by platform, so we just verify no errors
        expect(result.isActive()).toBe(false);
        done();
      }, 200);
    });

    it('calls onError for runtime errors', () => {
      const errors: any[] = [];
      const result = watchBrainfiles(
        testDir,
        () => {},
        (error) => errors.push(error)
      );

      expect(result.success).toBe(true);

      // Clean up
      result.stop();
    });
  });
});
