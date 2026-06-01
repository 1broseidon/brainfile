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
import { MemoryLogger } from '../utils/logger';
import { CLIError } from '../utils/cli-error';

describe('hooks commands', () => {
  let tempDir: string;
  let originalCwd: string;
  let originalHome: string | undefined;
  let logger: MemoryLogger;

  beforeEach(() => {
    // Create a temporary directory for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hooks-test-'));
    originalCwd = process.cwd();
    originalHome = process.env.HOME;

    // Set HOME to temp directory for user scope tests
    process.env.HOME = tempDir;
    process.chdir(tempDir);

    logger = new MemoryLogger();
  });

  afterEach(() => {
    // Restore original state
    process.chdir(originalCwd);
    process.env.HOME = originalHome;

    // Clean up temporary directory
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  });

  describe('installCommand', () => {
    it('should install hooks for Claude Code', () => {
      installCommand({ tool: 'claude-code', scope: 'user' }, logger);

      const settings = readToolSettings('claude-code', 'user');

      expect(settings.hooks).toBeDefined();
      expect(settings.hooks.PostToolUse).toBeDefined();
      expect(logger.getOutput()).toContain('Brainfile hooks installed');
    });

    it('should install hooks for Cursor', () => {
      installCommand({ tool: 'cursor', scope: 'user' }, logger);

      const settings = readToolSettings('cursor', 'user');

      expect(settings.hooks).toBeDefined();
      expect(settings.hooks.afterFileEdit).toBeDefined();
      expect(logger.getOutput()).toContain('Brainfile hooks installed');
    });

    it('should install hooks for Cline', () => {
      installCommand({ tool: 'cline', scope: 'project' }, logger);

      const settings = readToolSettings('cline', 'project');

      expect(settings.hooks).toBeDefined();
      expect(settings.hooks.PostToolUse).toBe(true);
      expect(logger.getOutput()).toContain('Brainfile hooks installed');
    });

    it('should throw CLIError for unknown tool', () => {
      expect(() => {
        installCommand({ tool: 'unknown-tool', scope: 'user' }, logger);
      }).toThrow(CLIError);

      try {
        installCommand({ tool: 'unknown-tool', scope: 'user' }, logger);
      } catch (e) {
        expect((e as CLIError).message).toContain('Unknown tool');
      }
    });

    it('should handle project scope', () => {
      installCommand({ tool: 'claude-code', scope: 'project' }, logger);

      const settings = readToolSettings('claude-code', 'project');

      expect(settings.hooks).toBeDefined();
    });
  });

  describe('uninstallCommand', () => {
    it('should uninstall hooks for Claude Code', () => {
      // First install
      installCommand({ tool: 'claude-code', scope: 'user' }, logger);
      logger = new MemoryLogger(); // Reset logger

      // Then uninstall
      uninstallCommand({ tool: 'claude-code', scope: 'user' }, logger);

      const settings = readToolSettings('claude-code', 'user');

      const hasBrainfileHooks = settings.hooks?.PostToolUse?.some((h: any) =>
        h.hooks?.some((hook: any) => hook.command?.includes('brainfile hooks'))
      );

      expect(hasBrainfileHooks).toBeFalsy();
      expect(logger.getOutput()).toContain('Removed brainfile hooks');
    });

    it('should handle uninstalling when not installed', () => {
      uninstallCommand({ tool: 'claude-code', scope: 'user' }, logger);

      expect(logger.getOutput()).toContain('No brainfile hooks found');
    });

    it('should uninstall from all scopes when scope is "all"', () => {
      // Install in both scopes
      installCommand({ tool: 'claude-code', scope: 'user' }, logger);
      installCommand({ tool: 'claude-code', scope: 'project' }, logger);
      logger = new MemoryLogger(); // Reset logger

      // Uninstall from all
      uninstallCommand({ tool: 'claude-code', scope: 'all' }, logger);

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
      listCommand({}, logger);

      const output = logger.getOutput();
      expect(output).toContain('Claude Code');
      expect(output).toContain('Cursor');
      expect(output).toContain('Cline');
    });

    it('should list specific tool when specified', () => {
      listCommand({ tool: 'claude-code' }, logger);

      const output = logger.getOutput();
      expect(output).toContain('Claude Code');
    });

    it('should list Cline when specified', () => {
      listCommand({ tool: 'cline' }, logger);

      const output = logger.getOutput();
      expect(output).toContain('Cline');
    });

    it('should show installed status correctly', () => {
      installCommand({ tool: 'claude-code', scope: 'user' }, logger);
      logger = new MemoryLogger();

      listCommand({ tool: 'claude-code' }, logger);

      const output = logger.getOutput();
      expect(output).toContain('✓');
    });

    it('should show not installed status correctly', () => {
      listCommand({ tool: 'cursor' }, logger);

      const output = logger.getOutput();
      expect(output).toContain('✗ Not installed');
    });
  });
});
