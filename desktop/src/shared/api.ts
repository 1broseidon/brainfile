/**
 * The one contract between the window and the board host. The renderer sees
 * only these shapes; everything that touches files or git stays behind it.
 */

export type Priority = 'low' | 'medium' | 'high' | 'critical';

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

/** A document's place in the graph (spec-12): what it is for, whatever it is called. */
export type DocRole = 'epic' | 'spec' | 'plan' | 'task' | 'decision';

export interface TaskView {
  id: string;
  title: string;
  column: string;
  position?: number;
  type?: string;
  role: DocRole;
  /** The TUI's glyph for the document's role; empty for a plain task. */
  glyph: string;
  priority?: Priority;
  assignee?: string;
  tags?: string[];
  dueDate?: string;
  parentId?: string;
  description?: string;
  subtasks?: Subtask[];
  contractStatus?: string;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string;
  /** Dependencies on related boards that are not done yet, as written (`mobile:task-12`). */
  blockedOn?: string[];
  /** The decisions this work rests on. */
  decisions?: string[];
  /** Those of them that have been superseded, rejected or gone stale. */
  restsOnRetired?: string[];
  /** Where the work came from, as written in `source:`: an issue's URL when it was made from one (task-26). */
  source?: string;
}

/** `proposed` is a legacy ADR's status before it was accepted. */
export type DecisionStatus = 'current' | 'superseded' | 'rejected' | 'stale' | 'proposed';

/** A decision (spec-11): a standing choice, not work. No column; current until replaced. */
export interface DecisionView {
  id: string;
  title: string;
  claimKey?: string;
  /** decision, preference, constraint or rule. */
  kind?: string;
  status: DecisionStatus;
  stance?: string;
  subject?: string;
  holdsWhile?: string;
  recheck?: string;
  validUntil?: string;
  supersedes: string[];
  supersededBy?: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
  /** Open work that rests on it. */
  restingOn: string[];
}

/** A dependency, resolved: here, or on a related board. */
export interface DependencyView {
  ref: string;
  /** open, completed, not-found, missing, no-board, unknown-alias, malformed */
  state: string;
  done: boolean;
  title?: string;
  /** The related board's folder, for a qualified reference. */
  folder?: string;
}

/** A sister board named in this board's `related:`. */
export interface RelatedView {
  alias: string;
  /** Absolute folder, resolved against this repository's root. */
  folder: string;
  status: 'found' | 'missing' | 'no-board';
}

export interface TaskDetail extends TaskView {
  /** Markdown body below the frontmatter, description section included. */
  body: string;
  /** `## Log` entries, newest last, as written. */
  log: string[];
  relatedFiles?: string[];
  blockedBy?: string[];
  dependsOn?: string[];
  dependencies: DependencyView[];
  /** True when the task lives in logs/ (completed). */
  archived: boolean;
  /** Set when the document is a decision. */
  decision?: DecisionView;
}

export interface ColumnView {
  id: string;
  title: string;
  completionColumn?: boolean;
}

export type Storage = 'linked' | 'standalone' | 'plain';

export interface SyncView {
  /** `synced 12s ago`, `local only`, … null for a plain board. */
  label: string | null;
  remote: string | null;
  /** Commits not yet sent. */
  pending: number;
  /** Commits on the remote's copy not here yet, as of the last fetch. */
  behind: number;
  busy: boolean;
  /** Plain-language result of the last sync this app ran, when it failed. */
  warning?: string;
}

export type SettleChoice = 'theirs' | 'merge' | 'keep';

/** Where the board lives and whether that needs a look (spec-15). */
export interface IntegrityView {
  /** Two boards disagree: nothing writes until one of the three choices is taken. */
  twoBoards: {
    /** `Two boards: this folder (7) and origin's (19, newer).` */
    message: string;
    /** `Origin's already has everything this folder has.` */
    detail: string;
    /** `Use origin's`. */
    useOther: string;
    /** The choice that loses nothing, when there is one. */
    lossless: SettleChoice | null;
  } | null;
  /** Anything else about where the board lives, one sentence each. */
  notes: string[];
  /** A few words for the health list (`two copies`, `old copy in main`), or null when all is well. */
  short: string | null;
  /** The problem `short` names, in one plain sentence: the health list's second line. */
  line: string | null;
  /** What Fix would do, when the problem has a fix that loses nothing (task-34). */
  fix: FixPlan | null;
  /** What Brainfile found, as plain lines (every copy, its count and last change), for an agent's brief. Empty when all is well. */
  found: string[];
}

