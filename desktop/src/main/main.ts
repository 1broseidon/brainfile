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
  AGENT_FORGE_METHODS,
  AGENT_HOST_METHODS,
  AGENT_METHODS,
  CHANNEL,
  HOST_METHODS,
  type AgentMessage,
  type AgentRequest,
  type BoardSnapshot,
  type HostReply,
  type HostMessage,
  type HostRequest,
  type IssuesView,
  type LinkProject,
  type Project,
  type ProjectState,
  type Result,
  type LiveAgents,
  type ReviewView,
} from '../shared/api';
import { loginShellPath } from './shellPath';
import { ProjectStore } from './projects';
import { existingFiles, listEditors, openFolder, openInEditor } from './editors';
import { detectForge, fileTokenStore, forgeFromRemote, ghCliToken, GitHub } from '@brainfile/core/forge';
import { readPlacement, resolvePlacement, writePlacement, type WindowPlacement } from './windowState';
import { BoardHolds, linkDesk } from '../link/bridge';
import { LinkServer } from '../link/server';
import { LinkStore } from '../link/store';
import { deskAddresses, deskName } from '../link/addresses';
import { bundleOf, Updater } from './updater';
import { APP_CLI_ENV, ELECTRON_BIN_ENV, appCliLaunch, appCliPath } from '../agents/ownCli';
import { UPDATE_PUBLIC_KEY } from './update-key';

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
let updater: Updater;
/** Set once quitting has begun: the agents process lets go first, then the rest goes. */
let quitting = false;
/** Set once the board host has been asked to go: it commits what is left first (its SIGTERM), and is not started again. */
let hostStopping = false;
/** How long the agents process has to let go of its hand-offs before the app quits anyway. */
const AGENTS_QUIT_MS = 6_000;
/** How long the board host has to commit what the agents process's letting go wrote, before the app quits anyway. */
const HOST_QUIT_MS = 2_000;

