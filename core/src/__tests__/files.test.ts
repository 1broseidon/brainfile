import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  findBrainfile,
  readBrainfileState,
  recordContractPickup,
  getBrainfileStatePath,
  getDotBrainfileGitignorePath,
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

  describe('state.json', () => {
    it('returns default state when missing', () => {
      const brainfilePath = writeFile('brainfile.md', 'root');

      const state = readBrainfileState(brainfilePath);

      expect(state.version).toBe('1.0.0');
      expect(state.contracts).toEqual({});
      expect(state.agents).toEqual({});
    });

    it('records contract pickup with version increments and creates .gitignore', () => {
      const brainfilePath = writeFile('brainfile.md', 'root');

      recordContractPickup({ brainfilePath, taskId: 'task-1', agent: 'codex' });
      recordContractPickup({ brainfilePath, taskId: 'task-1', agent: 'codex' });

      const statePath = getBrainfileStatePath(brainfilePath);
      expect(fs.existsSync(statePath)).toBe(true);

      const parsed = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
      expect(parsed.contracts['task-1'].pickedUpVersion).toBe(2);
      expect(parsed.contracts['task-1'].agent).toBe('codex');

      const gitignorePath = getDotBrainfileGitignorePath(brainfilePath);
      expect(fs.readFileSync(gitignorePath, 'utf-8')).toContain('state.json');
    });

    it('stores state alongside .brainfile/brainfile.md', () => {
      const brainfilePath = writeFile('.brainfile/brainfile.md', 'dotdir');

      recordContractPickup({ brainfilePath, taskId: 'task-2', agent: 'codex' });

      const statePath = getBrainfileStatePath(brainfilePath);
      expect(statePath).toBe(path.join(testDir, '.brainfile', 'state.json'));
      expect(fs.existsSync(statePath)).toBe(true);
    });
  });
});

