/**
 * Main process: the window, the project list, and the bridge to the board
 * host. A project is a folder the person added; its board is found, read and
 * written by the host, never here. The phone link (link/, task-40) reaches
 * the same host and agents processes through the same forwarding.
 */
import { app, BrowserWindow, dialog, ipcMain, nativeTheme, safeStorage, screen, shell, utilityProcess, type UtilityProcess } from 'electron';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {
  AGENT_HOST_METHODS,
  AGENT_METHODS,
  CHANNEL,
  HOST_METHODS,
  type AgentMessage,
  type AgentRequest,
  type HostReply,
  type HostMessage,
  type HostRequest,
  type IssuesView,
  type LinkProject,
  type Project,
  type ProjectState,
  type Result,
  type ReviewView,
} from '../shared/api';
import { loginShellPath } from './shellPath';
import { ProjectStore } from './projects';
import { existingFiles, listEditors, openFolder, openInEditor } from './editors';
import { detectForge, forgeFromRemote } from './forge';
import { fileTokenStore, ghCliToken, GitHub } from './github';
import { readPlacement, resolvePlacement, writePlacement, type WindowPlacement } from './windowState';
import { BoardHolds, linkDesk } from '../link/bridge';
import { LinkServer } from '../link/server';
import { LinkStore } from '../link/store';
import { deskAddresses, deskName } from '../link/addresses';

// A second copy (a test, a capture) keeps its own data and its own
// single-instance lock, so it never touches the installed app's.
if (process.env.BRAINFILE_USER_DATA) app.setPath('userData', path.resolve(process.env.BRAINFILE_USER_DATA));

// Launched from the Dock, the app inherits launchd's bare PATH: no Homebrew
// git, and no `brainfile` for `init` or the merge driver sync registers.
process.env.PATH = loginShellPath(process.env.PATH ?? '');

const DEV_URL = process.env.BRAINFILE_DEV_URL;

let win: BrowserWindow | null = null;
let host: UtilityProcess | null = null;
let agents: UtilityProcess | null = null;
const agentPending = new Map<number, (result: unknown) => void>();
let store: ProjectStore;
let github: GitHub;
let nextRequest = 1;
const pending = new Map<number, (result: unknown) => void>();
let link: LinkServer | null = null;
/** The boards the window and each phone hold open: the host closes one only when nobody does. */
const holds = new BoardHolds({
  open: (projectId) => callHost('openBoard', projectId),
  close: (projectId) => callHost('closeBoard', projectId),
});

// ── Board host ──────────────────────────────────────────────────────────────

