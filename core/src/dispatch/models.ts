/**
 * What an agent reports about its sessions: its models, the effort levels
 * each offers (effort.ts, task-50) and its permission modes, cached a day in
 * the data folder's models.json. probe (session.ts) asks it afresh.
 */
import * as fs from 'fs';
import * as path from 'path';
import type * as acp from '@agentclientprotocol/sdk';
import { customId } from './agentServers';
import { effortSelect } from './effort';
import type { Session } from './session';
import type { AgentId, AgentMode, AgentModes, AgentServer, ModelOption } from './types';

/** models.json in the data folder. */
export const modelsFile = (dataDir: string): string => path.join(dataDir, 'models.json');
/** How long an agent's model list is trusted before it is asked again. */
export const MODELS_TTL_MS = 24 * 60 * 60_000;

export type ModelCache = Record<string, { at: number; options: ModelOption[]; modes?: AgentModes | null }>;

export function readModels(dataDir: string): ModelCache {
  try {
    return JSON.parse(fs.readFileSync(modelsFile(dataDir), 'utf-8')) as ModelCache;
  } catch {
    return {};
  }
}

type SelectEntry = { value?: string; name: string; description?: string | null; options?: SelectEntry[] };

/** A select config option's values, its groups flattened. */
function flatSelect(option: acp.SessionConfigOption): { value: string; name: string; description?: string }[] {
  const flat: { value: string; name: string; description?: string }[] = [];
  if (option.type !== 'select') return flat;
  for (const entry of option.options as SelectEntry[]) {
    for (const o of entry.options ?? [entry]) if (o.value) flat.push({ value: o.value, name: o.name, description: o.description ?? undefined });
  }
  return flat;
}

/** The session's model option, if the agent offers one: `category: model`, or an option named model. */
export function modelOption(options: acp.SessionConfigOption[] | null | undefined) {
  const option = options?.find((o) => o.category === 'model' || o.id === 'model');
  if (!option || option.type !== 'select') return null;
  return { id: option.id, current: option.currentValue as string, options: flatSelect(option).map(({ value, name }) => ({ value, name })) };
}

/** The modes that never ask: Claude's Bypass permissions, Codex's Full access, Antigravity's YOLO. */
export const BYPASS_MODE = /bypass|yolo|full.?access|dont.?ask/i;

/** An agent's modes as a session holds them: `via` says which one changes it. */
export type SessionModes = (AgentModes & { via: { configId: string } | null }) | null;

/**
 * The session's permission modes, as the agent reports them: ACP session
 * modes, or else a config option of category `mode`. `via` says which one
 * changes it.
 */
export function modesOf(created: Pick<acp.NewSessionResponse, 'modes' | 'configOptions'>): SessionModes {
  let options: AgentMode[];
  let initial: string;
  let via: { configId: string } | null = null;
  if (created.modes?.availableModes.length) {
    options = created.modes.availableModes.map((m) => ({ id: m.id, name: m.name, description: m.description ?? undefined }));
    initial = created.modes.currentModeId;
  } else {
    const option = created.configOptions?.find((o) => o.category === 'mode' && o.type === 'select');
    if (!option) return null;
    options = flatSelect(option).map((o) => ({ id: o.value, name: o.name, description: o.description }));
    initial = option.currentValue as string;
    via = { configId: option.id };
  }
  const bypass = options.find((m) => BYPASS_MODE.test(m.id) || BYPASS_MODE.test(m.name))?.id ?? null;
  return { initial, options, bypass, via };
}

/** A custom agent whose entry changed or went is asked again for its models and modes, not answered from the old entry's. */
export function forgetChanged(dataDir: string, before: Record<string, AgentServer>, after: Record<string, AgentServer>): void {
  const changed = Object.keys(before).filter((name) => JSON.stringify(before[name]) !== JSON.stringify(after[name]));
  const cache = readModels(dataDir);
  if (!changed.some((name) => customId(name) in cache)) return;
  for (const name of changed) delete cache[customId(name)];
  fs.writeFileSync(modelsFile(dataDir), JSON.stringify(cache, null, 2));
}

export function remember(dataDir: string, agentId: AgentId, options: ModelOption[], modes: AgentModes | null): void {
  if (!options.length && !modes) return;
  const cache = readModels(dataDir);
  cache[agentId] = { at: Date.now(), options, modes };
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(modelsFile(dataDir), JSON.stringify(cache, null, 2));
}

/** A freshly listed model keeps the effort levels already asked for it. */
export function keepingEfforts(dataDir: string, agentId: AgentId, options: ModelOption[]): ModelOption[] {
  const prior = readModels(dataDir)[agentId]?.options ?? [];
  return options.map((option) => (Array.isArray(option.efforts) ? option : { ...option, efforts: prior.find((item) => item.value === option.value)?.efforts }));
}

/** How long a probe may spend asking each model's effort levels before it returns the list it has. */
export const EFFORT_SWEEP_MS = 8_000;

/** A model list whose efforts have been asked: each entry carries `efforts`, possibly empty. */
export function effortsKnown(options: ModelOption[]): boolean {
  return options.every((option) => Array.isArray(option.efforts));
}

/** Gives up when the work outlasts `ms`. The request itself is left to finish. */
export function within<T>(ms: number, work: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out')), Math.max(1, ms));
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * Each model's effort levels, asked on the probe session that listed the models.
 * The agent publishes `thought_level` for the model the session is on, so selecting
 * each model is what makes that model's levels appear. A model the sweep does not
 * reach keeps an empty list. The session is put back on the model it opened on.
 */
export async function learnEfforts(dataDir: string, session: Session): Promise<void> {
  const cached = readModels(dataDir)[session.agentId];
  const models = cached?.options ?? [];
  const modes = cached?.modes ?? null;
  const thought = effortSelect(session.configOptions);
  if (!session.modelConfigId || !thought) {
    remember(dataDir, session.agentId, models.map((model) => ({ value: model.value, name: model.name, efforts: [] })), modes);
    return;
  }
  const current = session.modelCurrent;
  const deadline = Date.now() + EFFORT_SWEEP_MS;
  const filled: ModelOption[] = [];
  for (const model of models) {
    if (model.value === current) {
      filled.push({ value: model.value, name: model.name, efforts: thought.options });
      continue;
    }
    const left = deadline - Date.now();
    if (left <= 0) {
      filled.push({ value: model.value, name: model.name, efforts: [] });
      continue;
    }
    try {
      const response = await within(
        Math.min(1_000, left),
        session.connection.setSessionConfigOption({ sessionId: session.sessionId, configId: session.modelConfigId, value: model.value })
      );
      const levels = effortSelect(response.configOptions);
      filled.push({ value: model.value, name: model.name, efforts: levels?.options ?? [] });
    } catch {
      filled.push({ value: model.value, name: model.name, efforts: [] });
    }
  }
  if (current && current !== filled[filled.length - 1]?.value) {
    await session.connection
      .setSessionConfigOption({ sessionId: session.sessionId, configId: session.modelConfigId, value: current })
      .catch(() => {});
  }
  remember(dataDir, session.agentId, filled, modes);
}
