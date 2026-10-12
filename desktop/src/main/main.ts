/**
 * Main process: the window, the project list, and the bridge to the board
 * host. A project is a folder the person added; its board is found, read and
 * written by the host, never here.
 */
import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell, utilityProcess, type UtilityProcess } from 'electron';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {
  AGENT_METHODS,
  CHANNEL,
  HOST_METHODS,
  type AgentMessage,
  type AgentRequest,
  type HostMessage,
  type HostRequest,
  type Project,
  type ProjectState,
  type Result,
} from '../shared/api';
import { loginShellPath } from './shellPath';
import { ProjectStore } from './projects';

// Launched from the Dock, the app inherits launchd's bare PATH: no Homebrew
// git, and no `brainfile` for `init` or the merge driver sync registers.
process.env.PATH = loginShellPath(process.env.PATH ?? '');

const DEV_URL = process.env.BRAINFILE_DEV_URL;

let win: BrowserWindow | null = null;
let host: UtilityProcess | null = null;
let agents: UtilityProcess | null = null;
const agentPending = new Map<number, (result: unknown) => void>();
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

// ── Agents process ──────────────────────────────────────────────────────────

function startAgents(): UtilityProcess {
  const child = utilityProcess.fork(path.join(__dirname, 'agents.js'), [], {
    serviceName: 'Brainfile Agents',
    env: { ...process.env, BRAINFILE_DATA_DIR: app.getPath('userData') },
  });
  child.on('message', (message: AgentMessage) => {
    if (message.kind === 'reply') {
      agentPending.get(message.id)?.(message.result);
      agentPending.delete(message.id);
    } else {
      win?.webContents.send(CHANNEL.agent, message.event);
    }
  });
  child.on('exit', () => {
    for (const resolve of agentPending.values()) resolve({ ok: false, error: 'The agents process stopped' });
    agentPending.clear();
    agents = null;
  });
  return child;
}

/**
 * In development, a rebuilt agents process takes over without a restart:
 * the old one is let go (its agents with it) and the next request starts
 * the new build. The window and the board host carry on.
 */
function reloadAgentsOnRebuild(): void {
  let timer: NodeJS.Timeout | null = null;
  fs.watch(path.join(__dirname, 'agents.js'), () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => agents?.kill(), 250);
  });
}

function callAgents<T>(method: AgentRequest['method'], ...args: unknown[]): Promise<T> {
  if (!agents) agents = startAgents();
  const id = nextRequest++;
  return new Promise((resolve) => {
    agentPending.set(id, resolve as (result: unknown) => void);
    agents!.postMessage({ id, method, args } satisfies AgentRequest);
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
  if ((AGENT_METHODS as readonly string[]).includes(method)) return callAgents(method as AgentRequest['method'], ...args);
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
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0b0a09' : '#e9e7e5',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // Captures render offscreen, in sRGB, so screenshots match the tokens.
      offscreen: !!process.env.BRAINFILE_CAPTURE,
    },
  });
  win.once('ready-to-show', () => {
    if (!process.env.BRAINFILE_CAPTURE) win?.show();
  });
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
  target.webContents.on('console-message', (event) => console.log('renderer:', event.message));
  target.webContents.once('did-finish-load', async () => {
    await new Promise((r) => setTimeout(r, 1500));
    const script = process.env.BRAINFILE_CAPTURE_SCRIPT;
    if (script) {
      const out = await target.webContents.executeJavaScript(script).catch((err) => console.error(err));
      if (out !== undefined) console.log('capture:', JSON.stringify(out));
      await new Promise((r) => setTimeout(r, 900));
    }
    const image = await target.webContents.capturePage();
    fs.writeFileSync(file, image.toPNG());
    app.quit();
  });
}

app.whenReady().then(() => {
  // A packaged app takes its icon from the bundle; in development the Dock
  // would show Electron's, so lend it the tile.
  if (!app.isPackaged) app.dock?.setIcon(path.join(__dirname, '..', 'assets', 'icon.png'));
  app.setName('Brainfile');
  store = new ProjectStore(path.join(app.getPath('userData'), 'projects.json'));
  host = startHost();
  if (DEV_URL) reloadAgentsOnRebuild();
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
  agents?.kill();
});