/** What Fix does to a board problem (task-34). Only ever offered when nothing is lost; every copy is backed up first. */
export interface FixPlan {
  /** `untrack` the code branch's old copy, `adopt` the copy that has everything, or `prune` a lost checkout. */
  kind: 'untrack' | 'adopt' | 'prune';
  /** What it will do, in a few words, said before it runs: `Back up, then untrack main's copy`. */
  words: string;
}

export interface FixResult {
  /** What was done, in a short line: `Untracked main's copy. Push main to share it.` */
  message: string;
  /** Undo can put it back, for a few seconds. */
  undo: boolean;
}

export interface BoardSnapshot {
  projectId: string;
  title: string;
  columns: ColumnView[];
  tasks: TaskView[];
  /**
   * Completed work from logs/, newest first: the latest completions, and
   * everything completed under a document that is shown, however old, so a
   * child stays under its parent (task-20).
   */
  completed: TaskView[];
  typeNames: string[];
  /** Every decision, current and retired, newest first. */
  decisions: DecisionView[];
  storage: Storage;
  sync: SyncView;
  integrity: IntegrityView;
  related: RelatedView[];
  /** Every `source:` on the board, open and completed, to the task that carries it: an issue here is already a task. */
  sources: Record<string, string>;
}

export type ProjectState =
  | { status: 'ready'; storage: Storage; dotDir: string; materialized?: boolean }
  | { status: 'no-board'; inRepo: boolean }
  | { status: 'legacy'; file: string }
  | { status: 'missing' }
  | { status: 'error'; message: string };

export interface Project {
  /** Absolute folder path; doubles as the id. */
  id: string;
  name: string;
  path: string;
  state: ProjectState;
}

export interface NewTaskInput {
  title: string;
  column: string;
  description?: string;
  priority?: Priority;
  assignee?: string;
  tags?: string[];
  type?: string;
  parentId?: string;
  /** The issue it is made from (task-26); refused when a task already carries it. */
  source?: string;
}

/** A decision as the phone records it (`brainfile decide`): it supersedes the claim key's current one. */
export interface NewDecisionInput {
  title: string;
  /** Dotted claim family, e.g. `dependency.http-client`. */
  claimKey?: string;
  /** The why, under the title. */
  description?: string;
}

export interface TaskPatch {
  title?: string;
  description?: string | null;
  priority?: Priority | null;
  assignee?: string | null;
  tags?: string[] | null;
  dueDate?: string | null;
  parentId?: string | null;
}

export interface RemovedTask {
  taskId: string;
  filePath: string;
  content: string;
}

// ── Agents (dispatch) ─────────────────────────────────────────────────────

export type AgentId = 'claude' | 'codex' | 'antigravity' | 'cursor' | 'grok';

export interface AgentInfo {
  id: AgentId;
  name: string;
  available: boolean;
  /** Why it is or isn't offered, in a few words: `your login`, `downloads once`, `not installed`. */
  note: string;
}

export interface ModelOption {
  value: string;
  name: string;
}

export interface ChatTurn {
  who: 'you' | 'agent';
  text: string;
}

export type RunState = 'starting' | 'working' | 'waiting' | 'done' | 'failed' | 'stopped';

