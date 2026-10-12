/**
 * The person's editors, found across supported platforms, and how each opens a file at a
 * line. A file named in an agent's reply (`core/src/linter.ts:74`) opens in
 * the one chosen in Settings; with none chosen, a running editor, then the first found.
 */
import { spawnSync } from 'child_process';
import spawn from 'cross-spawn';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { app, shell } from 'electron';
import { discoverEditors, findTerminal, selectEditor, runningProcesses, terminalInvocation, editorUrl, type EditorHost } from './editorDiscovery';
import type { EditorInfo, Result } from '../shared/api';

const SYSTEM: EditorInfo = { id: 'system', name: 'The file’s default app' };

const host: EditorHost = {
  platform: process.platform,
  home: os.homedir(),
  env: process.env,
  exists: (file) => { try { fs.accessSync(file, process.platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK); return true; } catch { return false; } },
  entries: (dir) => { try { return fs.readdirSync(dir); } catch { return []; } },
  run: (command, args) => {
    const r = spawnSync(command, args, { encoding: 'utf-8', timeout: 4000, windowsHide: true });
    return r.status === 0 ? (r.stdout ?? '').trim() : '';
  },
  protocol: (scheme) => { try { return app.getApplicationNameForProtocol(`${scheme}://`); } catch { return ''; } },
};

export function listEditors(): EditorInfo[] {
  const found = discoverEditors(host);
  const terminal = findTerminal(host);
  return [
    { id: 'auto', name: 'Automatic (running editor, then first found)' },
    ...found.map(({ editor }) => ({ id: editor.id, name: editor.terminal ? `${editor.name} in ${terminal?.name}` : editor.name })),
    SYSTEM,
  ];
}

/** A file in the project, or nothing: a path outside it, or one that is not there, is never opened. */
function inProject(projectId: string, file: string): string | null {
  const root = path.resolve(projectId);
  const full = path.resolve(root, file);
  if (full !== root && !full.startsWith(root + path.sep)) return null;
  try {
    return fs.statSync(full).isFile() ? full : null;
  } catch {
    return null;
  }
}

/** Which of these paths, relative to the project, are files in it. */
export function existingFiles(projectId: string, files: string[]): string[] {
  return files.filter((file) => inProject(projectId, file) !== null);
}

export function openInEditor(projectId: string, file: string, line: number | undefined, editorId: string | undefined): Result {
  const full = inProject(projectId, file);
  if (!full) return { ok: false, error: `${file} is not a file in this project` };
  launch(full, path.resolve(projectId), line, editorId);
  return { ok: true, value: undefined };
}

/** Opens a folder (a hand-off's worktree) as the editor's project. */
export function openFolder(folder: string, editorId: string | undefined): Result {
  if (!fs.statSync(folder, { throwIfNoEntry: false })?.isDirectory()) return { ok: false, error: `${folder} is not there` };
  launch(folder, folder, undefined, editorId);
  return { ok: true, value: undefined };
}

function launch(target: string, cwd: string, line: number | undefined, editorId: string | undefined): void {
  if (editorId === 'system') { void shell.openPath(target); return; }
  const found = discoverEditors(host);
  const selected = selectEditor(found, editorId, runningProcesses(host));
  if (!selected) { void shell.openPath(target); return; }
  if (selected.scheme) {
    void shell.openExternal(editorUrl(selected.editor, selected.scheme, target, line)).catch(() => shell.openPath(target));
    return;
  }
  const args = [...(selected.prefix ?? []), ...selected.editor.args(target, line)];
  const invocation = selected.editor.terminal ? terminalInvocation(host, selected.command!, args, cwd) : { command: selected.command!, args };
  if (!invocation) { void shell.openPath(target); return; }
  // cross-spawn handles Windows .cmd PATH shims and their argument escaping.
  const child = spawn(invocation.command, invocation.args, { cwd, env: process.env, detached: true, stdio: 'ignore', windowsHide: false });
  child.on('error', () => void shell.openPath(target));
  child.on('exit', (code) => { if (code !== null && code !== 0) void shell.openPath(target); });
  child.unref();
}
