import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discoverEditors, selectEditor, terminalInvocation, editorWords, editorUrl, EDITORS, type EditorHost } from '../src/main/editorDiscovery.ts';

function fixture(platform: string, files: string[] = [], output: Record<string, string> = {}, env: NodeJS.ProcessEnv = {}, handlers: Record<string, string> = {}): EditorHost {
  return {
    platform, home: platform === 'win32' ? 'C:\\Users\\person' : '/home/person', env,
    exists: (file) => files.includes(file),
    entries: (dir) => [...new Set(files.filter((f) => f.startsWith(dir + (platform === 'win32' ? '\\' : '/'))).map((f) => f.slice(dir.length + 1).split(platform === 'win32' ? '\\' : '/')[0]))],
    run: (command, args) => output[`${command} ${args.join(' ')}`] ?? '',
    protocol: (scheme) => handlers[scheme] ?? '',
  };
}
const ids = (h: EditorHost) => discoverEditors(h).map((f) => f.editor.id);

test('PATH takes precedence over app locations; Spotlight finds relocated macOS bundles', () => {
  const app = '/Volumes/Tools/Visual Studio Code.app';
  const h = fixture('darwin', ['/opt/bin/cursor', `${app}/Contents/Resources/app/bin/code`, app], {
    '/usr/bin/which cursor': '/opt/bin/cursor',
    '/usr/bin/mdfind kMDItemCFBundleIdentifier == "com.microsoft.VSCode"': app,
  });
  assert.deepEqual(ids(h), ['cursor', 'vscode']);
  assert.equal(discoverEditors(h)[0].command, '/opt/bin/cursor');
  assert.equal(discoverEditors(h)[1].command, `${app}/Contents/Resources/app/bin/code`);
});

test('Windows uses where and user Programs, including versioned JetBrains installs', () => {
  const local = 'C:\\Users\\person\\AppData\\Local';
  const code = `${local}\\Programs\\Microsoft VS Code\\Code.exe`;
  const idea = `${local}\\Programs\\JetBrains\\IntelliJ IDEA 2026.1\\bin\\idea64.exe`;
  const h = fixture('win32', ['C:\\bin\\cursor.cmd', code, idea], { 'where.exe cursor': 'C:\\missing\\cursor.cmd\r\nC:\\bin\\cursor.cmd' }, { LOCALAPPDATA: local });
  assert.deepEqual(ids(h), ['cursor', 'vscode', 'idea']);
  assert.equal(discoverEditors(h)[1].command, code);
});

test('Linux finds snap, flatpak, and versioned JetBrains Toolbox without PATH launchers', () => {
  const idea = '/home/person/.local/share/JetBrains/Toolbox/apps/IDEA-U/ch-0/261/bin/idea.sh';
  const h = fixture('linux', ['/snap/bin/cursor', '/usr/bin/flatpak', idea], {
    'flatpak list --app --columns=application': 'com.visualstudio.code',
    '/usr/bin/which flatpak': '/usr/bin/flatpak',
  });
  assert.deepEqual(ids(h), ['cursor', 'vscode', 'idea']);
  assert.deepEqual(discoverEditors(h)[1].prefix, ['run', 'com.visualstudio.code']);
});

test('URL handlers are the final layer; a shared Toolbox handler does not invent installed IDEs', () => {
  const h = fixture('linux', [], {}, {}, { vscode: 'Visual Studio Code', cursor: 'Cursor', jetbrains: 'JetBrains Toolbox' });
  assert.deepEqual(ids(h), ['cursor', 'vscode']);
  assert.equal(discoverEditors(h)[1].scheme, 'vscode');
  const ide = fixture('win32', [], {}, {}, { jetbrains: 'WebStorm' });
  assert.deepEqual(ids(ide), ['webstorm']);
});

test('terminal editors appear with Terminal.app even without Ghostty', () => {
  const h = fixture('darwin', ['/usr/bin/vim', '/System/Applications/Utilities/Terminal.app'], { '/usr/bin/which vim': '/usr/bin/vim' });
  assert.deepEqual(ids(h), ['vim']);
  const launch = terminalInvocation(h, '/usr/bin/vim', ['+74', "/tmp/a'b $file.ts"], '/tmp/project space')!;
  assert.equal(launch.command, '/usr/bin/osascript');
  assert.ok(launch.args.join('\n').includes('do script'));
  assert.ok(launch.args.join('\n').includes("'\\\\''"));
  assert.ok(launch.args.join('\n').includes("cd '/tmp/project space'"));
});