/** One piece of agent work: a dispatched task, or a turn in the board's small chat. */
export interface AgentRun {
  id: string;
  projectId: string;
  agentId: AgentId;
  kind: 'dispatch' | 'ask';
  taskId?: string;
  /** The model asked for, when one was; unset is the agent's default. */
  model?: string;
  /** The chat thread an ask belongs to. An ask with a taskId is a discussion of that task (task-35). */
  threadId?: string;
  /** A hand-off the chat made: the chat turn (an ask's run) that asked for it (spec-16). */
  from?: string;
  state: RunState;
  /** What kind of work, one word: reading, editing, running, searching, thinking. */
  activity: string;
  reply?: string;
  error?: string;
  startedAt: number;
  endedAt?: number;
  /** What the agent did on the way to its reply, in order: tools it ran and what it said between them. */
  steps?: RunStep[];
}

/**
 * Who asked for a hand-off, written on the task as `dispatch:` in its
 * frontmatter (spec-16), beside the assignee. Core keeps it as an unknown key;
 * queues and runner claims come later.
 */
export interface DispatchRecord {
  agent: AgentId;
  model?: string;
  by: 'chat';
  /** ISO 8601. */
  at: string;
}

/** One step of a turn: a tool the agent ran, or a line it wrote before its answer. */
export type RunStep = { kind: 'tool'; title: string; tool?: string; failed?: boolean } | { kind: 'note'; text: string };

/** An agent asking before it acts, answered in the board's band. */
export interface PermissionAsk {
  id: string;
  runId: string;
  projectId: string;
  agentId: AgentId;
  title: string;
  /** The tool's kind as the agent reports it: execute, edit, read, fetch, other. */
  kind?: string;
  options: { optionId: string; name: string; kind: string }[];
}

export type AgentEvent =
  | { kind: 'run'; run: AgentRun }
  | { kind: 'permission'; ask: PermissionAsk }
  | { kind: 'permission-done'; id: string };

/** Per repository, how the dispatcher answers an agent that asks first. Set in repo settings later. */
export type PermissionPolicy = 'ask' | 'allow' | 'bypass';

/** A permission mode an agent offers its sessions (ACP session modes), as the agent names it. */
export interface AgentMode {
  id: string;
  name: string;
  description?: string;
}

/** An agent's permission modes, as it reports them at runtime. */
export interface AgentModes {
  /** The mode a new session starts in: the agent's own default. */
  initial: string;
  options: AgentMode[];
  /** The mode that never asks (Bypass permissions, Full access, YOLO), if the agent has one. */
  bypass: string | null;
}

/** An editor found on this Mac, or the file's default app (`system`). */
export interface EditorInfo {
  id: string;
  name: string;
}

/**
 * A hand-off's own branch and worktree, as its review shows them (spec-14):
 * what the agent committed, and where Merge would put it.
 */
export interface ReviewView {
  /** `dispatch/task-15`. */
  branch: string;
  /** The worktree's folder. */
  path: string;
  /** The branch it was started from (a commit, when that was detached). */
  base: string | null;
  /** The branch the project's checkout is on now: where Merge lands. Null when detached. */
  into: string | null;
  /** Commits on the branch since it started. */
  ahead: number;
  /** The newest first, the first few. */
  commits: { sha: string; subject: string }[];
  /** The first few files changed, with lines added and removed. */
  files: { path: string; added: number; removed: number }[];
  filesChanged: number;
  added: number;
  removed: number;
  /** Files changed in the worktree and not committed: Merge waits for them. */
  uncommitted: number;
  /** Its commits are already in `into`; Merge only lets the worktree go. */
  merged: boolean;
}

/** What is running and asking now: what a phone that connects mid-run needs to catch up. */
export interface LiveAgents {
  /** Runs not yet ended. */
  runs: AgentRun[];
  /** Permission asks not yet answered. */
  asks: PermissionAsk[];
}

/** App-wide dispatch settings, kept in the app's dispatch.json. */
export interface DispatchSettings {
  /** On: every agent runs in its bypass mode and nothing is asked. Off: each agent's own default, or the mode chosen for it. */
  bypass: boolean;
  /** A mode chosen per agent for when bypass is off; unset is the agent's default. */
  modes: Partial<Record<AgentId, string>>;
}

// ── Forges (task-26) ──────────────────────────────────────────────────────

/** A code host the window knows how to read issues from. Only GitHub, for now. */
export type ForgeId = 'github';

