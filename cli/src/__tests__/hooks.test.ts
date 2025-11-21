import {
  afterEditCommand,
  beforePromptCommand,
  sessionStartCommand,
  installCommand,
  uninstallCommand,
  listCommand
} from '../commands/hooks';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getSettingsPath, readToolSettings } from '../utils/hook-settings';

describe('hooks commands', () => {
  let tempDir: string;
  let originalCwd: string;
  let originalHome: string | undefined;
  let originalStdin: any;
  let originalStdout: any;
  let stdinData: string;
  let stdoutData: string[];

  beforeEach(() => {
    // Create a temporary directory for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hooks-test-'));
    originalCwd = process.cwd();
    originalHome = process.env.HOME;

    // Set HOME to temp directory for user scope tests
    process.env.HOME = tempDir;
    process.chdir(tempDir);

    // Mock stdin and stdout
    stdinData = '';
    stdoutData = [];

    originalStdin = process.stdin;
    originalStdout = process.stdout.write;

    // Mock stdout.write to capture console.log output
    process.stdout.write = jest.fn((str: string) => {
      stdoutData.push(str);
      return true;
    });
  });

  afterEach(() => {
    // Restore original state
    process.chdir(originalCwd);
    process.env.HOME = originalHome;
    process.stdout.write = originalStdout;

    // Clean up temporary directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('installCommand', () => {
    it('should install hooks for Claude Code', () => {
      const consoleSpy = jest.spyOn(console, 'log');

      installCommand({ tool: 'claude-code', scope: 'user' });

      const settings = readToolSettings('claude-code', 'user');

      expect(settings.hooks).toBeDefined();
      expect(settings.hooks.PostToolUse).toBeDefined();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Brainfile hooks installed')
      );

      consoleSpy.mockRestore();
    });

    it('should install hooks for Cursor', () => {
      const consoleSpy = jest.spyOn(console, 'log');

      installCommand({ tool: 'cursor', scope: 'user' });

      const settings = readToolSettings('cursor', 'user');

      expect(settings.hooks).toBeDefined();
      expect(settings.hooks.afterFileEdit).toBeDefined();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Brainfile hooks installed')
      );

      consoleSpy.mockRestore();
    });

    it('should install hooks for Cline', () => {
      const consoleSpy = jest.spyOn(console, 'log');

      installCommand({ tool: 'cline', scope: 'project' });

      const settings = readToolSettings('cline', 'project');

      expect(settings.hooks).toBeDefined();
      expect(settings.hooks.PostToolUse).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Brainfile hooks installed')
      );

      consoleSpy.mockRestore();
    });

    it('should exit with error for unknown tool', () => {
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation((code?: any) => {
        throw new Error(`process.exit: ${code}`);
      });

      expect(() => {
        installCommand({ tool: 'unknown-tool', scope: 'user' });
      }).toThrow();

      exitSpy.mockRestore();
    });

    it('should handle project scope', () => {
      installCommand({ tool: 'claude-code', scope: 'project' });

      const settings = readToolSettings('claude-code', 'project');

      expect(settings.hooks).toBeDefined();
    });
  });

  describe('uninstallCommand', () => {
    it('should uninstall hooks for Claude Code', () => {
      // First install
      installCommand({ tool: 'claude-code', scope: 'user' });

      // Then uninstall
      const consoleSpy = jest.spyOn(console, 'log');
      uninstallCommand({ tool: 'claude-code', scope: 'user' });

      const settings = readToolSettings('claude-code', 'user');

      const hasBrainfileHooks = settings.hooks?.PostToolUse?.some((h: any) =>
        h.hooks?.some((hook: any) => hook.command?.includes('brainfile hooks'))
      );

      expect(hasBrainfileHooks).toBeFalsy();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Removed brainfile hooks')
      );

      consoleSpy.mockRestore();
    });

    it('should handle uninstalling when not installed', () => {
      const consoleSpy = jest.spyOn(console, 'log');

      uninstallCommand({ tool: 'claude-code', scope: 'user' });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('No brainfile hooks found')
      );

      consoleSpy.mockRestore();
    });

    it('should uninstall from all scopes when scope is "all"', () => {
      // Install in both scopes
      installCommand({ tool: 'claude-code', scope: 'user' });
      installCommand({ tool: 'claude-code', scope: 'project' });

      // Uninstall from all
      uninstallCommand({ tool: 'claude-code', scope: 'all' });

      const userSettings = readToolSettings('claude-code', 'user');
      const projectSettings = readToolSettings('claude-code', 'project');

      const hasUserHooks = userSettings.hooks?.PostToolUse?.some((h: any) =>
        h.hooks?.some((hook: any) => hook.command?.includes('brainfile hooks'))
      );

      const hasProjectHooks = projectSettings.hooks?.PostToolUse?.some((h: any) =>
        h.hooks?.some((hook: any) => hook.command?.includes('brainfile hooks'))
      );

      expect(hasUserHooks).toBeFalsy();
      expect(hasProjectHooks).toBeFalsy();
    });
  });

  describe('listCommand', () => {
    it('should list all tools when no tool specified', () => {
      const consoleSpy = jest.spyOn(console, 'log');

      listCommand({});

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Claude Code')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cursor')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cline')
      );

      consoleSpy.mockRestore();
    });

    it('should list specific tool when specified', () => {
      const consoleSpy = jest.spyOn(console, 'log');

      listCommand({ tool: 'claude-code' });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Claude Code')
      );

      consoleSpy.mockRestore();
    });

    it('should list Cline when specified', () => {
      const consoleSpy = jest.spyOn(console, 'log');

      listCommand({ tool: 'cline' });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cline')
      );

      consoleSpy.mockRestore();
    });

    it('should show installed status correctly', () => {
      installCommand({ tool: 'claude-code', scope: 'user' });

      const consoleSpy = jest.spyOn(console, 'log');

      listCommand({ tool: 'claude-code' });

      const output = consoleSpy.mock.calls.map(call => call[0]).join('\n');

      expect(output).toContain('✓');

      consoleSpy.mockRestore();
    });

    it('should show not installed status correctly', () => {
      const consoleSpy = jest.spyOn(console, 'log');

      listCommand({ tool: 'cursor' });

      const output = consoleSpy.mock.calls.map(call => call[0]).join('\n');

      expect(output).toContain('✗ Not installed');

      consoleSpy.mockRestore();
    });
  });
});
