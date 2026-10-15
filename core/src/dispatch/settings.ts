/**
 * dispatch.json: the app-wide dispatch settings, and per repository a policy
 * that overrides them. The person's own agents live here too, as
 * `agentServers` in Zed's shape (task-47). The file is in the data folder
 * (dataDir), so the CLI and the desktop read the same one.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { cleanServers } from './agentServers';
import { forgetChanged } from './models';
import type { DispatchSettings, PermissionPolicy } from './types';

/**
 * Where dispatch keeps its settings (dispatch.json), the model cache
 * (models.json) and the agent servers it installs (agents/): the desktop's
 * own data folder, so the CLI and the desktop share them. `BRAINFILE_DATA_DIR`
 * when set (the desktop sets it to Electron's userData), else the platform's:
 * ~/Library/Application Support/Brainfile on a Mac, %APPDATA%\Brainfile on
 * Windows, $XDG_DATA_HOME/brainfile (~/.local/share/brainfile) elsewhere.
 */
export function dataDir(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform, home = os.homedir()): string {
  if (env.BRAINFILE_DATA_DIR) return env.BRAINFILE_DATA_DIR;
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'Brainfile');
  if (platform === 'win32') return path.join(env.APPDATA ?? path.join(home, 'AppData', 'Roaming'), 'Brainfile');
  return path.join(env.XDG_DATA_HOME || path.join(home, '.local', 'share'), 'brainfile');
}

/** dispatch.json in the data folder. */
export const settingsFile = (dir: string): string => path.join(dir, 'dispatch.json');

export interface SettingsFile extends Partial<DispatchSettings> {
  /** Per repository: how asks are answered, and the most hand-offs at once (an epic's lead keeps to it; 3 when unset). */
  projects?: Record<string, { permissions?: PermissionPolicy; concurrency?: number }>;
}

export function readSettingsFile(file: string): SettingsFile {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as SettingsFile;
  } catch {
    return {};
  }
}

/** The settings as the window sees them: every field there, the agent servers cleaned. */
export function settingsOf(file: SettingsFile): DispatchSettings {
  return { bypass: file.bypass === true, modes: file.modes ?? {}, agentServers: cleanServers(file.agentServers) };
}

/** Writes the patch over what the file holds, keeping what it does not name (`projects`), and returns the settings now. */
export function writeSettings(file: string, patch: Partial<DispatchSettings>): DispatchSettings {
  const clean = patch.agentServers ? { ...patch, agentServers: cleanServers(patch.agentServers) } : patch;
  const next = { ...readSettingsFile(file), ...clean };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(next, null, 2));
  return settingsOf(next);
}

/** dispatch.json as it is on disk, `projects` and all. */
export function readSettings(dir: string): SettingsFile {
  return readSettingsFile(settingsFile(dir));
}

export function getSettings(dir: string): DispatchSettings {
  return settingsOf(readSettings(dir));
}

/** A repository's own policy wins; otherwise the app-wide switch decides. */
export function policyFor(dir: string, projectId: string): PermissionPolicy {
  const file = readSettings(dir);
  return file.projects?.[projectId]?.permissions ?? (file.bypass ? 'bypass' : 'ask');
}

/**
 * Writes the patch to dispatch.json and returns the settings now. A custom
 * agent whose entry changed is asked again for its models and modes. Open
 * sessions are the caller's to move to their new mode (applyMode).
 */
export function setSettings(dir: string, patch: Partial<DispatchSettings>): DispatchSettings {
  const before = getSettings(dir).agentServers;
  const now = writeSettings(settingsFile(dir), patch);
  if (patch.agentServers) forgetChanged(dir, before, now.agentServers);
  return now;
}
