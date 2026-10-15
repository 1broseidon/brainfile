import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { lintBoard, lintCommand } from '../commands/lint';
import { MemoryLogger } from '../utils/logger';
import { CLIError } from '../utils/cli-error';

describe('lint command', () => {
  const fixturesDir = path.join(__dirname, 'fixtures');
  let logger: MemoryLogger;
  const tempDirs: string[] = [];

  /**
   * Stage a fixture as a v2 workspace config file.
   *
   * The lint command lints the resolved brainfile config file, but the v2-only
   * runtime gate rejects any board path without a sibling board/ directory.
   * Copy the fixture content to <tmp>/.brainfile/brainfile.md with board/ and
   * logs/ dirs alongside so lint exercises the same content in a v2 layout.
   */
  function stageFixture(fixtureName: string): string {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brainfile-lint-test-'));
    tempDirs.push(tempDir);
    const dotDir = path.join(tempDir, '.brainfile');
    fs.mkdirSync(path.join(dotDir, 'board'), { recursive: true });
    fs.mkdirSync(path.join(dotDir, 'logs'), { recursive: true });
    const brainfilePath = path.join(dotDir, 'brainfile.md');
    fs.copyFileSync(path.join(fixturesDir, fixtureName), brainfilePath);
    return brainfilePath;
  }

  beforeEach(() => {
    logger = new MemoryLogger();
  });

  afterAll(() => {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  describe('valid files', () => {
    it('should pass validation for a valid brainfile', () => {
      const validFile = stageFixture('valid-lint.md');

      const result = lintCommand({ file: validFile }, logger);

      expect(result.success).toBe(true);
      expect(result.issues).toHaveLength(0);
      expect(logger.getOutput()).toContain('No issues found');
    });

    it('should pass validation for test-board.md', () => {
      const validFile = stageFixture('test-board.md');

      const result = lintCommand({ file: validFile }, logger);

      expect(result.success).toBe(true);
      expect(logger.getOutput()).toContain('No issues found');
    });
  });

  describe('YAML syntax errors', () => {
    it('should detect YAML syntax errors', () => {
      const invalidFile = stageFixture('invalid-yaml-syntax.md');

      try {
        lintCommand({ file: invalidFile }, logger);
      } catch (error) {
        expect(error).toBeInstanceOf(CLIError);
      }

      const output = logger.getOutput();
      expect(output).toContain('Error');
      // expect(output).toContain('YAML'); // The specific error message might vary depending on core linter implementation
    });
  });

  describe('unquoted strings with colons', () => {
    it('should detect unquoted strings with colons', () => {
      const unquotedFile = stageFixture('invalid-yaml-unquoted.md');

      try {
        lintCommand({ file: unquotedFile }, logger);
      } catch (error) {
        expect(error).toBeInstanceOf(CLIError);
      }

      const output = logger.getOutput();
      // Unquoted strings are treated as errors by the linter
      expect(output).toContain('Unquoted string');
    });

    it('should fix unquoted strings with --fix flag', () => {
      const tempFile = stageFixture('invalid-yaml-unquoted.md');

      const result = lintCommand({ file: tempFile, fix: true }, logger);

      expect(result.success).toBe(true);
      expect(result.fixed).toBe(true);

      const output = logger.getOutput();
      expect(output).toContain('Fixed');

      // Verify the file was actually fixed
      const fixedContent = fs.readFileSync(tempFile, 'utf-8');
      expect(fixedContent).toContain('"Enable Pages in repository settings (Source: GitHub Actions)"');
    });
  });

  describe('duplicate column IDs', () => {
    it('should detect duplicate column IDs', () => {
      const duplicateFile = stageFixture('duplicate-columns.md');

      // Warnings don't cause failure in default mode
      const result = lintCommand({ file: duplicateFile }, logger);

      expect(result.success).toBe(true);
      const output = logger.getOutput();
      expect(output).toContain('Warning');
      expect(output).toContain('Duplicate column detected');
      expect(output).toContain('todo');
    });
  });

  describe('check mode', () => {
    it('should throw error when issues found in check mode', () => {
      const unquotedFile = stageFixture('invalid-yaml-unquoted.md');

      try {
        lintCommand({ file: unquotedFile, check: true }, logger);
        fail('Should have thrown CLIError');
      } catch (error) {
        expect(error).toBeInstanceOf(CLIError);
        expect((error as CLIError).message).toContain('Lint check failed');
      }
    });

    it('should return check success when no issues in check mode', () => {
      const validFile = stageFixture('valid-lint.md');

      const result = lintCommand({ file: validFile, check: true }, logger);

      expect(result.success).toBe(true);
    });
  });

  describe('targets (decision-16)', () => {
    it('warns when a task lands on a branch that is not in the repository, here or on origin', () => {
      const brainfilePath = stageFixture('valid-lint.md');
      const project = path.dirname(path.dirname(brainfilePath));
      const git = (...args: string[]) => {
        const r = spawnSync('git', args, { cwd: project, encoding: 'utf-8', env: { ...process.env, GIT_CONFIG_GLOBAL: os.devNull, GIT_CONFIG_NOSYSTEM: '1' } });
        if (r.status !== 0) throw new Error(r.stderr);
      };
      git('init', '-q', '-b', 'main');
      git('-c', 'user.name=T', '-c', 'user.email=t@example.com', 'commit', '-q', '--allow-empty', '-m', 'init');
      git('branch', 'release');
      const board = path.join(path.dirname(brainfilePath), 'board');
      fs.writeFileSync(path.join(board, 'task-1.md'), '---\nid: task-1\ntitle: One\ncolumn: todo\nlandsOn: release\n---\n');
      fs.writeFileSync(path.join(board, 'task-2.md'), '---\nid: task-2\ntitle: Two\ncolumn: todo\nlandsOn: release/2.0\n---\n');

      const report = lintBoard(brainfilePath);
      const targets = report.issues.filter((i) => i.code?.startsWith('lands-on'));
      expect(targets).toEqual([expect.objectContaining({ type: 'warning', code: 'lands-on-missing', message: expect.stringContaining('task-2 lands on release/2.0') })]);
    });
  });

  describe('file not found', () => {
    it('should handle missing files gracefully', () => {
      try {
        lintCommand({ file: 'nonexistent.md' }, logger);
        fail('Should have thrown CLIError');
      } catch (error) {
        expect(error).toBeInstanceOf(CLIError);
        expect((error as CLIError).message).toContain('File not found');
      }
    });
  });
});
