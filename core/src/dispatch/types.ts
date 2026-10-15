/**
 * The shapes dispatch works in: the agents, their servers and modes, the
 * settings, a run and what it asks. Types only, so the desktop's window can
 * share the pure modules that use them (agentServers.ts, effort.ts).
 */

export type Result<T = void> = { ok: true; value: T } | { ok: false; error: string };

/** The agents Brainfile knows how to start. */
export type KnownAgentId = 'claude' | 'codex' | 'antigravity' | 'cursor' | 'grok';
/** An agent the person added (task-47), by the name it has in dispatch.json's agentServers: `custom:Muse Code`. */
export type CustomAgentId = `custom:${string}`;
export type AgentId = KnownAgentId | CustomAgentId;

/**
 * An ACP server the person runs themselves, in the shape of Zed's
 * `agent_servers` so an entry pastes across: started as given, the command
 * found on PATH and `env` set over the app's own environment.
 */
export interface AgentServer {
  command: string;
  args: string[];
  env: Record<string, string>;
}

export interface AgentInfo {
  id: AgentId;
  name: string;
  available: boolean;
  /** Why it is or isn't offered, in a few words: `your login`, `downloads once`, `not installed`, a custom agent's command or `muse-acp not found`. */
  note: string;
}

export interface EffortOption {
  value: string;
  name: string;
}

export interface ModelOption {
  value: string;
  name: string;
  /** Effort levels this model offers. Empty when it offers none; absent until they have been asked. */
  efforts?: EffortOption[];
}

export type RunState = 'starting' | 'working' | 'waiting' | 'done' | 'failed' | 'stopped';

/** One piece of agent work: a dispatched task, or a turn in the board's small chat. */
export interface AgentRun {
  id: string;
  projectId: string;
  agentId: AgentId;
  /** `lead`: one turn of an epic's lead (decision-15), on the epic. */
  kind: 'dispatch' | 'ask' | 'lead';
  taskId?: string;
  /** The model asked for, when one was; unset is the agent's default. */
  model?: string;
  /** The effort level asked for with that model, when one was (task-50, task-54). */
  effort?: string;
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

/** One step of a turn: a tool the agent ran, or a line it wrote before its answer. */
export type RunStep = { kind: 'tool'; title: string; tool?: string; failed?: boolean } | { kind: 'note'; text: string };

/** An agent asking before it acts, answered by whoever runs it: the desktop's band, a terminal's prompt. */
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

/** Per repository, how the dispatcher answers an agent that asks first. */
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

/** A compatible entry from the official ACP registry. */
export interface RegistryAgent {
  id: string;
  name: string;
  description: string;
  version: string;
  distribution: 'npx' | 'binary';
}

export interface RegistryView {
  agents: RegistryAgent[];
  cached: boolean;
  /** A failed refresh, or an empty registry when no cache exists. */
  warning?: string;
}

/** App-wide dispatch settings, kept in dispatch.json in the data folder. */
export interface DispatchSettings {
  /** On: every agent runs in its bypass mode and nothing is asked. Off: each agent's own default, or the mode chosen for it. */
  bypass: boolean;
  /** A mode chosen per agent for when bypass is off; unset is the agent's default. */
  modes: Partial<Record<AgentId, string>>;
  /** The person's own ACP servers by display name, offered beside the known agents as `custom:<name>` (task-47). */
  agentServers: Record<string, AgentServer>;
}