function startHost(): UtilityProcess {
  const child = utilityProcess.fork(path.join(__dirname, 'host.js'), [], { serviceName: 'Brainfile Board Host' });
  child.on('message', (message: HostMessage) => {
    if (message.kind === 'reply') {
      pending.get(message.id)?.(message.result);
      pending.delete(message.id);
    } else if (message.kind === 'board') {
      win?.webContents.send(CHANNEL.board, message.snapshot);
      link?.board(message.snapshot);
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
    // The app's own binary runs the desk's MCP server as node (desk-mcp.ts).
    env: { ...process.env, BRAINFILE_DATA_DIR: app.getPath('userData'), BRAINFILE_ELECTRON_BIN: process.execPath },
  });
  child.on('message', (message: AgentMessage) => {
    if (message.kind === 'reply') {
      agentPending.get(message.id)?.(message.result);
      agentPending.delete(message.id);
    } else if (message.kind === 'host') {
      // A board write the chat's hand-off makes (spec-16): only the ones named, through the host like any other.
      const allowed = (AGENT_HOST_METHODS as readonly string[]).includes(message.method);
      const result = allowed ? callHost(message.method, ...message.args) : Promise.resolve({ ok: false, error: `Not allowed: ${message.method}` });
      void result.then((value) => child.postMessage({ kind: 'host-reply', id: message.id, result: value } satisfies HostReply));
    } else {
      win?.webContents.send(CHANNEL.agent, message.event);
      link?.agent(message.event);
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
  void link?.projectsChanged();
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

// ── Issues (task-26) ────────────────────────────────────────────────────────

async function listIssues(projectId: string, force?: boolean): Promise<Result<IssuesView>> {
  const repo = await detectForge(projectId);
  if (!repo) return { ok: false, error: `${path.basename(projectId)}'s origin is not on GitHub.` };
  return github.listIssues(repo, force);
}

function startGitHub(): GitHub {
  const store = fileTokenStore(
    path.join(app.getPath('userData'), 'github.json'),
    (text) => {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('The Keychain is not available to keep a token safely.');
      return safeStorage.encryptString(text);
    },
    (sealed) => safeStorage.decryptString(sealed)
  );
  return new GitHub({ fetch: (...args) => fetch(...args), ghToken: ghCliToken, env: process.env, store });
}

// ── Phone link (task-40) ────────────────────────────────────────────────────

/**
 * Where a project is shared, for a phone joining it to a GitHub project it
 * follows: a tracked board's remote and its name under `refs/brainfile/`,
 * else the code's origin, with no ref.
 */
async function sharedOn(projectId: string): Promise<Pick<LinkProject, 'repo' | 'ref'>> {
  const shared = await callHost<{ url?: string | null; ref?: string | null }>('sharing', projectId);
  if (shared.url) {
    const repo = forgeFromRemote(shared.url);
    return repo && shared.ref ? { repo: { owner: repo.owner, name: repo.name }, ref: shared.ref } : {};
  }
  const origin = await detectForge(projectId);
  return origin ? { repo: { owner: origin.owner, name: origin.name } } : {};
}

async function linkProjects(): Promise<LinkProject[]> {
  return Promise.all((await listProjects()).map(async (project) => ({ ...project, ...(await sharedOn(project.id)) })));
}

function startLink(): LinkServer {
  const linkStore = new LinkStore(path.join(app.getPath('userData'), 'link.json'), {
    seal: (text) => {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('The Keychain is not available');
      return safeStorage.encryptString(text);
    },
    open: (sealed) => safeStorage.decryptString(sealed),
  });
  const server = new LinkServer({
    store: linkStore,
    desk: linkDesk({
      host: (method, ...args) => callHost(method, ...args),
      agents: (method, ...args) => callAgents(method, ...args),
      holds,
      projects: linkProjects,
      knows: (projectId) => store.list().includes(projectId),
    }),
    addresses: deskAddresses,
    name: deskName(),
    onChange: (view) => win?.webContents.send(CHANNEL.link, view),
    // Development aid: `BRAINFILE_LINK_HOST=127.0.0.1` listens on this Mac only (a capture, a test).
    listenHost: process.env.BRAINFILE_LINK_HOST,
  });
  void server.start();
  return server;
}

// ── IPC ─────────────────────────────────────────────────────────────────────

const local: Record<string, (...args: any[]) => unknown> = {
  listProjects,
  addProject,
  removeProject: async (projectId: string) => {
    holds.forget(projectId);
    await callHost('closeBoard', projectId);
    store.remove(projectId);
    await broadcastProjects();
  },
  revealProject: (projectId: string) => shell.openPath(projectId),
  refreshProject: resolveProject,
  initBoard,
  listEditors,
  existingFiles,
  openInEditor,
  forgeRepo: detectForge,
  listIssues,
  githubAuth: () => github.auth(),
  setGitHubToken: (token: string | null) => github.setToken(token),
  linkState: () => link!.view(),
  setLink: (on: boolean) => link!.setOn(on === true),
  linkCode: () => link!.code(),
  forgetPhone: (key: string) => link!.forget(key),
  // The folder comes from the agents process, never from the window.
  openWorktree: async (projectId: string, taskId: string, editorId?: string): Promise<Result> => {
    const review = await callAgents<Result<ReviewView | null>>('review', projectId, taskId);
    if (!review.ok) return review;
    if (!review.value) return { ok: false, error: `${taskId} has no worktree` };
    return openFolder(review.value.path, editorId);
  },
};

ipcMain.handle(CHANNEL.invoke, async (_event, method: string, ...args: unknown[]) => {
  // The window holds the boards it opens, as each phone does.
  if (method === 'openBoard') return holds.open('window', args[0] as string);
  if (method === 'closeBoard') return holds.close('window', args[0] as string);
  if ((HOST_METHODS as readonly string[]).includes(method)) return callHost(method as HostRequest['method'], ...args);
  if ((AGENT_METHODS as readonly string[]).includes(method)) return callAgents(method as AgentRequest['method'], ...args);
  const handler = local[method];
  if (!handler) throw new Error(`Unknown method ${method}`);
  return handler(...args);
});

// ── Window ──────────────────────────────────────────────────────────────────

function windowFile(): string {
  return path.join(app.getPath('userData'), 'window.json');
}

/** Writes the normal bounds (not the maximized frame) plus the display mode. */
function rememberWindow(target: BrowserWindow): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const save = () => {
    if (target.isDestroyed()) return;
    const bounds = target.getNormalBounds();
    const placement: WindowPlacement = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      maximized: target.isMaximized(),
      fullscreen: target.isFullScreen(),
    };
    writePlacement(windowFile(), placement);
  };
  const later = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(save, 200);
  };
  target.on('move', later);
  target.on('resize', later);
  target.on('maximize', save);
  target.on('unmaximize', save);
  target.on('enter-full-screen', save);
  target.on('leave-full-screen', save);
  target.on('close', () => {
    if (timer) clearTimeout(timer);
    save();
  });
}

function createWindow(): void {
  const forced = process.env.BRAINFILE_THEME;
  nativeTheme.themeSource = forced === 'light' || forced === 'dark' ? forced : 'system';
  // Capture stays on the centered default so a screenshot cannot clobber the saved place.
  const capturing = !!process.env.BRAINFILE_CAPTURE;
  const placement = resolvePlacement(
    capturing ? null : readPlacement(windowFile()),
    screen.getAllDisplays().map((display) => display.bounds),
  );
  win = new BrowserWindow({
    width: placement.width,
    height: placement.height,
    ...(placement.position ? { x: placement.position.x, y: placement.position.y } : {}),
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
      offscreen: capturing,
    },
  });
  if (placement.fullscreen) win.setFullScreen(true);
  else if (placement.maximized) win.maximize();
  if (!capturing) rememberWindow(win);
  win.once('ready-to-show', () => {
    if (!capturing) win?.show();
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

function start(): void {
  // A packaged app takes its icon from the bundle; in development the Dock
  // would show Electron's, so lend it the tile.
  if (!app.isPackaged) app.dock?.setIcon(path.join(__dirname, '..', 'assets', 'icon.png'));
  app.setName('Brainfile');
  store = new ProjectStore(path.join(app.getPath('userData'), 'projects.json'));
  github = startGitHub();
  host = startHost();
  link = startLink();
  if (DEV_URL) reloadAgentsOnRebuild();
  createWindow();
  app.on('activate', () => {
    if (!win) createWindow();
  });
  app.on('second-instance', () => {
    if (!win) return createWindow();
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
}

// One packaged app per data folder: a second copy (another Brainfile.app, or
// `open -n`) hands over to the first rather than opening the same projects,
// localStorage and boards twice. Development runs skip the lock, since the dev
// loop restarts Electron while the old one is still letting go.
if (!app.isPackaged || app.requestSingleInstanceLock()) void app.whenReady().then(start);
else app.quit();

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  // The host flushes pending commits on exit.
  host?.kill();
  agents?.kill();
  void link?.close();
});
