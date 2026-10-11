/**
 * Main process: the window, the project list, and the bridge to the board
 * host. A project is a folder the person added; its board is found, read and
 * written by the host, never here.
 */
import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell, utilityProcess, type UtilityProcess } from 'electron';
import { spawn } from 'child_process';
import * as path from 'path';
import { CHANNEL, HOST_METHODS, type HostMessage, type HostRequest, type Project, type ProjectState, type Result } from '../shared/api';
import { loginShellPath } from './shellPath';
import { ProjectStore } from './projects';

// Launched from the Dock, the app inherits launchd's bare PATH: no Homebrew
// git, and no `brainfile` for `init` or the merge driver sync registers.
process.env.PATH = loginShellPath(process.env.PATH ?? '');

const DEV_URL = process.env.BRAINFILE_DEV_URL;

let win: BrowserWindow | null = null;
let host: UtilityProcess | null = null;
let store: ProjectStore;
let nextRequest = 1;
const pending = new Map<number, (result: unknown) => void>();

// ── Board host ──────────────────────────────────────────────────────────────

function startHost(): UtilityProcess {
  const child = utilityProcess.fork(path.join(__dirname, 'host.js'), [], { serviceName: 'Brainfile Board Host' });
  child.on('message', (message: HostMessage) => {
    if (message.kind === 'reply') {
      pending.get(message.id)?.(message.result);
      pending.delete(message.id);
    } else if (message.kind === 'board') {
      win?.webContents.send(CHANNEL.board, message.snapshot);
    }
  });
  child.on('exit', () => {
    for (const resolve of pending.values()) resolve({ ok: false, error: 'The board host stopped' });
    pending.clear();
    host = null;
  });
  return child;
}

function callHost<T>(method: HostRequest['method'], ...args: unknown[]): Promise<T> {
  if (!host) host = startHost();
  const id = nextRequest++;
  return new Promise((resolve) => {
    pending.set(id, resolve as (result: unknown) => void);
    host!.postMessage({ id, method, args } satisfies HostRequest);
  });
}

// ── Projects ────────────────────────────────────────────────────────────────

async function resolveProject(folder: string): Promise<Project> {
  const state = await callHost<ProjectState>('locate', folder);
  return { id: folder, name: path.basename(folder), path: folder, state };
}

async function listProjects(): Promise<Project[]> {
  return Promise.all(store.list().map(resolveProject));
}

async function broadcastProjects(): Promise<void> {
  win?.webContents.send(CHANNEL.projects, await listProjects());
}

async function addProject(): Promise<Project | null> {
  const picked = await dialog.showOpenDialog(win!, {
    title: 'Add a project',
    buttonLabel: 'Add Project',
    message: 'Choose a repository or folder. Its board is found the same way the brainfile CLI finds it.',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (picked.canceled || picked.filePaths.length === 0) return null;
  let project = await resolveProject(picked.filePaths[0]);
  // A subfolder of a repository is the repository's project.
  const root = project.state.status === 'ready' ? path.dirname(project.state.dotDir) : project.path;
  if (root !== project.path && project.state.status === 'ready' && project.state.storage !== 'standalone') {
    project = await resolveProject(root);
  }
  store.add(project.path);
  await broadcastProjects();
  return project;
}

/** `brainfile init` in the project folder: the CLI owns board creation. */
function initBoard(projectId: string): Promise<Result<Project>> {
  return new Promise((resolve) => {
    const child = spawn('brainfile', ['init'], { cwd: projectId, env: process.env });
    let output = '';
    child.stdout.on('data', (d) => (output += d));
    child.stderr.on('data', (d) => (output += d));
    child.on('error', () =>
      resolve({ ok: false, error: 'The brainfile CLI is not on your PATH. Install it with `npm i -g brainfile`, then try again.' })
    );
    child.on('close', async (code) => {
      if (code !== 0) return resolve({ ok: false, error: output.trim() || `brainfile init exited with ${code}` });
      const project = await resolveProject(projectId);
      await broadcastProjects();
      resolve({ ok: true, value: project });
    });
  });
}

// ── IPC ─────────────────────────────────────────────────────────────────────

const local: Record<string, (...args: any[]) => unknown> = {
  listProjects,
  addProject,
  removeProject: async (projectId: string) => {
    await callHost('closeBoard', projectId);
    store.remove(projectId);
    await broadcastProjects();
  },
  revealProject: (projectId: string) => shell.openPath(projectId),
  refreshProject: resolveProject,
  initBoard,
};

ipcMain.handle(CHANNEL.invoke, async (_event, method: string, ...args: unknown[]) => {
  if ((HOST_METHODS as readonly string[]).includes(method)) return callHost(method as HostRequest['method'], ...args);
  const handler = local[method];
  if (!handler) throw new Error(`Unknown method ${method}`);
  return handler(...args);
});

// ── Window ──────────────────────────────────────────────────────────────────

function createWindow(): void {
  const forced = process.env.BRAINFILE_THEME;
  nativeTheme.themeSource = forced === 'light' || forced === 'dark' ? forced : 'system';
  win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: 'Brainfile',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 13, y: 10 },
    // The well (tokens.css), so a resize never flashes another colour.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0b0b0f' : '#e8e7ee',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  win.once('ready-to-show', () => win?.show());
  if (process.env.BRAINFILE_CAPTURE) captureAndQuit(win, process.env.BRAINFILE_CAPTURE);
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  if (DEV_URL) void win.loadURL(DEV_URL);
  else void win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  win.on('closed', () => (win = null));
}

/**
 * Development aid: `BRAINFILE_CAPTURE=out.png` saves the window once it has
 * settled and quits. `BRAINFILE_CAPTURE_SCRIPT` runs in the page first.
 */
function captureAndQuit(target: BrowserWindow, file: string): void {
  target.webContents.once('did-finish-load', async () => {
    await new Promise((r) => setTimeout(r, 1500));
    const script = process.env.BRAINFILE_CAPTURE_SCRIPT;
    if (script) {
      await target.webContents.executeJavaScript(script).catch((err) => console.error(err));
      await new Promise((r) => setTimeout(r, 900));
    }
    // The real window, vibrancy and all, when screen capture is allowed;
    // the page alone otherwise.
    const windowId = target.getMediaSourceId().split(':')[1];
    const shot = require('child_process').spawnSync('screencapture', ['-x', '-o', '-l', windowId, file]);
    if (shot.status !== 0 || !require('fs').existsSync(file)) {
      const image = await target.webContents.capturePage();
      require('fs').writeFileSync(file, image.toPNG());
    }
    app.quit();
  });
}

app.whenReady().then(() => {
  store = new ProjectStore(path.join(app.getPath('userData'), 'projects.json'));
  host = startHost();
  createWindow();
  app.on('activate', () => {
    if (!win) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  // The host flushes pending commits on exit.
  host?.kill();
});
