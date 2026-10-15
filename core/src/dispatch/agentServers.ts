/**
 * Custom agents (task-47): any ACP server the person names, kept in
 * dispatch.json's `agentServers` in the shape Zed uses for `agent_servers`
 * (a display name, then `command`, `args` and `env`), so an entry pastes
 * across either way. Each is offered as `custom:<name>`. Pure, so dispatch,
 * the desktop's window and plain `node --test` share it.
 */
import type { AgentServer, CustomAgentId, Result } from './types';

const PREFIX = 'custom:';

export const customId = (name: string): CustomAgentId => `${PREFIX}${name}`;
export const isCustom = (id: string): id is CustomAgentId => id.startsWith(PREFIX);
export const customName = (id: CustomAgentId): string => id.slice(PREFIX.length);

/** A name as it is kept: trimmed, its spaces single; empty when it has none or carries a control character. */
export function cleanName(name: string): string {
  if (/[\u0000-\u001f\u007f]/.test(name)) return '';
  return name.trim().replace(/\s+/g, ' ');
}

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/**
 * One entry, as read from dispatch.json or pasted from Zed: its command, its
 * arguments and its environment, every value a string. Null when it has no
 * command, as Zed's registry and extension entries have none. Other keys
 * (Zed's `type`, `default_mode`) are let go.
 */
export function cleanServer(raw: unknown): AgentServer | null {
  if (!isObject(raw) || typeof raw.command !== 'string' || !raw.command.trim()) return null;
  const args = Array.isArray(raw.args) ? raw.args.filter((a): a is string | number | boolean => ['string', 'number', 'boolean'].includes(typeof a)).map(String) : [];
  const env: Record<string, string> = {};
  if (isObject(raw.env)) {
    for (const [key, value] of Object.entries(raw.env)) {
      if (key && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')) env[key] = String(value);
    }
  }
  return { command: raw.command.trim(), args, env };
}

/** The `agentServers` map, cleaned: entries without a usable name or command are dropped; the first of two names that clean alike is kept. */
export function cleanServers(raw: unknown): Record<string, AgentServer> {
  const servers: Record<string, AgentServer> = {};
  if (!isObject(raw)) return servers;
  for (const [key, value] of Object.entries(raw)) {
    const name = cleanName(key);
    const server = cleanServer(value);
    if (name && server && !(name in servers)) servers[name] = server;
  }
  return servers;
}

/** JSON with Zed's settings comments and trailing commas taken out, strings left alone. */
function stripJsonc(text: string): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '"') {
      const start = i++;
      while (i < text.length && text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
      out += text.slice(start, ++i);
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
    } else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end < 0 ? text.length : end + 2;
    } else {
      out += c;
      i++;
    }
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
}

/**
 * Entries pasted from Zed's settings.json: the whole file or its
 * `"agent_servers": {…}`, the map itself, or one `"Name": {…}` on its own.
 * Comments and trailing commas are fine, as Zed allows them.
 */
export function pastedServers(text: string): Result<Record<string, AgentServer>> {
  const source = stripJsonc(text).trim().replace(/,$/, '');
  if (!source) return { ok: false, error: 'Paste an entry from Zed’s agent_servers' };
  let parsed: unknown;
  for (const attempt of [source, `{${source}}`]) {
    try {
      parsed = JSON.parse(attempt);
      break;
    } catch {
      /* a fragment: try it wrapped */
    }
  }
  if (!isObject(parsed)) return { ok: false, error: 'That is not JSON Brainfile can read' };
  const map = isObject(parsed.agent_servers) ? parsed.agent_servers : isObject(parsed.agentServers) ? parsed.agentServers : parsed;
  if (typeof map.command === 'string') return { ok: false, error: 'Give the entry its name: "Name": { "command": … }' };
  const servers = cleanServers(map);
  if (Object.keys(servers).length === 0) return { ok: false, error: 'No entry with a command in it' };
  return { ok: true, value: servers };
}

/** Arguments as the editor shows them: one a line, so an argument keeps its spaces. */
export const argsText = (args: string[]): string => args.join('\n');

export function argsFrom(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/** The environment as the editor shows it: `KEY=value`, one a line. */
export const envText = (env: Record<string, string>): string =>
  Object.entries(env)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

export function envFrom(text: string): Result<Record<string, string>> {
  const env: Record<string, string> = {};
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const eq = line.indexOf('=');
    const key = eq < 0 ? '' : line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return { ok: false, error: `Not KEY=value: ${line.slice(0, 40)}` };
    env[key] = line.slice(eq + 1);
  }
  return { ok: true, value: env };
}

/** A command as the picker names it: its file's name, not the folders before it. */
export const commandName = (command: string): string => command.split('/').filter(Boolean).pop() ?? command;