/** The repository a project's origin remote points at, on a forge the window knows. */
export interface ForgeRepo {
  forge: ForgeId;
  /** `github.com`. */
  host: string;
  owner: string;
  name: string;
  /** `https://github.com/owner/name`. */
  url: string;
}

/** An open issue, as the issues view shows it. */
export interface IssueView {
  number: number;
  title: string;
  body: string;
  labels: string[];
  /** The issue's page: what a task made from it keeps as its `source:`. */
  url: string;
  author?: string;
  comments: number;
  createdAt: string;
  updatedAt: string;
}

/** How the window signs in to GitHub: the gh CLI's login, a token in the environment, one saved in Settings, or none (public repositories only). */
export type GitHubAuthSource = 'gh' | 'env' | 'token' | 'none';

export interface IssuesView {
  repo: ForgeRepo;
  /** Open issues, pull requests left out, most recently updated first. */
  issues: IssueView[];
  /** When GitHub was last asked (ms). */
  fetchedAt: number;
  auth: GitHubAuthSource;
  /** Requests left in the hour, as GitHub last said. */
  rateRemaining?: number;
  /** More open issues than were read. */
  truncated: boolean;
}

export interface GitHubAuthView {
  source: GitHubAuthSource;
  /** Who GitHub says the credentials belong to, when it was asked and they work. */
  login?: string;
  /** A token is saved in Settings. */
  saved: boolean;
  /** Why the credentials found do not work. */
  error?: string;
}

// ── Phone link (task-40, brainfile-mobile docs/link.md) ───────────────────

/** A project as a phone sees it: where it is shared, when it is, so the phone can join it to a GitHub project it follows. */
export interface LinkProject extends Project {
  repo?: { owner: string; name: string };
  /** The board's name under `refs/brainfile/` on that repository: `board`. */
  ref?: string;
}

/** A phone that may connect: its key, from the pairing it was let in by. */
export interface LinkedPhone {
  /** Its static X25519 public key, unpadded base64url. */
  key: string;
  /** The model it gave when it paired: `iPhone 16 Pro`. */
  name: string;
  pairedAt: number;
  lastSeen: number;
}

export interface LinkView {
  /** Settings, Phone, Phone link: listening on the network. Off by default. */
  on: boolean;
  /** The port it listens on, while it does. */
  port: number | null;
  /** Why it could not listen, in a few words. */
  error?: string;
  phones: (LinkedPhone & { connected: boolean })[];
  /** The last phone let in by a code, so a code on screen can say so and close. */
  paired?: { name: string; at: number };
}

/** A code a phone scans or is sent: `brainfile://link?v=1&k=…&s=…&a=…&n=…`. */
export interface PairingCode {
  link: string;
  /** When its secret stops being accepted (ms). */
  expiresAt: number;
}

export type Result<T = void> = { ok: true; value: T } | { ok: false; error: string };

/** Requests the renderer can make. Each maps to one handler in the host or main. */
export interface Api {
  listProjects(): Promise<Project[]>;
  /** Opens the folder picker; resolves to the added project, or null when cancelled. */
  addProject(): Promise<Project | null>;
  removeProject(projectId: string): Promise<void>;
  revealProject(projectId: string): Promise<void>;
  /** Re-resolve a project's board (after `brainfile init`, a fetch, …). */
  refreshProject(projectId: string): Promise<Project>;
  initBoard(projectId: string): Promise<Result<Project>>;

  openBoard(projectId: string): Promise<Result<BoardSnapshot>>;
  closeBoard(projectId: string): Promise<void>;
  getTask(projectId: string, taskId: string): Promise<Result<TaskDetail>>;

