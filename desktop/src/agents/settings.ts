/**
 * dispatch.json: the app-wide dispatch settings, and per repository a policy
 * that overrides them. The person's own agents live here too, as
 * `agentServers` in Zed's shape (task-47). Nothing here touches Electron, so
 * it is tested on its own.
 */
import * as fs from 'fs';
import * as path from 'path';
import { cleanServers } from '../shared/agentServers';
import type { DispatchSettings, PermissionPolicy } from '../shared/api';

export interface SettingsFile extends Partial<DispatchSettings> {
  projects?: Record<string, { permissions?: PermissionPolicy }>;
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
