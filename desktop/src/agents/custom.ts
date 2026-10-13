/**
 * Starting a custom agent (task-47): an ACP server the person named in
 * dispatch.json, run as given. Nothing is installed or downloaded: its
 * command is found on PATH as a shell would find it, or taken as the path it
 * is, and its `env` is set over the environment the app gives every agent.
 * Nothing here touches Electron, so it is tested on its own.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { AgentServer } from '../shared/api';

function executable(file: string): boolean {
  try {
    if (!fs.statSync(file).isFile()) return false;
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * The command's file: a path as given (`~/` is home), else the first
 * executable of that name on PATH. Null when there is none, or for a
 * relative path, which would mean a different file in every repository.
 */
export function resolveCommand(command: string, envPath: string, home = os.homedir()): string | null {
  const given = command.startsWith('~/') ? path.join(home, command.slice(2)) : command;
  if (given.includes('/')) return path.isAbsolute(given) && executable(given) ? given : null;
  for (const dir of envPath.split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, given);
    if (executable(candidate)) return candidate;
  }
  return null;
}

export interface CustomLaunch {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
}

/**
 * How to start the server over the environment the app gives its agents:
 * its own `env` set over that one, and the command found on the PATH that
 * results, so a PATH of its own is where its command is looked for. Null
 * when the command is not there.
 */
export function customLaunch(server: AgentServer, base: NodeJS.ProcessEnv, home = os.homedir()): CustomLaunch | null {
  const env = { ...base, ...server.env };
  const command = resolveCommand(server.command, env.PATH ?? '', home);
  return command ? { command, args: [...server.args], env } : null;
}
