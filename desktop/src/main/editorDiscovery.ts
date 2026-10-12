import * as path from 'path';

export interface Editor {
  id: string;
  name: string;
  /** macOS bundle name; Spotlight also locates it outside Applications. */
  app?: string;
  /** Where the bundle keeps its command line, or a command on PATH. */
  cli: (bundle: string) => string;
  /** The arguments that open `file` at `line`. */
  args: (file: string, line?: number) => string[];
  /** A terminal editor, run in the person’s terminal. */
  terminal?: boolean;
}

const at = (file: string, line?: number) => (line ? `${file}:${line}` : file);
const vscodeLike = (app: string, bin: string): Pick<Editor, 'app' | 'cli' | 'args'> => ({
  app,
  cli: (bundle) => path.join(bundle, 'Contents/Resources/app/bin', bin),
  // `-g` is for a file at a line; a folder opens as itself.
  args: (file, line) => (line ? ['-g', at(file, line)] : [file]),
});
const jetbrains = (id: string, name: string, app: string, bin: string): Editor => ({
  id,
  name,
  app,
  cli: (bundle) => path.join(bundle, 'Contents/MacOS', bin),
  args: (file, line) => (line ? ['--line', String(line), file] : [file]),
});

/** In the order a default is chosen when the person has not chosen one. */
export const EDITORS: Editor[] = [
  { id: 'cursor', name: 'Cursor', ...vscodeLike('Cursor.app', 'cursor') },
  { id: 'vscode', name: 'Visual Studio Code', ...vscodeLike('Visual Studio Code.app', 'code') },
  { id: 'zed', name: 'Zed', app: 'Zed.app', cli: (bundle) => path.join(bundle, 'Contents/MacOS/cli'), args: (file, line) => [at(file, line)] },
  { id: 'windsurf', name: 'Windsurf', ...vscodeLike('Windsurf.app', 'windsurf') },
  // The editor is Antigravity IDE; plain Antigravity (2.x) is the agent manager, not an editor.
  { id: 'antigravity', name: 'Antigravity IDE', ...vscodeLike('Antigravity IDE.app', 'antigravity-ide') },
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

/** OS operations are injected so detection and launch arguments can be checked on any host. */
export interface EditorHost {
  platform: string;
  home: string;
  env: NodeJS.ProcessEnv;
  exists: (file: string) => boolean;
  entries: (dir: string) => string[];
  run: (command: string, args: string[]) => string;
  protocol: (scheme: string) => string;
}
export interface FoundEditor { editor: Editor; command?: string; prefix?: string[]; scheme?: string }
interface Metadata { bin: string; aliases?: string[]; bundleId?: string; windows?: string[]; flatpak?: string | string[]; scheme?: string }
const metadata: Record<string, Metadata> = {
  cursor: { bin: 'cursor', bundleId: 'com.todesktop.230313mzl4w4u92', windows: ['cursor/Cursor.exe'], flatpak: 'com.cursor.Cursor', scheme: 'cursor' },
  vscode: { bin: 'code', bundleId: 'com.microsoft.VSCode', windows: ['Microsoft VS Code/Code.exe'], flatpak: 'com.visualstudio.code', scheme: 'vscode' },
  zed: { bin: 'zed', bundleId: 'dev.zed.Zed', windows: ['Zed/zed.exe'], flatpak: 'dev.zed.Zed', scheme: 'zed' },
  windsurf: { bin: 'windsurf', bundleId: 'com.exafunction.windsurf', windows: ['Windsurf/Windsurf.exe'], scheme: 'windsurf' },
  antigravity: { bin: 'antigravity-ide', windows: ['Antigravity IDE/Antigravity IDE.exe'] },
  sublime: { bin: 'subl', bundleId: 'com.sublimetext.4', windows: ['Sublime Text/subl.exe'], flatpak: 'com.sublimetext.three' },
  webstorm: { bin: 'webstorm', bundleId: 'com.jetbrains.WebStorm', flatpak: 'com.jetbrains.WebStorm', scheme: 'jetbrains' },
  idea: { bin: 'idea', aliases: ['intellij-idea-community', 'intellij-idea-ultimate'], bundleId: 'com.jetbrains.intellij', flatpak: ['com.jetbrains.IntelliJ-IDEA-Community', 'com.jetbrains.IntelliJ-IDEA-Ultimate'], scheme: 'jetbrains' },
  goland: { bin: 'goland', bundleId: 'com.jetbrains.goland', flatpak: 'com.jetbrains.GoLand', scheme: 'jetbrains' },
  pycharm: { bin: 'pycharm', aliases: ['pycharm-community', 'pycharm-professional'], bundleId: 'com.jetbrains.pycharm', flatpak: ['com.jetbrains.PyCharm-Community', 'com.jetbrains.PyCharm-Professional'], scheme: 'jetbrains' },
  rustrover: { bin: 'rustrover', bundleId: 'com.jetbrains.rustrover', flatpak: 'com.jetbrains.RustRover', scheme: 'jetbrains' },
  bbedit: { bin: 'bbedit', bundleId: 'com.barebones.bbedit' },
  xcode: { bin: 'xed', bundleId: 'com.apple.dt.Xcode' },
  nvim: { bin: 'nvim' }, hx: { bin: 'hx' }, vim: { bin: 'vim' },
};
const join = (h: EditorHost, ...parts: string[]) => (h.platform === 'win32' ? path.win32 : path.posix).join(...parts);

export function which(h: EditorHost, command: string): string | null {
  if (command.includes('/') || command.includes('\\')) return h.exists(command) ? command : null;
  const output = h.run(h.platform === 'win32' ? 'where.exe' : '/usr/bin/which', [command]);
  return output.split(/\r?\n/).find((file) => file && h.exists(file)) ?? null;
}

function bundleOf(h: EditorHost, app: string, bundleId?: string): string | null {
  if (bundleId) {
    const found = h.run('/usr/bin/mdfind', ['kMDItemCFBundleIdentifier == "' + bundleId + '"']).split('\n').find((p) => p.endsWith('.app') && h.exists(p));
    if (found) return found;
  }
  return ['/Applications', join(h, h.home, 'Applications'), '/System/Applications', '/System/Applications/Utilities']
    .map((dir) => join(h, dir, app)).find(h.exists) ?? null;
}

/** Find binaries in versioned Toolbox installs without assuming a version directory. */
function toolbox(h: EditorHost, root: string, bin: string, depth = 0): string | null {
  for (const suffix of [`bin/${bin}.sh`, `bin/${bin}64.exe`, `bin/${bin}.exe`]) {
    const candidate = join(h, root, suffix);
    if (h.exists(candidate)) return candidate;
  }
  if (depth >= 4) return null;
  for (const entry of h.entries(root)) {
    const found = toolbox(h, join(h, root, entry), bin, depth + 1);
    if (found) return found;
  }
  return null;
}

function resolveEditor(h: EditorHost, editor: Editor, flatpaks: Set<string>): FoundEditor | null {
  const meta = metadata[editor.id];
  if (h.platform !== 'darwin' && ['bbedit', 'xcode'].includes(editor.id)) return null;
  // xed ships with macOS even when Xcode itself isn't installed.
  if (editor.id === 'xcode' && !bundleOf(h, editor.app!, meta.bundleId)) return null;
  const bins = [meta.bin, ...(meta.aliases ?? [])];
  const cli = bins.map((bin) => which(h, bin)).find(Boolean);
  if (cli) return { editor, command: cli };
  if (editor.terminal) return null;
  if (h.platform === 'darwin' && editor.app) {
    const bundle = bundleOf(h, editor.app, meta.bundleId);
    if (bundle && h.exists(editor.cli(bundle))) return { editor, command: editor.cli(bundle) };
  }
  if (h.platform === 'win32') {
    const roots = [h.env.LOCALAPPDATA && join(h, h.env.LOCALAPPDATA, 'Programs'), h.env.LOCALAPPDATA, h.env.ProgramFiles, h.env['ProgramFiles(x86)']].filter((r): r is string => !!r);
    for (const root of roots) {
      for (const suffix of meta.windows ?? []) {
        const command = join(h, root, suffix);
        if (h.exists(command)) return { editor, command };
      }
      if (meta.scheme === 'jetbrains') {
        const command = toolbox(h, join(h, root, 'JetBrains'), meta.bin);
        if (command) return { editor, command };
      }
      // JetBrains also installs into product/version directories in Programs.
      for (const entry of h.entries(root).filter((e) => e.toLowerCase().includes(editor.name.toLowerCase()))) {
        const command = toolbox(h, join(h, root, entry), meta.bin);
        if (command) return { editor, command };
      }
    }
  }
  if (h.platform === 'linux') {
    for (const root of ['/snap/bin', '/var/lib/snapd/snap/bin', join(h, h.home, '.local/bin'), '/usr/local/bin', '/usr/bin']) {
      for (const bin of bins) {
        const command = join(h, root, bin);
        if (h.exists(command)) return { editor, command };
      }
    }
    const flatpakId = (Array.isArray(meta.flatpak) ? meta.flatpak : [meta.flatpak]).find((id) => id && flatpaks.has(id));
    if (flatpakId) {
      const flatpak = which(h, 'flatpak');
      if (flatpak) return { editor, command: flatpak, prefix: ['run', flatpakId] };
    }
  }
  if (meta.scheme === 'jetbrains') {
    const root = h.platform === 'win32'
      ? join(h, h.env.LOCALAPPDATA ?? h.home, 'JetBrains/Toolbox/apps')
      : join(h, h.home, h.platform === 'darwin' ? 'Library/Application Support/JetBrains/Toolbox/apps' : '.local/share/JetBrains/Toolbox/apps');
    const command = toolbox(h, root, meta.bin);
    if (command) return { editor, command };
  }
  if (meta.scheme) {
    const handler = h.protocol(meta.scheme);
    // jetbrains:// is shared: a Toolbox handler alone doesn't prove every IDE is installed.
    if (handler && (meta.scheme !== 'jetbrains' || handler.toLowerCase().includes(editor.name.toLowerCase()))) return { editor, scheme: meta.scheme };
  }
  return null;
}

/** Parse $EDITOR as argv, never as executable shell code. */
export function editorWords(value: string): string[] {
  const result: string[] = [];
  let word = '', quote = '', started = false;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === quote) { quote = ''; started = true; }
    else if (!quote && (c === '"' || c === "'")) { quote = c; started = true; }
    else if (c === '\\' && value[i + 1] && (value[i + 1] === quote || /[\s'"\\]/.test(value[i + 1]))) { word += value[++i]; started = true; }
    else if (!quote && /\s/.test(c)) { if (started) result.push(word); word = ''; started = false; }
    else { word += c; started = true; }
  }
  if (quote) return [];
  if (started) result.push(word);
  return result;
}

function userEditor(h: EditorHost): FoundEditor | null {
  let value = h.env.EDITOR ?? '';
  const loginShell = h.env.SHELL || (h.platform === 'win32' ? (which(h, 'pwsh') ?? which(h, 'powershell')) : '/bin/sh');
  if (loginShell) {
    const powershell = /(?:pwsh|powershell)(?:\.exe)?$/i.test(loginShell);
    const output = h.run(loginShell, powershell
      ? ['-NoLogo', '-NonInteractive', '-Command', '[Console]::Write("__BRAINFILE_EDITOR__" + $env:EDITOR + "__BRAINFILE_EDITOR__")']
      : ['-ilc', 'printf "__BRAINFILE_EDITOR__%s__BRAINFILE_EDITOR__" "$EDITOR"']);
    const match = /__BRAINFILE_EDITOR__([\s\S]*?)__BRAINFILE_EDITOR__/.exec(output);
    if (match) value = match[1];
  }
  const [bin, ...prefix] = editorWords(value);
  if (!bin) return null;
  const command = which(h, bin);
  if (!command) return null;
  const basename = (h.platform === 'win32' ? path.win32 : path.posix).basename(bin).replace(/\.(exe|cmd|bat)$/i, '');
  const known = EDITORS.find((e) => metadata[e.id].bin === basename);
  const editor: Editor = { ...(known ?? { cli: () => command, args: (file, line) => line ? [`+${line}`, file] : [file], terminal: true }), id: 'user-editor', name: `Your $EDITOR (${value})` };
  return { editor, command, prefix };
}

export function discoverEditors(h: EditorHost): FoundEditor[] {
  const terminal = findTerminal(h);
  const flatpaks = new Set(h.platform === 'linux' ? h.run('flatpak', ['list', '--app', '--columns=application']).split('\n') : []);
  const found = EDITORS.map((e) => resolveEditor(h, e, flatpaks)).filter((e): e is FoundEditor => !!e && (!e.editor.terminal || !!terminal));
  const user = userEditor(h);
  if (user && (!user.editor.terminal || terminal)) found.push(user);
  return found;
}

export function runningProcesses(h: EditorHost): string {
  return h.platform === 'win32' ? h.run('tasklist.exe', ['/FO', 'CSV', '/NH']) : h.run('/bin/ps', ['-axo', 'comm=']);
}
export function selectEditor(found: FoundEditor[], id: string | undefined, processes: string): FoundEditor | undefined {
  const explicit = found.find((e) => e.editor.id === id);
  if (explicit) return explicit;
  return found.find(({ editor, command }) => {
    const meta = metadata[editor.id];
    const names = [command, editor.app, meta?.bin, meta?.scheme === 'jetbrains' ? `${meta.bin}64.exe` : undefined, ...(meta?.windows ?? []).map((p) => p.split('/').pop()!)].filter((n): n is string => !!n);
    return processes.split(/\r?\n/).some((raw) => {
      const line = raw.trim();
      // JetBrains' Linux process is its bundled JVM, not its .sh launcher.
      if (command?.endsWith('.sh') && meta?.scheme === 'jetbrains' && line.startsWith(command.slice(0, command.lastIndexOf('/bin/')) + '/')) return true;
      return names.some((name) => {
      if (name.endsWith('.app')) return line.toLowerCase().includes(name.toLowerCase() + '/');
      const base = name.split(/[\\/]/).pop()!.replace(/\.(cmd|bat)$/i, '');
      return line.toLowerCase() === name.toLowerCase() || new RegExp(`(?:^|[/\\\\",])${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\.exe)?(?:$|["])`, 'i').test(line);
      });
    });
  }) ?? found[0];
}

interface Terminal { name: string; command: string; kind: string }
export function findTerminal(h: EditorHost): Terminal | null {
  if (h.platform === 'win32') { const command = which(h, 'wt'); return command ? { name: 'Windows Terminal', command, kind: 'wt' } : null; }
  if (h.platform === 'darwin') {
    const choices = [
      ['Ghostty', 'com.mitchellh.ghostty', 'ghostty'], ['WezTerm', 'com.github.wez.wezterm', 'wezterm'],
      ['kitty', 'net.kovidgoyal.kitty', 'kitty'], ['iTerm', 'com.googlecode.iterm2', 'iterm'],
      ['Alacritty', 'org.alacritty', 'alacritty'], ['Terminal', 'com.apple.Terminal', 'terminal'],
    ];
    // Honor the terminal inherited from the person's session before the installed order.
    const preferred = (h.env.TERM_PROGRAM ?? h.env.TERMINAL ?? '').toLowerCase();
    const ordered = [...choices.filter(([name]) => preferred.includes(name.toLowerCase())), ...choices.filter(([name]) => !preferred.includes(name.toLowerCase()))];
    for (const [name, bundleId, kind] of ordered) {
      const bundle = bundleOf(h, `${name}.app`, bundleId);
      if (bundle) return { name: name === 'iTerm' ? 'iTerm2' : name, command: bundle, kind };
    }
    return null;
  }
  const choices = [h.env.TERMINAL, 'x-terminal-emulator', 'wezterm', 'kitty', 'gnome-terminal', 'konsole', 'xfce4-terminal', 'alacritty', 'xterm'].filter((s): s is string => !!s);
  for (const name of choices) { const command = which(h, name); if (command) return { name, command, kind: name.split('/').pop()! }; }
  return null;
}

export const shellQuote = (value: string) => "'" + value.replace(/'/g, "'\\''") + "'";
const appleString = (value: string) => JSON.stringify(value);
export function terminalInvocation(h: EditorHost, command: string, args: string[], cwd: string): { command: string; args: string[] } | null {
  const terminal = findTerminal(h);
  if (!terminal) return null;
  const argv = [command, ...args];
  if (terminal.kind === 'wt') return { command: terminal.command, args: ['-d', cwd, ...argv] };
  if (h.platform === 'darwin' && ['iterm', 'terminal'].includes(terminal.kind)) {
    const script = `cd ${shellQuote(cwd)} && exec ${argv.map(shellQuote).join(' ')}`;
    const app = appleString(terminal.command);
    return { command: '/usr/bin/osascript', args: terminal.kind === 'terminal'
      ? ['-e', `tell application ${app}`, '-e', 'activate', '-e', `do script ${appleString(script)}`, '-e', 'end tell']
      : ['-e', `tell application ${app}`, '-e', 'activate', '-e', 'set w to (create window with default profile)', '-e', 'tell current session of w', '-e', `write text ${appleString(script)}`, '-e', 'end tell', '-e', 'end tell'] };
  }
  const flags = terminal.kind === 'ghostty' ? [`--working-directory=${cwd}`, '-e']
    : terminal.kind === 'wezterm' ? ['start', '--cwd', cwd, '--']
    : terminal.kind === 'kitty' ? ['--directory', cwd]
    : terminal.kind === 'gnome-terminal' ? ['--working-directory', cwd, '--']
    : terminal.kind === 'konsole' ? ['--workdir', cwd, '-e']
    : terminal.kind === 'xfce4-terminal' ? ['--working-directory', cwd, '-x']
    : terminal.kind === 'alacritty' ? ['--working-directory', cwd, '-e'] : ['-e'];
  // A login shell supplies the terminal editor's usual environment and working directory.
  const payload = h.platform === 'darwin' ? [...flags, ...argv]
    : [...flags, h.env.SHELL || '/bin/sh', '-lc', `cd ${shellQuote(cwd)} && exec ${argv.map(shellQuote).join(' ')}`];
  return h.platform === 'darwin' ? { command: '/usr/bin/open', args: ['-na', terminal.command, '--args', ...payload] } : { command: terminal.command, args: payload };
}

export function editorUrl(editor: Editor, scheme: string, target: string, line?: number): string {
  const file = target.replace(/\\/g, '/');
  if (scheme === 'jetbrains') return `jetbrains://${editor.id === 'idea' ? 'idea' : editor.id}/navigate/reference?file=${encodeURIComponent(file)}${line ? `&line=${line}` : ''}`;
  return `${scheme}://file/${file.split('/').map(encodeURIComponent).join('/')}${line ? `:${line}` : ''}`;
}