test('honors inherited macOS terminal and uses each terminal’s execution flags', () => {
  const cases: Array<[string, string, string[]]> = [
    ['Ghostty', 'ghostty', ['--working-directory=/tmp/project', '-e']],
    ['WezTerm', 'wezterm', ['start', '--cwd', '/tmp/project', '--']],
    ['kitty', 'kitty', ['--directory', '/tmp/project']],
    ['Alacritty', 'alacritty', ['--working-directory', '/tmp/project', '-e']],
  ];
  for (const [app, term, flags] of cases) {
    const h = fixture('darwin', ['/Applications/Ghostty.app', `/Applications/${app}.app`], {}, { TERM_PROGRAM: term });
    const plan = terminalInvocation(h, '/bin/vim', ['+2', '/tmp/file'], '/tmp/project')!;
    assert.deepEqual(plan.args, ['-na', `/Applications/${app}.app`, '--args', ...flags, '/bin/vim', '+2', '/tmp/file']);
  }
  const iterm = fixture('darwin', ['/Applications/iTerm.app']);
  assert.ok(terminalInvocation(iterm, '/bin/vim', ['/tmp/file'], '/tmp')!.args.join('\n').includes('write text'));
});

test('Linux terminal fallback executes argv in cwd and Windows uses wt', () => {
  const linux = fixture('linux', ['/usr/bin/x-terminal-emulator'], { '/usr/bin/which x-terminal-emulator': '/usr/bin/x-terminal-emulator' }, { SHELL: '/bin/bash' });
  assert.deepEqual(terminalInvocation(linux, '/bin/vim', ['+8', '/tmp/a b'], '/repo'), {
    command: '/usr/bin/x-terminal-emulator', args: ['-e', '/bin/bash', '-lc', "cd '/repo' && exec '/bin/vim' '+8' '/tmp/a b'"],
  });
  const windows = fixture('win32', ['C:\\bin\\wt.exe', 'C:\\bin\\nvim.exe'], { 'where.exe wt': 'C:\\bin\\wt.exe', 'where.exe nvim': 'C:\\bin\\nvim.exe' });
  assert.deepEqual(ids(windows), ['nvim']);
  assert.deepEqual(terminalInvocation(windows, 'C:\\bin\\nvim.exe', ['+8', 'C:\\a b'], 'C:\\repo'), {
    command: 'C:\\bin\\wt.exe', args: ['-d', 'C:\\repo', 'C:\\bin\\nvim.exe', '+8', 'C:\\a b'],
  });
});

test('Your $EDITOR comes from the login shell, preserving quoted arguments without evaluating code', () => {
  const h = fixture('linux', ['/opt/bin/nvim', '/usr/bin/xterm'], {
    '/usr/bin/which nvim': '/opt/bin/nvim', '/usr/bin/which xterm': '/usr/bin/xterm',
    '/bin/zsh -ilc printf "__BRAINFILE_EDITOR__%s__BRAINFILE_EDITOR__" "$EDITOR"': 'startup noise\n__BRAINFILE_EDITOR__nvim -u "my config"__BRAINFILE_EDITOR__',
  }, { SHELL: '/bin/zsh', EDITOR: 'vim' });
  const user = discoverEditors(h).find((f) => f.editor.id === 'user-editor')!;
  assert.equal(user.command, '/opt/bin/nvim');
  assert.deepEqual(user.prefix, ['-u', 'my config']);
  assert.deepEqual(user.editor.args('/tmp/file', 42), ['+42', '/tmp/file']);
  assert.deepEqual(editorWords("vim '$(touch /tmp/oops)'"), ['vim', '$(touch /tmp/oops)']);
  assert.deepEqual(editorWords('"C:\\Program Files\\Editor\\vim.exe" --clean'), ['C:\\Program Files\\Editor\\vim.exe', '--clean']);
  assert.deepEqual(editorWords('vim "unfinished'), []);
});