  addTask(projectId: string, input: NewTaskInput): Promise<Result<TaskView>>;
  moveTask(projectId: string, taskId: string, column: string, position?: number): Promise<Result<{ completed: boolean }>>;
  patchTask(projectId: string, taskId: string, patch: TaskPatch): Promise<Result>;
  toggleSubtask(projectId: string, taskId: string, subtaskId: string): Promise<Result>;
  addSubtask(projectId: string, taskId: string, title: string): Promise<Result>;
  completeTask(projectId: string, taskId: string): Promise<Result>;
  /** Resolves to the removed file, so the window can offer Undo. */
  deleteTask(projectId: string, taskId: string): Promise<Result<RemovedTask>>;
  restoreTask(projectId: string, removed: RemovedTask): Promise<Result>;
  /** A line in the task's log, as the person. */
  noteTask(projectId: string, taskId: string, text: string): Promise<Result>;
  /** Record a decision as `brainfile decide` does: the claim key's current decision is superseded. */
  decide(projectId: string, input: NewDecisionInput): Promise<Result<DecisionView>>;
  syncNow(projectId: string): Promise<Result<SyncView>>;
  /** Make two boards one: take the other, merge them, or keep this one. What is replaced is backed up first. */
  settleBoards(projectId: string, choice: SettleChoice): Promise<Result<{ message: string }>>;
  /** What Fix would do about the board's problem now, or null when no fix loses nothing. */
  planFix(projectId: string): Promise<Result<FixPlan | null>>;
  /**
   * Back up every copy of the board, then fix its problem. `expected` is the
   * plan's words as the person confirmed them; if the plan has changed since,
   * nothing runs.
   */
  fixBoard(projectId: string, expected?: string): Promise<Result<FixResult>>;
  /** Put back what the last fix changed, within a few seconds of it. What it replaces is backed up first. */
  undoFix(projectId: string): Promise<Result<{ message: string }>>;

  listAgents(): Promise<AgentInfo[]>;
  /** The agent's models, as it reports them; probed once and cached. */
  listModels(agentId: AgentId): Promise<Result<ModelOption[]>>;
  /** The agent's permission modes, as it reports them; probed with the models and cached. */
  listModes(agentId: AgentId): Promise<Result<AgentModes | null>>;
  getSettings(): Promise<DispatchSettings>;
  /** Applies at once, to sessions already open as well as new ones. */
  setSettings(patch: Partial<DispatchSettings>): Promise<DispatchSettings>;
  dispatch(projectId: string, taskId: string, agentId: AgentId, model?: string): Promise<Result<AgentRun>>;
  /** One turn in a chat thread; earlier lines come along in case the agent's session has gone. */
  /** `context` names what the person has open (a task's ID), so "this" means it. */
  /** `models` is the person's model for each agent on this board: what the chat's hand-offs use (spec-16). */
  ask(
    projectId: string,
    agentId: AgentId,
    text: string,
    threadId: string,
    model?: string,
    earlier?: ChatTurn[],
    context?: string[],
    models?: Partial<Record<AgentId, string>>
  ): Promise<Result<AgentRun>>;
  /**
   * One turn in a discussion of a task before it is handed off (task-35): the
   * agent has the task as context and may change its description, subtasks
   * and contract, not code. The run is an ask on the thread, with the task's ID.
   */
  discuss(
    projectId: string,
    agentId: AgentId,
    text: string,
    threadId: string,
    taskId: string,
    model?: string,
    earlier?: ChatTurn[]
  ): Promise<Result<AgentRun>>;
  stopRun(runId: string): Promise<void>;
  /** The runs not yet ended and the asks not yet answered. */
  live(): Promise<LiveAgents>;
  /** The hand-off's branch and what is on it, or null when the task has no worktree. */
  review(projectId: string, taskId: string): Promise<Result<ReviewView | null>>;
  /** Merge the hand-off's branch into the checkout's branch, then let its worktree and branch go. */
  mergeReview(projectId: string, taskId: string): Promise<Result<{ message: string }>>;
  /** Throw the hand-off's work away: its worktree and its branch. */
  discardReview(projectId: string, taskId: string): Promise<Result<{ message: string }>>;
  /** Opens the hand-off's worktree in the editor named, else the first found. */
  openWorktree(projectId: string, taskId: string, editorId?: string): Promise<Result>;
  answerPermission(askId: string, optionId: string | null): Promise<void>;
  onAgentEvent(listener: (event: AgentEvent) => void): () => void;

