import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  shouldSuggestV2Migration,
  markV2MigrationHintShown,
  __resetV2MigrationHintState,
} from '../utils/v2-detect';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-v2hint-'));
}

function writeV1Brainfile(dir: string, hasTasks: boolean): string {
  const filePath = path.join(dir, 'brainfile.md');
  const content = hasTasks
    ? `---
title: Test Board
columns:
  - id: todo
    title: To Do
    tasks:
      - id: task-1
        title: A task
  - id: done
    title: Done
    tasks: []
---
`
    : `---
title: Empty Board
columns:
  - id: todo
    title: To Do
    tasks: []
---
`;
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

function writeV2Brainfile(dir: string): string {
  const dotDir = path.join(dir, '.brainfile');
  fs.mkdirSync(dotDir, { recursive: true });
  fs.mkdirSync(path.join(dotDir, 'board'), { recursive: true });
  const filePath = path.join(dotDir, 'brainfile.md');
  fs.writeFileSync(
    filePath,
    `---
title: V2 Board
columns:
  - id: todo
    title: To Do
---
`,
    'utf-8'
  );
  return filePath;
}

describe('v2 migration hint', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
    __resetV2MigrationHintState();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('shouldSuggestV2Migration', () => {
    it('returns true for v1 brainfile with tasks and no hint shown', () => {
      const filePath = writeV1Brainfile(tempDir, true);
      expect(shouldSuggestV2Migration(filePath)).toBe(true);
    });

    it('returns false for v1 brainfile with no tasks', () => {
      const filePath = writeV1Brainfile(tempDir, false);
      expect(shouldSuggestV2Migration(filePath)).toBe(false);
    });

    it('returns false for v2 brainfile', () => {
      const filePath = writeV2Brainfile(tempDir);
      expect(shouldSuggestV2Migration(filePath)).toBe(false);
    });

    it('returns false after hint has been shown in-process', () => {
      const filePath = writeV1Brainfile(tempDir, true);
      // First check: should be true
      expect(shouldSuggestV2Migration(filePath)).toBe(true);
      // Mark as shown
      markV2MigrationHintShown(filePath);
      // Second check: should be false
      expect(shouldSuggestV2Migration(filePath)).toBe(false);
    });

    it('returns false when brainfile does not exist', () => {
      const fakePath = path.join(tempDir, 'nonexistent.md');
      expect(shouldSuggestV2Migration(fakePath)).toBe(false);
    });
  });
});
