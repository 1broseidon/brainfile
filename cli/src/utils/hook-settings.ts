import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export type SupportedTool = 'claude-code' | 'cursor';
export type SettingsScope = 'user' | 'project';

/**
 * Get settings path for a specific tool and scope
 */
export function getSettingsPath(tool: SupportedTool, scope: SettingsScope): string {
  const homeDir = os.homedir();

  if (scope === 'user') {
    switch (tool) {
      case 'claude-code':
        return path.join(homeDir, '.claude', 'settings.json');
      case 'cursor':
        return path.join(homeDir, '.cursor', 'hooks.json');
    }
  } else {
    // project scope
    switch (tool) {
      case 'claude-code':
        return path.join(process.cwd(), '.claude', 'settings.json');
      case 'cursor':
        return path.join(process.cwd(), '.cursor', 'hooks.json');
    }
  }
}

/**
 * Read tool settings (returns empty object if file doesn't exist)
 */
export function readToolSettings(tool: SupportedTool, scope: SettingsScope): any {
  const settingsPath = getSettingsPath(tool, scope);

  if (!fs.existsSync(settingsPath)) {
    return tool === 'cursor' ? { version: 1, hooks: {} } : {};
  }

  try {
    const content = fs.readFileSync(settingsPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return tool === 'cursor' ? { version: 1, hooks: {} } : {};
  }
}

/**
 * Write tool settings
 */
export function writeToolSettings(tool: SupportedTool, scope: SettingsScope, settings: any): void {
  const settingsPath = getSettingsPath(tool, scope);
  const settingsDir = path.dirname(settingsPath);

  // Create directory if it doesn't exist
  if (!fs.existsSync(settingsDir)) {
    fs.mkdirSync(settingsDir, { recursive: true });
  }

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
}

/**
 * Add brainfile hooks to tool settings
 */
export function installBrainfileHooks(tool: SupportedTool, scope: SettingsScope): void {
  const settings = readToolSettings(tool, scope);

  if (tool === 'claude-code') {
    if (!settings.hooks) {
      settings.hooks = {};
    }

    settings.hooks.PostToolUse = settings.hooks.PostToolUse || [];
    settings.hooks.UserPromptSubmit = settings.hooks.UserPromptSubmit || [];
    settings.hooks.SessionStart = settings.hooks.SessionStart || [];

    // Add PostToolUse hook if not already present
    const hasPostToolUse = settings.hooks.PostToolUse.some((h: any) =>
      h.hooks?.some((hook: any) => hook.command?.includes('brainfile hooks after-edit'))
    );

    if (!hasPostToolUse) {
      settings.hooks.PostToolUse.push({
        matcher: 'Edit|Write|Create',
        hooks: [
          {
            type: 'command',
            command: 'brainfile hooks after-edit'
          }
        ]
      });
    }

    // Add UserPromptSubmit hook if not already present
    const hasUserPromptSubmit = settings.hooks.UserPromptSubmit.some((h: any) =>
      h.hooks?.some((hook: any) => hook.command?.includes('brainfile hooks before-prompt'))
    );

    if (!hasUserPromptSubmit) {
      settings.hooks.UserPromptSubmit.push({
        matcher: '',
        hooks: [
          {
            type: 'command',
            command: 'brainfile hooks before-prompt'
          }
        ]
      });
    }

    // Add SessionStart hook if not already present
    const hasSessionStart = settings.hooks.SessionStart.some((h: any) =>
      h.hooks?.some((hook: any) => hook.command?.includes('brainfile hooks session-start'))
    );

    if (!hasSessionStart) {
      settings.hooks.SessionStart.push({
        matcher: '',
        hooks: [
          {
            type: 'command',
            command: 'brainfile hooks session-start'
          }
        ]
      });
    }
  } else if (tool === 'cursor') {
    if (!settings.hooks) {
      settings.hooks = {};
    }

    settings.hooks.afterFileEdit = settings.hooks.afterFileEdit || [];
    settings.hooks.beforeSubmitPrompt = settings.hooks.beforeSubmitPrompt || [];
    settings.hooks.stop = settings.hooks.stop || [];

    // Add afterFileEdit hook if not already present
    const hasAfterFileEdit = settings.hooks.afterFileEdit.some((h: any) =>
      h.command?.includes('brainfile hooks after-edit')
    );

    if (!hasAfterFileEdit) {
      settings.hooks.afterFileEdit.push({
        command: 'brainfile hooks after-edit'
      });
    }

    // Add beforeSubmitPrompt hook if not already present
    const hasBeforeSubmitPrompt = settings.hooks.beforeSubmitPrompt.some((h: any) =>
      h.command?.includes('brainfile hooks before-prompt')
    );

    if (!hasBeforeSubmitPrompt) {
      settings.hooks.beforeSubmitPrompt.push({
        command: 'brainfile hooks before-prompt'
      });
    }

    // Add stop hook if not already present
    const hasStop = settings.hooks.stop.some((h: any) =>
      h.command?.includes('brainfile hooks session-start')
    );

    if (!hasStop) {
      settings.hooks.stop.push({
        command: 'brainfile hooks session-start'
      });
    }
  }

  writeToolSettings(tool, scope, settings);
}

/**
 * Remove brainfile hooks from tool settings
 */
export function uninstallBrainfileHooks(tool: SupportedTool, scope: SettingsScope): void {
  const settings = readToolSettings(tool, scope);

  if (!settings.hooks) {
    return;
  }

  if (tool === 'claude-code') {
    // Remove brainfile hooks from each event type
    if (settings.hooks.PostToolUse) {
      settings.hooks.PostToolUse = settings.hooks.PostToolUse.filter((h: any) =>
        !h.hooks?.some((hook: any) => hook.command?.includes('brainfile hooks'))
      );
    }

    if (settings.hooks.UserPromptSubmit) {
      settings.hooks.UserPromptSubmit = settings.hooks.UserPromptSubmit.filter((h: any) =>
        !h.hooks?.some((hook: any) => hook.command?.includes('brainfile hooks'))
      );
    }

    if (settings.hooks.SessionStart) {
      settings.hooks.SessionStart = settings.hooks.SessionStart.filter((h: any) =>
        !h.hooks?.some((hook: any) => hook.command?.includes('brainfile hooks'))
      );
    }
  } else if (tool === 'cursor') {
    // Remove brainfile hooks from each event type
    if (settings.hooks.afterFileEdit) {
      settings.hooks.afterFileEdit = settings.hooks.afterFileEdit.filter((h: any) =>
        !h.command?.includes('brainfile hooks')
      );
    }

    if (settings.hooks.beforeSubmitPrompt) {
      settings.hooks.beforeSubmitPrompt = settings.hooks.beforeSubmitPrompt.filter((h: any) =>
        !h.command?.includes('brainfile hooks')
      );
    }

    if (settings.hooks.stop) {
      settings.hooks.stop = settings.hooks.stop.filter((h: any) =>
        !h.command?.includes('brainfile hooks')
      );
    }
  }

  writeToolSettings(tool, scope, settings);
}

/**
 * Check if brainfile hooks are installed for a tool
 */
export function areBrainfileHooksInstalled(tool: SupportedTool, scope: SettingsScope): boolean {
  const settingsPath = getSettingsPath(tool, scope);

  if (!fs.existsSync(settingsPath)) {
    return false;
  }

  const settings = readToolSettings(tool, scope);

  if (!settings.hooks) {
    return false;
  }

  if (tool === 'claude-code') {
    const hasPostToolUse = settings.hooks.PostToolUse?.some((h: any) =>
      h.hooks?.some((hook: any) => hook.command?.includes('brainfile hooks after-edit'))
    ) || false;

    const hasUserPromptSubmit = settings.hooks.UserPromptSubmit?.some((h: any) =>
      h.hooks?.some((hook: any) => hook.command?.includes('brainfile hooks before-prompt'))
    ) || false;

    const hasSessionStart = settings.hooks.SessionStart?.some((h: any) =>
      h.hooks?.some((hook: any) => hook.command?.includes('brainfile hooks session-start'))
    ) || false;

    return hasPostToolUse || hasUserPromptSubmit || hasSessionStart;
  } else if (tool === 'cursor') {
    const hasAfterFileEdit = settings.hooks.afterFileEdit?.some((h: any) =>
      h.command?.includes('brainfile hooks after-edit')
    ) || false;

    const hasBeforeSubmitPrompt = settings.hooks.beforeSubmitPrompt?.some((h: any) =>
      h.command?.includes('brainfile hooks before-prompt')
    ) || false;

    const hasStop = settings.hooks.stop?.some((h: any) =>
      h.command?.includes('brainfile hooks session-start')
    ) || false;

    return hasAfterFileEdit || hasBeforeSubmitPrompt || hasStop;
  }

  return false;
}
