import {
  getSettingsPath,
  readToolSettings,
  writeToolSettings,
  installBrainfileHooks,
  uninstallBrainfileHooks,
  areBrainfileHooksInstalled
} from '../utils/hook-settings';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('hook-settings', () => {
  let tempDir: string;
  let originalCwd: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    // Create a temporary directory for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-settings-test-'));
    originalCwd = process.cwd();
    originalHome = process.env.HOME;

    // Set HOME to temp directory for user scope tests
    process.env.HOME = tempDir;
    process.chdir(tempDir);
  });

  afterEach(() => {
    // Restore original state
    process.chdir(originalCwd);
    process.env.HOME = originalHome;

    // Clean up temporary directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('getSettingsPath', () => {
    it('should return correct path for Claude Code user scope', () => {
      const result = getSettingsPath('claude-code', 'user');
      expect(result).toContain('.claude');
      expect(result).toContain('settings.json');
    });

    it('should return correct path for Claude Code project scope', () => {
      const result = getSettingsPath('claude-code', 'project');
      expect(result).toBe(path.join(tempDir, '.claude', 'settings.json'));
    });

    it('should return correct path for Cursor user scope', () => {
      const result = getSettingsPath('cursor', 'user');
      expect(result).toContain('.cursor');
      expect(result).toContain('hooks.json');
    });

    it('should return correct path for Cursor project scope', () => {
      const result = getSettingsPath('cursor', 'project');
      expect(result).toBe(path.join(tempDir, '.cursor', 'hooks.json'));
    });

    it('should return correct path for Cline user scope', () => {
      const result = getSettingsPath('cline', 'user');
      expect(result).toContain('Documents');
      expect(result).toContain('Cline');
      expect(result).toContain('Hooks');
    });

    it('should return correct path for Cline project scope', () => {
      const result = getSettingsPath('cline', 'project');
      expect(result).toBe(path.join(tempDir, '.clinerules', 'hooks'));
    });
  });

  describe('readToolSettings', () => {
    it('should return empty object for non-existent Claude Code settings', () => {
      // Use project scope to avoid os.homedir() issues in tests
      const result = readToolSettings('claude-code', 'project');
      expect(result).toEqual({});
    });

    it('should return default structure for non-existent Cursor settings', () => {
      // Use project scope to avoid os.homedir() issues in tests
      const result = readToolSettings('cursor', 'project');
      expect(result).toEqual({ version: 1, hooks: {} });
    });

    it('should return empty hooks for non-existent Cline settings', () => {
      // Use project scope to avoid os.homedir() issues in tests
      const result = readToolSettings('cline', 'project');
      expect(result).toEqual({ hooks: {} });
    });

    it('should read Cline hook scripts', () => {
      const hooksDir = getSettingsPath('cline', 'project');
      fs.mkdirSync(hooksDir, { recursive: true });
      
      // Create hook files
      fs.writeFileSync(path.join(hooksDir, 'PostToolUse'), '#!/bin/bash\necho test');
      fs.writeFileSync(path.join(hooksDir, 'TaskStart'), '#!/bin/bash\necho test');

      const result = readToolSettings('cline', 'project');
      expect(result.hooks.PostToolUse).toBe(true);
      expect(result.hooks.TaskStart).toBe(true);
      expect(result.hooks.UserPromptSubmit).toBeUndefined();
    });

    it('should read existing settings file', () => {
      const settingsPath = getSettingsPath('claude-code', 'user');
      const settingsDir = path.dirname(settingsPath);

      fs.mkdirSync(settingsDir, { recursive: true });
      fs.writeFileSync(settingsPath, JSON.stringify({ test: 'value' }));

      const result = readToolSettings('claude-code', 'user');
      expect(result).toEqual({ test: 'value' });
    });

    it('should handle malformed JSON gracefully', () => {
      const settingsPath = getSettingsPath('claude-code', 'user');
      const settingsDir = path.dirname(settingsPath);

      fs.mkdirSync(settingsDir, { recursive: true });
      fs.writeFileSync(settingsPath, 'invalid json');

      const result = readToolSettings('claude-code', 'user');
      expect(result).toEqual({});
    });
  });

  describe('writeToolSettings', () => {
    it('should create directory and write settings', () => {
      const settings = { hooks: { test: 'value' } };

      writeToolSettings('claude-code', 'user', settings);

      const settingsPath = getSettingsPath('claude-code', 'user');
      expect(fs.existsSync(settingsPath)).toBe(true);

      const content = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      expect(content).toEqual(settings);
    });

    it('should overwrite existing settings', () => {
      const settingsPath = getSettingsPath('claude-code', 'user');
      const settingsDir = path.dirname(settingsPath);

      fs.mkdirSync(settingsDir, { recursive: true });
      fs.writeFileSync(settingsPath, JSON.stringify({ old: 'value' }));

      const newSettings = { new: 'value' };
      writeToolSettings('claude-code', 'user', newSettings);

      const content = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      expect(content).toEqual(newSettings);
    });
  });

  describe('installBrainfileHooks', () => {
    it('should install hooks for Claude Code', () => {
      installBrainfileHooks('claude-code', 'user');

      const settings = readToolSettings('claude-code', 'user');

      expect(settings.hooks).toBeDefined();
      expect(settings.hooks.PostToolUse).toBeDefined();
      expect(settings.hooks.UserPromptSubmit).toBeDefined();
      expect(settings.hooks.SessionStart).toBeDefined();
    });

    it('should install hooks for Cursor', () => {
      installBrainfileHooks('cursor', 'user');

      const settings = readToolSettings('cursor', 'user');

      expect(settings.hooks).toBeDefined();
      expect(settings.hooks.afterFileEdit).toBeDefined();
      expect(settings.hooks.beforeSubmitPrompt).toBeDefined();
      expect(settings.hooks.stop).toBeDefined();
    });

    it('should install hook scripts for Cline', () => {
      installBrainfileHooks('cline', 'project');

      const hooksDir = getSettingsPath('cline', 'project');
      
      // Check that hook files were created
      expect(fs.existsSync(path.join(hooksDir, 'PostToolUse'))).toBe(true);
      expect(fs.existsSync(path.join(hooksDir, 'UserPromptSubmit'))).toBe(true);
      expect(fs.existsSync(path.join(hooksDir, 'TaskStart'))).toBe(true);

      // Check that files are executable
      const postToolUsePath = path.join(hooksDir, 'PostToolUse');
      const stats = fs.statSync(postToolUsePath);
      expect(stats.mode & 0o111).toBeGreaterThan(0); // Check for any execute bit

      // Check that files contain brainfile commands
      const content = fs.readFileSync(postToolUsePath, 'utf-8');
      expect(content).toContain('#!/usr/bin/env bash');
      expect(content).toContain('brainfile hooks');
    });

    it('should preserve existing hooks when installing', () => {
      const existingSettings = {
        hooks: {
          PostToolUse: [
            {
              matcher: 'Read',
              hooks: [{ type: 'command', command: 'echo "existing"' }]
            }
          ]
        }
      };

      writeToolSettings('claude-code', 'user', existingSettings);
      installBrainfileHooks('claude-code', 'user');

      const settings = readToolSettings('claude-code', 'user');

      expect(settings.hooks.PostToolUse.length).toBeGreaterThan(1);
    });

    it('should not duplicate hooks if already installed', () => {
      installBrainfileHooks('claude-code', 'user');
      installBrainfileHooks('claude-code', 'user'); // Install again

      const settings = readToolSettings('claude-code', 'user');

      // Count hooks with brainfile commands
      const brainfileHooks = settings.hooks.PostToolUse.filter((h: any) =>
        h.hooks?.some((hook: any) => hook.command?.includes('brainfile hooks'))
      );

      expect(brainfileHooks.length).toBe(1);
    });
  });

  describe('uninstallBrainfileHooks', () => {
    it('should remove brainfile hooks from Claude Code settings', () => {
      installBrainfileHooks('claude-code', 'user');
      uninstallBrainfileHooks('claude-code', 'user');

      const settings = readToolSettings('claude-code', 'user');

      const hasBrainfileHooks = settings.hooks?.PostToolUse?.some((h: any) =>
        h.hooks?.some((hook: any) => hook.command?.includes('brainfile hooks'))
      );

      expect(hasBrainfileHooks).toBeFalsy();
    });

    it('should remove brainfile hooks from Cursor settings', () => {
      installBrainfileHooks('cursor', 'user');
      uninstallBrainfileHooks('cursor', 'user');

      const settings = readToolSettings('cursor', 'user');

      const hasBrainfileHooks = settings.hooks?.afterFileEdit?.some((h: any) =>
        h.command?.includes('brainfile hooks')
      );

      expect(hasBrainfileHooks).toBeFalsy();
    });

    it('should remove brainfile hook scripts from Cline', () => {
      installBrainfileHooks('cline', 'project');
      
      const hooksDir = getSettingsPath('cline', 'project');
      expect(fs.existsSync(path.join(hooksDir, 'PostToolUse'))).toBe(true);

      uninstallBrainfileHooks('cline', 'project');

      expect(fs.existsSync(path.join(hooksDir, 'PostToolUse'))).toBe(false);
      expect(fs.existsSync(path.join(hooksDir, 'UserPromptSubmit'))).toBe(false);
      expect(fs.existsSync(path.join(hooksDir, 'TaskStart'))).toBe(false);
    });

    it('should preserve other hooks when uninstalling', () => {
      const existingSettings = {
        hooks: {
          PostToolUse: [
            {
              matcher: 'Read',
              hooks: [{ type: 'command', command: 'echo "existing"' }]
            }
          ]
        }
      };

      writeToolSettings('claude-code', 'user', existingSettings);
      installBrainfileHooks('claude-code', 'user');
      uninstallBrainfileHooks('claude-code', 'user');

      const settings = readToolSettings('claude-code', 'user');

      const existingHook = settings.hooks.PostToolUse.find(
        (h: any) => h.matcher === 'Read'
      );

      expect(existingHook).toBeDefined();
    });

    it('should handle uninstalling when no hooks exist', () => {
      expect(() => {
        uninstallBrainfileHooks('claude-code', 'user');
      }).not.toThrow();
    });
  });

  describe('areBrainfileHooksInstalled', () => {
    it('should return false when settings file does not exist', () => {
      const result = areBrainfileHooksInstalled('claude-code', 'user');
      expect(result).toBe(false);
    });

    it('should return false when hooks are not installed', () => {
      writeToolSettings('claude-code', 'user', { hooks: {} });

      const result = areBrainfileHooksInstalled('claude-code', 'user');
      expect(result).toBe(false);
    });

    it('should return false when Cline hooks directory does not exist', () => {
      const result = areBrainfileHooksInstalled('cline', 'project');
      expect(result).toBe(false);
    });

    it('should return true when Claude Code hooks are installed', () => {
      installBrainfileHooks('claude-code', 'user');

      const result = areBrainfileHooksInstalled('claude-code', 'user');
      expect(result).toBe(true);
    });

    it('should return true when Cursor hooks are installed', () => {
      installBrainfileHooks('cursor', 'user');

      const result = areBrainfileHooksInstalled('cursor', 'user');
      expect(result).toBe(true);
    });

    it('should return true when Cline hooks are installed', () => {
      installBrainfileHooks('cline', 'project');

      const result = areBrainfileHooksInstalled('cline', 'project');
      expect(result).toBe(true);
    });

    it('should return false when Cline hooks directory exists but no brainfile hooks', () => {
      const hooksDir = getSettingsPath('cline', 'project');
      fs.mkdirSync(hooksDir, { recursive: true });
      
      // Create a non-brainfile hook
      fs.writeFileSync(path.join(hooksDir, 'PostToolUse'), '#!/bin/bash\necho "other hook"');

      const result = areBrainfileHooksInstalled('cline', 'project');
      expect(result).toBe(false);
    });

    it('should return true if at least one hook is installed', () => {
      const settings = {
        hooks: {
          PostToolUse: [
            {
              matcher: 'Edit|Write',
              hooks: [{ type: 'command', command: 'brainfile hooks after-edit' }]
            }
          ]
        }
      };

      writeToolSettings('claude-code', 'user', settings);

      const result = areBrainfileHooksInstalled('claude-code', 'user');
      expect(result).toBe(true);
    });
  });
});