/** The boards the window and each phone hold open: the host closes one only when nobody does. */
const holds = new BoardHolds({
  // A board opened is one the agents process works the queue of (task-84), and whose runs from elsewhere it shows.
  open: (projectId) =>
    callHost<Result<BoardSnapshot>>('openBoard', projectId).then((opened) => {
      if (opened.ok) void callAgents('boardChanged', projectId);
      return opened;
    }),
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
      // The queue is worked again (task-84), and an epic's lead hears a child the person completed, and ends with its last (decision-15).
      void callAgents('boardChanged', message.snapshot.projectId);
    } else if (message.kind === 'runs') {
      // A run or runner file changed: one a terminal or an MCP client runs shows as the window's own do (task-84).
      void callAgents('runsChanged', message.projectId);
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
  // Quitting, the host is not started again by a late write once it has gone.
  if (hostStopping && !host) return Promise.resolve({ ok: false, error: 'Brainfile is quitting' } as T);
  if (!host) host = startHost();
  const id = nextRequest++;
  return new Promise((resolve) => {
    pending.set(id, resolve as (result: unknown) => void);
    host!.postMessage({ id, method, args } satisfies HostRequest);
  });
}

// ── Agents process ──────────────────────────────────────────────────────────

/** The app's own brainfile CLI: shipped in its Resources, or in development the repository's own build (ownCli.ts). */
const appCli = () => appCliPath({ packaged: app.isPackaged, resourcesPath: process.resourcesPath, appPath: app.getAppPath() });

function startAgents(): UtilityProcess {
  const child = utilityProcess.fork(path.join(__dirname, 'agents.js'), [], {
    serviceName: 'Brainfile Agents',
    // Its agents get the app's own CLI, run by this binary as node, not the brainfile installed on the Mac.
    env: { ...process.env, BRAINFILE_DATA_DIR: app.getPath('userData'), [APP_CLI_ENV]: appCli(), [ELECTRON_BIN_ENV]: process.execPath },
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
    } else if (message.kind === 'forge') {
      // A pull request opened or followed (decision-16): GitHub is asked here, where the person's credentials are.
      void forgeCall(message.method, message.args).then((value) => child.postMessage({ kind: 'host-reply', id: message.id, result: value } satisfies HostReply));
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

/** How many agents are at work, as the agents process writes it for the dev loop; 0 when it cannot say. */
function agentsAtWork(file = process.env.BRAINFILE_DEV_BUSY): number {
  if (!file) return 0;
  try {
    return Number(fs.readFileSync(file, 'utf-8')) || 0;
  } catch {
    return 0;
  }
}

/**
 * In development, a rebuilt agents process takes over without a restart:
 * the old one is let go and the next request starts the new build. The
 * window and the board host carry on. While an agent is at work the swap
 * waits, so merging a hand-off into the app's own code never ends another.
 */
function reloadAgentsOnRebuild(): void {
  let timer: NodeJS.Timeout | null = null;
  let said = false;
  const swap = () => {
    const working = agentsAtWork();
    if (working > 0) {
      if (!said) console.log(`agents: the rebuild waits for ${working} agent run${working === 1 ? '' : 's'} to finish`);
      said = true;
      timer = setTimeout(swap, 2000);
      return;
    }
    said = false;
    agents?.kill();
  };
  fs.watch(path.join(__dirname, 'agents.js'), () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(swap, 250);
  });
}

function callAgents<T>(method: AgentRequest['method'], ...args: unknown[]): Promise<T> {
  // Quitting, the agents process is not started again by what its letting go writes.
  if (quitting && !agents) return Promise.resolve({ ok: false, error: 'Brainfile is quitting' } as T);
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

/** `brainfile init` in the project folder: the CLI owns board creation, the app's own (ownCli.ts), run by this binary as node. */
function initBoard(projectId: string): Promise<Result<Project>> {
  return new Promise((resolve) => {
    const cli = appCli();
    if (!fs.existsSync(cli)) return resolve({ ok: false, error: `Brainfile's own command line is not at ${cli}` });
    const launch = appCliLaunch(process.execPath, cli);
    const child = spawn(launch.command, [...launch.args, 'init'], { cwd: projectId, env: { ...process.env, ...launch.env } });
    let output = '';
    child.stdout.on('data', (d) => (output += d));
    child.stderr.on('data', (d) => (output += d));
    child.on('error', (err) => resolve({ ok: false, error: `brainfile init could not start: ${err.message}` }));
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

/** One of the forge calls the agents process may make, on the window's GitHub client. */
async function forgeCall(method: string, args: unknown[]): Promise<unknown> {
  if (!(AGENT_FORGE_METHODS as readonly string[]).includes(method)) return { ok: false, error: `Not allowed: ${method}` };
  try {
    if (method === 'openPullRequest') return await github.openPullRequest(...(args as Parameters<GitHub['openPullRequest']>));
    return await github.pullRequestState(...(args as Parameters<GitHub['pullRequestState']>));
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
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
  return new GitHub({
    fetch: (...args) => fetch(...args),
    ghToken: ghCliToken,
    env: process.env,
    store,
    userAgent: 'Brainfile-Desktop',
    signIn: 'Sign in with `gh auth login`, or save a token in Settings.',
  });
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
    open: (sealed) => {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('The Keychain is not available');
      return safeStorage.decryptString(sealed);
    },
  });
  const server = new LinkServer({
    store: linkStore,
    desk: linkDesk({
      host: (method, ...args) => callHost(method, ...args),
      agents: (method, ...args) => callAgents(method, ...args),
      holds,
      projects: linkProjects,
      knows: (projectId) => store.list().includes(projectId),
      settled: (projectId) => win?.webContents.send(CHANNEL.ready, projectId),
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

// ── Updates (task-71) ───────────────────────────────────────────────────────

/** How many agents are at work now: an update's restart waits for none. */
async function agentsWorking(): Promise<number> {
  if (!agents) return 0;
  const live = await callAgents<LiveAgents>('live');
  // A run another runner works (`where`) goes on without this app.
  return live.runs.filter((r) => !r.where && (r.state === 'starting' || r.state === 'working' || r.state === 'waiting')).length;
}

function startUpdater(): Updater {
  const bundle = process.platform === 'darwin' && app.isPackaged ? bundleOf(app.getPath('exe')) : null;
  const disabledReason =
    process.platform !== 'darwin' ? 'Brainfile updates itself on a Mac; elsewhere, install the new release.'
    : !app.isPackaged || !bundle ? 'A development run: the installed Brainfile.app updates itself.'
    : undefined;
  const updates = new Updater({
    current: app.getVersion(),
    target: `${process.platform}-${process.arch}`,
    bundle,
    dataDir: app.getPath('userData'),
    publicKey: UPDATE_PUBLIC_KEY,
    fetch: (input, init) => fetch(input, init),
    busy: agentsWorking,
    // A normal quit, so the board host flushes its commits first.
    relaunch: () => {
      app.relaunch();
      app.quit();
    },
    onChange: (status) => win?.webContents.send(CHANNEL.update, status),
    disabledReason,
    // Development aid: `BRAINFILE_PREVIEW_UPDATE=0.2.0` pretends that version is out, for the badge and Settings › Updates.
    preview: DEV_URL ? process.env.BRAINFILE_PREVIEW_UPDATE : undefined,
  });
  updates.start();
  return updates;
}

// ── IPC ─────────────────────────────────────────────────────────────────────

const local: Record<string, (...args: any[]) => unknown> = {
  updateStatus: () => updater.view(),
  checkUpdate: () => updater.check(),
  // It runs on: progress and the outcome reach the window as update events.
  installUpdate: (version: string) => {
    void updater.install(version);
    return updater.view();
  },
  cancelUpdate: () => updater.cancel(),
  restartToUpdate: () => updater.restart(),
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

/**
 * The strip is the window's title bar on every platform: on a Mac the traffic
 * lights sit in it; elsewhere the system draws its own controls over its
 * right end (titleBarOverlay), in the well's colour with the strip's quiet ink.
 */
const MAC = process.platform === 'darwin';
const STRIP_H = 40;
function overlayColours(): { color: string; symbolColor: string; height: number } {
  const dark = nativeTheme.shouldUseDarkColors;
  return { color: dark ? '#0b0a09' : '#e9e7e5', symbolColor: dark ? '#8b8783' : '#77736e', height: STRIP_H };
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
    ...(MAC
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 14, y: 14 } }
      : { titleBarStyle: 'hidden' as const, titleBarOverlay: overlayColours() }),
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
  if (!MAC) {
    const target = win;
    const recolour = () => {
      if (!target.isDestroyed()) target.setTitleBarOverlay(overlayColours());
    };
    nativeTheme.on('updated', recolour);
    target.once('closed', () => nativeTheme.off('updated', recolour));
  }
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
  updater = startUpdater();
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

app.on('before-quit', (event) => {
  if (!quitting && agents) {
    // The agents process goes first: its hand-offs end stopped, their claims given back through the host
    // (so the next launch starts none of them again by itself); then the host, which flushes its commits.
    quitting = true;
    event.preventDefault();
    const child = agents;
    const gone = new Promise<void>((resolve) => child.once('exit', () => resolve()));
    child.kill();
    void Promise.race([gone, new Promise((resolve) => setTimeout(resolve, AGENTS_QUIT_MS))]).then(() => app.quit());
    return;
  }
  quitting = true;
  if (host && !hostStopping) {
    // Then the host: on SIGTERM it commits what the agents process's letting go wrote (releases, notes), which its
    // debounce had not yet; given a moment to, as the agents process was, before the app goes.
    hostStopping = true;
    event.preventDefault();
    const child = host;
    const gone = new Promise<void>((resolve) => child.once('exit', () => resolve()));
    child.kill();
    void Promise.race([gone, new Promise((resolve) => setTimeout(resolve, HOST_QUIT_MS))]).then(() => app.quit());
    return;
  }
  hostStopping = true;
  agents?.kill();
  void link?.close();
});
