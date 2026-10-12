/**
 * The person's editors, found on this Mac, and how each opens a file at a
 * line. A file named in an agent's reply (`core/src/linter.ts:74`) opens in
 * the one chosen in Settings; with none chosen, the first found here.
 */
import { spawn, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { shell } from 'electron';
import type { EditorInfo, Result } from '../shared/api';

interface Editor {
  id: string;
  name: string;
  /** The app bundle, looked for in /Applications and ~/Applications. */
  app?: string;
  /** Where the bundle keeps its command line, or a command on PATH. */
  cli: (bundle: string) => string;
  /** The arguments that open `file` at `line`. */
  args: (file: string, line?: number) => string[];
  /** A terminal editor, run in Ghostty. */
  terminal?: boolean;
}

const at = (file: string, line?: number) => (line ? `${file}:${line}` : file);
const vscodeLike = (app: string, bin: string): Pick<Editor, 'app' | 'cli' | 'args'> => ({
  app,
  cli: (bundle) => path.join(bundle, 'Contents/Resources/app/bin', bin),
  args: (file, line) => ['-g', at(file, line)],
});
const jetbrains = (id: string, name: string, app: string, bin: string): Editor => ({
  id,
  name,
  app,
  cli: (bundle) => path.join(bundle, 'Contents/MacOS', bin),
  args: (file, line) => (line ? ['--line', String(line), file] : [file]),
});

/** In the order a default is chosen when the person has not chosen one. */
const EDITORS: Editor[] = [
  { id: 'cursor', name: 'Cursor', ...vscodeLike('Cursor.app', 'cursor') },
  { id: 'vscode', name: 'Visual Studio Code', ...vscodeLike('Visual Studio Code.app', 'code') },
  { id: 'zed', name: 'Zed', app: 'Zed.app', cli: (bundle) => path.join(bundle, 'Contents/MacOS/cli'), args: (file, line) => [at(file, line)] },
  { id: 'windsurf', name: 'Windsurf', ...vscodeLike('Windsurf.app', 'windsurf') },
  { id: 'antigravity', name: 'Antigravity', ...vscodeLike('Antigravity.app', 'antigravity') },
  {
    id: 'sublime',
    name: 'Sublime Text',
    app: 'Sublime Text.app',
    cli: (bundle) => path.join(bundle, 'Contents/SharedSupport/bin/subl'),
    args: (file, line) => [at(file, line)],
  },
  jetbrains('webstorm', 'WebStorm', 'WebStorm.app', 'webstorm'),
  jetbrains('idea', 'IntelliJ IDEA', 'IntelliJ IDEA.app', 'idea'),
  jetbrains('goland', 'GoLand', 'GoLand.app', 'goland'),
  jetbrains('pycharm', 'PyCharm', 'PyCharm.app', 'pycharm'),
  jetbrains('rustrover', 'RustRover', 'RustRover.app', 'rustrover'),
  {
    id: 'bbedit',
    name: 'BBEdit',
    app: 'BBEdit.app',
    cli: (bundle) => path.join(bundle, 'Contents/Helpers/bbedit_tool'),
    args: (file, line) => (line ? [`+${line}`, file] : [file]),
  },
  { id: 'xcode', name: 'Xcode', app: 'Xcode.app', cli: () => '/usr/bin/xed', args: (file, line) => (line ? ['--line', String(line), file] : [file]) },
  { id: 'nvim', name: 'Neovim', terminal: true, cli: () => 'nvim', args: (file, line) => (line ? [`+${line}`, file] : [file]) },
  { id: 'hx', name: 'Helix', terminal: true, cli: () => 'hx', args: (file, line) => [at(file, line)] },
  { id: 'vim', name: 'Vim', terminal: true, cli: () => 'vim', args: (file, line) => (line ? [`+${line}`, file] : [file]) },
];

const SYSTEM: EditorInfo = { id: 'system', name: 'The file’s default app' };

function bundleOf(app: string): string | null {
  for (const dir of ['/Applications', path.join(os.homedir(), 'Applications')]) {
    const bundle = path.join(dir, app);
    if (fs.existsSync(bundle)) return bundle;
  }
  return null;
}

function which(command: string): string | null {
  const r = spawnSync('/usr/bin/which', [command], { encoding: 'utf-8' });
  return r.status === 0 && r.stdout.trim() ? r.stdout.trim() : null;
}

const ghostty = () => bundleOf('Ghostty.app');

/** How to run an editor that is here, or null when it is not. */
function resolve(editor: Editor): string | null {
  if (editor.terminal) return ghostty() ? which(editor.cli('')) : null;
  const bundle = editor.app ? bundleOf(editor.app) : null;
  if (!bundle) return null;
  const cli = editor.cli(bundle);
  return fs.existsSync(cli) ? cli : null;
}

/** The editors on this Mac, best first, then the file's default app. */
export function listEditors(): EditorInfo[] {
  const found = EDITORS.filter((e) => resolve(e)).map((e) => ({ id: e.id, name: e.terminal ? `${e.name} in Ghostty` : e.name }));
  return [...found, SYSTEM];
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
  const editor = EDITORS.find((e) => e.id === editorId && resolve(e)) ?? EDITORS.find((e) => resolve(e));
  if (!editor || editorId === 'system') {
    void shell.openPath(full);
    return { ok: true, value: undefined };
  }
  const command = resolve(editor)!;
  const args = editor.args(full, line);
  const child = editor.terminal
    ? spawn('/usr/bin/open', ['-na', 'Ghostty', '--args', `--working-directory=${path.resolve(projectId)}`, '-e', command, ...args], {
        detached: true,
        stdio: 'ignore',
      })
    : spawn(command, args, { cwd: path.resolve(projectId), env: process.env, detached: true, stdio: 'ignore' });
  child.on('error', () => void shell.openPath(full));
  child.unref();
  return { ok: true, value: undefined };
}
