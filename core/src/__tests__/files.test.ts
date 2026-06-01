import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  findBrainfile,
  ensureDotBrainfileGitignore,
  getDotBrainfileGitignorePath,
  getBrainfileStatePath,
} from '../utils/files';

describe('utils/files', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-files-test-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  const writeFile = (relativePath: string, contents: string | Buffer) => {
    const fullPath = path.join(testDir, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, contents);
    return fullPath;
  };

  describe('findBrainfile', () => {
    it('prefers .brainfile/brainfile.md over brainfile.md', () => {
      writeFile('brainfile.md', 'root');
      writeFile('.brainfile/brainfile.md', 'dotdir');

      const result = findBrainfile(testDir);

      expect(result).not.toBeNull();
      expect(result!.absolutePath).toBe(path.join(testDir, '.brainfile', 'brainfile.md'));
      expect(result!.kind).toBe('dotdir');
    });

    it('falls back to brainfile.md when .brainfile/brainfile.md is missing', () => {
      writeFile('brainfile.md', 'root');

      const result = findBrainfile(testDir);

      expect(result).not.toBeNull();
      expect(result!.absolutePath).toBe(path.join(testDir, 'brainfile.md'));
      expect(result!.kind).toBe('root');
    });

    it('walks up from nested directories', () => {
      writeFile('.brainfile/brainfile.md', 'dotdir');
      fs.mkdirSync(path.join(testDir, 'a/b/c'), { recursive: true });

      const result = findBrainfile(path.join(testDir, 'a/b/c'));

      expect(result).not.toBeNull();
      expect(result!.absolutePath).toBe(path.join(testDir, '.brainfile', 'brainfile.md'));
    });
  });

  describe('dot-brainfile helpers', () => {
    it('creates .brainfile/.gitignore without state.json entry', () => {
      const brainfilePath = writeFile('brainfile.md', 'root');

      ensureDotBrainfileGitignore(brainfilePath);

      const gitignorePath = getDotBrainfileGitignorePath(brainfilePath);
      expect(fs.existsSync(gitignorePath)).toBe(true);
      expect(fs.readFileSync(gitignorePath, 'utf-8')).not.toContain('state.json');
    });

    it('getBrainfileStatePath still resolves deprecated state path deterministically', () => {
      const brainfilePath = writeFile('.brainfile/brainfile.md', 'dotdir');
      const statePath = getBrainfileStatePath(brainfilePath);

      expect(statePath).toBe(path.join(testDir, '.brainfile', 'state.json'));
    });
  });
});
