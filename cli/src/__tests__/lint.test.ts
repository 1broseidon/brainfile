import * as fs from 'fs';
import * as path from 'path';
import { lintCommand } from '../commands/lint';

// Mock console methods to capture output
let consoleOutput: string[] = [];
let consoleErrorOutput: string[] = [];
const originalLog = console.log;
const originalError = console.error;

beforeEach(() => {
  consoleOutput = [];
  consoleErrorOutput = [];
  console.log = jest.fn((...args) => {
    consoleOutput.push(args.map(arg => String(arg)).join(' '));
  });
  console.error = jest.fn((...args) => {
    consoleErrorOutput.push(args.map(arg => String(arg)).join(' '));
  });
});

afterEach(() => {
  console.log = originalLog;
  console.error = originalError;
});

describe('lint command', () => {
  const fixturesDir = path.join(__dirname, 'fixtures');

  describe('valid files', () => {
    it('should pass validation for a valid brainfile', () => {
      const mockExit = jest.spyOn(process, 'exit').mockImplementation((code?: any) => {
        throw new Error(`Process exit: ${code}`);
      });

      const validFile = path.join(fixturesDir, 'valid-lint.md');

      try {
        lintCommand({ file: validFile });
      } catch (error: any) {
        expect(error.message).toBe('Process exit: 0');
      }

      expect(consoleOutput.join('\n')).toContain('No issues found');
      mockExit.mockRestore();
    });

    it('should pass validation for test-board.md', () => {
      const mockExit = jest.spyOn(process, 'exit').mockImplementation((code?: any) => {
        throw new Error(`Process exit: ${code}`);
      });

      const validFile = path.join(fixturesDir, 'test-board.md');

      try {
        lintCommand({ file: validFile });
      } catch (error: any) {
        expect(error.message).toBe('Process exit: 0');
      }

      expect(consoleOutput.join('\n')).toContain('No issues found');
      mockExit.mockRestore();
    });
  });

  describe('YAML syntax errors', () => {
    it('should detect YAML syntax errors', () => {
      const mockExit = jest.spyOn(process, 'exit').mockImplementation((code?: any) => {
        throw new Error(`Process exit: ${code}`);
      });

      const invalidFile = path.join(fixturesDir, 'invalid-yaml-syntax.md');

      try {
        lintCommand({ file: invalidFile });
      } catch (error: any) {
        expect(error.message).toBe('Process exit: 1');
      }

      const output = consoleOutput.join('\n');
      expect(output).toContain('Error');
      expect(output).toContain('YAML');
      mockExit.mockRestore();
    });
  });

  describe('unquoted strings with colons', () => {
    it('should detect unquoted strings with colons', () => {
      const mockExit = jest.spyOn(process, 'exit').mockImplementation((code?: any) => {
        throw new Error(`Process exit: ${code}`);
      });

      const unquotedFile = path.join(fixturesDir, 'invalid-yaml-unquoted.md');

      try {
        lintCommand({ file: unquotedFile });
      } catch (error: any) {
        expect(error.message).toBe('Process exit: 1');
      }

      const output = consoleOutput.join('\n');
      expect(output).toContain('Warning');
      expect(output).toContain('Unquoted string with colon');
      mockExit.mockRestore();
    });

    it('should fix unquoted strings with --fix flag', () => {
      const mockExit = jest.spyOn(process, 'exit').mockImplementation((code?: any) => {
        throw new Error(`Process exit: ${code}`);
      });

      // Create a temporary copy to test fixing
      const unquotedFile = path.join(fixturesDir, 'invalid-yaml-unquoted.md');
      const tempFile = path.join(fixturesDir, 'temp-fix-test.md');
      fs.copyFileSync(unquotedFile, tempFile);

      try {
        lintCommand({ file: tempFile, fix: true });
      } catch (error: any) {
        // Should exit with 0 after fixing
        expect(error.message).toBe('Process exit: 0');
      }

      const output = consoleOutput.join('\n');
      expect(output).toContain('Fixed');

      // Verify the file was actually fixed
      const fixedContent = fs.readFileSync(tempFile, 'utf-8');
      expect(fixedContent).toContain('"Enable Pages in repository settings (Source: GitHub Actions)"');

      // Clean up
      fs.unlinkSync(tempFile);
      mockExit.mockRestore();
    });
  });

  describe('duplicate column IDs', () => {
    it('should detect duplicate column IDs', () => {
      const mockExit = jest.spyOn(process, 'exit').mockImplementation((code?: any) => {
        throw new Error(`Process exit: ${code}`);
      });

      const duplicateFile = path.join(fixturesDir, 'duplicate-columns.md');

      try {
        lintCommand({ file: duplicateFile });
      } catch (error: any) {
        expect(error.message).toBe('Process exit: 0'); // Warnings don't cause exit 1
      }

      const output = consoleOutput.join('\n');
      expect(output).toContain('Warning');
      expect(output).toContain('Duplicate column detected');
      expect(output).toContain('todo');
      mockExit.mockRestore();
    });
  });

  describe('check mode', () => {
    it('should exit with error code when issues found in check mode', () => {
      const mockExit = jest.spyOn(process, 'exit').mockImplementation((code?: any) => {
        throw new Error(`Process exit: ${code}`);
      });

      const unquotedFile = path.join(fixturesDir, 'invalid-yaml-unquoted.md');

      try {
        lintCommand({ file: unquotedFile, check: true });
      } catch (error: any) {
        expect(error.message).toBe('Process exit: 1');
      }

      mockExit.mockRestore();
    });

    it('should exit with 0 when no issues in check mode', () => {
      const mockExit = jest.spyOn(process, 'exit').mockImplementation((code?: any) => {
        throw new Error(`Process exit: ${code}`);
      });

      const validFile = path.join(fixturesDir, 'valid-lint.md');

      try {
        lintCommand({ file: validFile, check: true });
      } catch (error: any) {
        expect(error.message).toBe('Process exit: 0');
      }

      mockExit.mockRestore();
    });
  });

  describe('file not found', () => {
    it('should handle missing files gracefully', () => {
      const mockExit = jest.spyOn(process, 'exit').mockImplementation((code?: any) => {
        throw new Error(`Process exit: ${code}`);
      });

      try {
        lintCommand({ file: 'nonexistent.md' });
      } catch (error: any) {
        expect(error.message).toBe('Process exit: 1');
      }

      expect(consoleErrorOutput.join('\n')).toContain('File not found');
      mockExit.mockRestore();
    });
  });
});