test('explicit editor wins, otherwise a running editor wins before first discovered', () => {
  const h = fixture('linux', ['/snap/bin/cursor', '/snap/bin/code']);
  const found = discoverEditors(h);
  assert.equal(selectEditor(found, undefined, '/usr/share/code/code')?.editor.id, 'vscode');
  assert.equal(selectEditor(found, 'cursor', '/usr/share/code/code')?.editor.id, 'cursor');
  assert.equal(selectEditor(found, 'auto', '/usr/share/code/code')?.editor.id, 'vscode');
  assert.equal(selectEditor(found, undefined, '/usr/bin/code-helper')?.editor.id, 'cursor');
  assert.equal(selectEditor(found, 'removed-editor', '')?.editor.id, 'cursor');
  assert.equal(selectEditor(found, undefined, '"Code.exe","1234","Console"')?.editor.id, 'vscode');
  assert.equal(selectEditor(found, undefined, '/Applications/Visual Studio Code.app/Contents/MacOS/Electron')?.editor.id, 'vscode');
});

test('URL fallback preserves spaces, URI characters, Windows separators and line numbers', () => {
  const code = EDITORS.find((e) => e.id === 'vscode')!;
  assert.equal(editorUrl(code, 'vscode', '/tmp/a b#?.ts', 12), 'vscode://file//tmp/a%20b%23%3F.ts:12');
  assert.equal(editorUrl(code, 'vscode', 'C:\\a b\\file.ts', 12), 'vscode://file/C%3A/a%20b/file.ts:12');
  const idea = EDITORS.find((e) => e.id === 'idea')!;
  assert.equal(editorUrl(idea, 'jetbrains', '/tmp/a b.ts', 12), 'jetbrains://idea/navigate/reference?file=%2Ftmp%2Fa%20b.ts&line=12');
});

test('does not mistake macOS xed stub or the Antigravity agent manager for installed editors', () => {
  const h = fixture('darwin', ['/usr/bin/xed'], { '/usr/bin/which xed': '/usr/bin/xed' }, {}, { antigravity: 'Antigravity' });
  assert.deepEqual(ids(h), []);
});

test('Windows reads EDITOR from PowerShell’s profile and accepts quoted executable paths', () => {
  const shell = 'C:\\bin\\pwsh.exe';
  const vim = 'C:\\Program Files\\Vim\\vim.exe';
  const h = fixture('win32', [shell, vim, 'C:\\bin\\wt.exe'], {
    'where.exe pwsh': shell,
    'where.exe wt': 'C:\\bin\\wt.exe',
    [shell + ' -NoLogo -NonInteractive -Command [Console]::Write("__BRAINFILE_EDITOR__" + $env:EDITOR + "__BRAINFILE_EDITOR__")']: `__BRAINFILE_EDITOR__"${vim}" --clean__BRAINFILE_EDITOR__`,
  });
  const user = discoverEditors(h).find((f) => f.editor.id === 'user-editor')!;
  assert.equal(user.command, vim);
  assert.deepEqual(user.prefix, ['--clean']);
});

test('automatic recognizes JetBrains’ bundled JVM and executable names on Windows', () => {
  const idea = '/home/person/.local/share/JetBrains/Toolbox/apps/idea/bin/idea.sh';
  const h = fixture('linux', ['/snap/bin/cursor', idea]);
  assert.equal(selectEditor(discoverEditors(h), undefined, '/home/person/.local/share/JetBrains/Toolbox/apps/idea/jbr/bin/java')?.editor.id, 'idea');
  const windows = fixture('win32', ['C:\\bin\\cursor.cmd', 'C:\\bin\\idea.cmd'], { 'where.exe cursor': 'C:\\bin\\cursor.cmd', 'where.exe idea': 'C:\\bin\\idea.cmd' });
  assert.equal(selectEditor(discoverEditors(windows), undefined, '"idea64.exe","1234","Console"')?.editor.id, 'idea');
});

test('Linux resolves distro launcher names and both free and paid flatpak editions', () => {
  const snap = fixture('linux', ['/snap/bin/intellij-idea-community']);
  assert.deepEqual(ids(snap), ['idea']);
  const h = fixture('linux', ['/usr/bin/flatpak'], {
    'flatpak list --app --columns=application': 'com.jetbrains.IntelliJ-IDEA-Ultimate\ncom.jetbrains.PyCharm-Professional',
    '/usr/bin/which flatpak': '/usr/bin/flatpak',
  });
  assert.deepEqual(ids(h), ['idea', 'pycharm']);
  assert.deepEqual(discoverEditors(h)[1].prefix, ['run', 'com.jetbrains.PyCharm-Professional']);
});