  /** The editors on this Mac, best first, then the file's default app. */
  listEditors(): Promise<EditorInfo[]>;
  /** Which of these paths, relative to the project, are files in it. */
  existingFiles(projectId: string, files: string[]): Promise<string[]>;
  /** Opens a file in the project at a line, in the editor named, else the first found. */
  openInEditor(projectId: string, file: string, line?: number, editorId?: string): Promise<Result>;

  /** The forge repository the project's origin points at, or null when it is none the window knows. */
  forgeRepo(projectId: string): Promise<ForgeRepo | null>;
  /** The repository's open issues. Asked of GitHub at most once a minute unless `force`; unchanged answers cost no rate limit. */
  listIssues(projectId: string, force?: boolean): Promise<Result<IssuesView>>;
  /** How the window would sign in to GitHub now, and as whom. */
  githubAuth(): Promise<GitHubAuthView>;
  /** Save a token for GitHub (kept in the Keychain's care), or forget it with null. Checked with GitHub before it is kept. */
  setGitHubToken(token: string | null): Promise<Result<GitHubAuthView>>;

  /** The phone link: the switch, the linked phones. */
  linkState(): Promise<LinkView>;
  /** Off closes every phone's connection and stops listening. */
  setLink(on: boolean): Promise<LinkView>;
  /** A new pairing code, valid five minutes; it turns the link on and retires the last one. */
  linkCode(): Promise<Result<PairingCode>>;
  /** Removes the phone's key; a connected phone is told (`bye`) and let go. */
  forgetPhone(key: string): Promise<LinkView>;
  onLinkChanged(listener: (view: LinkView) => void): () => void;

  onBoardChanged(listener: (snapshot: BoardSnapshot) => void): () => void;
  onProjectsChanged(listener: (projects: Project[]) => void): () => void;
}

/** Channel names, shared by preload and main. */
export const CHANNEL = {
  invoke: 'brainfile:invoke',
  board: 'brainfile:board',
  projects: 'brainfile:projects',
  agent: 'brainfile:agent',
  link: 'brainfile:link',
} as const;

/** Methods main forwards to the agents process. */
export const AGENT_METHODS = [
  'listAgents',
  'listModels',
  'listModes',
  'getSettings',
  'setSettings',
  'dispatch',
  'ask',
  'discuss',
  'stopRun',
  'live',
  'review',
  'mergeReview',
  'discardReview',
  'answerPermission',
] as const;
export type AgentMethod = (typeof AGENT_METHODS)[number];
/** From main to the agents process: a request, or the host's answer to one the agents process made. */
export type AgentRequest = { id: number; method: AgentMethod; args: unknown[] };
export type HostReply = { kind: 'host-reply'; id: number; result: unknown };
/** The board writes the agents process may ask main to pass to the host. */
export const AGENT_HOST_METHODS = ['recordDispatch'] as const;
export type AgentHostMethod = (typeof AGENT_HOST_METHODS)[number];
export type AgentMessage =
  | { kind: 'reply'; id: number; result: unknown }
  | { kind: 'event'; event: AgentEvent }
  | { kind: 'host'; id: number; method: AgentHostMethod; args: unknown[] };

/** Methods main forwards to the board host rather than answering itself. */
export const HOST_METHODS = [
  'openBoard',
  'closeBoard',
  'getTask',
  'addTask',
  'moveTask',
  'patchTask',
  'toggleSubtask',
  'addSubtask',
  'completeTask',
  'deleteTask',
  'restoreTask',
  'noteTask',
  'decide',
  'syncNow',
  'settleBoards',
  'planFix',
  'fixBoard',
  'undoFix',
] as const;

export type HostMethod = (typeof HOST_METHODS)[number];

/** Messages between main and the board host (a utility process). */
export type HostRequest = { id: number; method: HostMethod | AgentHostMethod | 'locate' | 'sharing'; args: unknown[] };
export type HostMessage =
  | { kind: 'reply'; id: number; result: unknown }
  | { kind: 'board'; snapshot: BoardSnapshot };
